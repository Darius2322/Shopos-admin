-- ============================================================================
-- PHASE 8 — the actual cause of "sync isn't working" / "different sales on
-- different devices" / the `profiles · update — new row violates row-level
-- security` failures in Sync Center
-- ============================================================================
-- Root cause: the phase1 migration backfilled user_active_business for
-- every profile that existed AT THAT MOMENT. But every profile created
-- SINCE then — every new employee via invite-employee, every new owner via
-- approve-owner/admin-create-business — never got a user_active_business
-- row, because that only ever got set by the NEW switch_active_business()
-- RPC, which nothing calls automatically on first login.
--
-- Consequence: for anyone in that position, auth_business_id() returns
-- NULL. Every RLS policy that checks `business_id = auth_business_id()`
-- then compares against NULL, which is never true — so every write
-- silently fails (exactly the "new row violates row-level security"
-- error on profiles), and worse, every READ scoped the same way returns
-- nothing either. That's why a device only shows what was done ON that
-- device: local Dexie cache still has what was entered locally, but nothing
-- is syncing up OR down, because the session has no resolvable business.
--
-- Fix: a trigger so this can never happen again for future profiles, plus
-- a one-time backfill for anyone already stuck in this state right now
-- (this is very likely Sam and anyone else added since the phase1
-- migration ran).
-- ============================================================================

begin;

-- 1. One-time repair for anyone currently affected.
insert into user_active_business (user_id, business_id, profile_id)
select p.user_id, p.business_id, p.id
from profiles p
where not exists (
  select 1 from user_active_business u where u.user_id = p.user_id
)
on conflict (user_id) do nothing;

-- 2. Never again: auto-set the active business the moment a profile is
-- created, for anyone who doesn't already have one selected. Deliberately
-- ON CONFLICT DO NOTHING — if someone already has an active business (a
-- second membership being added), this must NOT silently switch them
-- away from where they currently are.
create or replace function set_default_active_business() returns trigger
language plpgsql security definer as $$
begin
  insert into user_active_business (user_id, business_id, profile_id)
  values (new.user_id, new.business_id, new.id)
  on conflict (user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists profiles_set_default_active_business on profiles;
create trigger profiles_set_default_active_business
  after insert on profiles
  for each row execute function set_default_active_business();

-- 3. Belt-and-suspenders: re-assert grants on every table introduced or
-- touched since phase1, in case any of them are missing the base
-- table-level GRANT that RLS sits on top of (RLS restricts what a grant
-- already allows — it doesn't substitute for one). This is safe to run
-- repeatedly and changes nothing for tables that already have correct
-- grants.
grant select, insert, update, delete on device_sessions to authenticated;
grant select, insert, update, delete on user_active_business to authenticated;
grant select on permissions to authenticated;
grant select on role_permissions to authenticated;
grant select, insert, update, delete on profile_permissions to authenticated;
grant select, insert, update, delete on receipt_shares to authenticated;
grant execute on function switch_active_business(uuid) to authenticated;
grant execute on function my_memberships() to authenticated;
grant execute on function has_permission(text) to authenticated;
grant execute on function user_has_permission(uuid, text) to authenticated;

commit;

-- ============================================================================
-- VERIFY
-- ============================================================================
-- 1. select count(*) from profiles p
--    where not exists (select 1 from user_active_business u where u.user_id = p.user_id);
--    -- must be 0 after this migration
-- 2. As Sam (or whichever account is currently stuck): sign out, sign back
--    in, then try any action that writes to profiles/sales/etc. Should
--    now succeed. In Sync Center, "Retry failed" should now clear the
--    backlog instead of re-failing.
-- 3. On a second device signed in as the SAME account: confirm sales
--    entered on device A now actually appear on device B after a sync,
--    and vice versa.
-- 4. Add a brand new employee right now (through invite-employee) and
--    confirm their first sign-in works immediately without needing any
--    manual fix.
