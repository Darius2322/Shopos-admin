import { useEffect, useMemo, useState } from 'react';
import { SupabaseClient } from '@supabase/supabase-js';
import { Download } from 'lucide-react';
import { Card, ErrorText, Skeleton, EmptyState } from '../components/ui';
import { friendlyError } from '../lib/friendlyError';

interface Row { id: string; business_id: string; customer_name: string; customer_phone: string; starts_at: string; created_at: string; status: string; price: number; paid: boolean; seats: number; bk_businesses: { name: string; kind: string } | null }
interface Biz { id: string; name: string; kind: string; status: string }
interface App { id: string; status: string }
const KIND: Record<string, string> = { salon: 'Salon', barbershop: 'Barbershop', beauty: 'Beauty studio', spa: 'Spa & massage', bus: 'Bus & shuttle', clinic: 'Clinic', carwash: 'Car wash', fitness: 'Fitness & classes', custom: 'Custom' };
const ymd = (d: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Nairobi' }).format(d);
const kes = (n: number) => `KES ${Math.round(n).toLocaleString()}`;

function Bar({ label, value, max, note }: { label: string; value: number; max: number; note?: string }) {
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="w-28 truncate text-slate-500">{label}</span>
      <div className="flex-1 h-2.5 rounded-full bg-slate-800/40 overflow-hidden"><div className="h-full rounded-full bg-field-600" style={{ width: `${max ? Math.max(2, (value / max) * 100) : 0}%` }} /></div>
      <span className="w-16 text-right tabular-nums">{note ?? value}</span>
    </div>
  );
}
function csv(name: string, rows: (string | number)[][]) {
  const body = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([body], { type: 'text/csv' })); a.download = name; a.click(); URL.revokeObjectURL(a.href);
}

