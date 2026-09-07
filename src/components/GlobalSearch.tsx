import { useEffect, useRef, useState } from 'react';
import { SupabaseClient } from '@supabase/supabase-js';
import { Search, X } from 'lucide-react';

interface BusinessHit { id: string; name: string; email: string | null; kind: 'business' }
interface BranchHit { id: string; name: string; business_id: string; business_name: string; kind: 'branch' }
type Hit = BusinessHit | BranchHit;

export function GlobalSearch({ supabase, onOpenBusiness }: { supabase: SupabaseClient; onOpenBusiness: (id: string) => void }) {
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<Hit[]>([]);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const q = query.trim();
    if (q.length < 2) { setHits([]); setBusy(false); return; }
    setBusy(true);
    debounceRef.current = setTimeout(async () => {
      const [biz, branches] = await Promise.all([
        supabase.from('businesses').select('id, name, email').or(`name.ilike.%${q}%,email.ilike.%${q}%,phone.ilike.%${q}%`).limit(5),
        supabase.from('branches').select('id, name, business_id, businesses(name)').ilike('name', `%${q}%`).limit(5),
      ]);
      const businessHits: Hit[] = (biz.data ?? []).map((b: any) => ({ kind: 'business', id: b.id, name: b.name, email: b.email }));
      const branchHits: Hit[] = (branches.data ?? []).map((b: any) => ({
        kind: 'branch', id: b.id, name: b.name, business_id: b.business_id, business_name: b.businesses?.name ?? 'Unknown business',
      }));
      setHits([...businessHits, ...branchHits]);
      setBusy(false);
    }, 250);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [query]);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  function select(hit: Hit) {
    setOpen(false); setQuery(''); setHits([]);
    onOpenBusiness(hit.kind === 'business' ? hit.id : hit.business_id);
  }

  return (
    <div className="relative flex-1 max-w-md" ref={ref}>
      <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
      <input
        className="input pl-9 pr-8 py-2 text-sm"
        placeholder="Search businesses, branches…"
        value={query}
        onFocus={() => setOpen(true)}
        onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
      />
      {query && (
        <button
          aria-label="Clear search"
          onClick={() => { setQuery(''); setHits([]); }}
          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-ink"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      )}
      {open && query.trim().length >= 2 && (
        <div className="absolute left-0 right-0 mt-2 card p-2 z-30 shadow-lg max-h-80 overflow-y-auto">
          {busy && <p className="text-sm text-slate-400 px-2 py-3 text-center">Searching…</p>}
          {!busy && hits.length === 0 && <p className="text-sm text-slate-400 px-2 py-3 text-center">No matches.</p>}
          {!busy && hits.map((hit) => (
            <button
              key={`${hit.kind}-${hit.id}`}
              onClick={() => select(hit)}
              className="w-full text-left px-2 py-2 rounded-card hover:bg-slate-800"
            >
              <div className="text-sm font-medium">{hit.name}</div>
              <div className="text-xs text-slate-400">
                {hit.kind === 'business' ? (hit.email ?? 'Business') : `Branch · ${hit.business_name}`}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
