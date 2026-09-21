-- ============================================================================
-- PART 16 — Rate-limits the account-claim flow.
--
-- claim-owner-account (see supabase/functions/claim-owner-account/index.ts)
-- is deliberately public/unauthenticated — an applicant who was just
-- approved doesn't have a session yet, so identity is proven only by
-- knowing BOTH their email and a 6-character reference code together.
-- That's ~32^6 (~1.07 billion) combinations for a single guess, which is
-- fine against a one-off guess, but nothing was stopping repeated guesses
-- against the same request — a scripted attacker with your applicant's
-- email could eventually brute-force the code before the real owner
-- claims their account.
--
-- This adds the same shape of protection the OTP activation flow already
-- has (locking out after too many attempts): 5 failed attempts against one
-- application locks it for 15 minutes.
-- ============================================================================

alter table owner_requests
  add column if not exists claim_failed_attempts int not null default 0,
  add column if not exists claim_locked_until timestamptz;

-- Read-only: called first, before the edge function even looks up the
-- request, so checking the lock never itself counts as an attempt. Keyed
-- on email alone (not email+code) — the reference code is exactly what's
-- being guessed, so a wrong code must still count against this email's
-- attempt limit, not be silently free just because it didn't match.
create or replace function check_claim_lock(p_email text)
returns timestamptz
language sql
stable
security definer
set search_path = public
as $$
  select claim_locked_until from owner_requests
  where lower(email) = lower(trim(p_email))
    and claim_locked_until is not null and claim_locked_until > now()
  order by created_at desc
  limit 1;
$$;
revoke all on function check_claim_lock(text) from public;
grant execute on function check_claim_lock(text) to anon, authenticated;

-- Called once per attempt, after the edge function has determined whether
-- the email+code+status combination was valid. Matches by email alone so
-- a wrong code — which matches no row on (email, code) — still gets
-- recorded against that email's most recent request.
create or replace function register_claim_attempt(p_email text, p_success boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  select id into v_id from owner_requests
  where lower(email) = lower(trim(p_email))
  order by created_at desc
  limit 1;
  if v_id is null then return; end if;

  if p_success then
    update owner_requests set claim_failed_attempts = 0, claim_locked_until = null where id = v_id;
  else
    update owner_requests
      set claim_failed_attempts = claim_failed_attempts + 1,
          claim_locked_until = case when claim_failed_attempts + 1 >= 5 then now() + interval '15 minutes' else claim_locked_until end
      where id = v_id;
  end if;
end;
$$;
revoke all on function register_claim_attempt(text, boolean) from public;
grant execute on function register_claim_attempt(text, boolean) to anon, authenticated;
