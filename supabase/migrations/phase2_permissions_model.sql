-- ============================================================================
-- PHASE 2 — Granular permissions (spec sections 9-13)
-- ============================================================================
-- Layers a real permissions system on top of phase1's membership model.
-- Additive only — no existing table, column, or policy is touched here
-- (profiles write policies are tightened separately in phase2b, after this
-- is in place and verified, since that part is genuinely higher-risk).
--
-- Your actual role set (from types.ts / schema.sql) is:
--   owner, manager, cashier, inventory_manager, accountant, sales_staff
-- — richer than the generic owner/admin/manager/staff in the spec doc, so
-- the defaults below are mapped to YOUR roles, not invented generic ones.
-- 'owner' is always allowed everything and is never checked against this
-- table (see user_has_permission below) — it's not seeded here.
--
-- These role defaults are a reasonable starting point inferred from your
-- role names, not something you specified explicitly — please review
-- role_permissions_seed below against how you actually want each role
-- scoped before relying on it, and adjust with plain UPDATE/INSERT/DELETE
-- statements against role_permissions (it's a normal table, not something
-- that needs a migration to change).
-- ============================================================================

begin;

create table if not exists permissions (
  key text primary key,
  description text not null
);

insert into permissions (key, description) values
  ('sales.view', 'View sales'),
  ('sales.create', 'Record a sale'),
  ('sales.refund', 'Process a refund'),
  ('sales.cancel', 'Cancel a sale'),
  ('inventory.view', 'View inventory'),
  ('inventory.create', 'Add a product'),
  ('inventory.update', 'Edit a product'),
  ('inventory.delete', 'Delete a product'),
  ('inventory.adjust', 'Adjust stock levels'),
  ('customers.view', 'View customers'),
  ('customers.create', 'Add a customer'),
  ('customers.update', 'Edit a customer'),
  ('customers.delete', 'Delete a customer'),
  ('suppliers.view', 'View suppliers'),
  ('suppliers.create', 'Add a supplier'),
  ('suppliers.update', 'Edit a supplier'),
  ('suppliers.delete', 'Delete a supplier'),
  ('purchases.view', 'View purchases'),
  ('purchases.create', 'Record a purchase'),
  ('expenses.view', 'View expenses'),
  ('expenses.create', 'Record an expense'),
  ('staff.view', 'View staff list and details'),
  ('staff.create', 'Add a staff member'),
  ('staff.update', 'Edit a staff member (role, branch, status)'),
  ('staff.delete', 'Remove a staff member'),
  ('staff.permissions', 'Grant or revoke individual staff permissions'),
  ('reports.view', 'View operational reports'),
  ('reports.financial', 'View financial reports'),
  ('business.settings', 'Change business settings'),
  ('business.manage', 'Full business management'),
  ('audit.view', 'View the audit log'),
  ('closings.reopen', 'Reopen a closed day')
on conflict (key) do nothing;

create table if not exists role_permissions (
  role text not null,
  permission_id text not null references permissions(key) on delete cascade,
  primary key (role, permission_id)
);

-- Manager: broad operational access, short of staff.delete/permissions and
-- business-level settings.
insert into role_permissions (role, permission_id) values
  ('manager','sales.view'),('manager','sales.create'),('manager','sales.refund'),('manager','sales.cancel'),
  ('manager','inventory.view'),('manager','inventory.create'),('manager','inventory.update'),
  ('manager','inventory.delete'),('manager','inventory.adjust'),
  ('manager','customers.view'),('manager','customers.create'),('manager','customers.update'),('manager','customers.delete'),
  ('manager','suppliers.view'),('manager','suppliers.create'),('manager','suppliers.update'),
  ('manager','purchases.view'),('manager','purchases.create'),
  ('manager','expenses.view'),('manager','expenses.create'),
  ('manager','staff.view'),('manager','staff.create'),('manager','staff.update'),
  ('manager','reports.view'),('manager','reports.financial'),
  ('manager','closings.reopen')
on conflict do nothing;

-- Inventory manager: stock and supplier-facing, read-only elsewhere.
insert into role_permissions (role, permission_id) values
  ('inventory_manager','inventory.view'),('inventory_manager','inventory.create'),
  ('inventory_manager','inventory.update'),('inventory_manager','inventory.adjust'),
  ('inventory_manager','suppliers.view'),('inventory_manager','suppliers.create'),('inventory_manager','suppliers.update'),
  ('inventory_manager','purchases.view'),('inventory_manager','purchases.create'),
  ('inventory_manager','reports.view')
on conflict do nothing;

-- Accountant: money-facing views, no operational writes.
insert into role_permissions (role, permission_id) values
  ('accountant','sales.view'),
  ('accountant','expenses.view'),('accountant','expenses.create'),
  ('accountant','purchases.view'),
  ('accountant','reports.view'),('accountant','reports.financial'),
  ('accountant','audit.view')
on conflict do nothing;

-- Sales staff: front-of-business, customer-facing.
insert into role_permissions (role, permission_id) values
  ('sales_staff','sales.view'),('sales_staff','sales.create'),
  ('sales_staff','customers.view'),('sales_staff','customers.create'),('sales_staff','customers.update'),
  ('sales_staff','inventory.view')
on conflict do nothing;

-- Cashier: the till.
insert into role_permissions (role, permission_id) values
  ('cashier','sales.view'),('cashier','sales.create'),
  ('cashier','customers.view'),('cashier','customers.create'),
  ('cashier','inventory.view')
on conflict do nothing;

-- Resolves a permission for a specific business, combining role defaults
-- with per-staff overrides (profile_permissions — already existed in your
-- schema, this is the first thing that actually reads it as an override
-- layer rather than it just sitting unused).
-- Owner always returns true without being looked up anywhere — owners are
-- not meant to be constrainable by a role_permissions row a staff member
-- might someday be able to influence.
create or replace function user_has_permission(p_business_id uuid, p_permission text) returns boolean
language plpgsql stable security definer as $$
declare
  v_profile_id uuid;
  v_role text;
  v_override boolean;
begin
  select id, role into v_profile_id, v_role from profiles
    where user_id = auth.uid() and business_id = p_business_id and status = 'active';

  if v_profile_id is null then
    return false;
  end if;
  if v_role = 'owner' then
    return true;
  end if;

  select allowed into v_override from profile_permissions
    where profile_id = v_profile_id and permission = p_permission;
  if v_override is not null then
    return v_override;
  end if;

  return exists(
    select 1 from role_permissions where role = v_role and permission_id = p_permission
  );
end;
$$;

-- Convenience wrapper for RLS policies — checks the permission against
-- whichever business is currently active for this session.
create or replace function has_permission(p_permission text) returns boolean
language sql stable security definer as $$
  select user_has_permission(auth_business_id(), p_permission)
$$;

commit;

-- ============================================================================
-- VERIFY BEFORE MOVING ON
-- ============================================================================
-- 1. select * from permissions;           -- 31 rows
-- 2. select role, count(*) from role_permissions group by role;
-- 3. As a real cashier user: select has_permission('inventory.delete');
--    -- must be false
-- 4. As a real owner user: select has_permission('inventory.delete');
--    -- must be true (owners bypass the table entirely)
-- 5. Grant a one-off override and confirm it takes effect:
--    insert into profile_permissions (profile_id, permission, allowed)
--    values ('<a cashier profile id>', 'inventory.delete', true);
--    -- that cashier's has_permission('inventory.delete') should now be true
