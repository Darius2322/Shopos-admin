import type { Profile, Role } from './types';

/**
 * Mirrors the role_permissions defaults seeded in
 * supabase/migrations/phase2_permissions_model.sql — kept in sync by hand
 * since the UI needs this instantly and offline, without a round trip.
 *
 * IMPORTANT: this is a UX convenience only, exactly per spec section 8 —
 * "frontend hiding is only a UX layer; backend authorization is the
 * actual security layer." Every one of these is already independently
 * enforced server-side by has_permission()/user_has_permission() and the
 * RLS policies built on them (phase2/phase2b). If this file and the
 * database ever disagree, the database wins — someone might see a nav
 * item that then gets rejected server-side (annoying but safe), never
 * the other way around.
 *
 * A staff member's individual profile_permissions overrides (set via the
 * Users page) are NOT reflected here — those are business-specific and
 * would need a lookup this module intentionally avoids to stay
 * synchronous. A staff member granted an extra permission that way may
 * see a nav item hidden for their role until this is revisited; that's
 * strictly a "the button is one tap further away" gap, not a broken one
 * — the backend already honors the override regardless of what the nav
 * shows.
 */
export type Permission =
  | 'sales.view' | 'sales.create' | 'sales.refund' | 'sales.cancel'
  | 'inventory.view' | 'inventory.create' | 'inventory.update' | 'inventory.delete' | 'inventory.adjust'
  | 'customers.view' | 'customers.create' | 'customers.update' | 'customers.delete'
  | 'suppliers.view' | 'suppliers.create' | 'suppliers.update' | 'suppliers.delete'
  | 'purchases.view' | 'purchases.create'
  | 'expenses.view' | 'expenses.create'
  | 'staff.view' | 'staff.create' | 'staff.update' | 'staff.delete' | 'staff.permissions'
  | 'reports.view' | 'reports.financial'
  | 'business.settings' | 'business.manage'
  | 'audit.view' | 'closings.reopen';

const ROLE_PERMISSIONS: Record<Exclude<Role, 'owner'>, Permission[]> = {
  manager: [
    'sales.view', 'sales.create', 'sales.refund', 'sales.cancel',
    'inventory.view', 'inventory.create', 'inventory.update', 'inventory.delete', 'inventory.adjust',
    'customers.view', 'customers.create', 'customers.update', 'customers.delete',
    'suppliers.view', 'suppliers.create', 'suppliers.update',
    'purchases.view', 'purchases.create',
    'expenses.view', 'expenses.create',
    'staff.view', 'staff.create', 'staff.update',
    'reports.view', 'reports.financial',
    'closings.reopen'
  ],
  inventory_manager: [
    'inventory.view', 'inventory.create', 'inventory.update', 'inventory.adjust',
    'suppliers.view', 'suppliers.create', 'suppliers.update',
    'purchases.view', 'purchases.create',
    'reports.view'
  ],
  accountant: [
    'sales.view',
    'expenses.view', 'expenses.create',
    'purchases.view',
    'reports.view', 'reports.financial',
    'audit.view'
  ],
  sales_staff: [
    'sales.view', 'sales.create',
    'customers.view', 'customers.create', 'customers.update',
    'inventory.view'
  ],
  cashier: [
    'sales.view', 'sales.create',
    'customers.view', 'customers.create',
    'inventory.view'
  ]
};

/** Owners bypass this table entirely, same as the backend's
 * user_has_permission() — never look owners up in ROLE_PERMISSIONS. */
export function roleHasPermission(role: Role, permission: Permission): boolean {
  if (role === 'owner') return true;
  return ROLE_PERMISSIONS[role]?.includes(permission) ?? false;
}

export function profileHasPermission(profile: Profile | null, permission: Permission): boolean {
  if (!profile) return false;
  return roleHasPermission(profile.role, permission);
}

export function profileHasAnyPermission(profile: Profile | null, permissions: Permission[]): boolean {
  return permissions.some((p) => profileHasPermission(profile, p));
}
