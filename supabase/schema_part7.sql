-- ============================================================================
-- PART 7 — Admin Portal Phase 1: platform-level audit log, OTP activation
-- management for admins, and owner-request decision reasons.
--
-- Additive: run once, after parts 1-6, against your EXISTING Supabase
-- project. Does not touch existing data.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- ADMIN ACTIONS  (platform-level audit log — separate from the per-business
-- `audit_log`, because platform actions like "reject owner request" don't
-- always have a business_id yet, and mixing tenant + platform audit trails
-- in one table would make tenant RLS on audit_log harder to reason about).
-- ----------------------------------------------------------------------------
create table if not exists admin_actions (
  id uuid primary key default gen_random_uuid(),
  admin_id uuid not null references auth.users(id),
  action text not null,
  entity_type text not null,
  entity_id uuid,
  reason text,
  created_at timestamptz not null default now()
);
alter table admin_actions enable row level security;

-- Only platform admins can ever read this. Nobody can insert directly —
-- rows are only ever written by the security-definer functions below, which
-- guarantee admin_id is really the caller (never client-supplied).
create policy admin_actions_admin_read on admin_actions for select using (is_platform_admin());
create policy admin_actions_no_direct_insert on admin_actions for insert with check (false);

-- Platform admins can also read the per-business audit log across every
-- tenant (existing `audit_isolation` policy already restricts normal users
-- to their own business; this adds an admin-only OR condition on top of it,
-- same pattern used for businesses/branches/profiles in Part 3).
create policy audit_log_admin_read on audit_log for select using (is_platform_admin());

-- ----------------------------------------------------------------------------
-- OWNER REQUESTS — decision reason + "request more information" status
-- ----------------------------------------------------------------------------
alter table owner_requests add column if not exists decision_reason text;
alter table owner_requests drop constraint if exists owner_requests_status_check;
alter table owner_requests add constraint owner_requests_status_check
  check (status in ('pending','approved','rejected','paused','info_requested'));

-- Reject or request-info on an owner request. (Approval stays in the
-- approve-owner Edge Function — it needs the service role to create the
-- auth user, so it can't go through a plain security-definer function.)
create or replace function admin_decide_owner_request(p_request_id uuid, p_decision text, p_reason text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not is_platform_admin() then
    raise exception 'Not authorized';
  end if;
  if p_decision not in ('rejected', 'info_requested') then
    raise exception 'Invalid decision — use rejected or info_requested';
  end if;

  update owner_requests
    set status = p_decision, decided_by = auth.uid(), decided_at = now(), decision_reason = p_reason
    where id = p_request_id;

  insert into admin_actions (admin_id, action, entity_type, entity_id, reason)
  values (auth.uid(), 'owner_request_' || p_decision, 'owner_request', p_request_id, p_reason);
end;
$$;
revoke all on function admin_decide_owner_request(uuid, text, text) from public;
grant execute on function admin_decide_owner_request(uuid, text, text) to authenticated;

-- ----------------------------------------------------------------------------
-- BUSINESS STATUS — admin-driven, with a reason and an audit trail. The
-- direct `businesses_admin_write` policy from Part 3 still exists as a
-- fallback, but the admin UI should route through this so every status
-- change is logged.
-- ----------------------------------------------------------------------------
create or replace function admin_set_business_status(p_business_id uuid, p_status text, p_reason text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_previous text;
begin
  if not is_platform_admin() then
    raise exception 'Not authorized';
  end if;
  if p_status not in ('pending_activation','active','paused','suspended') then
    raise exception 'Invalid status';
  end if;

  select status into v_previous from businesses where id = p_business_id;

  update businesses set status = p_status, updated_at = now() where id = p_business_id;

  insert into admin_actions (admin_id, action, entity_type, entity_id, reason)
  values (auth.uid(), 'business_status_' || p_status, 'business', p_business_id,
          coalesce(p_reason, 'previous: ' || coalesce(v_previous, 'unknown')));
end;
$$;
revoke all on function admin_set_business_status(uuid, text, text) from public;
grant execute on function admin_set_business_status(uuid, text, text) to authenticated;

-- ----------------------------------------------------------------------------
-- OTP ACTIVATION — admin-facing status view + regenerate/revoke.
-- otp_codes itself has NO direct client access (Part 4: `for all using
-- (false)`), by design, so the hash is never readable from the browser even
-- by an admin. These functions return only non-sensitive fields.
-- ----------------------------------------------------------------------------
create or replace function admin_otp_status(p_business_id uuid)
returns table (id uuid, attempts int, max_attempts int, expires_at timestamptz, used_at timestamptz, created_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not is_platform_admin() then
    raise exception 'Not authorized';
  end if;
  return query
    select o.id, o.attempts, o.max_attempts, o.expires_at, o.used_at, o.created_at
    from otp_codes o
    where o.business_id = p_business_id and o.purpose = 'activation'
    order by o.created_at desc;
end;
$$;
revoke all on function admin_otp_status(uuid) from public;
grant execute on function admin_otp_status(uuid) to authenticated;

-- Invalidates any outstanding unused code and issues a fresh one. Returns
-- the plaintext code exactly once (same pattern as approve-owner) — it is
-- never stored anywhere but the hash.
create or replace function admin_generate_otp(p_business_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_code text;
  v_hash text;
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

  insert into admin_actions (admin_id, action, entity_type, entity_id)
  values (auth.uid(), 'otp_generated', 'business', p_business_id);

  return v_code;
end;
$$;
revoke all on function admin_generate_otp(uuid) from public;
grant execute on function admin_generate_otp(uuid) to authenticated;

-- Revokes any outstanding unused code without issuing a new one.
create or replace function admin_revoke_otp(p_business_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not is_platform_admin() then
    raise exception 'Not authorized';
  end if;

  update otp_codes set used_at = now()
    where business_id = p_business_id and purpose = 'activation' and used_at is null;

  insert into admin_actions (admin_id, action, entity_type, entity_id)
  values (auth.uid(), 'otp_revoked', 'business', p_business_id);
end;
$$;
revoke all on function admin_revoke_otp(uuid) from public;
grant execute on function admin_revoke_otp(uuid) to authenticated;
