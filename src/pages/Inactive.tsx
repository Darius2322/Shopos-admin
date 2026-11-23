import { useEffect, useMemo, useState } from 'react';
import { SupabaseClient } from '@supabase/supabase-js';
import { Card, EmptyState, ErrorText, Modal, Skeleton } from '../components/ui';
import { describeError } from '../lib/errors';

interface Biz {
  kind: 'shop' | 'booking'; id: string; name: string; status: string | null; email: string | null; phone: string | null; package: string | null;
  created_at: string; last_activity: string | null; last_kind: string | null; never_used: boolean; days_inactive: number; days_since_signup: number;
  sales: number; products: number; staff: number; last_sale: string | null; last_login: string | null; onboarding_done?: boolean | null; onboarding_step?: string | number | null; activation_expires_at?: string | null;
}
const WINDOWS = [7, 14, 30, 60, 90];
const d = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '–');
const span = (n: number) => (n >= 60 ? `${Math.floor(n / 30)} months` : n === 1 ? '1 day' : `${n} days`);
const waNumber = (p: string | null) => { const x = (p ?? '').replace(/\D/g, ''); return x.startsWith('0') ? `254${x.slice(1)}` : x.startsWith('7') || x.startsWith('1') ? `254${x}` : x; };

/** Businesses that registered but have gone quiet or never started. */
export default function Inactive({ supabase, onOpenBusiness }: { supabase: SupabaseClient; onOpenBusiness: (id: string) => void }) {
  const [days, setDays] = useState(14); const [kind, setKind] = useState<'all' | 'shop' | 'booking'>('all'); const [only, setOnly] = useState<'all' | 'never' | 'quiet'>('all');
  const [rows, setRows] = useState<Biz[] | null>(null); const [err, setErr] = useState<string | null>(null); const [q, setQ] = useState(''); const [open, setOpen] = useState<string | null>(null);

  useEffect(() => {
    let off = false; setRows(null); setErr(null);
    void supabase.rpc('admin_inactive_businesses', { p_days: days }).then(({ data, error }) => {
      if (off) return;
      if (error) { setErr(describeError(error, 'Could not load inactive businesses')); setRows([]); return; }
      setRows((data ?? []) as Biz[]);
    });
    return () => { off = true; };
  }, [supabase, days]);

  const shown = useMemo(() => (rows ?? []).filter((r) => (kind === 'all' || r.kind === kind) && (only === 'all' || (only === 'never' ? r.never_used : !r.never_used)) && (!q.trim() || [r.name, r.email, r.phone].some((x) => (x ?? '').toLowerCase().includes(q.toLowerCase())))), [rows, kind, only, q]);
  const never = (rows ?? []).filter((r) => r.never_used).length;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Inactive businesses</h1>
        <p className="text-xs text-slate-400">Registered businesses with no activity (sales, sign-ins or bookings) for the chosen time. “Never started” means they registered but have never made a sale or booking.</p>
      </div>
      <div className="flex flex-wrap gap-2 items-center">
        <span className="text-xs text-slate-400">Quiet for at least</span>
        {WINDOWS.map((w) => <button key={w} onClick={() => setDays(w)} className={`rounded-full border px-3 py-1 text-sm ${days === w ? 'bg-emerald-600 border-emerald-600 text-white' : 'border-slate-600 text-slate-300'}`}>{w} days</button>)}
      </div>
      <div className="flex flex-wrap gap-2 items-center">
        {([['all', 'All'], ['shop', 'Shops (POS)'], ['booking', 'Booking']] as const).map(([k, l]) => <button key={k} onClick={() => setKind(k)} className={`rounded-full border px-3 py-1 text-xs ${kind === k ? 'bg-slate-200 text-slate-900 border-slate-200' : 'border-slate-600 text-slate-300'}`}>{l}</button>)}
        <span className="w-px h-5 bg-slate-700" />
        {([['all', 'Everyone'], ['never', `Never started${rows ? ` (${never})` : ''}`], ['quiet', 'Went quiet']] as const).map(([k, l]) => <button key={k} onClick={() => setOnly(k)} className={`rounded-full border px-3 py-1 text-xs ${only === k ? 'bg-slate-200 text-slate-900 border-slate-200' : 'border-slate-600 text-slate-300'}`}>{l}</button>)}
        <input className="ml-auto rounded-xl border border-slate-600 bg-transparent px-3 py-1.5 text-sm w-48" placeholder="Search" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search" />
      </div>
      {err && <ErrorText>{err}</ErrorText>}
      {rows === null ? <Skeleton /> : shown.length === 0 ? <EmptyState message={`No businesses have been inactive for ${days} days or more. Nice.`} /> : (
        <Card>
          <p className="text-xs text-slate-400 mb-2">{shown.length} business{shown.length === 1 ? '' : 'es'}, longest quiet first</p>
          <ul className="divide-y divide-slate-700/60">
            {shown.map((r) => {
              const isOpen = open === r.id;
              const msg = r.never_used
                ? `Hi ${r.name}, you registered on ShopOS ${span(r.days_since_signup)} ago but haven't started yet. Can I help you get set up? It only takes a few minutes.`
                : `Hi ${r.name}, we noticed you haven't used ShopOS for ${span(r.days_inactive)}. Is everything okay? Let us know if you need any help.`;
              return (
                <li key={`${r.kind}-${r.id}`} className="py-3">
                  <button type="button" onClick={() => setOpen(isOpen ? null : r.id)} aria-haspopup="dialog" className="w-full text-left flex items-start justify-between gap-3">
                    <span className="min-w-0">
                      <span className="block text-sm font-medium truncate">{r.name} <span className="text-[11px] font-normal text-slate-400">· {r.kind === 'shop' ? 'POS shop' : 'Booking'}{r.status ? ` · ${r.status}` : ''}</span></span>
                      <span className="block text-xs text-slate-400">Registered {d(r.created_at)} ({span(r.days_since_signup)} ago){r.package ? ` · ${r.package}` : ''}</span>
                    </span>
                    <span className="text-right shrink-0">
                      {r.never_used ? <span className="text-xs rounded-full px-2 py-0.5 bg-amber-500/15 text-amber-300">Never started</span> : <span className="text-xs rounded-full px-2 py-0.5 bg-rose-500/15 text-rose-300">Quiet {span(r.days_inactive)}</span>}
                      <span className="block text-[11px] text-slate-500 mt-1">details</span>
                    </span>
                  </button>
                  {isOpen && (
                    <Modal title={r.name} subtitle={`${r.kind === 'shop' ? 'POS shop' : 'Booking business'}${r.status ? ` · ${r.status}` : ''} · registered ${d(r.created_at)}`} onClose={() => setOpen(null)}>
                    <div className="text-xs space-y-3">
                      <dl className="grid grid-cols-[auto,1fr] gap-x-4 gap-y-1">
                        <dt className="text-slate-400">Last activity</dt><dd>{r.last_activity ? `${new Date(r.last_activity).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}${r.last_kind ? ` (${r.last_kind})` : ''}` : 'None recorded'}</dd>
                        <dt className="text-slate-400">{r.kind === 'shop' ? 'Last sale' : 'Last booking'}</dt><dd>{r.last_sale ? d(r.last_sale) : 'Never'}</dd>
                        <dt className="text-slate-400">Last sign-in</dt><dd>{r.last_login ? d(r.last_login) : 'Never'}</dd>
                        <dt className="text-slate-400">{r.kind === 'shop' ? 'Sales / products / staff' : 'Bookings'}</dt><dd>{r.kind === 'shop' ? `${r.sales} / ${r.products} / ${r.staff}` : r.sales}</dd>
                        {r.kind === 'shop' && <><dt className="text-slate-400">Setup</dt><dd>{r.onboarding_done ? 'Finished' : `Not finished${r.onboarding_step ? ` (step ${r.onboarding_step})` : ''}`}</dd></>}
                        {r.activation_expires_at && <><dt className="text-slate-400">Access until</dt><dd>{d(r.activation_expires_at)}</dd></>}
                        <dt className="text-slate-400">Contact</dt><dd className="break-all">{[r.email, r.phone].filter(Boolean).join(' · ') || 'No contact on file'}</dd>
                      </dl>
                      <div className="flex flex-wrap gap-2 pt-1">
                        {r.kind === 'shop' && <button className="btn-secondary text-xs" onClick={() => onOpenBusiness(r.id)}>Open business</button>}
                        {r.phone && <a className="btn-secondary text-xs" href={`tel:${r.phone}`}>Call</a>}
                        {r.phone && <a className="btn-secondary text-xs" target="_blank" rel="noopener noreferrer" href={`https://wa.me/${waNumber(r.phone)}?text=${encodeURIComponent(msg)}`}>WhatsApp nudge</a>}
                        {r.email && <a className="btn-secondary text-xs" href={`mailto:${r.email}?subject=${encodeURIComponent('Can we help you with ShopOS?')}&body=${encodeURIComponent(msg)}`}>Email nudge</a>}
                      </div>
                    </div>
                    </Modal>
                  )}
                </li>
              );
            })}
          </ul>
        </Card>
      )}
    </div>
  );
}
