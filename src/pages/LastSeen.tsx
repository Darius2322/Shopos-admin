import { useCallback, useEffect, useState } from 'react';
import { SupabaseClient } from '@supabase/supabase-js';
import { Card, EmptyState, ErrorText, Modal, Skeleton } from '../components/ui';
import { describeError } from '../lib/errors';
import { ago } from '../lib/siteUtil';

interface Shop {
  id: string; name: string; status: string; created_at: string; last_activity_kind: string | null; business_email: string | null;
  owner_name: string | null; owner_phone: string | null; owner_email: string | null;
  last_seen: string | null; last_login: string | null; last_sale: string | null; sales_total: number; sales_30d: number; products: number; app_version: string | null;
  staff: { name: string | null; role: string; status: string | null; last_login: string | null }[];
  devices: { name: string | null; type: string | null; last_active: string | null; revoked: boolean }[];
}
interface Person { who: string; detail: string | null; business: string | null; phone: string | null; last_seen: string | null; first_seen: string | null; visits: number; last_path: string | null; last_sign_in: string | null }
type Kind = 'shop' | 'owner' | 'booker';
const DAY = 86400000;
const QUIET = [[0, 'Any'], [1, '1+ day'], [3, '3+ days'], [7, '1+ week'], [14, '2+ weeks'], [30, '1+ month'], [60, '2+ months'], [90, '3+ months']] as const;
const dt = (d?: string | null) => (d ? new Date(d).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'never');
const quietDays = (iso: string | null, created?: string) => { const t = iso ?? created ?? null; return t ? Math.floor((Date.now() - new Date(t).getTime()) / DAY) : 9999; };
const online = (iso: string | null) => !!iso && Date.now() - new Date(iso).getTime() < 5 * 60000;
const span = (d: number) => (d >= 9999 ? 'never' : d < 1 ? 'today' : d >= 60 ? `${Math.floor(d / 30)} months` : d >= 14 ? `${Math.floor(d / 7)} weeks` : `${d} day${d === 1 ? '' : 's'}`);

function Stat({ l, v }: { l: string; v: React.ReactNode }) { return <div className="rounded-lg border border-slate-700 p-2"><div className="text-[10px] uppercase tracking-wide text-slate-500">{l}</div><div className="text-sm font-medium break-words">{v}</div></div>; }

