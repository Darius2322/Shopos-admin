-- ============================================================================
-- PHASE 5a — audit_log RLS (spec sections 14 & 22)
-- ============================================================================
-- Current policy:
--   create policy audit_isolation on audit_log for all
--     using (business_id = auth_business_id());
--
-- Same shape of gap as the profiles_isolation fix in phase2b: "for all"
-- with only a same-business check means every business member can
-- currently SELECT, INSERT, UPDATE, or DELETE any audit_log row —
-- including forging an entry attributed to someone else, or deleting
-- their own trail after the fact. Spec section 22 is explicit that audit
-- logs must be append-only and section 14 that staff shouldn't
-- automatically have full access to the audit system.
--
-- Unlike profiles, legitimate client-side INSERTs into audit_log are real
-- (src/lib/audit.ts — a cashier cancelling a sale writes their own audit
-- entry locally before it syncs), so INSERT isn't blocked outright the
-- way it was for profiles — it's constrained to attributing the entry to
-- yourself only.
-- ============================================================================

begin;

drop policy if exists audit_isolation on audit_log;

create policy audit_select on audit_log
  for select using (business_id = auth_business_id() and has_permission('audit.view'));

create policy audit_insert on audit_log
  for insert with check (business_id = auth_business_id() and user_id = auth.uid());

-- No UPDATE or DELETE policy at all — omitting them denies both by
-- default under RLS, making the table append-only for every role
-- including owner. (audit_log_admin_read from schema_part7.sql, platform
-- admin SELECT access, is untouched by this file.)

commit;

-- ============================================================================
-- VERIFY BEFORE MOVING ON
-- ============================================================================
-- 1. As a cashier (no audit.view by default): select * from audit_log;
--    -- should return zero rows, not an error
-- 2. As an accountant (has audit.view): select * from audit_log;
--    -- should return this business's rows
-- 3. As any staff member: try inserting an audit_log row with
--    user_id set to someone else's id -- must fail
-- 4. As an owner: try `update audit_log set action = 'x' where id = '...'`
--    -- must fail (no update policy exists)
