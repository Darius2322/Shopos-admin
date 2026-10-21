import { useEffect, useRef, useState } from 'react';
import { SupabaseClient } from '@supabase/supabase-js';
import { Search, X, Building2, Store, Package as PackageIcon, CornerDownRight, UserPlus, LifeBuoy, Sparkles, Users, Star } from 'lucide-react';
import { TABS, type Tab } from './Sidebar';

type Kind = 'page' | 'business' | 'branch' | 'package' | 'request' | 'ticket' | 'feature' | 'staff' | 'review';
interface Hit { kind: Kind; id: string; title: string; sub: string; go: { tab: Tab } | { business: string } }

const GROUPS: [Kind, string][] = [['page', 'Pages'], ['business', 'Businesses'], ['branch', 'Branches'], ['staff', 'Staff'], ['request', 'Owner requests'], ['ticket', 'Support tickets'], ['feature', 'Feature requests'], ['review', 'Reviews'], ['package', 'Packages']];
const ICON: Record<Kind, any> = { page: CornerDownRight, business: Building2, branch: Store, package: PackageIcon, request: UserPlus, ticket: LifeBuoy, feature: Sparkles, staff: Users, review: Star };
// Keep characters that have a meaning in a database filter out of what is typed.
const safe = (v: string) => v.replace(/[%,()*\\]/g, ' ').trim();

/** A Search button for the top bar. It opens a full-screen search across pages, businesses, branches, staff, owner requests,
 * support tickets, feature requests, reviews and packages. Shortcut: press "/" or Ctrl+K. */
