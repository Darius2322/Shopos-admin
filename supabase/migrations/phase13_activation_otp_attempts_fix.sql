-- PHASE 13 — activation OTP hardening (non-destructive; replaces one function)
-- 1. Wrong-code attempts were never persisted: the function did
--    `update ... attempts = attempts + 1` and then RAISED, and a raised
--    exception rolls the update back. The 6-digit code could be guessed
--    without limit. Now a wrong code returns false (transaction commits).
-- 2. search_path now includes `extensions` so digest() resolves whether
--    pgcrypto lives in `public` or in Supabase's `extensions` schema.
-- 3. Row lock on the OTP row so double-submits cannot both succeed.
create or replace function activate_business(p_business_id uuid, p_code text)
returns boolean
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_profile_id uuid;
  v_otp record;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;

  select id into v_profile_id from profiles
    where user_id = auth.uid() and business_id = p_business_id;
  if v_profile_id is null then raise exception 'Not authorized for this business'; end if;

  -- Already activated (e.g. page refreshed / double submit): succeed quietly.
  if exists (select 1 from businesses where id = p_business_id and status = 'active') then
    return true;
  end if;

  select * into v_otp from otp_codes
    where business_id = p_business_id and purpose = 'activation' and used_at is null
    order by created_at desc limit 1
    for update;

  if v_otp is null then raise exception 'No activation code found — ask an admin to resend one'; end if;
  if v_otp.expires_at < now() then raise exception 'This code has expired — ask an admin to resend one'; end if;
  if v_otp.attempts >= v_otp.max_attempts then
    raise exception 'Too many incorrect attempts — ask an admin to resend a code';
  end if;

  if encode(digest(p_code, 'sha256'), 'hex') <> v_otp.code_hash then
    update otp_codes set attempts = attempts + 1 where id = v_otp.id;
    return false;  -- do NOT raise: raising would roll the attempt count back
  end if;

  update otp_codes set used_at = now() where id = v_otp.id;
  update businesses set status = 'active', updated_at = now() where id = p_business_id;
  update profiles set status = 'active', updated_at = now() where id = v_profile_id;

  insert into audit_log (business_id, user_id, action, entity_type, entity_id)
  values (p_business_id, auth.uid(), 'account_activated', 'business', p_business_id);
  return true;
end;
$$;
revoke all on function activate_business(uuid, text) from public;
grant execute on function activate_business(uuid, text) to authenticated;
