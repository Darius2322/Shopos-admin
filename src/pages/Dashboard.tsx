import { useEffect, useState } from 'react';
import { SupabaseClient } from '@supabase/supabase-js';
import { Card, Skeleton, StatCard, StatusBadge } from '../components/ui';
import { Business } from '../lib/types';
import { DesktopSetups } from '../components/DesktopSetups';
import { ReconsiderDecisions } from '../components/ReconsiderDecisions';
import { SiteAnalytics } from '../components/SiteAnalytics';

interface DayRow { day: string; transactions: number; sales_amount: number; active_businesses: number }
interface TopShop { business_id: string; name: string; status: string; transactions: number; sales_amount: number; avg_sale: number; growth_pct: number | null; last_sale_at: string | null; active_days: number }

interface Counts {
  businessesByStatus: Record<string, number>;
  totalBranches: number;
  totalOwners: number;
  totalEmployees: number;
  pendingOwnerRequests: number;
  newBusinesses7d: number;
  activeToday: number;
  activeWeek: number;
  activeMonth: number;
  totalUsers: number;
  activeUsers: number;
  totalSalesAmount: number;
  totalTransactions: number;
  salesTodayAmount: number;
  pendingReleases: number;
}

export default function Dashboard({ supabase, onOpenBusiness }: { supabase: SupabaseClient; onOpenBusiness: (id: string) => void }) {
  const [counts, setCounts] = useState<Counts | null>(null);
  const [recent, setRecent] = useState<Business[]>([]);
  const [loading, setLoading] = useState(true);
  const [days, setDays] = useState<7 | 30 | 90>(30);
  const [perDay, setPerDay] = useState<DayRow[] | null>(null);
  const [topShops, setTopShops] = useState<TopShop[] | null>(null);
  const [insightError, setInsightError] = useState(false);

  useEffect(() => { load(); }, []);
  useEffect(() => {
    let cancelled = false;
    setInsightError(false);
    Promise.all([supabase.rpc('admin_transactions_per_day', { p_days: days }), supabase.rpc('admin_top_businesses', { p_days: days, p_limit: 10 })]).then(([d, t]) => {
      if (cancelled) return;
      if (d.error || t.error) { setInsightError(true); return; }
      setPerDay((d.data as DayRow[]).map((r) => ({ ...r, transactions: Number(r.transactions), sales_amount: Number(r.sales_amount), active_businesses: Number(r.active_businesses) })));
      setTopShops((t.data as TopShop[]).map((r) => ({ ...r, transactions: Number(r.transactions), sales_amount: Number(r.sales_amount), avg_sale: Number(r.avg_sale), growth_pct: r.growth_pct == null ? null : Number(r.growth_pct) })));
    });
    return () => { cancelled = true; };
  }, [days]);

  async function load() {
    setLoading(true);
    const [businesses, branches, profiles, ownerRequests, recentBusinesses, totals, pendingReleases] = await Promise.all([
      supabase.from('businesses').select('status, created_at, last_active_at'),
      supabase.from('branches').select('id', { count: 'exact', head: true }),
      supabase.from('profiles').select('role, status'),
      supabase.from('owner_requests').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
      supabase.from('businesses').select('*').order('created_at', { ascending: false }).limit(5),
      supabase.rpc('admin_platform_totals'),
      supabase.from('app_releases').select('id', { count: 'exact', head: true }).eq('published', false),
    ]);

    const businessesByStatus: Record<string, number> = {};
    const now = Date.now();
    const DAY = 24 * 60 * 60 * 1000;
    let newBusinesses7d = 0, activeToday = 0, activeWeek = 0, activeMonth = 0;
    for (const b of businesses.data ?? []) {
      businessesByStatus[b.status] = (businessesByStatus[b.status] ?? 0) + 1;
      if (now - new Date(b.created_at).getTime() <= 7 * DAY) newBusinesses7d++;
      if (b.last_active_at) {
        const age = now - new Date(b.last_active_at).getTime();
        if (age <= DAY) activeToday++;
        if (age <= 7 * DAY) activeWeek++;
        if (age <= 30 * DAY) activeMonth++;
      }
    }
    const totalOwners = (profiles.data ?? []).filter((p: any) => p.role === 'owner').length;
    const totalEmployees = (profiles.data ?? []).filter((p: any) => p.role !== 'owner').length;
    const activeUsers = (profiles.data ?? []).filter((p: any) => p.status === 'active').length;
    const platformTotals = (totals.data as any) ?? {};

    setCounts({
      businessesByStatus,
      totalBranches: branches.count ?? 0,
      totalOwners,
      totalEmployees,
      pendingOwnerRequests: ownerRequests.count ?? 0,
      newBusinesses7d,
      activeToday, activeWeek, activeMonth,
      totalUsers: totalOwners + totalEmployees,
      activeUsers,
      totalSalesAmount: platformTotals.total_sales_amount ?? 0,
      totalTransactions: platformTotals.total_transactions ?? 0,
      salesTodayAmount: platformTotals.sales_today_amount ?? 0,
      pendingReleases: pendingReleases.count ?? 0,
    });
    setRecent(recentBusinesses.data ?? []);
    setLoading(false);
  }

  if (loading || !counts) return <Skeleton rows={4} />;

  const totalBusinesses = Object.values(counts.businessesByStatus).reduce((a, b) => a + b, 0);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-display font-semibold text-lg mb-3">Platform overview</h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <StatCard label="Total businesses" value={totalBusinesses} />
          <StatCard label="Active" value={counts.businessesByStatus.active ?? 0} />
          <StatCard label="New (7 days)" value={counts.newBusinesses7d} />
          <StatCard label="Activation required" value={counts.businessesByStatus.pending_activation ?? 0} />
          <StatCard label="Paused" value={counts.businessesByStatus.paused ?? 0} />
          <StatCard label="Suspended" value={counts.businessesByStatus.suspended ?? 0} />
        </div>
      </div>

      <SiteAnalytics supabase={supabase} />

      <div>
        <h2 className="font-display font-semibold text-lg mb-3">Activity</h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <StatCard label="Active today" value={counts.activeToday} />
          <StatCard label="Active this week" value={counts.activeWeek} />
          <StatCard label="Active this month" value={counts.activeMonth} />
        </div>
      </div>

      <div>
        <h2 className="font-display font-semibold text-lg mb-3">Platform sales</h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <StatCard label="Total sales processed" value={counts.totalSalesAmount.toLocaleString()} />
          <StatCard label="Total transactions" value={counts.totalTransactions} />
          <StatCard label="Sales today" value={counts.salesTodayAmount.toLocaleString()} />
        </div>
        <p className="text-[11px] text-slate-500 mt-1.5">Sums across every business, in each business's own currency — treat as an order-of-magnitude figure, not a single reconciled total.</p>
      </div>

      <div>
        <div className="flex items-center justify-between mb-3 gap-3">
          <h2 className="font-display font-semibold text-lg">Shop performance</h2>
          <div role="group" aria-label="Period" className="flex gap-1">
            {([7, 30, 90] as const).map((d) => (
              <button key={d} onClick={() => setDays(d)} aria-pressed={days === d} className={`text-xs px-3 min-h-[32px] rounded-full ${days === d ? 'bg-field-600 text-white' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'}`}>{d}d</button>
            ))}
          </div>
        </div>
        {insightError && <p role="alert" className="text-sm text-rust-600">Couldn't load performance figures. Check your connection and try again.</p>}
        {!insightError && (!perDay || !topShops) && <Skeleton rows={3} />}
        {perDay && topShops && (
          <>
            <Card className="mb-3">
              <div className="flex items-baseline justify-between mb-2">
                <div className="text-sm font-medium">Transactions per day</div>
                <div className="text-xs text-slate-400 tnum">{perDay.reduce((s, r) => s + r.transactions, 0).toLocaleString()} in {days} days</div>
              </div>
              {perDay.every((r) => r.transactions === 0) ? <p className="text-xs text-slate-500">No sales recorded in this period.</p> : (
                <>
                  <div className="flex items-end gap-[2px] h-28" role="img" aria-label="Bar chart of transactions per day">
                    {(() => { const max = Math.max(...perDay.map((r) => r.transactions), 1); return perDay.map((r) => (
                      <div key={r.day} className="flex-1 min-w-0 bg-field-600/80 hover:bg-field-500 rounded-t-sm" style={{ height: `${Math.max((r.transactions / max) * 100, r.transactions ? 4 : 1)}%` }}
                        title={`${new Date(r.day).toLocaleDateString()}: ${r.transactions} transactions · ${r.sales_amount.toLocaleString()} sold · ${r.active_businesses} shops trading`} />
                    )); })()}
                  </div>
                  <div className="flex justify-between text-[10px] text-slate-500 mt-1 tnum"><span>{new Date(perDay[0].day).toLocaleDateString()}</span><span>{new Date(perDay[perDay.length - 1].day).toLocaleDateString()}</span></div>
                  <div className="grid grid-cols-3 gap-2 text-center mt-3">
                    <div className="rounded-lg bg-slate-800 p-2"><div className="tnum font-semibold">{Math.round(perDay.reduce((s, r) => s + r.transactions, 0) / perDay.length).toLocaleString()}</div><div className="text-[10px] text-slate-400">Avg per day</div></div>
                    <div className="rounded-lg bg-slate-800 p-2"><div className="tnum font-semibold">{Math.max(...perDay.map((r) => r.transactions)).toLocaleString()}</div><div className="text-[10px] text-slate-400">Best day</div></div>
                    <div className="rounded-lg bg-slate-800 p-2"><div className="tnum font-semibold">{perDay[perDay.length - 1].active_businesses}</div><div className="text-[10px] text-slate-400">Shops trading today</div></div>
                  </div>
                </>
              )}
            </Card>
            <Card>
              <div className="text-sm font-medium mb-2">Top performing shops</div>
              {topShops.length === 0 ? <p className="text-xs text-slate-500">No shop has recorded sales in this period.</p> : (
                <div className="overflow-x-auto -mx-1">
                  <table className="w-full text-xs min-w-[520px]">
                    <thead><tr className="text-slate-500 text-left"><th className="px-1 py-1.5 font-medium">#</th><th className="px-1 font-medium">Shop</th><th className="px-1 text-right font-medium">Sales</th><th className="px-1 text-right font-medium">Txns</th><th className="px-1 text-right font-medium">Avg sale</th><th className="px-1 text-right font-medium">vs prior {days}d</th><th className="px-1 text-right font-medium">Days trading</th></tr></thead>
                    <tbody>
                      {topShops.map((t, i) => (
                        <tr key={t.business_id} onClick={() => onOpenBusiness(t.business_id)} className="cursor-pointer border-t border-slate-800 hover:bg-slate-800/70">
                          <td className="px-1 py-2.5 text-slate-500 tnum">{i + 1}</td>
                          <td className="px-1 font-medium text-sm">{t.name}</td>
                          <td className="px-1 text-right tnum">{t.sales_amount.toLocaleString()}</td>
                          <td className="px-1 text-right tnum">{t.transactions.toLocaleString()}</td>
                          <td className="px-1 text-right tnum">{t.avg_sale.toLocaleString()}</td>
                          <td className={`px-1 text-right tnum ${t.growth_pct == null ? 'text-slate-500' : t.growth_pct >= 0 ? 'text-field-500' : 'text-rust-500'}`}>{t.growth_pct == null ? 'new' : `${t.growth_pct > 0 ? '+' : ''}${t.growth_pct}%`}</td>
                          <td className="px-1 text-right tnum">{t.active_days}/{days}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <p className="text-[11px] text-slate-500 mt-2">Ranked by sales value in each shop's own currency. "new" means the shop had no sales in the prior period.</p>
            </Card>
          </>
        )}
      </div>

      <DesktopSetups supabase={supabase} />
      <ReconsiderDecisions supabase={supabase} />

      <div>
        <h2 className="font-display font-semibold text-lg mb-3">System</h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <StatCard label="Total branches" value={counts.totalBranches} />
          <StatCard label="Total owners" value={counts.totalOwners} />
          <StatCard label="Total employees" value={counts.totalEmployees} />
          <StatCard label="Total users" value={counts.totalUsers} />
          <StatCard label="Active users" value={counts.activeUsers} />
          <StatCard label="Pending owner requests" value={counts.pendingOwnerRequests} />
          <StatCard label="Unpublished releases" value={counts.pendingReleases} />
        </div>
      </div>

      <div>
        <h2 className="font-display font-semibold text-lg mb-3">Recently registered</h2>
        <div className="space-y-2">
          {recent.length === 0 && <p className="text-sm text-slate-400">No businesses yet.</p>}
          {recent.map((b) => (
            <Card key={b.id} className="flex items-center justify-between gap-3 cursor-pointer hover:border-field-600" >
              <button onClick={() => onOpenBusiness(b.id)} className="min-w-0 text-left flex-1">
                <div className="text-sm font-medium">{b.name}</div>
                <div className="text-xs text-slate-400">{b.email ?? 'No email'} · {new Date(b.created_at).toLocaleDateString()}</div>
              </button>
              <StatusBadge status={b.status} />
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}
