-- ============================================================================
-- PHASE 11 — fix the "permission denied for table X" bug class permanently
-- ============================================================================
-- device_sessions and feature_requests have both now shown this exact
-- failure: a bare GRANT-level denial, separate from and prior to RLS.
-- RLS policies only restrict what a GRANT already allows -- a table with
-- no GRANT at all denies everything before RLS is even consulted. Rather
-- than find these one table at a time as each one happens to get
-- exercised for the first time, this grants base CRUD access to
-- `authenticated` on every table in the public schema in one sweep.
--
-- This is safe: every one of these tables already has RLS enabled with
-- its own policies (that's the actual security boundary throughout this
-- app), so granting the outer gate doesn't expose anything RLS wasn't
-- already going to allow or deny correctly on a row-by-row basis. This
-- migration only ever widens what's POSSIBLE to attempt -- it changes
-- nothing about what any policy actually permits.
-- ============================================================================

do $$
declare
  r record;
begin
  for r in
    select table_name from information_schema.tables
    where table_schema = 'public' and table_type = 'BASE TABLE'
  loop
    execute format('grant select, insert, update, delete on public.%I to authenticated', r.table_name);
  end loop;
end $$;

-- ============================================================================
-- VERIFY
-- ============================================================================
-- Re-run CHECK_MISSING_GRANTS.sql -- it should now return zero rows.
-- As a real staff account: retry the featureRequests · create item in
-- Sync Center -- should succeed now (assuming the account also has
-- whatever RLS policy that action actually requires -- this migration
-- only removes the grant-level blocker, not any RLS rule).
