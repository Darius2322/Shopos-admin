import { useEffect, useMemo, useState } from 'react';
import { SupabaseClient } from '@supabase/supabase-js';
import { ChevronRight, Search, X } from 'lucide-react';
import { Card, EmptyState, Skeleton, StatusBadge } from '../components/ui';
import { Business } from '../lib/types';
import { formatLastActive, activityLabel } from '../lib/time';

type ActivityFilter = 'all' | 'active7d' | 'active30d' | 'inactive30d';

export default function Businesses({ supabase, onOpen }: { supabase: SupabaseClient; onOpen: (id: string) => void }) {
  const [businesses, setBusinesses] = useState<Business[]>([]);
  const [userCounts, setUserCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<string>('all');
  const [activityFilter, setActivityFilter] = useState<ActivityFilter>('all');
  const [sortBy, setSortBy] = useState<'created' | 'active'>('created');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    const [biz, profiles] = await Promise.all([
      supabase.from('businesses').select('*').order('created_at', { ascending: false }),
      supabase.from('profiles').select('business_id'),
    ]);
    setBusinesses(biz.data ?? []);
    const counts: Record<string, number> = {};
    for (const p of profiles.data ?? []) counts[p.business_id] = (counts[p.business_id] ?? 0) + 1;
    setUserCounts(counts);
    setLoading(false);
  }

  if (loading) return <Skeleton />;

  const now = Date.now();
  const DAY = 24 * 60 * 60 * 1000;

  const filtered = useMemo(() => {
    let rows = businesses;
    if (filter !== 'all') rows = rows.filter((b) => b.status === filter);
    if (activityFilter !== 'all') {
      rows = rows.filter((b) => {
        const age = b.last_active_at ? now - new Date(b.last_active_at).getTime() : Infinity;
        if (activityFilter === 'active7d') return age <= 7 * DAY;
        if (activityFilter === 'active30d') return age <= 30 * DAY;
        return age > 30 * DAY; // inactive30d
      });
    }
    if (dateFrom) rows = rows.filter((b) => b.created_at >= dateFrom);
    if (dateTo) rows = rows.filter((b) => b.created_at <= `${dateTo}T23:59:59`);
    const q = query.trim().toLowerCase();
    if (q) {
      rows = rows.filter((b) =>
        b.name.toLowerCase().includes(q) ||
        (b.email ?? '').toLowerCase().includes(q) ||
        (b.phone ?? '').toLowerCase().includes(q)
      );
    }
    return sortBy === 'active'
      ? [...rows].sort((a, b) => (b.last_active_at ?? '').localeCompare(a.last_active_at ?? ''))
      : rows;
  }, [businesses, filter, activityFilter, dateFrom, dateTo, query, sortBy]);

  const statuses = ['all', 'pending_activation', 'active', 'paused', 'suspended'];

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-display font-semibold text-lg">Businesses</h2>
        <span className="text-xs text-slate-500">{filtered.length} of {businesses.length}</span>
      </div>

      <div className="relative">
        <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
        <input className="input pl-9 text-sm" placeholder="Search by name, email, or phone…" value={query} onChange={(e) => setQuery(e.target.value)} />
        {query && <button onClick={() => setQuery('')} className="absolute right-3 top-1/2 -translate-y-1/2"><X className="w-4 h-4 text-slate-500" /></button>}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <select className="input w-auto text-xs py-1.5" value={sortBy} onChange={(e) => setSortBy(e.target.value as 'created' | 'active')} aria-label="Sort businesses">
          <option value="created">Newest first</option>
          <option value="active">Recently active</option>
        </select>
        <select className="input w-auto text-xs py-1.5" value={filter} onChange={(e) => setFilter(e.target.value)} aria-label="Filter by status">
          {statuses.map((s) => <option key={s} value={s}>{s === 'all' ? 'All statuses' : s.replace(/_/g, ' ')}</option>)}
        </select>
        <select className="input w-auto text-xs py-1.5" value={activityFilter} onChange={(e) => setActivityFilter(e.target.value as ActivityFilter)} aria-label="Filter by activity">
          <option value="all">Any activity</option>
          <option value="active7d">Active in last 7 days</option>
          <option value="active30d">Active in last 30 days</option>
          <option value="inactive30d">Inactive 30+ days</option>
        </select>
        <input type="date" className="input w-auto text-xs py-1.5" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} title="Registered from" />
        <input type="date" className="input w-auto text-xs py-1.5" value={dateTo} onChange={(e) => setDateTo(e.target.value)} title="Registered to" />
      </div>

      {filtered.length === 0 && <EmptyState message="No businesses match this search/filter." />}
      {filtered.map((b) => (
        <Card key={b.id} className="cursor-pointer hover:border-field-600" >
          <button onClick={() => onOpen(b.id)} className="w-full flex items-center justify-between gap-3 text-left">
            <div className="min-w-0">
              <div className="text-sm font-medium">{b.name}</div>
              <div className="text-xs text-slate-400">{b.email ?? 'No email'} · {new Date(b.created_at).toLocaleDateString()} · {userCounts[b.id] ?? 0} user{(userCounts[b.id] ?? 0) === 1 ? '' : 's'}</div>
              <div className="text-xs text-slate-500 mt-0.5">
                Last active: <span className="font-medium">{formatLastActive(b.last_active_at)}</span>
                {b.last_active_at && (
                  <span className="block text-slate-400">
                    {new Date(b.last_active_at).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true })}
                    {b.last_activity_kind ? ` · ${activityLabel(b.last_activity_kind)}` : ''}
                  </span>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <StatusBadge status={b.status} />
              <ChevronRight className="w-4 h-4 text-slate-500" />
            </div>
          </button>
        </Card>
      ))}
    </div>
  );
}
