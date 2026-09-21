-- ============================================================================
-- PHASE 9 — permissions/role_permissions had NO RLS enabled at all since
-- phase2 created them. Right now, any authenticated user (any staff member
-- at any business) can read AND write these tables directly.
-- ============================================================================
-- role_permissions has no business_id — it's a single, platform-wide set
-- of role defaults shared by every business on ShopOS. That makes it
-- fundamentally different from every other table in this app: it must
-- NOT be editable by individual shop owners, because a change there
-- would silently affect every other business too. This is why the
-- upcoming Role Defaults page lives in the ADMIN app, restricted to
-- platform admins, not in the per-business app.
-- ============================================================================

begin;

alter table permissions enable row level security;
create policy permissions_read on permissions for select using (true);
-- No write policies for permissions at all — the catalog of what
-- permission keys exist is fixed application config, not user-editable
-- data, from either the business app or the admin app.

alter table role_permissions enable row level security;
create policy role_permissions_read on role_permissions for select using (true);
create policy role_permissions_admin_write on role_permissions for all
  using (is_platform_admin()) with check (is_platform_admin());

commit;

-- ============================================================================
-- VERIFY
-- ============================================================================
-- 1. As a normal staff member (not a platform admin):
--    select * from permissions;  -- should still work (read-only reference data)
--    insert into role_permissions (role, permission_id) values ('cashier', 'inventory.delete');
--    -- must fail now
-- 2. As a platform admin: the same insert should succeed.
