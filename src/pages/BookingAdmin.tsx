import { useEffect, useMemo, useState } from 'react';
import { SupabaseClient } from '@supabase/supabase-js';
import { Download } from 'lucide-react';
import { Card, ErrorText, Skeleton, EmptyState } from '../components/ui';
import { friendlyError } from '../lib/friendlyError';

type R = Record<string, any>;
export type BkView = 'analytics' | 'owners' | 'catalog' | 'today' | 'revenue' | 'quotes' | 'activity';
const KIND: Record<string, string> = { salon: 'Salon', barbershop: 'Barbershop', beauty: 'Beauty studio', spa: 'Spa & massage', bus: 'Bus & shuttle', clinic: 'Clinic', carwash: 'Car wash', fitness: 'Fitness & classes', custom: 'Custom' };
const TZ = 'Africa/Nairobi';
const ymd = (d: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(d);
const kes = (n: number) => `KES ${Math.round(n).toLocaleString()}`;
const hourOf = (iso: string) => Number(new Date(iso).toLocaleString('en-GB', { hour: '2-digit', hour12: false, timeZone: TZ })) % 24;
const when = (iso: string) => new Date(iso).toLocaleString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: TZ });
const ago = (iso: string | null) => { if (!iso) return 'never'; const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000); if (m < 2) return 'just now'; if (m < 60) return `${m} min ago`; if (m < 1440) return `${Math.round(m / 60)} h ago`; const d = Math.round(m / 1440); return d < 60 ? `${d} day${d === 1 ? '' : 's'} ago` : `${Math.round(d / 30)} months ago`; };

function Bar({ label, value, max, note }: { label: string; value: number; max: number; note?: string }) {
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="w-28 truncate text-slate-500">{label}</span>
      <div className="flex-1 h-2.5 rounded-full bg-slate-800/40 overflow-hidden"><div className="h-full rounded-full bg-field-600" style={{ width: `${max ? Math.max(2, (value / max) * 100) : 0}%` }} /></div>
      <span className="w-20 text-right tabular-nums">{note ?? value}</span>
    </div>
  );
}
function Kpi({ l, v, sub }: { l: string; v: string | number; sub?: string }) {
  return <Card className="p-3 text-center"><div className="text-xl font-semibold">{v}</div><div className="text-xs text-slate-500">{l}</div>{sub && <div className="text-[10px] text-slate-400">{sub}</div>}</Card>;
}
function Chips<T extends string | number>({ value, onChange, items }: { value: T; onChange: (v: T) => void; items: [T, string][] }) {
  return <div className="flex flex-wrap gap-2">{items.map(([id, l]) => <button key={String(id)} onClick={() => onChange(id)} className={`px-3 py-1.5 rounded-full text-xs border ${value === id ? 'bg-field-600 text-white border-field-600' : 'border-slate-300 text-slate-600'}`}>{l}</button>)}</div>;
}
function csv(name: string, rows: (string | number)[][]) {
  const body = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([body], { type: 'text/csv' })); a.download = name; a.click(); URL.revokeObjectURL(a.href);
}