/** Booking overview, customers and reports, worked out from the booking tables. */
export default function BookingInsights({ supabase, view }: { supabase: SupabaseClient; view: 'overview' | 'customers' | 'reports' }) {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [biz, setBiz] = useState<Biz[]>([]);
  const [apps, setApps] = useState<App[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [days, setDays] = useState(30);
  const [q, setQ] = useState('');

  useEffect(() => {
    (async () => {
      const [r, b, a] = await Promise.all([
        supabase.from('bk_bookings').select('id, business_id, customer_name, customer_phone, starts_at, created_at, status, price, paid, seats, bk_businesses(name, kind)').order('starts_at', { ascending: false }).limit(5000),
        supabase.from('bk_businesses').select('id, name, kind, status'),
        supabase.from('bk_applications').select('id, status'),
      ]);
      if (r.error) { setErr(friendlyError(r.error, 'Could not load booking data.')); return; }
      setRows((r.data ?? []) as unknown as Row[]); setBiz((b.data ?? []) as Biz[]); setApps((a.data ?? []) as App[]);
    })();
  }, [supabase]);

  const inRange = useMemo(() => { const from = Date.now() - days * 86400000; return (rows ?? []).filter((r) => new Date(r.starts_at).getTime() >= from && new Date(r.starts_at).getTime() <= Date.now() + 90 * 86400000); }, [rows, days]);

  if (err) return <ErrorText>{err}</ErrorText>;
  if (!rows) return <Skeleton rows={4} />;
  const today = ymd(new Date());

  if (view === 'overview') {
    const live = biz.filter((b) => b.status === 'active').length;
    const todays = rows.filter((r) => ymd(new Date(r.starts_at)) === today && ['pending', 'confirmed', 'completed'].includes(r.status));
    const upcoming = rows.filter((r) => ['pending', 'confirmed'].includes(r.status) && new Date(r.starts_at) > new Date());
    const pending = rows.filter((r) => r.status === 'pending').length;
    const last14 = Array.from({ length: 14 }, (_, i) => { const d = ymd(new Date(Date.now() - (13 - i) * 86400000)); return { d, n: rows.filter((r) => ymd(new Date(r.created_at)) === d).length }; });
    const maxD = Math.max(1, ...last14.map((x) => x.n));
    const byKind: Record<string, number> = {}; for (const r of rows) { const k = r.bk_businesses?.kind ?? 'custom'; byKind[k] = (byKind[k] ?? 0) + 1; }
    const byBiz: Record<string, number> = {}; for (const r of rows) { const n = r.bk_businesses?.name ?? 'Unknown'; byBiz[n] = (byBiz[n] ?? 0) + 1; }
    const top = Object.entries(byBiz).sort((a, b) => b[1] - a[1]).slice(0, 6);
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {[['Live businesses', live], ['Bookings today', todays.length], ['Upcoming', upcoming.length], ['Waiting for approval', pending + apps.filter((a) => a.status === 'pending').length]].map(([l, v]) => (
            <Card key={l as string} className="p-3 text-center"><div className="text-2xl font-semibold">{v}</div><div className="text-xs text-slate-500">{l}</div></Card>))}
        </div>
        <Card className="p-4"><h3 className="font-medium text-sm mb-3">Bookings made, last 14 days</h3>
          <div className="flex items-end gap-1 h-28">{last14.map((x) => <div key={x.d} className="flex-1 flex flex-col items-center justify-end gap-1" title={`${x.d}: ${x.n}`}><div className="w-full rounded-t bg-field-600" style={{ height: `${(x.n / maxD) * 100}%`, minHeight: x.n ? 4 : 1 }} /><span className="text-[9px] text-slate-500">{x.d.slice(8)}</span></div>)}</div></Card>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <Card className="p-4 space-y-2"><h3 className="font-medium text-sm">By kind of business</h3>{Object.keys(byKind).length === 0 ? <p className="text-xs text-slate-500">No bookings yet.</p> : Object.entries(byKind).sort((a, b) => b[1] - a[1]).map(([k, n]) => <Bar key={k} label={KIND[k] ?? k} value={n} max={Math.max(...Object.values(byKind))} />)}</Card>
          <Card className="p-4 space-y-2"><h3 className="font-medium text-sm">Busiest businesses</h3>{top.length === 0 ? <p className="text-xs text-slate-500">No bookings yet.</p> : top.map(([n, c]) => <Bar key={n} label={n} value={c} max={top[0][1]} />)}</Card>
        </div>
      </div>
    );
  }

  if (view === 'customers') {
    const map = new Map<string, { name: string; phone: string; total: number; done: number; cancelled: number; noshow: number; spent: number; last: string; biz: Set<string> }>();
    for (const r of rows) {
      const c = map.get(r.customer_phone) ?? { name: r.customer_name, phone: r.customer_phone, total: 0, done: 0, cancelled: 0, noshow: 0, spent: 0, last: r.starts_at, biz: new Set<string>() };
      c.total++; if (r.status === 'completed') c.done++; if (r.status === 'cancelled') c.cancelled++; if (r.status === 'no_show') c.noshow++;
      if (r.paid) c.spent += Number(r.price); if (r.starts_at > c.last) c.last = r.starts_at; c.biz.add(r.bk_businesses?.name ?? ''); map.set(r.customer_phone, c);
    }
    const list = [...map.values()].filter((c) => !q || `${c.name} ${c.phone}`.toLowerCase().includes(q.toLowerCase())).sort((a, b) => b.total - a.total);
    return (
      <div className="space-y-3">
        <div className="flex gap-2"><input className="input flex-1" placeholder="Search name or phone" value={q} onChange={(e) => setQ(e.target.value)} />
          <button onClick={() => csv('booking-customers.csv', [['Name', 'Phone', 'Bookings', 'Completed', 'Cancelled', 'No-shows', 'Paid (KES)', 'Last booking'], ...list.map((c) => [c.name, c.phone, c.total, c.done, c.cancelled, c.noshow, c.spent, c.last])])} className="btn-secondary text-sm inline-flex items-center gap-1"><Download className="w-4 h-4" />CSV</button></div>
        {list.length === 0 ? <EmptyState message="No customers yet." /> : list.slice(0, 200).map((c) => (
          <Card key={c.phone} className="p-3 flex items-center justify-between gap-3">
            <div className="min-w-0"><div className="text-sm font-medium">{c.name}</div><div className="text-xs text-slate-500"><a href={`tel:${c.phone}`} className="underline">{c.phone}</a> · {c.biz.size} business{c.biz.size === 1 ? '' : 'es'}</div></div>
            <div className="text-right text-xs shrink-0"><div>{c.total} booking{c.total === 1 ? '' : 's'}</div><div className="text-slate-400">{c.done} done · {c.cancelled} cancelled · {c.noshow} no-show</div></div>
          </Card>))}
        <p className="text-xs text-slate-400">Customers are matched by phone number. Contact details are for supporting bookings only.</p>
      </div>
    );
  }

  // reports
  const per = new Map<string, { name: string; kind: string; n: number; done: number; cancelled: number; noshow: number; revenue: number }>();
  for (const r of inRange) {
    const k = r.business_id; const p = per.get(k) ?? { name: r.bk_businesses?.name ?? 'Unknown', kind: r.bk_businesses?.kind ?? 'custom', n: 0, done: 0, cancelled: 0, noshow: 0, revenue: 0 };
    p.n++; if (r.status === 'completed') p.done++; if (r.status === 'cancelled') p.cancelled++; if (r.status === 'no_show') p.noshow++; if (r.paid && !['cancelled', 'no_show'].includes(r.status)) p.revenue += Number(r.price); per.set(k, p);
  }
  const list = [...per.values()].sort((a, b) => b.n - a.n);
  const tot = list.reduce((a, b) => ({ n: a.n + b.n, done: a.done + b.done, cancelled: a.cancelled + b.cancelled, noshow: a.noshow + b.noshow, revenue: a.revenue + b.revenue }), { n: 0, done: 0, cancelled: 0, noshow: 0, revenue: 0 });
  const pct = (a: number, b: number) => (b ? `${Math.round((a / b) * 100)}%` : '0%');
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {[7, 30, 90, 365].map((d) => <button key={d} onClick={() => setDays(d)} className={`px-3 py-1.5 rounded-full text-sm border ${days === d ? 'bg-field-600 text-white border-field-600' : 'border-slate-300'}`}>{d === 365 ? '1 year' : `${d} days`}</button>)}
        <button onClick={() => csv(`booking-report-${days}d.csv`, [['Business', 'Kind', 'Bookings', 'Completed', 'Cancelled', 'No-shows', 'Paid (KES)'], ...list.map((p) => [p.name, KIND[p.kind] ?? p.kind, p.n, p.done, p.cancelled, p.noshow, p.revenue])])} className="btn-secondary text-sm ml-auto inline-flex items-center gap-1"><Download className="w-4 h-4" />CSV</button>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {[['Bookings', tot.n], ['Completed', tot.done], ['Cancelled', pct(tot.cancelled, tot.n)], ['Paid by customers', kes(tot.revenue)]].map(([l, v]) => <Card key={l as string} className="p-3 text-center"><div className="text-xl font-semibold">{v}</div><div className="text-xs text-slate-500">{l}</div></Card>)}
      </div>
      {list.length === 0 ? <EmptyState message="No bookings in this period." /> : list.map((p) => (
        <Card key={p.name} className="p-3">
          <div className="flex items-center justify-between"><div className="text-sm font-medium">{p.name} <span className="text-xs text-slate-400">· {KIND[p.kind] ?? p.kind}</span></div><div className="text-sm">{p.n} bookings</div></div>
          <div className="text-xs text-slate-500 mt-1">{p.done} completed · cancelled {pct(p.cancelled, p.n)} · no-show {pct(p.noshow, p.n)} · paid {kes(p.revenue)}</div>
        </Card>))}
      <p className="text-xs text-slate-400">Paid figures count only bookings the owner marked as paid. ShopOS does not handle the money.</p>
    </div>
  );
}
