import { useLiveQuery } from 'dexie-react-hooks';
import { TrendingUp, Package, AlertTriangle, Users, Wallet, ArrowRight } from 'lucide-react';
import { db } from '../../lib/db';
import { useAuth } from '../../lib/auth';
import { useWizardVisibility } from '../onboarding/SetupWizard';

function money(n: number, currency: string) {
  return `${currency} ${n.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}
function startOfToday() {
  const d = new Date(); d.setHours(0, 0, 0, 0); return d.toISOString();
}

export function Dashboard() {
  const { business, activeBranchId, profile } = useAuth();
  const currency = business?.currency ?? 'KES';
  const businessId = business?.id;

  const sales = useLiveQuery(
    () => (businessId ? db.sales.where('businessId').equals(businessId).toArray() : []),
    [businessId]
  ) ?? [];
  const products = useLiveQuery(
    () => (businessId ? db.products.where('businessId').equals(businessId).toArray() : []),
    [businessId]
  ) ?? [];
  const debts = useLiveQuery(
    () => (businessId ? db.debts.where('businessId').equals(businessId).toArray() : []),
    [businessId]
  ) ?? [];
  const customers = useLiveQuery(
    () => (businessId ? db.customers.where('businessId').equals(businessId).toArray() : []),
    [businessId]
  ) ?? [];

  const scoped = activeBranchId ? sales.filter((s) => s.branchId === activeBranchId) : sales;
  const todaySales = scoped.filter((s) => s.createdAt >= startOfToday() && s.status === 'completed');
  const todayRevenue = todaySales.reduce((sum, s) => sum + s.total, 0);
  const outstandingDebt = debts.filter((d) => d.status !== 'paid').reduce((sum, d) => sum + d.remainingAmount, 0);
  const lowStock = products.filter((p) => p.active && p.quantity > 0 && p.quantity <= p.minStock);
  const outOfStock = products.filter((p) => p.active && p.quantity <= 0);
  const debtors = new Set(debts.filter((d) => d.status !== 'paid').map((d) => d.customerId ?? `manual:${d.debtorName ?? d.id}`)).size;

  const cards = [
    { icon: TrendingUp, label: "Today's sales", value: money(todayRevenue, currency), accent: 'field' as const },
    { icon: Wallet, label: 'Outstanding debt', value: money(outstandingDebt, currency), accent: 'rust' as const },
    { icon: Package, label: 'Low stock', value: String(lowStock.length), accent: 'amber' as const },
    { icon: AlertTriangle, label: 'Out of stock', value: String(outOfStock.length), accent: 'rust' as const },
    { icon: Users, label: 'Customers with debt', value: String(debtors), accent: 'amber' as const },
    { icon: Users, label: 'Total customers', value: String(customers.length), accent: 'slate' as const }
  ];

  const accentClasses: Record<string, string> = {
    field: 'text-field-600 bg-field-50',
    rust: 'text-rust-600 bg-rust-50',
    amber: 'text-amber-600 bg-amber-100',
    slate: 'text-slate-600 bg-slate-200'
  };

  return (
    <div className="p-4 md:p-8 max-w-6xl mx-auto">
      {business && !business.onboardingCompleted && (
        <button
          onClick={() => useWizardVisibility.getState().show()}
          className="w-full card p-3.5 mb-5 flex items-center justify-between bg-field-50 border-field-300 text-left"
        >
          <div>
            <div className="text-sm font-medium text-field-700">Finish setting up ShopOS</div>
            <div className="text-xs text-field-700/70">Business profile, branches, team, and more — pick up where you left off.</div>
          </div>
          <ArrowRight className="w-4 h-4 text-field-700 shrink-0" />
        </button>
      )}
      <h1 className="font-display text-2xl font-semibold mb-1">Welcome back{profile ? `, ${profile.fullName.split(' ')[0]}` : ''}</h1>
      <p className="text-sm text-slate-500 mb-6">{business?.name}{activeBranchId ? '' : ' · All branches'}</p>

      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3.5 mb-8">
        {cards.map((c) => (
          <div key={c.label} className="card p-3.5">
            <div className={`w-8 h-8 rounded-lg flex items-center justify-center mb-2.5 ${accentClasses[c.accent]}`}>
              <c.icon className="w-4 h-4" />
            </div>
            <div className="tnum text-lg font-semibold leading-tight">{c.value}</div>
            <div className="text-xs text-slate-500 mt-0.5">{c.label}</div>
          </div>
        ))}
      </div>

      <div className="card p-4">
        <h2 className="font-display font-semibold mb-3">Recent sales</h2>
        {scoped.slice(0, 8).length === 0 && <p className="text-sm text-slate-500 py-4 text-center">No sales yet.</p>}
        <div className="divide-y divide-slate-100">
          {[...scoped].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 8).map((s) => (
            <div key={s.id} className="flex items-center justify-between py-2.5 text-sm">
              <div>
                <div className="font-medium">{s.receiptNumber}</div>
                <div className="text-xs text-slate-500">{new Date(s.createdAt).toLocaleString()} · {s.paymentMethod}</div>
              </div>
              <div className="tnum font-medium">{money(s.total, currency)}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