export function SearchEverything({ supabase, onOpenBusiness, onGo }: { supabase: SupabaseClient; onOpenBusiness: (id: string) => void; onGo: (tab: Tab) => void }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<Hit[]>([]);
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const seq = useRef(0);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      const typing = !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable);
      if ((e.key === 'k' && (e.ctrlKey || e.metaKey)) || (e.key === '/' && !typing)) { e.preventDefault(); setOpen(true); }
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);
  useEffect(() => { if (open) window.setTimeout(() => input.current?.focus(), 30); else { setQuery(''); setHits([]); } }, [open]);

  useEffect(() => {
    const q = safe(query);
    const my = ++seq.current;
    if (!q) { setHits([]); setBusy(false); return; }
    const pages: Hit[] = TABS.filter(([k, l]) => k !== 'create' && l.toLowerCase().includes(q.toLowerCase())).slice(0, 4).map(([k, l]) => ({ kind: 'page', id: k, title: l, sub: 'Go to this page', go: { tab: k } }));
    setHits(pages); setBusy(true);
    const t = window.setTimeout(async () => {
      const like = `%${q}%`;
      const run = async <T,>(p: PromiseLike<{ data: T[] | null }>): Promise<T[]> => { try { return (await p).data ?? []; } catch { return []; } };
      const [biz, br, pk, rq, tk, ft, st, rv] = await Promise.all([
        run<any>(supabase.from('businesses').select('id, name, email, phone').is('deleted_at', null).or(`name.ilike.${like},email.ilike.${like},phone.ilike.${like}`).limit(6)),
        run<any>(supabase.from('branches').select('id, name, business_id, businesses(name)').ilike('name', like).limit(5)),
        run<any>(supabase.from('packages').select('id, name').ilike('name', like).limit(4)),
        run<any>(supabase.from('owner_requests').select('id, full_name, email, phone, business_name, status, reference_code').or(`full_name.ilike.${like},email.ilike.${like},phone.ilike.${like},business_name.ilike.${like},reference_code.ilike.${like}`).limit(5)),
        run<any>(supabase.from('support_tickets').select('id, subject, status, category').or(`subject.ilike.${like},description.ilike.${like}`).limit(5)),
        run<any>(supabase.from('feature_requests').select('id, feature, status, business_id').or(`feature.ilike.${like},reason.ilike.${like}`).limit(5)),
        run<any>(supabase.from('profiles').select('id, full_name, phone, role, business_id').is('deleted_at', null).or(`full_name.ilike.${like},phone.ilike.${like}`).limit(6)),
        run<any>(supabase.from('reviews').select('id, author_name, business_name, body, rating').or(`author_name.ilike.${like},business_name.ilike.${like},body.ilike.${like}`).limit(4))
      ]);
      if (my !== seq.current) return;
      const all: Hit[] = [
        ...pages,
        ...biz.map((b: any): Hit => ({ kind: 'business', id: b.id, title: b.name, sub: [b.email, b.phone].filter(Boolean).join(' · ') || 'Business', go: { business: b.id } })),
        ...br.map((b: any): Hit => ({ kind: 'branch', id: b.id, title: b.name, sub: `Branch · ${b.businesses?.name ?? 'Unknown business'}`, go: { business: b.business_id } })),
        ...st.map((p: any): Hit => ({ kind: 'staff', id: p.id, title: p.full_name ?? 'Staff member', sub: `${String(p.role ?? '').replace(/_/g, ' ')}${p.phone ? ` · ${p.phone}` : ''}`, go: { business: p.business_id } })),
        ...rq.map((r: any): Hit => ({ kind: 'request', id: r.id, title: r.business_name ?? r.full_name, sub: `${r.full_name} · ${r.status}${r.reference_code ? ` · ${r.reference_code}` : ''}`, go: { tab: 'requests' } })),
        ...tk.map((x: any): Hit => ({ kind: 'ticket', id: x.id, title: x.subject, sub: `${x.category ?? 'Ticket'} · ${x.status}`, go: { tab: 'support' } })),
        ...ft.map((x: any): Hit => ({ kind: 'feature', id: x.id, title: String(x.feature).replace(/_/g, ' '), sub: `Feature request · ${x.status}`, go: { tab: 'features' } })),
        ...rv.map((x: any): Hit => ({ kind: 'review', id: x.id, title: `${x.author_name ?? 'Review'} · ${x.rating}★`, sub: String(x.body ?? x.business_name ?? '').slice(0, 80), go: { tab: 'reviews' } })),
        ...pk.map((x: any): Hit => ({ kind: 'package', id: x.id, title: x.name, sub: 'Package', go: { tab: 'packages' } }))
      ];
      setHits(all); setBusy(false);
    }, 200);
    return () => window.clearTimeout(t);
  }, [query, supabase]);

  function pick(h: Hit) {
    setOpen(false);
    if ('business' in h.go) onOpenBusiness(h.go.business); else onGo(h.go.tab);
  }

  return (
    <>
      <button onClick={() => setOpen(true)} aria-label="Search everything" title="Search everything (/)" className="flex items-center gap-1.5 px-2.5 h-9 rounded-card border border-slate-700 text-slate-300 hover:text-ink hover:bg-slate-800 text-sm">
        <Search className="w-4 h-4" /> <span className="hidden sm:inline">Search</span>
      </button>
      {open && (
        <div className="fixed inset-0 z-50 bg-paper flex flex-col" role="dialog" aria-modal="true" aria-label="Search everything">
          <div className="flex items-center gap-2 p-3 border-b border-slate-700">
            <Search className="w-5 h-5 text-slate-400 shrink-0" />
            <input ref={input} className="input flex-1" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search businesses, staff, requests, tickets, pages…" aria-label="Search everything" />
            <button onClick={() => setOpen(false)} aria-label="Close search" className="p-2 text-slate-400 hover:text-ink"><X className="w-5 h-5" /></button>
          </div>
          <div className="flex-1 overflow-y-auto p-3 max-w-2xl w-full mx-auto">
            {!safe(query) && <p className="text-sm text-slate-400 text-center py-10">Type a name, email, phone number, reference code or page name.<br /><span className="text-xs">Tip: press / from anywhere to open search.</span></p>}
            {safe(query) && !busy && hits.length === 0 && <p className="text-sm text-slate-400 text-center py-10">No matches for “{query}”.</p>}
            {safe(query) && busy && hits.length === 0 && <p className="text-sm text-slate-400 text-center py-10">Searching…</p>}
            {GROUPS.map(([kind, label]) => {
              const rows = hits.filter((h) => h.kind === kind);
              if (!rows.length) return null;
              const Icon = ICON[kind];
              return (
                <section key={kind} className="mb-4" aria-label={label}>
                  <h3 className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider px-1 mb-1">{label}</h3>
                  {rows.map((h) => (
                    <button key={`${h.kind}-${h.id}`} onClick={() => pick(h)} className="w-full text-left px-2 py-2.5 rounded-card hover:bg-slate-800 flex items-start gap-2.5">
                      <Icon className="w-4 h-4 text-slate-400 mt-0.5 shrink-0" />
                      <span className="min-w-0"><span className="block text-sm font-medium truncate">{h.title}</span><span className="block text-xs text-slate-400 truncate">{h.sub}</span></span>
                    </button>
                  ))}
                </section>
              );
            })}
            {busy && hits.length > 0 && <p className="text-xs text-slate-500 text-center">Searching more…</p>}
          </div>
        </div>
      )}
    </>
  );
}
