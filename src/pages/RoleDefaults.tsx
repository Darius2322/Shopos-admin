import { useEffect, useMemo, useState, Fragment } from 'react';
import { SupabaseClient } from '@supabase/supabase-js';
import { Card, ErrorText, Skeleton } from '../components/ui';

interface PermissionRow {
  key: string;
  description: string;
}

// Owner is deliberately excluded — it always has every permission by
// design (see user_has_permission in the database), and is never checked
// against this table.
const ROLES = ['manager', 'inventory_manager', 'accountant', 'sales_staff', 'cashier'] as const;
const ROLE_LABEL: Record<(typeof ROLES)[number], string> = {
  manager: 'Manager', inventory_manager: 'Inventory Mgr', accountant: 'Accountant',
  sales_staff: 'Sales Staff', cashier: 'Cashier'
};

// role_permissions has no business_id — this one table's defaults apply
// to EVERY business on ShopOS at once. That's why this page lives here,
// restricted to platform admins, rather than in any individual business's
// settings: a change here is a platform-wide change, not a per-shop one.
export default function RoleDefaultsPage({ supabase }: { supabase: SupabaseClient }) {
  const [permissions, setPermissions] = useState<PermissionRow[]>([]);
  const [grants, setGrants] = useState<Set<string>>(new Set()); // "role:permission_id"
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<string | null>(null);

  async function load() {
    setLoading(true); setError(null);
    const [{ data: perms, error: permError }, { data: rp, error: rpError }] = await Promise.all([
      supabase.from('permissions').select('key, description').order('key'),
      supabase.from('role_permissions').select('role, permission_id')
    ]);
    if (permError || rpError) {
      setError((permError ?? rpError)?.message ?? 'Could not load permissions');
    } else {
      setPermissions(perms ?? []);
      setGrants(new Set((rp ?? []).map((r: any) => `${r.role}:${r.permission_id}`)));
    }
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  const groups = useMemo(() => {
    const byPrefix = new Map<string, PermissionRow[]>();
    for (const p of permissions) {
      const prefix = p.key.split('.')[0];
      if (!byPrefix.has(prefix)) byPrefix.set(prefix, []);
      byPrefix.get(prefix)!.push(p);
    }
    return Array.from(byPrefix.entries());
  }, [permissions]);

  async function toggle(role: string, permissionKey: string, checked: boolean) {
    const cellKey = `${role}:${permissionKey}`;
    setPending(cellKey); setError(null);
    // Optimistic update — reverted below if the write fails.
    setGrants((prev) => {
      const next = new Set(prev);
      checked ? next.add(cellKey) : next.delete(cellKey);
      return next;
    });
    try {
      if (checked) {
        const { error } = await supabase.from('role_permissions').insert({ role, permission_id: permissionKey });
        if (error) throw error;
      } else {
        const { error } = await supabase.from('role_permissions').delete().eq('role', role).eq('permission_id', permissionKey);
        if (error) throw error;
      }
    } catch (err) {
      setGrants((prev) => {
        const next = new Set(prev);
        checked ? next.delete(cellKey) : next.add(cellKey);
        return next;
      });
      setError(err instanceof Error ? err.message : 'Could not save that change');
    } finally {
      setPending(null);
    }
  }

  if (loading) return <Skeleton rows={8} />;

  return (
    <div>
      <div className="mb-4">
        <h1 className="text-xl font-semibold text-ink">Role Defaults</h1>
        <p className="text-sm text-slate-400 mt-1">
          These defaults apply to every business on ShopOS — a change here affects all of them, not one shop.
          Individual businesses can still grant or revoke specific permissions for individual staff members from
          within their own Users page; that layer sits on top of whatever is set here and is unaffected by it.
        </p>
      </div>

      {error && <ErrorText>{error}</ErrorText>}

      <Card className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-800">
              <th className="text-left font-medium px-4 py-2.5 text-slate-400">Permission</th>
              {ROLES.map((role) => (
                <th key={role} className="text-center font-medium px-3 py-2.5 text-slate-400 whitespace-nowrap">{ROLE_LABEL[role]}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {groups.map(([prefix, rows]) => (
              <Fragment key={prefix}>
                <tr className="bg-slate-900/40">
                  <td colSpan={ROLES.length + 1} className="px-4 py-1.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">{prefix}</td>
                </tr>
                {rows.map((perm) => (
                  <tr key={perm.key} className="border-b border-slate-800/60">
                    <td className="px-4 py-2 text-ink">{perm.description}</td>
                    {ROLES.map((role) => {
                      const cellKey = `${role}:${perm.key}`;
                      return (
                        <td key={role} className="text-center px-3 py-2">
                          <input
                            type="checkbox"
                            checked={grants.has(cellKey)}
                            disabled={pending === cellKey}
                            onChange={(e) => toggle(role, perm.key, e.target.checked)}
                          />
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </Fragment>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
