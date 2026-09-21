import { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { X, MapPin, Phone, Mail, Calendar, AlertTriangle } from 'lucide-react';
import { db } from '../../lib/db';
import { useAuth } from '../../lib/auth';

type Tab = 'sales' | 'inventory' | 'people' | 'debts' | 'activity';

function rangeStarts() {
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
  const sevenDaysAgo = new Date(now.getTime() - 7 * 86400000).toISOString();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 86400000).toISOString();
  return { startOfToday, sevenDaysAgo, thirtyDaysAgo };
}

function money(n: number, currency: string) {
  return `${currency} ${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// A modal now, not a routed page — every other detail view in the app
// (products, staff, suppliers, customers) opens as a modal over the list
// it came from; this used to be the one exception, navigating away to a
// full page instead. id/onClose are passed in directly rather than read
// from the URL.
export function BranchProfile({ id, onClose }: { id: string; onClose: () => void }) {
  const { business, profile } = useAuth();
  const currency = business?.currency ?? 'KES';
  const canManage = profile?.role === 'owner' || profile?.role === 'manager';

  const branch = useLiveQuery(() => (id ? db.branches.get(id) : undefined), [id]);
  const profiles = useLiveQuery(() => (business ? db.profiles.where('businessId').equals(business.id).toArray() : []), [business?.id]) ?? [];
  const branchAssignments = useLiveQuery(
    () => (id ? db.profileBranches.where('branchId').equals(id).toArray() : []),
    [id]
  ) ?? [];
  const assignedProfileIds = new Set(branchAssignments.map((a) => a.profileId));
  // Managers and owners implicitly have access to every branch (see
  // auth.ts) regardless of an explicit profile_branches row, so they show
  // up here too rather than looking unassigned when they aren't.
  const branchEmployees = useMemo(
    () => profiles.filter((p) => p.role !== 'owner' && (p.role === 'manager' || assignedProfileIds.has(p.id))),
    [profiles, branchAssignments]
  );

  const sales = useLiveQuery(
    () => (business ? db.sales.where('businessId').equals(business.id).toArray() : []),
    [business?.id]
  ) ?? [];
  const branchSales = useMemo(() => sales.filter((s) => s.branchId === id), [sales, id]);

  const products = useLiveQuery(
    () => (business && id ? db.products.where({ businessId: business.id, branchId: id }).toArray() : []),
    [business?.id, id]
  ) ?? [];

  const debts = useLiveQuery(
    () => (business ? db.debts.where('businessId').equals(business.id).toArray() : []),
    [business?.id]
  ) ?? [];
  const branchDebts = useMemo(() => debts.filter((d) => d.branchId === id), [debts, id]);

  const refunds = useLiveQuery(
    () => (business ? db.refunds.where('businessId').equals(business.id).toArray() : []),
    [business?.id]
  ) ?? [];
  const branchRefunds = useMemo(() => refunds.filter((r) => r.branchId === id), [refunds, id]);

  const cancellations = useLiveQuery(
    () => (business ? db.saleCancellations.where('businessId').equals(business.id).toArray() : []),
    [business?.id]
  ) ?? [];
  const branchCancellations = useMemo(() => cancellations.filter((c) => c.branchId === id), [cancellations, id]);

  const auditEntries = useLiveQuery(
    () => (business ? db.auditLog.where('businessId').equals(business.id).toArray() : []),
    [business?.id]
  ) ?? [];
  const branchActivity = useMemo(
    () => auditEntries.filter((a) => a.branchId === id).sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [auditEntries, id]
  );

  const [tab, setTab] = useState<Tab>('sales');

  const manager = profiles.find((p) => p.id === branch?.managerId);

  const salesStats = useMemo(() => {
    const { startOfToday, sevenDaysAgo, thirtyDaysAgo } = rangeStarts();
    const completed = branchSales.filter((s) => s.status === 'completed' || s.status === 'partially_refunded');
    const sum = (list: typeof sales) => list.reduce((s, x) => s + x.total, 0);
    const today = completed.filter((s) => s.createdAt >= startOfToday);
    const week = completed.filter((s) => s.createdAt >= sevenDaysAgo);
    const month = completed.filter((s) => s.createdAt >= thirtyDaysAgo);
    const byMethod: Record<string, number> = {};
    for (const s of month) byMethod[s.paymentMethod] = (byMethod[s.paymentMethod] ?? 0) + s.amountPaid;
    return {
      todayTotal: sum(today), todayCount: today.length,
      weekTotal: sum(week), weekCount: week.length,
      monthTotal: sum(month), monthCount: month.length,
      byMethod
    };
  }, [branchSales]);

  const inventoryStats = useMemo(() => {
    const stockValue = products.reduce((s, p) => s + p.sellingPrice * p.quantity, 0);
    const lowStock = products.filter((p) => p.quantity > 0 && p.quantity <= p.minStock);
    const outOfStock = products.filter((p) => p.quantity <= 0);
    return { total: products.length, stockValue, lowStock, outOfStock };
  }, [products]);

  const debtStats = useMemo(() => {
    const outstanding = branchDebts.filter((d) => d.status !== 'paid');
    const total = outstanding.reduce((s, d) => s + d.remainingAmount, 0);
    return { outstandingCount: outstanding.length, total };
  }, [branchDebts]);

  if (!branch) {
    return (
      <div className="fixed inset-0 z-[55] flex items-center justify-center">
        <div className="absolute inset-0 bg-ink/40" onClick={onClose} />
        <div className="relative bg-paper-raised rounded-2xl p-6 text-center">
          <p className="text-sm text-slate-500 mb-3">Branch not found.</p>
          <button onClick={onClose} className="btn-secondary text-sm">Close</button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[55] flex items-end md:items-center md:justify-center">
      <div className="absolute inset-0 bg-ink/40" onClick={onClose} />
      <div className="relative w-full md:max-w-2xl bg-paper-raised rounded-t-2xl md:rounded-2xl max-h-[90vh] overflow-y-auto p-4 md:p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="font-display text-xl font-semibold">{branch.name}</h1>
            <p className="text-sm text-slate-500 mt-0.5">{branch.code ?? 'No code'}{branch.status === 'paused' ? ' · Paused' : ''}</p>
          </div>
          <button onClick={onClose} aria-label="Close"><X className="w-5 h-5" /></button>
        </div>

        <div className="card p-5 mb-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm text-slate-600">
            <div className="flex items-center gap-2"><MapPin className="w-4 h-4 text-slate-400 shrink-0" /> {branch.location ?? 'No location set'}</div>
            <div className="flex items-center gap-2"><Phone className="w-4 h-4 text-slate-400 shrink-0" /> {branch.phone ?? 'No phone'}</div>
            <div className="flex items-center gap-2"><Mail className="w-4 h-4 text-slate-400 shrink-0" /> Manager: {manager?.fullName ?? 'No manager assigned'}</div>
            <div className="flex items-center gap-2"><Calendar className="w-4 h-4 text-slate-400 shrink-0" /> Created {new Date(branch.createdAt).toLocaleDateString()}</div>
          </div>
        </div>

      <div className="flex gap-1 mb-4 overflow-x-auto">
        {(['sales', 'inventory', 'people', 'debts', 'activity'] as Tab[])
          .filter((t) => canManage || (t !== 'debts' && t !== 'people'))
          .map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`text-sm font-medium px-3 py-1.5 rounded-full whitespace-nowrap ${tab === t ? 'bg-field-600 text-white' : 'bg-slate-100 text-slate-600'}`}
          >
            {t[0].toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>

      {tab === 'sales' && (
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-3">
            <StatCard label="Today" value={money(salesStats.todayTotal, currency)} sub={`${salesStats.todayCount} sale${salesStats.todayCount !== 1 ? 's' : ''}`} />
            <StatCard label="Last 7 days" value={money(salesStats.weekTotal, currency)} sub={`${salesStats.weekCount} sales`} />
            <StatCard label="Last 30 days" value={money(salesStats.monthTotal, currency)} sub={`${salesStats.monthCount} sales`} />
          </div>
          <div className="card p-4">
            <h3 className="text-sm font-semibold mb-3">Payment breakdown (last 30 days)</h3>
            <div className="space-y-1.5">
              {Object.entries(salesStats.byMethod).length === 0 && <p className="text-sm text-slate-400">No sales in this period.</p>}
              {Object.entries(salesStats.byMethod).map(([method, amount]) => (
                <div key={method} className="flex justify-between text-sm tnum">
                  <span className="text-slate-500 capitalize">{method}</span>
                  <span className="font-medium">{money(amount, currency)}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <StatCard label="Refunds" value={String(branchRefunds.length)} sub={money(branchRefunds.reduce((s, r) => s + r.totalAmount, 0), currency)} />
            <StatCard label="Cancellations" value={String(branchCancellations.length)} sub={branchCancellations.filter((c) => c.status === 'pending').length + ' pending'} />
          </div>
        </div>
      )}

      {tab === 'inventory' && (
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-3">
            <StatCard label="Products" value={String(inventoryStats.total)} />
            <StatCard label="Stock value" value={money(inventoryStats.stockValue, currency)} />
            <StatCard label="Low / out" value={`${inventoryStats.lowStock.length} / ${inventoryStats.outOfStock.length}`} />
          </div>
          {(inventoryStats.lowStock.length > 0 || inventoryStats.outOfStock.length > 0) && (
            <div className="card p-4">
              <h3 className="text-sm font-semibold mb-3 flex items-center gap-1.5"><AlertTriangle className="w-4 h-4 text-amber-500" /> Needs attention</h3>
              <div className="space-y-1.5">
                {[...inventoryStats.outOfStock, ...inventoryStats.lowStock].slice(0, 12).map((p) => (
                  <div key={p.id} className="flex justify-between text-sm">
                    <span className="truncate">{p.name}</span>
                    <span className={`tnum ${p.quantity <= 0 ? 'text-rust-600' : 'text-amber-600'}`}>{p.quantity} {p.unit}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {tab === 'people' && (
        <div className="space-y-3">
          <div className="card p-4">
            <h3 className="text-sm font-semibold mb-1">Manager</h3>
            <p className="text-sm text-slate-600">{manager?.fullName ?? 'No manager assigned'}</p>
          </div>
          <div className="card p-4">
            <h3 className="text-sm font-semibold mb-2">Employees</h3>
            {branchEmployees.length === 0 && <p className="text-xs text-slate-400 mb-1">No employees assigned to this branch yet.</p>}
            <div className="space-y-1.5">
              {branchEmployees.map((p) => (
                <div key={p.id} className="flex justify-between text-sm">
                  <span>{p.fullName}</span>
                  <span className="text-slate-500 capitalize">{p.role.replace(/_/g, ' ')}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {tab === 'debts' && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <StatCard label="Outstanding debt" value={money(debtStats.total, currency)} />
            <StatCard label="Open accounts" value={String(debtStats.outstandingCount)} />
          </div>
          <div className="card p-4">
            <h3 className="text-sm font-semibold mb-2">Outstanding debts</h3>
            {branchDebts.filter((d) => d.status !== 'paid').length === 0 && <p className="text-sm text-slate-400">No outstanding debt at this branch.</p>}
            <div className="space-y-1.5">
              {branchDebts.filter((d) => d.status !== 'paid').slice(0, 15).map((d) => (
                <div key={d.id} className="flex justify-between text-sm">
                  <span className="text-slate-500">{new Date(d.createdAt).toLocaleDateString()}</span>
                  <span className="tnum font-medium">{money(d.remainingAmount, currency)}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {tab === 'activity' && (
        <div className="card p-4">
          <h3 className="text-sm font-semibold mb-3">Recent activity</h3>
          {branchActivity.length === 0 && <p className="text-sm text-slate-400">No recorded activity yet.</p>}
          <div className="space-y-2">
            {branchActivity.slice(0, 30).map((a) => (
              <div key={a.id} className="text-sm border-b border-slate-100 last:border-0 pb-2">
                <div className="flex justify-between">
                  <span>{a.action.replace(/_/g, ' ')}</span>
                  <span className="text-xs text-slate-400">{new Date(a.createdAt).toLocaleString()}</span>
                </div>
                {a.entityType && <div className="text-xs text-slate-400">{a.entityType}</div>}
              </div>
            ))}
          </div>
        </div>
      )}
      </div>
    </div>
  );
}

function StatCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="card p-3.5">
      <div className="text-lg font-display font-semibold tnum truncate">{value}</div>
      <div className="text-xs text-slate-500 mt-0.5">{label}</div>
      {sub && <div className="text-xs text-slate-400 mt-0.5 tnum">{sub}</div>}
    </div>
  );
}
