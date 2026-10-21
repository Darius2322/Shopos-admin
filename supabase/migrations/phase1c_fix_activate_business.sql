-- ============================================================================
-- PHASE 1c — activate_business() still assumed profiles.id = auth.uid(),
-- which the phase1 migration made no longer universally true.
-- ============================================================================
-- Symptom this fixes: an owner/staff member activating a SECOND business
-- (their first business's profile row still has id = their old auth id,
-- but the new business's profile row has a freshly generated id) would
-- get "Not authorized for this business" even with the correct OTP, and
-- even on success the update would silently activate the wrong row (or
-- no row) rather than this business's actual membership.
-- ============================================================================

create or replace function activate_business(p_business_id uuid, p_code text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile_id uuid;
  v_otp record;
  v_code_hash text;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  select id into v_profile_id from profiles
    where user_id = auth.uid() and business_id = p_business_id;
  if v_profile_id is null then
    raise exception 'Not authorized for this business';
  end if;

  select * into v_otp from otp_codes
    where business_id = p_business_id and purpose = 'activation' and used_at is null
    order by created_at desc limit 1;

  if v_otp is null then
    raise exception 'No activation code found — ask an admin to resend one';
  end if;
  if v_otp.expires_at < now() then
    raise exception 'This code has expired — ask an admin to resend one';
  end if;
  if v_otp.attempts >= v_otp.max_attempts then
    raise exception 'Too many incorrect attempts — ask an admin to resend a code';
  end if;

  v_code_hash := encode(digest(p_code, 'sha256'), 'hex');

  if v_code_hash <> v_otp.code_hash then
    update otp_codes set attempts = attempts + 1 where id = v_otp.id;
    raise exception 'Incorrect code';
  end if;

  update otp_codes set used_at = now() where id = v_otp.id;
  update businesses set status = 'active', updated_at = now() where id = p_business_id;
  update profiles set status = 'active', updated_at = now() where id = v_profile_id;

  insert into audit_log (business_id, user_id, action, entity_type, entity_id)
  values (p_business_id, auth.uid(), 'account_activated', 'business', p_business_id);

  return true;
end;
$$;
