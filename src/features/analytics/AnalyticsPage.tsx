import { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { TrendingUp, TrendingDown, Wallet, Package, AlertTriangle, Percent } from 'lucide-react';
import { db } from '../../lib/db';
import { useAuth } from '../../lib/auth';

function money(n: number, currency: string, decimals = 0) {
  return `${currency} ${n.toLocaleString(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}`;
}
function round2(n: number) { return Math.round(n * 100) / 100; }

type Range = 'today' | 'week' | 'month' | 'custom';

function rangeToDates(range: Range, customFrom: string, customTo: string): { from: string; to: string } {
  const now = new Date();
  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).toISOString();
  const endOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999).toISOString();
  switch (range) {
    case 'today': return { from: startOfDay(now), to: endOfDay(now) };
    case 'week': { const w = new Date(now); w.setDate(w.getDate() - 6); return { from: startOfDay(w), to: endOfDay(now) }; }
    case 'month': { const m = new Date(now); m.setDate(m.getDate() - 29); return { from: startOfDay(m), to: endOfDay(now) }; }
    case 'custom': return {
      from: customFrom ? startOfDay(new Date(customFrom)) : startOfDay(now),
      to: customTo ? endOfDay(new Date(customTo)) : endOfDay(now)
    };
  }
}

export function AnalyticsPage() {
  const { business, activeBranchId } = useAuth();
  const currency = business?.currency ?? 'KES';
  const businessId = business?.id;

  const [range, setRange] = useState<Range>('week');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const { from, to } = useMemo(() => rangeToDates(range, customFrom, customTo), [range, customFrom, customTo]);

  // Same indexed-range approach as Sales' own filters — this scans only
  // the date window asked for, not every sale the business has ever made.
  const salesInRange = useLiveQuery(() => {
    if (!businessId) return [];
    return db.sales.where('createdAt').between(from, to, true, true)
      .toArray()
      .then((rows) => rows.filter((s) => s.businessId === businessId && (!activeBranchId || s.branchId === activeBranchId)));
  }, [businessId, from, to, activeBranchId]) ?? [];

  const saleIds = useMemo(() => salesInRange.map((s) => s.id), [salesInRange]);
  const itemsInRange = useLiveQuery(
    () => (saleIds.length ? db.saleItems.where('saleId').anyOf(saleIds).toArray() : []),
    [saleIds.join(',')]
  ) ?? [];

  const refundsInRange = useLiveQuery(() => {
    if (!businessId) return [];
    return db.refunds.where('createdAt').between(from, to, true, true)
      .toArray()
      .then((rows) => rows.filter((r) => r.businessId === businessId && r.status === 'processed'));
  }, [businessId, from, to]) ?? [];

  const expensesInRange = useLiveQuery(() => {
    if (!businessId) return [];
    return db.expenses.where('createdAt').between(from, to, true, true)
      .toArray()
      .then((rows) => rows.filter((e) => e.businessId === businessId && !e.deletedAt && (!activeBranchId || e.branchId === activeBranchId)));
  }, [businessId, from, to, activeBranchId]) ?? [];

  // Snapshots, not date-ranged — an outstanding debt or a low-stock level
  // is a current balance, not something that happened "during" a period.
  const debts = useLiveQuery(() => (businessId ? db.debts.where('businessId').equals(businessId).toArray() : []), [businessId]) ?? [];
  const products = useLiveQuery(() => (businessId ? db.products.where('businessId').equals(businessId).toArray() : []), [businessId]) ?? [];

  const completed = salesInRange.filter((s) => s.status !== 'cancelled');
  const cancelled = salesInRange.filter((s) => s.status === 'cancelled');

  const grossSales = round2(completed.reduce((s, sale) => s + sale.total, 0));
  const discountsGiven = round2(completed.reduce((s, sale) => s + sale.discount, 0));
  const refundsTotal = round2(refundsInRange.reduce((s, r) => s + r.totalAmount, 0));
  const netRevenue = round2(grossSales - refundsTotal);
  const cogs = round2(itemsInRange.reduce((s, i) => s + i.unitCost * i.quantity, 0));
  const grossProfit = round2(netRevenue - cogs);
  const expensesTotal = round2(expensesInRange.reduce((s, e) => s + e.amount, 0));
  const netProfit = round2(grossProfit - expensesTotal);
  const marginPct = netRevenue > 0 ? round2((netProfit / netRevenue) * 100) : 0;
  const outstandingDebt = round2(debts.filter((d) => d.status !== 'paid').reduce((s, d) => s + d.remainingAmount, 0));
  const lowStock = products.filter((p) => p.active && p.quantity > 0 && p.quantity <= p.minStock).length;

  const trendData = useMemo(() => {
    const byDay = new Map<string, number>();
    for (const s of completed) {
      const day = s.createdAt.slice(0, 10);
      byDay.set(day, round2((byDay.get(day) ?? 0) + s.total));
    }
    return [...byDay.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([day, revenue]) => ({ day: day.slice(5), revenue }));
  }, [completed]);

  const bestSellers = useMemo(() => {
    const byProduct = new Map<string, { name: string; qty: number; revenue: number }>();
    for (const i of itemsInRange) {
      const cur = byProduct.get(i.productId) ?? { name: i.productName, qty: 0, revenue: 0 };
      cur.qty += i.quantity;
      cur.revenue = round2(cur.revenue + i.lineTotal);
      byProduct.set(i.productId, cur);
    }
    return [...byProduct.values()].sort((a, b) => b.revenue - a.revenue).slice(0, 8);
  }, [itemsInRange]);

  const cards = [
    { icon: TrendingUp, label: 'Net revenue', value: money(netRevenue, currency), sub: `${money(grossSales, currency)} gross − ${money(refundsTotal, currency)} refunds`, accent: 'field' },
    { icon: Wallet, label: 'Net profit', value: money(netProfit, currency), sub: `${marginPct}% margin`, accent: netProfit >= 0 ? 'field' : 'rust' },
    { icon: Package, label: 'Cost of goods sold', value: money(cogs, currency), sub: `Gross profit ${money(grossProfit, currency)}`, accent: 'slate' },
    { icon: TrendingDown, label: 'Expenses', value: money(expensesTotal, currency), sub: `${expensesInRange.length} recorded`, accent: 'amber' },
    { icon: Percent, label: 'Discounts given', value: money(discountsGiven, currency), sub: `${cancelled.length} sale${cancelled.length === 1 ? '' : 's'} cancelled`, accent: 'slate' },
    { icon: AlertTriangle, label: 'Outstanding debt', value: money(outstandingDebt, currency), sub: `${lowStock} product${lowStock === 1 ? '' : 's'} low on stock`, accent: 'rust' },
  ] as const;

  const accentClasses: Record<string, string> = {
    field: 'text-field-600 bg-field-50', rust: 'text-rust-600 bg-rust-50',
    amber: 'text-amber-600 bg-amber-100', slate: 'text-slate-600 bg-slate-200'
  };

  return (
    <div className="p-4 md:p-8 max-w-6xl mx-auto">
      <h1 className="font-display text-2xl font-semibold mb-1">Profit & Loss</h1>
      <p className="text-sm text-slate-500 mb-4">Every figure below is calculated from your actual sales, refund, and expense records — not an estimate.</p>

      <div className="flex gap-1.5 flex-wrap mb-2">
        {(['today', 'week', 'month', 'custom'] as Range[]).map((r) => (
          <button key={r} onClick={() => setRange(r)} className={`text-xs font-medium px-3 py-1.5 rounded-full ${range === r ? 'bg-field-600 text-white' : 'bg-slate-100 text-slate-600'}`}>
            {r === 'today' ? 'Today' : r === 'week' ? 'Last 7 days' : r === 'month' ? 'Last 30 days' : 'Custom range'}
          </button>
        ))}
      </div>
      {range === 'custom' && (
        <div className="flex gap-2 mb-4">
          <input type="date" className="input text-sm" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} />
          <input type="date" className="input text-sm" value={customTo} onChange={(e) => setCustomTo(e.target.value)} />
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3.5 mb-6 mt-3">
        {cards.map((c) => (
          <div key={c.label} className="card p-3.5">
            <div className={`w-8 h-8 rounded-lg flex items-center justify-center mb-2.5 ${accentClasses[c.accent]}`}>
              <c.icon className="w-4 h-4" />
            </div>
            <div className="tnum text-lg font-semibold leading-tight">{c.value}</div>
            <div className="text-xs text-slate-500 mt-0.5">{c.label}</div>
            <div className="text-[11px] text-slate-400 mt-1">{c.sub}</div>
          </div>
        ))}
      </div>

      <div className="card p-4 mb-4">
        <h2 className="font-display font-semibold mb-3">Revenue trend</h2>
        {trendData.length === 0 ? (
          <p className="text-sm text-slate-500 py-8 text-center">No completed sales in this range.</p>
        ) : (
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={trendData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis dataKey="day" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} width={50} />
              <Tooltip formatter={(v: number) => money(v, currency, 2)} />
              <Line type="monotone" dataKey="revenue" stroke="#2f8f60" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <div className="card p-4">
          <h2 className="font-display font-semibold mb-3">Best-selling products</h2>
          {bestSellers.length === 0 ? (
            <p className="text-sm text-slate-500 py-4 text-center">No sales in this range.</p>
          ) : (
            <>
              <ResponsiveContainer width="100%" height={180}>
                <BarChart data={bestSellers} layout="vertical" margin={{ left: 8 }}>
                  <XAxis type="number" tick={{ fontSize: 11 }} />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} width={100} />
                  <Tooltip formatter={(v: number) => money(v, currency, 2)} />
                  <Bar dataKey="revenue" fill="#2f8f60" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
              <div className="divide-y divide-slate-100 mt-2">
                {bestSellers.map((p) => (
                  <div key={p.name} className="flex justify-between py-1.5 text-sm">
                    <span className="truncate pr-2">{p.name}</span>
                    <span className="tnum text-slate-500 shrink-0">{p.qty} sold</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        <div className="card p-4">
          <h2 className="font-display font-semibold mb-3">Low-stock products</h2>
          {products.filter((p) => p.active && p.quantity > 0 && p.quantity <= p.minStock).length === 0 ? (
            <p className="text-sm text-slate-500 py-4 text-center">Nothing is low on stock.</p>
          ) : (
            <div className="divide-y divide-slate-100">
              {products.filter((p) => p.active && p.quantity > 0 && p.quantity <= p.minStock)
                .sort((a, b) => a.quantity - b.quantity).slice(0, 8).map((p) => (
                  <div key={p.id} className="flex justify-between py-1.5 text-sm">
                    <span className="truncate pr-2">{p.name}</span>
                    <span className="tnum text-amber-600 shrink-0">{p.quantity} left</span>
                  </div>
                ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