/** Booking admin: analytics, owners and logins, services and chairs, today, revenue, quotes and activity. */
export default function BookingAdmin({ supabase, view }: { supabase: SupabaseClient; view: BkView }) {
  const [bk, setBk] = useState<R[] | null>(null);
  const [biz, setBiz] = useState<R[]>([]);
  const [owners, setOwners] = useState<R[]>([]);
  const [svc, setSvc] = useState<R[]>([]);
  const [staff, setStaff] = useState<R[]>([]);
  const [quotes, setQuotes] = useState<R[]>([]);
  const [apps, setApps] = useState<R[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [days, setDays] = useState(30);
  const [q, setQ] = useState('');
  const [f, setF] = useState('all');

  useEffect(() => {
    (async () => {
      const [b, bz, o, s, st, qu, a] = await Promise.all([
        supabase.from('bk_bookings').select('*, bk_businesses(name, kind), bk_services(name), bk_staff(name)').order('starts_at', { ascending: false }).limit(5000),
        supabase.from('bk_businesses').select('*').order('created_at', { ascending: false }),
        supabase.rpc('bk_admin_owners'),
        supabase.from('bk_services').select('*, bk_businesses(name)').order('sort'),
        supabase.from('bk_staff').select('*, bk_businesses(name)').order('sort'),
        supabase.from('bk_quotes').select('*, bk_businesses(name)').order('created_at', { ascending: false }).limit(500),
        supabase.from('bk_applications').select('*').order('created_at', { ascending: false }).limit(200),
      ]);
      if (b.error) { setErr(friendlyError(b.error, 'Could not load booking data.')); return; }
      setBk((b.data ?? []) as R[]); setBiz((bz.data ?? []) as R[]); setOwners((o.data ?? []) as R[]); setSvc((s.data ?? []) as R[]); setStaff((st.data ?? []) as R[]); setQuotes((qu.data ?? []) as R[]); setApps((a.data ?? []) as R[]);
    })();
  }, [supabase]);

  const range = useMemo(() => { const from = Date.now() - days * 86400000; return (bk ?? []).filter((r) => { const t = new Date(r.starts_at).getTime(); return t >= from && t <= Date.now() + 90 * 86400000; }); }, [bk, days]);

  if (err) return <ErrorText>{err}</ErrorText>;
  if (!bk) return <Skeleton rows={4} />;
  const live = (r: R) => !['cancelled', 'no_show'].includes(r.status);
  const paidSum = (rows: R[]) => rows.filter((r) => r.paid && live(r)).reduce((a, r) => a + Number(r.price), 0);
  const pct = (a: number, b: number) => (b ? `${Math.round((a / b) * 100)}%` : '0%');

  /* ───────── Analytics */
  if (view === 'analytics') {
    const n = range.length; const done = range.filter((r) => r.status === 'completed').length; const canc = range.filter((r) => r.status === 'cancelled').length; const ns = range.filter((r) => r.status === 'no_show').length;
    const ver = range.filter((r) => r.verified_at).length; const rev = paidSum(range);
    const customers = new Set(range.map((r) => r.customer_phone)); const counts: Record<string, number> = {}; for (const r of range) counts[r.customer_phone] = (counts[r.customer_phone] ?? 0) + 1;
    const repeat = Object.values(counts).filter((c) => c > 1).length;
    const lead = range.length ? range.reduce((a, r) => a + (new Date(r.starts_at).getTime() - new Date(r.created_at).getTime()), 0) / range.length / 86400000 : 0;
    const bars = Math.min(days, 30); const series = Array.from({ length: bars }, (_, i) => { const d = ymd(new Date(Date.now() - (bars - 1 - i) * 86400000)); return { d, n: (bk ?? []).filter((r) => ymd(new Date(r.created_at)) === d).length }; }); const maxS = Math.max(1, ...series.map((x) => x.n));
    const hr = Array.from({ length: 24 }, (_, h) => range.filter((r) => hourOf(r.starts_at) === h).length); const hrs = hr.map((c, h) => ({ h, c })).filter((x) => x.c > 0);
    const wdName = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']; const wd = Array.from({ length: 7 }, (_, i) => range.filter((r) => new Date(new Date(r.starts_at).toLocaleString('en-US', { timeZone: TZ })).getDay() === i).length);
    const by = (key: (r: R) => string) => { const m: Record<string, number> = {}; for (const r of range) { const k = key(r); m[k] = (m[k] ?? 0) + 1; } return Object.entries(m).sort((a, b) => b[1] - a[1]).slice(0, 8); };
    const bySvc = by((r) => r.bk_services?.name ?? 'Trip'); const byBiz = by((r) => r.bk_businesses?.name ?? 'Unknown'); const byKind = by((r) => KIND[r.bk_businesses?.kind] ?? 'Custom');
    const status = by((r) => r.status.replace('_', ' '));
    return (
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-2"><Chips value={days} onChange={setDays} items={[[7, '7 days'], [30, '30 days'], [90, '90 days'], [365, '1 year']]} />
          <button onClick={() => csv(`booking-analytics-${days}d.csv`, [['Code', 'Business', 'Service', 'Customer', 'Phone', 'When', 'Status', 'Price', 'Paid', 'Verified'], ...range.map((r) => [r.code, r.bk_businesses?.name ?? '', r.bk_services?.name ?? '', r.customer_name, r.customer_phone, r.starts_at, r.status, r.price, r.paid ? 'yes' : 'no', r.verified_at ? 'yes' : 'no'])])} className="btn-secondary text-xs !py-1 ml-auto inline-flex items-center gap-1"><Download className="w-3 h-3" />CSV</button></div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <Kpi l="Bookings" v={n} /><Kpi l="Paid by customers" v={kes(rev)} sub={n ? `avg ${kes(rev / Math.max(1, range.filter((r) => r.paid && live(r)).length))}` : undefined} /><Kpi l="Completed" v={pct(done, n)} sub={`${done} bookings`} /><Kpi l="Cancelled" v={pct(canc, n)} sub={`${canc} bookings`} />
          <Kpi l="No-shows" v={pct(ns, n)} sub={`${ns} bookings`} /><Kpi l="Verified on the day" v={pct(ver, n)} sub={`${ver} bookings`} /><Kpi l="Customers" v={customers.size} sub={`${repeat} came back`} /><Kpi l="Booked ahead" v={`${lead.toFixed(1)} days`} sub="average lead time" />
        </div>
        <Card className="p-4"><h3 className="font-medium text-sm mb-3">Bookings made per day{bars < days ? ` (last ${bars})` : ''}</h3><div className="flex items-end gap-0.5 h-28">{series.map((x) => <div key={x.d} className="flex-1 rounded-t bg-field-600" style={{ height: `${Math.max(2, (x.n / maxS) * 100)}%` }} title={`${x.d}: ${x.n}`} />)}</div></Card>
        <div className="grid md:grid-cols-2 gap-3">
          <Card className="p-4 space-y-2"><h3 className="font-medium text-sm">Status</h3>{status.length === 0 ? <p className="text-xs text-slate-500">Nothing yet.</p> : status.map(([k, c]) => <Bar key={k} label={k} value={c} max={status[0][1]} note={`${c} · ${pct(c, n)}`} />)}</Card>
          <Card className="p-4 space-y-2"><h3 className="font-medium text-sm">By kind of business</h3>{byKind.length === 0 ? <p className="text-xs text-slate-500">Nothing yet.</p> : byKind.map(([k, c]) => <Bar key={k} label={k} value={c} max={byKind[0][1]} />)}</Card>
          <Card className="p-4 space-y-2"><h3 className="font-medium text-sm">Top businesses</h3>{byBiz.length === 0 ? <p className="text-xs text-slate-500">Nothing yet.</p> : byBiz.map(([k, c]) => <Bar key={k} label={k} value={c} max={byBiz[0][1]} />)}</Card>
          <Card className="p-4 space-y-2"><h3 className="font-medium text-sm">Most booked services</h3>{bySvc.length === 0 ? <p className="text-xs text-slate-500">Nothing yet.</p> : bySvc.map(([k, c]) => <Bar key={k} label={k} value={c} max={bySvc[0][1]} />)}</Card>
          <Card className="p-4 space-y-2"><h3 className="font-medium text-sm">Busiest days</h3>{wdName.map((nme, i) => <Bar key={nme} label={nme} value={wd[i]} max={Math.max(1, ...wd)} />)}</Card>
          <Card className="p-4 space-y-2"><h3 className="font-medium text-sm">Busiest hours</h3>{hrs.length === 0 ? <p className="text-xs text-slate-500">Nothing yet.</p> : hrs.map((x) => <Bar key={x.h} label={`${String(x.h).padStart(2, '0')}:00`} value={x.c} max={Math.max(...hrs.map((y) => y.c))} />)}</Card>
        </div>
      </div>
    );
  }

  /* ───────── Owners & logins */
  if (view === 'owners') {
    const cnt: Record<string, number> = {}; for (const r of bk) cnt[r.business_id] = (cnt[r.business_id] ?? 0) + 1;
    const list = owners.filter((o) => (!q || `${o.business_name} ${o.email ?? ''}`.toLowerCase().includes(q.toLowerCase())) && (f === 'all' || (f === 'never' ? !o.last_sign_in_at : f === 'inactive' ? !o.last_sign_in_at || Date.now() - new Date(o.last_sign_in_at).getTime() > 14 * 86400000 : o.last_sign_in_at && Date.now() - new Date(o.last_sign_in_at).getTime() <= 7 * 86400000)));
    return (
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-2"><Chips value={f} onChange={setF} items={[['all', 'All'], ['active', 'Signed in this week'], ['inactive', 'Quiet 14+ days'], ['never', 'Never signed in']]} />
          <button onClick={() => csv('booking-owners.csv', [['Business', 'Email', 'Last sign-in', 'Account created', 'Also has ShopOS', 'Bookings'], ...list.map((o) => [o.business_name, o.email ?? '', o.last_sign_in_at ?? '', o.account_created ?? '', o.has_shop ? 'yes' : 'no', cnt[o.business_id] ?? 0])])} className="btn-secondary text-xs !py-1 ml-auto inline-flex items-center gap-1"><Download className="w-3 h-3" />CSV</button></div>
        <input className="input" placeholder="Search business or email" value={q} onChange={(e) => setQ(e.target.value)} />
        {list.length === 0 ? <EmptyState message="No owners match." /> : list.map((o) => (
          <Card key={o.business_id} className="p-3">
            <div className="flex items-start justify-between gap-3"><div className="min-w-0"><div className="text-sm font-medium">{o.business_name}</div><div className="text-xs text-slate-500 break-all">{o.email ?? 'No owner account'}</div></div>
              <div className="text-right shrink-0"><div className="text-sm">{ago(o.last_sign_in_at)}</div><div className="text-[10px] text-slate-400">last sign-in</div></div></div>
            <div className="text-xs text-slate-400 mt-2 flex flex-wrap gap-x-4">{o.last_sign_in_at && <span>{new Date(o.last_sign_in_at).toLocaleString('en-GB', { timeZone: TZ })}</span>}{o.account_created && <span>Account created {new Date(o.account_created).toLocaleDateString('en-GB')}</span>}<span>{o.has_shop ? 'Also has a ShopOS shop (same sign-in)' : 'Bookings only'}</span><span>{cnt[o.business_id] ?? 0} bookings</span></div>
          </Card>))}
      </div>
    );
  }

  /* ───────── Services and chairs */
  if (view === 'catalog') {
    const groups = biz.map((b) => ({ b, s: svc.filter((x) => x.business_id === b.id), t: staff.filter((x) => x.business_id === b.id) })).filter((g) => !q || g.b.name.toLowerCase().includes(q.toLowerCase()));
    return (
      <div className="space-y-3">
        <input className="input" placeholder="Search business" value={q} onChange={(e) => setQ(e.target.value)} />
        {groups.length === 0 ? <EmptyState message="No businesses yet." /> : groups.map(({ b, s, t }) => (
          <Card key={b.id} className="p-4 space-y-2">
            <div className="flex items-center justify-between"><div className="font-medium text-sm">{b.name} <span className="text-xs text-slate-400">· {KIND[b.kind] ?? b.kind}</span></div><span className="text-xs text-slate-400">{s.length} services · {t.length} chairs/staff</span></div>
            {s.length === 0 ? <p className="text-xs text-slate-500">No services yet.</p> : <div className="grid sm:grid-cols-2 gap-1.5">{s.map((x) => <div key={x.id} className={`text-xs rounded-lg bg-slate-800/30 px-2.5 py-1.5 flex justify-between ${x.active ? '' : 'opacity-50'}`}><span>{x.name} · {x.duration_min} min{x.capacity > 1 ? ` · ${x.capacity} at once` : ''}</span><b>{kes(Number(x.price))}</b></div>)}</div>}
            {t.length > 0 && <div className="flex flex-wrap gap-1.5">{t.map((x) => <span key={x.id} className={`text-xs px-2 py-0.5 rounded-full border border-slate-600 ${x.active ? '' : 'opacity-50'}`}>{x.name}</span>)}</div>}
          </Card>))}
      </div>
    );
  }

  /* ───────── Today and tomorrow */
  if (view === 'today') {
    const t0 = ymd(new Date()); const t1 = ymd(new Date(Date.now() + 86400000));
    const days2 = [[t0, 'Today'], [t1, 'Tomorrow']] as const;
    return (
      <div className="space-y-4">
        {days2.map(([d, label]) => {
          const rows = bk.filter((r) => ymd(new Date(r.starts_at)) === d && ['pending', 'confirmed', 'completed'].includes(r.status)).sort((a, b) => a.starts_at.localeCompare(b.starts_at));
          return (
            <div key={d} className="space-y-2">
              <h3 className="font-medium text-sm">{label} · {rows.length} booking{rows.length === 1 ? '' : 's'}{label === 'Today' ? ` · ${rows.filter((r) => r.verified_at).length} verified` : ''}</h3>
              {rows.length === 0 ? <Card className="p-4 text-xs text-slate-500">Nothing booked.</Card> : rows.map((r) => (
                <Card key={r.id} className="p-3 flex items-center justify-between gap-3"><div className="min-w-0"><div className="text-sm font-medium">{r.customer_name} <span className="text-slate-400 font-normal">· {r.customer_phone}</span></div><div className="text-xs text-slate-500">{r.bk_businesses?.name} · {r.bk_services?.name ?? 'Trip'}{r.bk_staff?.name ? ` · ${r.bk_staff.name}` : ''} · {when(r.starts_at)}</div></div>
                  <div className="text-right text-xs shrink-0"><div className="capitalize">{r.status.replace('_', ' ')}</div>{r.verified_at && <div className="text-field-600">verified ✓</div>}</div></Card>))}
            </div>);
        })}
      </div>
    );
  }

  /* ───────── Revenue */
  if (view === 'revenue') {
    const months = Array.from({ length: 6 }, (_, i) => { const d = new Date(); d.setMonth(d.getMonth() - (5 - i)); return new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit' }).format(d); });
    const mrows = months.map((m) => { const rows = bk.filter((r) => ymd(new Date(r.starts_at)).startsWith(m) && live(r)); return { m, paid: paidSum(rows), unpaid: rows.filter((r) => !r.paid && r.status === 'completed').reduce((a, r) => a + Number(r.price), 0) }; });
    const mx = Math.max(1, ...mrows.map((x) => x.paid));
    const per: Record<string, { name: string; paid: number; owed: number }> = {};
    for (const r of bk) { if (!live(r)) continue; const p = (per[r.business_id] ??= { name: r.bk_businesses?.name ?? 'Unknown', paid: 0, owed: 0 }); if (r.paid) p.paid += Number(r.price); else if (r.status === 'completed') p.owed += Number(r.price); }
    const list = Object.values(per).sort((a, b) => b.paid - a.paid);
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2"><Kpi l="Paid, all time" v={kes(paidSum(bk))} /><Kpi l="Paid, last 30 days" v={kes(paidSum(bk.filter((r) => Date.now() - new Date(r.starts_at).getTime() < 30 * 86400000 && new Date(r.starts_at).getTime() < Date.now() + 86400000)))} /><Kpi l="Done but not marked paid" v={kes(bk.filter((r) => r.status === 'completed' && !r.paid).reduce((a, r) => a + Number(r.price), 0))} /></div>
        <Card className="p-4 space-y-2"><h3 className="font-medium text-sm">Paid by month</h3>{mrows.map((x) => <Bar key={x.m} label={x.m} value={x.paid} max={mx} note={kes(x.paid)} />)}</Card>
        <Card className="p-4 space-y-2"><h3 className="font-medium text-sm">By business</h3>{list.length === 0 ? <p className="text-xs text-slate-500">Nothing yet.</p> : list.map((p) => <div key={p.name} className="flex justify-between text-sm border-t border-slate-800/40 pt-1.5"><span>{p.name}</span><span>{kes(p.paid)}{p.owed ? <span className="text-xs text-amber-500"> · {kes(p.owed)} not marked paid</span> : null}</span></div>)}</Card>
        <p className="text-xs text-slate-400">These figures are what owners record. ShopOS does not handle customers' money.</p>
      </div>
    );
  }

  /* ───────── Quotes */
  if (view === 'quotes') {
    const tot = (r: R) => (r.lines as { quantity: number; unitPrice: number }[]).reduce((a, l) => a + l.quantity * l.unitPrice, 0);
    const list = quotes.filter((r) => (f === 'all' || r.status === f) && (!q || `${r.number} ${r.customer_name} ${r.bk_businesses?.name ?? ''}`.toLowerCase().includes(q.toLowerCase())));
    return (
      <div className="space-y-3">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">{(['draft', 'sent', 'accepted', 'declined'] as const).map((s) => <Kpi key={s} l={s} v={quotes.filter((r) => r.status === s).length} sub={kes(quotes.filter((r) => r.status === s).reduce((a, r) => a + tot(r), 0))} />)}</div>
        <Chips value={f} onChange={setF} items={[['all', 'All'], ['draft', 'Draft'], ['sent', 'Sent'], ['accepted', 'Accepted'], ['declined', 'Declined']]} />
        <input className="input" placeholder="Search number, customer or business" value={q} onChange={(e) => setQ(e.target.value)} />
        {list.length === 0 ? <EmptyState message="No quotes." /> : list.map((r) => <Card key={r.id} className="p-3 flex justify-between gap-3"><div className="min-w-0"><div className="text-sm font-medium">{r.number} · {r.customer_name}</div><div className="text-xs text-slate-500">{r.bk_businesses?.name} · {new Date(r.created_at).toLocaleDateString('en-GB')}</div></div><div className="text-right shrink-0"><div className="text-sm">{kes(tot(r))}</div><div className="text-xs text-slate-400 capitalize">{r.status}</div></div></Card>)}
      </div>
    );
  }

  /* ───────── Activity feed */
  const ev: { t: string; text: string }[] = [];
  for (const r of bk.slice(0, 400)) ev.push({ t: r.created_at, text: `${r.customer_name} booked ${r.bk_services?.name ?? 'a trip'} at ${r.bk_businesses?.name ?? 'a business'} for ${when(r.starts_at)}${r.status === 'cancelled' ? ' (now cancelled)' : ''}` });
  for (const b of biz) ev.push({ t: b.created_at, text: `${b.name} was added (${b.status})` });
  for (const a of apps) ev.push({ t: a.created_at, text: `${a.business_name} applied to join (${a.status})` });
  for (const o of owners) if (o.last_sign_in_at) ev.push({ t: o.last_sign_in_at, text: `${o.email ?? 'Owner'} signed in (${o.business_name})` });
  ev.sort((a, b) => b.t.localeCompare(a.t));
  return (
    <div className="space-y-2">
      {ev.length === 0 ? <EmptyState message="Nothing has happened yet." /> : ev.slice(0, 120).map((e, i) => <Card key={i} className="p-3 flex justify-between gap-3 text-sm"><span className="min-w-0 break-words">{e.text}</span><span className="text-xs text-slate-400 shrink-0">{ago(e.t)}</span></Card>)}
    </div>
  );
}
