import { useEffect, useState } from 'react';
import { SupabaseClient } from '@supabase/supabase-js';
import { ChevronRight } from 'lucide-react';
import { Card, EmptyState, Skeleton, StatusBadge } from '../components/ui';
import { Business } from '../lib/types';

export default function Businesses({ supabase, onOpen }: { supabase: SupabaseClient; onOpen: (id: string) => void }) {
  const [businesses, setBusinesses] = useState<Business[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>('all');

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    const { data } = await supabase.from('businesses').select('*').order('created_at', { ascending: false });
    setBusinesses(data ?? []);
    setLoading(false);
  }

  if (loading) return <Skeleton />;

  const filtered = filter === 'all' ? businesses : businesses.filter((b) => b.status === filter);
  const statuses = ['all', 'pending_activation', 'active', 'paused', 'suspended'];

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-display font-semibold text-lg">Businesses</h2>
        <select className="input w-auto text-xs py-1.5" value={filter} onChange={(e) => setFilter(e.target.value)}>
          {statuses.map((s) => <option key={s} value={s}>{s === 'all' ? 'All statuses' : s.replace(/_/g, ' ')}</option>)}
        </select>
      </div>
      {filtered.length === 0 && <EmptyState message="No businesses match this filter." />}
      {filtered.map((b) => (
        <Card key={b.id} className="cursor-pointer hover:border-field-600" >
          <button onClick={() => onOpen(b.id)} className="w-full flex items-center justify-between gap-3 text-left">
            <div className="min-w-0">
              <div className="text-sm font-medium">{b.name}</div>
              <div className="text-xs text-slate-400">{b.email ?? 'No email'} · {new Date(b.created_at).toLocaleDateString()}</div>
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
