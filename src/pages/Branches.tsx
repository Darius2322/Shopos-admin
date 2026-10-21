import { useEffect, useState } from 'react';
import { SupabaseClient } from '@supabase/supabase-js';
import { Card, EmptyState, Skeleton, StatusBadge } from '../components/ui';
import { Branch, Business } from '../lib/types';

export default function Branches({ supabase, onOpenBusiness }: { supabase: SupabaseClient; onOpenBusiness: (id: string) => void }) {
  const [branches, setBranches] = useState<Branch[]>([]);
  const [businesses, setBusinesses] = useState<Record<string, Business>>({});
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    const [br, biz] = await Promise.all([
      supabase.from('branches').select('*').order('created_at', { ascending: false }),
      supabase.from('businesses').select('*'),
    ]);
    setBranches(br.data ?? []);
    const map: Record<string, Business> = {};
    for (const b of biz.data ?? []) map[b.id] = b;
    setBusinesses(map);
    setLoading(false);
  }

  if (loading) return <Skeleton />;

  const filtered = branches.filter((b) => {
    if (!search) return true;
    const biz = businesses[b.business_id];
    const haystack = `${b.name} ${b.location ?? ''} ${biz?.name ?? ''}`.toLowerCase();
    return haystack.includes(search.toLowerCase());
  });

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-display font-semibold text-lg">All branches ({branches.length})</h2>
      </div>
      <input className="input" placeholder="Search by branch, location, or business…" value={search} onChange={(e) => setSearch(e.target.value)} />
      {filtered.length === 0 && <EmptyState message="No branches match." />}
      {filtered.map((b) => {
        const biz = businesses[b.business_id];
        return (
          <Card key={b.id} className="cursor-pointer hover:border-field-600">
            <button onClick={() => onOpenBusiness(b.business_id)} className="w-full flex items-center justify-between gap-3 text-left">
              <div className="min-w-0">
                <div className="text-sm font-medium">{b.name}</div>
                <div className="text-xs text-slate-400">
                  {biz?.name ?? 'Unknown business'} · {b.location ?? 'No location'}{b.code ? ` · ${b.code}` : ''}
                </div>
              </div>
              <StatusBadge status={b.status} />
            </button>
          </Card>
        );
      })}
    </div>
  );
}
