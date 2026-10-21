-- ============================================================================
-- PHASE 1b — let a user see their OWN membership rows in every business,
-- not just their currently active one.
-- ============================================================================
-- Why this is needed: the existing profiles_isolation policy scopes ALL
-- access (including SELECT) to `business_id = auth_business_id()` — i.e.
-- only the currently active business. That's correct for seeing co-workers,
-- but it also blocks a user from seeing their OWN membership row in a
-- second business. The app's offline-first sync engine (src/lib/sync.ts)
-- pulls every table with a plain `select('*')` and relies entirely on RLS
-- to scope it — so without this, a user's other-business memberships would
-- never sync to their device and the business switcher would have nothing
-- to show but the current business.
--
-- This is purely additive: it does not touch profiles_isolation or any
-- other existing policy, and it only ever exposes rows where
-- user_id = auth.uid() — never a co-worker's row in a business you're not
-- in.
-- ============================================================================

drop policy if exists profiles_own_rows on profiles;
create policy profiles_own_rows on profiles for select using (user_id = auth.uid());
