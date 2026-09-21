-- ============================================================================
-- PART 14 — Fixes the "Could not generate code" bug in the admin portal,
-- and adds a "main branch" flag per business.
--
-- Additive/corrective: run once, after parts 1-13, against your EXISTING
-- Supabase project. Safe to run even if you're not 100% sure Part 9 made it
-- in — this re-asserts the correct state either way.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- FIX: admin_generate_otp() had two versions living side by side.
--
-- Part 7 created:  admin_generate_otp(p_business_id uuid)
-- Part 9 later added a duration parameter with:
--                  admin_generate_otp(p_business_id uuid, p_duration_months int default null)
--
-- Postgres treats a different parameter LIST as a different function, so
-- "create or replace" in Part 9 did NOT replace the Part 7 version — it
-- created a second, separate function with the same name. Both have existed
-- in the database ever since. PostgREST (what the Supabase client talks to)
-- won't guess which one you mean when a name is ambiguous, and returns an
-- error instead — which is what the admin portal has been surfacing as the
-- generic "Could not generate code" message (the real error was being
-- discarded before it reached the screen; see the admin's lib/errors.ts
-- fix shipped alongside this migration).
--
-- The fix: drop the old single-argument version so only the two-argument
-- (business + duration) version remains.
-- ----------------------------------------------------------------------------
drop function if exists admin_generate_otp(uuid);

-- Re-assert the correct version, in case Part 9 was never actually run.
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
-- MAIN BRANCH
--
-- Lets an admin designate one branch per business as its "main" branch —
-- e.g. "Sam's - Main" vs. "Sam's - Uthiru". A partial unique index makes it
-- structurally impossible for a business to end up with two main branches
-- at once, including under concurrent requests.
-- ----------------------------------------------------------------------------
alter table branches add column if not exists is_main boolean not null default false;

create unique index if not exists branches_one_main_per_business
  on branches (business_id) where is_main;

-- Give every existing business with no main branch yet a sensible default:
-- its oldest branch. New businesses just start with none set until an
-- admin picks one.
update branches b
set is_main = true
where b.id = (
  select b3.id from branches b3
  where b3.business_id = b.business_id
  order by b3.created_at asc
  limit 1
)
and not exists (
  select 1 from branches b2 where b2.business_id = b.business_id and b2.is_main
);

create or replace function admin_set_main_branch(p_business_id uuid, p_branch_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not is_platform_admin() then
    raise exception 'Not authorized';
  end if;

  if not exists (select 1 from branches where id = p_branch_id and business_id = p_business_id) then
    raise exception 'That branch does not belong to this business';
  end if;

  -- Unset first, then set, so the partial unique index above is never
  -- momentarily violated within the transaction.
  update branches set is_main = false where business_id = p_business_id and is_main = true;
  update branches set is_main = true where id = p_branch_id;

  insert into admin_actions (admin_id, action, entity_type, entity_id)
  values (auth.uid(), 'main_branch_set', 'branch', p_branch_id);
end;
$$;
revoke all on function admin_set_main_branch(uuid, uuid) from public;
grant execute on function admin_set_main_branch(uuid, uuid) to authenticated;
