-- ============================================================================
-- PART 10 — Self-service account claiming.
--
-- Lets an approved applicant set their own password right from the status
-- check screen (email + reference number), instead of depending on the
-- invite email arriving/being checked — the exact problem reference
-- numbers were introduced to solve in Part 9, now carried one step
-- further: checking status and finishing setup no longer requires email
-- at all, only reference number + the email address used to apply.
--
-- Additive: run once, after parts 1-9, against your existing project.
-- ============================================================================

-- Links a request to the business it produced once approved, and tracks
-- whether the owner has claimed (set a password for) their account yet.
alter table owner_requests add column if not exists business_id uuid references businesses(id);
alter table owner_requests add column if not exists claimed_at timestamptz;

-- Backfill reference codes for rows created before Part 9's trigger existed
-- (the trigger only fires on new inserts, not retroactively).
update owner_requests set reference_code = generate_reference_code() where reference_code is null;

-- ----------------------------------------------------------------------------
-- Replaces Part 9's check_owner_request_status: now requires the EMAIL to
-- match too, not just the reference code alone. A 6-character code from a
-- 32-character alphabet is already fairly resistant to guessing, but
-- requiring the applicant's own email as well costs nothing and matches
-- how the applicant actually thinks of "checking my application" — by
-- both together, not the code in isolation.
-- ----------------------------------------------------------------------------
drop function if exists check_owner_request_status(text);

create or replace function check_owner_request_status(p_email text, p_reference_code text)
returns table (business_name text, status text, submitted_at timestamptz, decision_reason text, can_claim boolean)
language sql
security definer
set search_path = public
stable
as $$
  select business_name, status, created_at, decision_reason,
         (status = 'approved' and claimed_at is null and business_id is not null) as can_claim
  from owner_requests
  where reference_code = upper(trim(p_reference_code))
    and lower(email) = lower(trim(p_email));
$$;
revoke all on function check_owner_request_status(text, text) from public;
grant execute on function check_owner_request_status(text, text) to anon, authenticated;
