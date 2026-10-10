import { useEffect, useRef, useState } from 'react';
import { SupabaseClient } from '@supabase/supabase-js';
import { Search, X, Building2, Store, Package as PackageIcon, CornerDownRight } from 'lucide-react';
import { TABS, type Tab } from './Sidebar';

interface BusinessHit { id: string; name: string; email: string | null; kind: 'business' }
interface BranchHit { id: string; name: string; business_id: string; business_name: string; kind: 'branch' }
interface PackageHit { id: string; name: string; kind: 'package' }
interface PageHit { id: Tab; name: string; kind: 'page' }
type Hit = BusinessHit | BranchHit | PackageHit | PageHit;

// Keep characters that have a meaning in a database filter out of what is typed.
const safe = (v: string) => v.replace(/[%,()*\\]/g, ' ').trim();

export function GlobalSearch({ supabase, onOpenBusiness, onGo }: { supabase: SupabaseClient; onOpenBusiness: (id: string) => void; onGo?: (tab: Tab) => void }) {
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<Hit[]>([]);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const q = safe(query);
    if (q.length < 1) { setHits([]); setBusy(false); return; }
    // Menu pages answer instantly; the database results follow a moment later, so typing feels live.
    const pages: Hit[] = onGo ? TABS.filter(([key, label]) => key !== 'create' && label.toLowerCase().includes(q.toLowerCase())).slice(0, 3).map(([key, label]) => ({ kind: 'page' as const, id: key, name: label })) : [];
    setHits(pages);
    setBusy(true);
    debounceRef.current = setTimeout(async () => {
      const [biz, branches, pk] = await Promise.all([
        supabase.from('businesses').select('id, name, email').is('deleted_at', null).or(`name.ilike.%${q}%,email.ilike.%${q}%,phone.ilike.%${q}%`).limit(6),
        supabase.from('branches').select('id, name, business_id, businesses(name)').ilike('name', `%${q}%`).limit(4),
        supabase.from('packages').select('id, name').ilike('name', `%${q}%`).limit(3),
      ]);
      const businessHits: Hit[] = (biz.data ?? []).map((b: any) => ({ kind: 'business', id: b.id, name: b.name, email: b.email }));
      const branchHits: Hit[] = (branches.data ?? []).map((b: any) => ({
        kind: 'branch', id: b.id, name: b.name, business_id: b.business_id, business_name: b.businesses?.name ?? 'Unknown business',
      }));
      const packageHits: Hit[] = (pk.data ?? []).map((p: any) => ({ kind: 'package', id: p.id, name: p.name }));
      setHits([...businessHits, ...branchHits, ...packageHits, ...pages]);
      setBusy(false);
    }, 150);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [query, onGo]);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  function select(hit: Hit) {
    setOpen(false); setQuery(''); setHits([]);
    if (hit.kind === 'page') onGo?.(hit.id);
    else if (hit.kind === 'package') onGo?.('packages');
    else onOpenBusiness(hit.kind === 'business' ? hit.id : hit.business_id);
  }

  return (
    <div className="relative flex-1 max-w-md" ref={ref}>
      <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
      <input
        className="input pl-9 pr-8 py-2 text-sm"
        placeholder="Search businesses, branches, pages…"
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
      {open && query.trim().length >= 1 && (
        <div className="absolute left-0 right-0 mt-2 card p-2 z-30 shadow-lg max-h-80 overflow-y-auto">
          {busy && hits.length === 0 && <p className="text-sm text-slate-400 px-2 py-3 text-center">Searching…</p>}
          {!busy && hits.length === 0 && <p className="text-sm text-slate-400 px-2 py-3 text-center">No matches.</p>}
          {hits.map((hit) => (
            <button
              key={`${hit.kind}-${hit.id}`}
              onClick={() => select(hit)}
              className="w-full text-left px-2 py-2 rounded-card hover:bg-slate-800"
            >
              <div className="text-sm font-medium flex items-center gap-1.5">
                {hit.kind === 'business' ? <Building2 className="w-3.5 h-3.5 text-slate-400" /> : hit.kind === 'branch' ? <Store className="w-3.5 h-3.5 text-slate-400" /> : hit.kind === 'package' ? <PackageIcon className="w-3.5 h-3.5 text-slate-400" /> : <CornerDownRight className="w-3.5 h-3.5 text-slate-400" />}{hit.name}
              </div>
              <div className="text-xs text-slate-400">
                {hit.kind === 'business' ? (hit.email ?? 'Business') : hit.kind === 'branch' ? `Branch · ${hit.business_name}` : hit.kind === 'package' ? 'Package' : 'Go to this page'}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
