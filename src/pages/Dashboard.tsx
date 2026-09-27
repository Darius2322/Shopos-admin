import { useEffect, useState } from 'react';
import { SupabaseClient } from '@supabase/supabase-js';
import { Card, Skeleton, StatCard, StatusBadge } from '../components/ui';
import { Business } from '../lib/types';

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

  useEffect(() => { load(); }, []);

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
