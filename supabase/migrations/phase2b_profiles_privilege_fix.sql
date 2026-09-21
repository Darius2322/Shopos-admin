-- ============================================================================
-- PHASE 2b — close a real privilege-escalation hole in `profiles`
-- (spec section 17 explicitly requires this: "Staff -> changes role to
-- owner" must fail).
-- ============================================================================
-- Your current policy is:
--   create policy profiles_isolation on profiles for all
--     using (business_id = auth_business_id());
--
-- "for all" with only a USING clause covers SELECT/INSERT/UPDATE/DELETE
-- with the SAME single check: same business. There is no role check at
-- all on writes. Concretely, today, any signed-in cashier can currently:
--   update profiles set role = 'owner' where id = '<their own profile id>';
-- and Postgres/RLS will allow it, because the only condition is "same
-- business", which is trivially true for their own row.
--
-- This migration:
--   1. Splits that one policy into SELECT / UPDATE / DELETE, each scoped
--      by the actual permission it needs (from phase2's has_permission()).
--   2. Removes client-side INSERT entirely — every current profile-creating
--      code path (invite-employee, approve-owner, admin-create-business)
--      already goes through a service-role Edge Function, which bypasses
--      RLS anyway, so this closes off direct-from-browser account creation
--      without changing any legitimate flow.
--   3. Adds a trigger that blocks anyone — even someone who legitimately
--      holds staff.update — from changing their OWN role, status, or
--      business_id. That has to be a separate, unconditional rule: an
--      owner who is also technically "staff.update"-permitted in some
--      edge case should still never be able to promote themselves via
--      this path; account-level changes to your own membership go
--      through an explicit administrative action, not a self-edit.
--
-- SELECT is left exactly as it is today (co-worker names/roles/status are
-- not secret, and plenty of existing screens likely join against them for
-- display — tightening reads without being able to test every screen
-- risks breaking something I can't see from here; the actual security
-- hole was always on the write side).
-- ============================================================================

begin;

drop policy if exists profiles_isolation on profiles;

create policy profiles_select on profiles
  for select using (business_id = auth_business_id());
  -- (profiles_own_rows from phase1b still separately allows seeing your
  -- own rows in OTHER businesses — unaffected by this file)

create policy profiles_update on profiles
  for update
  using (business_id = auth_business_id() and has_permission('staff.update'))
  with check (business_id = auth_business_id() and has_permission('staff.update'));

create policy profiles_delete on profiles
  for delete using (business_id = auth_business_id() and has_permission('staff.delete'));

-- No client-side INSERT policy at all — omitting one means INSERT is
-- denied by default under RLS. Account creation only ever happens via
-- the service-role Edge Functions, which bypass RLS entirely and are
-- therefore unaffected by this.

create or replace function prevent_profile_self_privilege_escalation() returns trigger
language plpgsql security definer as $$
begin
  if new.user_id = auth.uid()
     and (new.role is distinct from old.role
          or new.status is distinct from old.status
          or new.business_id is distinct from old.business_id) then
    raise exception 'You cannot change your own role, status, or business assignment';
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_no_self_escalation on profiles;
create trigger profiles_no_self_escalation
  before update on profiles
  for each row execute function prevent_profile_self_privilege_escalation();

commit;

-- ============================================================================
-- VERIFY BEFORE MOVING ON
-- ============================================================================
-- 1. As a cashier: try `update profiles set role = 'owner' where user_id = auth.uid()`
--    -- must fail with "You cannot change your own role..."
-- 2. As a manager (has staff.update): try updating a cashier's role to
--    'sales_staff' -- should succeed
-- 3. As a manager: try updating a cashier's role to 'owner' -- decide
--    whether this should be blocked too (arguably yes — only an owner
--    should be able to create another owner). If so, add to the trigger:
--    `if new.role = 'owner' and old.role <> 'owner' and
--     not exists (select 1 from profiles where user_id = auth.uid()
--     and business_id = new.business_id and role = 'owner') then raise
--     exception 'Only an owner can promote someone to owner'; end if;`
-- 4. Confirm every existing screen that lists/edits staff still works —
--    this is the one thing I could not verify without running the app.