/** When shops, booking owners and bookers were last in the apps, with a "quiet for" filter and full detail per shop. */
export default function LastSeen({ supabase, onOpenBusiness }: { supabase: SupabaseClient; onOpenBusiness?: (id: string) => void }) {
  const [kind, setKind] = useState<Kind>('shop');
  const [shops, setShops] = useState<Shop[] | null>(null); const [people, setPeople] = useState<Person[] | null>(null);
  const [err, setErr] = useState<string | null>(null); const [q, setQ] = useState('');
  const [quiet, setQuiet] = useState(0); const [custom, setCustom] = useState(''); const [sort, setSort] = useState<'recent' | 'quiet'>('recent');
  const [open, setOpen] = useState<Shop | null>(null);

  const load = useCallback(async (k: Kind) => {
    setErr(null);
    if (k === 'shop') { const { data, error } = await supabase.rpc('admin_last_seen_shops'); if (error) { setErr(describeError(error, 'Could not load last seen')); setShops([]); return; } setShops((data ?? []) as Shop[]); }
    else { const { data, error } = await supabase.rpc('admin_last_seen', { p_kind: k }); if (error) { setErr(describeError(error, 'Could not load last seen')); setPeople([]); return; } setPeople((data ?? []) as Person[]); }
  }, [supabase]);
  useEffect(() => { void load(kind); const t = setInterval(() => void load(kind), 60000); return () => clearInterval(t); }, [kind, load]);

  const match = (xs: (string | null | undefined)[]) => !q.trim() || xs.some((x) => (x ?? '').toLowerCase().includes(q.toLowerCase()));
  const sortBy = <T,>(a: T[], f: (x: T) => number) => [...a].sort((x, y) => (sort === 'quiet' ? f(y) - f(x) : f(x) - f(y)));
  const shownShops = sortBy((shops ?? []).filter((s) => quietDays(s.last_seen, s.created_at) >= quiet && match([s.name, s.owner_name, s.owner_phone, s.owner_email])), (s) => quietDays(s.last_seen, s.created_at));
  const shownPeople = sortBy((people ?? []).filter((p) => quietDays(p.last_seen) >= quiet && match([p.who, p.detail, p.business, p.phone])), (p) => quietDays(p.last_seen));
  const loading = kind === 'shop' ? shops === null : people === null;
  const count = kind === 'shop' ? shownShops.length : shownPeople.length;
  const pill = (on: boolean) => `rounded-full border px-3 py-1.5 text-xs ${on ? 'bg-emerald-600 border-emerald-600 text-white' : 'border-slate-600 text-slate-300'}`;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {([['shop', 'Shops (POS)'], ['owner', 'Booking owners'], ['booker', 'Bookers']] as const).map(([k, l]) => <button key={k} onClick={() => setKind(k)} className={pill(kind === k)}>{l}</button>)}
        <input className="ml-auto rounded-xl border border-slate-600 bg-transparent px-3 py-1.5 text-sm w-48" placeholder="Search name, phone, email" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      <Card>
        <div className="text-xs text-slate-400 mb-2">Quiet for (not seen in)</div>
        <div className="flex flex-wrap items-center gap-2">
          {QUIET.map(([d, l]) => <button key={d} onClick={() => setQuiet(d)} className={pill(quiet === d)}>{l}</button>)}
          <span className="flex items-center gap-1"><input aria-label="Custom days" inputMode="numeric" value={custom} onChange={(e) => { const v = e.target.value.replace(/\D/g, '').slice(0, 4); setCustom(v); setQuiet(v ? parseInt(v, 10) : 0); }} placeholder="days" className="w-16 rounded-full border border-slate-600 bg-transparent px-3 py-1.5 text-xs" /></span>
          <button onClick={() => setSort(sort === 'recent' ? 'quiet' : 'recent')} className="ml-auto text-xs text-slate-300 underline">{sort === 'recent' ? 'Showing most recent first' : 'Showing longest quiet first'}</button>
        </div>
        <div className="mt-2 text-xs text-slate-500">{loading ? 'Loading…' : `${count} ${kind === 'shop' ? 'shop' : 'person'}${count === 1 ? '' : 's'}${quiet ? ` quiet for ${span(quiet)} or more` : ''}`}</div>
      </Card>
      {err && <ErrorText>{err}</ErrorText>}
      {loading ? <Skeleton /> : count === 0 ? <EmptyState message={quiet ? 'Nobody has been quiet that long.' : kind === 'booker' ? 'Nobody yet. Bookers appear after they open the booker app or a booking page.' : 'Nothing found.'} /> : kind === 'shop' ? (
        <Card><div className="divide-y divide-slate-700/60">
          {shownShops.map((s) => { const d = quietDays(s.last_seen, s.created_at); return (
            <button key={s.id} onClick={() => setOpen(s)} className="w-full text-left py-3 flex items-start gap-3">
              <span className={`mt-1.5 w-2.5 h-2.5 rounded-full shrink-0 ${online(s.last_seen) ? 'bg-emerald-500' : d >= 30 ? 'bg-rust-500' : 'bg-slate-500'}`} />
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium truncate">{s.name} <span className="text-[10px] rounded bg-slate-700 px-1.5 py-0.5 font-normal text-slate-300">{s.status}</span></div>
                <div className="text-xs text-slate-400 truncate">{[s.owner_name, s.owner_phone].filter(Boolean).join(' · ') || 'No owner details'}</div>
                <div className="text-xs text-slate-500 mt-0.5">{s.sales_30d} sales in 30 days · {s.sales_total} total · {s.products} products{s.app_version ? ` · v${s.app_version}` : ''}</div>
              </div>
              <div className="text-right text-xs shrink-0"><div className="font-medium">{online(s.last_seen) ? 'Online now' : s.last_seen ? ago(s.last_seen) : 'never used'}</div><div className="text-slate-500">quiet {span(d)}</div></div>
            </button>); })}
        </div></Card>
      ) : (
        <Card><div className="divide-y divide-slate-700/60">
          {shownPeople.map((r, i) => (
            <div key={i} className="py-3 flex items-start gap-3">
              <span className={`mt-1.5 w-2.5 h-2.5 rounded-full shrink-0 ${online(r.last_seen) ? 'bg-emerald-500' : 'bg-slate-500'}`} />
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium truncate">{r.who}{r.business ? <span className="text-slate-400 font-normal"> · {r.business}</span> : null}</div>
                <div className="text-xs text-slate-400 truncate">{[r.detail, r.phone].filter(Boolean).join(' · ') || '—'}</div>
                <div className="text-xs text-slate-500 mt-0.5">{r.visits ? `${r.visits} visit${r.visits === 1 ? '' : 's'}` : ''}{r.first_seen ? ` · first seen ${new Date(r.first_seen).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}` : ''}{r.last_path ? ` · last on ${r.last_path}` : ''}</div>
              </div>
              <div className="text-right text-xs shrink-0"><div className="font-medium">{online(r.last_seen) ? 'Online now' : ago(r.last_seen)}</div><div className="text-slate-500">quiet {span(quietDays(r.last_seen))}</div>{kind === 'owner' && r.last_sign_in && <div className="text-slate-500">signed in {ago(r.last_sign_in)}</div>}</div>
            </div>))}
        </div></Card>
      )}

      {open && (
        <Modal title={open.name} subtitle={`${open.status} · signed up ${dt(open.created_at)}`} onClose={() => setOpen(null)}>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <Stat l="Last seen" v={online(open.last_seen) ? 'Online now' : dt(open.last_seen)} />
              <Stat l="Quiet for" v={span(quietDays(open.last_seen, open.created_at))} />
              <Stat l="Last login" v={dt(open.last_login)} />
              <Stat l="Last sale" v={dt(open.last_sale)} />
              <Stat l="Sales (30 days)" v={open.sales_30d} />
              <Stat l="Sales (all time)" v={open.sales_total} />
              <Stat l="Active products" v={open.products} />
              <Stat l="App version" v={open.app_version ?? '—'} />
            </div>
            <div className="text-xs space-y-0.5"><div className="text-slate-500 uppercase tracking-wide text-[10px]">Owner</div>
              <div>{open.owner_name ?? '—'}</div>
              {open.owner_phone && <div><a className="underline" href={`tel:${open.owner_phone}`}>{open.owner_phone}</a> · <a className="underline" href={`https://wa.me/${open.owner_phone.replace(/\D/g, '')}`} target="_blank" rel="noreferrer">WhatsApp</a></div>}
              {(open.owner_email || open.business_email) && <div>{open.owner_email ?? open.business_email}</div>}
            </div>
            <div><div className="text-slate-500 uppercase tracking-wide text-[10px] mb-1">Staff ({open.staff.length})</div>
              {open.staff.length === 0 ? <div className="text-xs text-slate-500">None</div> : <ul className="text-xs space-y-1">{open.staff.map((p, i) => <li key={i} className="flex justify-between gap-2"><span className="truncate">{p.name ?? '—'} · {p.role}{p.status && p.status !== 'active' ? ` (${p.status})` : ''}</span><span className="text-slate-500 shrink-0">{p.last_login ? ago(p.last_login) : 'never signed in'}</span></li>)}</ul>}</div>
            <div><div className="text-slate-500 uppercase tracking-wide text-[10px] mb-1">Devices ({open.devices.length})</div>
              {open.devices.length === 0 ? <div className="text-xs text-slate-500">None</div> : <ul className="text-xs space-y-1">{open.devices.map((d, i) => <li key={i} className="flex justify-between gap-2"><span className="truncate">{d.name ?? d.type ?? 'Device'}{d.revoked ? ' (signed out)' : ''}</span><span className="text-slate-500 shrink-0">{d.last_active ? ago(d.last_active) : '—'}</span></li>)}</ul>}</div>
            {onOpenBusiness && <button className="btn-secondary text-xs" onClick={() => { const id = open.id; setOpen(null); onOpenBusiness(id); }}>Open business</button>}
          </div>
        </Modal>
      )}
    </div>
  );
}
