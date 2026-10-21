-- ============================================================================
-- PART 9 — Time-limited activation, expiry auto-pause, application
-- reference numbers + public status check.
--
-- Additive: run once, after parts 1-8, against your existing project.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- TIME-LIMITED ACTIVATION
-- ----------------------------------------------------------------------------
alter table businesses add column if not exists activation_expires_at timestamptz;
-- null = lifetime / no expiry. Set whenever an owner is approved or an
-- admin (re)generates an activation code with a duration attached.

-- The one place expiry is actually enforced: flips an expired 'active'
-- business to 'paused'. Security definer so it can update despite RLS,
-- but it only ever touches ONE business — the caller's own (via
-- auth_business_id()) — so a business user calling this can only affect
-- themselves, never another tenant.
create or replace function check_and_apply_expiry()
returns boolean -- true if the business was just paused by this call
language plpgsql
security definer
set search_path = public
as $$
declare
  v_business_id uuid := auth_business_id();
  v_paused boolean := false;
begin
  if v_business_id is null then
    return false;
  end if;
  update businesses
    set status = 'paused', updated_at = now()
    where id = v_business_id
      and status = 'active'
      and activation_expires_at is not null
      and activation_expires_at < now();
  get diagnostics v_paused = row_count;
  return v_paused > 0;
end;
$$;
revoke all on function check_and_apply_expiry() from public;
grant execute on function check_and_apply_expiry() to authenticated;

-- Platform-wide sweep for every business at once, so expiry doesn't
-- depend on someone opening the app at the right moment. Runs as the
-- platform admin's own privilege check, not per-business auth_business_id().
create or replace function admin_sweep_expired_businesses()
returns int -- count of businesses just paused
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count int;
begin
  update businesses
    set status = 'paused', updated_at = now()
    where status = 'active'
      and activation_expires_at is not null
      and activation_expires_at < now();
  get diagnostics v_count = row_count;
  if v_count > 0 then
    insert into admin_actions (admin_id, action, entity_type, reason)
    select null, 'activation_expired_auto_pause', 'business', v_count::text || ' business(es) paused on expiry'
    where v_count > 0;
  end if;
  return v_count;
end;
$$;
-- admin_id is nullable in admin_actions specifically for this automated
-- entry — nothing else should ever insert with a null admin_id, since
-- every other admin_actions row is a real human decision.
alter table admin_actions alter column admin_id drop not null;

-- Deliberately NOT granted to authenticated/anon — this must only run via
-- pg_cron (which executes as the scheduling role, bypassing this grant
-- entirely) or manually by a superuser in the SQL editor. A business user
-- calling this directly could force other tenants' expiry checks early;
-- check_and_apply_expiry() above is the one they're allowed to trigger,
-- and only for their own business.
revoke all on function admin_sweep_expired_businesses() from public;

-- Best-effort scheduling via pg_cron, run every hour. Wrapped in an
-- exception handler because pg_cron is only available on some Supabase
-- plans and must be enabled as an extension first (Database → Extensions
-- → pg_cron) — if it's not available, this silently skips instead of
-- failing the whole migration, and the self-heal check in the app
-- (check_and_apply_expiry, called on login) still covers you.
do $$
begin
  perform cron.schedule(
    'shopos-expire-businesses',
    '0 * * * *',
    $cron$select admin_sweep_expired_businesses();$cron$
  );
exception when others then
  raise notice 'pg_cron not available — skipping schedule. Expiry will still self-heal via check_and_apply_expiry() on each login. Enable the pg_cron extension in Supabase (Database > Extensions) and re-run this block to get hourly sweeps regardless of login activity.';
end $$;

-- ----------------------------------------------------------------------------
-- ADMIN: generate/regenerate OTP now takes a duration, and sets it
-- (replaces the version from Part 7 — same signature name, new behavior)
-- ----------------------------------------------------------------------------
create or replace function admin_generate_otp(p_business_id uuid, p_duration_months int default null)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_code text;
  v_hash text;
  v_expires_at timestamptz;
begin
  if not is_platform_admin() then
    raise exception 'Not authorized';
  end if;

  update otp_codes set used_at = now()
    where business_id = p_business_id and purpose = 'activation' and used_at is null;

  v_code := lpad(floor(random() * 1000000)::text, 6, '0');
  v_hash := encode(digest(v_code, 'sha256'), 'hex');

  insert into otp_codes (business_id, purpose, code_hash, expires_at)
  values (p_business_id, 'activation', v_hash, now() + interval '15 minutes');

  -- p_duration_months is the ACCESS duration (how long the business stays
  -- active once activated) — unrelated to the OTP's own 15-minute expiry
  -- above, which is just how long the code itself is valid to enter.
  if p_duration_months is null then
    v_expires_at := null; -- lifetime
  else
    v_expires_at := now() + (p_duration_months || ' months')::interval;
  end if;
  update businesses set activation_expires_at = v_expires_at where id = p_business_id;

  insert into admin_actions (admin_id, action, entity_type, entity_id, reason)
  values (auth.uid(), 'otp_generated', 'business', p_business_id,
          case when p_duration_months is null then 'lifetime access' else p_duration_months || ' month(s) access' end);

  return v_code;
end;
$$;
revoke all on function admin_generate_otp(uuid, int) from public;
grant execute on function admin_generate_otp(uuid, int) to authenticated;

-- ----------------------------------------------------------------------------
-- OWNER REQUEST REFERENCE CODES — so an applicant who can't sign in yet
-- (no account exists until approval) can still check their status.
-- ----------------------------------------------------------------------------
alter table owner_requests add column if not exists reference_code text unique;

create or replace function generate_reference_code()
returns text
language plpgsql
as $$
declare
  v_chars text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; -- no 0/O/1/I — easy to read aloud/type
  v_code text;
  v_exists boolean;
begin
  loop
    v_code := 'SR-';
    for i in 1..6 loop
      v_code := v_code || substr(v_chars, floor(random() * length(v_chars) + 1)::int, 1);
    end loop;
    select exists(select 1 from owner_requests where reference_code = v_code) into v_exists;
    exit when not v_exists;
  end loop;
  return v_code;
end;
$$;

create or replace function set_owner_request_reference_code()
returns trigger
language plpgsql
as $$
begin
  if new.reference_code is null then
    new.reference_code := generate_reference_code();
  end if;
  return new;
end;
$$;
drop trigger if exists owner_request_reference_code on owner_requests;
create trigger owner_request_reference_code before insert on owner_requests
  for each row execute function set_owner_request_reference_code();

-- Public, unauthenticated status check — deliberately returns only what's
-- safe to show someone who merely knows the reference code (not email,
-- phone, or the OTP itself): status, business name, submitted date, and
-- the reason if one was given for a rejection/info-request.
create or replace function check_owner_request_status(p_reference_code text)
returns table (business_name text, status text, submitted_at timestamptz, decision_reason text)
language sql
security definer
set search_path = public
stable
as $$
  select business_name, status, created_at, decision_reason
  from owner_requests
  where reference_code = upper(trim(p_reference_code));
$$;
revoke all on function check_owner_request_status(text) from public;
grant execute on function check_owner_request_status(text) to anon, authenticated;
