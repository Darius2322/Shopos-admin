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
}

export default function Dashboard({ supabase, onOpenBusiness }: { supabase: SupabaseClient; onOpenBusiness: (id: string) => void }) {
  const [counts, setCounts] = useState<Counts | null>(null);
  const [recent, setRecent] = useState<Business[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    const [businesses, branches, profiles, ownerRequests, recentBusinesses] = await Promise.all([
      supabase.from('businesses').select('status'),
      supabase.from('branches').select('id', { count: 'exact', head: true }),
      supabase.from('profiles').select('role'),
      supabase.from('owner_requests').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
      supabase.from('businesses').select('*').order('created_at', { ascending: false }).limit(5),
    ]);

    const businessesByStatus: Record<string, number> = {};
    for (const b of businesses.data ?? []) {
      businessesByStatus[b.status] = (businessesByStatus[b.status] ?? 0) + 1;
    }
    const totalOwners = (profiles.data ?? []).filter((p: any) => p.role === 'owner').length;
    const totalEmployees = (profiles.data ?? []).filter((p: any) => p.role !== 'owner').length;

    setCounts({
      businessesByStatus,
      totalBranches: branches.count ?? 0,
      totalOwners,
      totalEmployees,
      pendingOwnerRequests: ownerRequests.count ?? 0,
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
          <StatCard label="Activation required" value={counts.businessesByStatus.pending_activation ?? 0} />
          <StatCard label="Paused" value={counts.businessesByStatus.paused ?? 0} />
          <StatCard label="Suspended" value={counts.businessesByStatus.suspended ?? 0} />
          <StatCard label="Pending owner requests" value={counts.pendingOwnerRequests} />
          <StatCard label="Total branches" value={counts.totalBranches} />
          <StatCard label="Total owners" value={counts.totalOwners} />
          <StatCard label="Total employees" value={counts.totalEmployees} />
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
