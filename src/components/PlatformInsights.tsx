import { useEffect, useState } from 'react';
import { SupabaseClient } from '@supabase/supabase-js';
import { Card, Skeleton, EmptyState } from './ui';
import { friendlyError } from '../lib/friendlyError';

interface Day { day: string; n: number; value?: number }
interface Insights {
  signups_per_day: Day[]; by_status: Record<string, number>; by_type: { type: string; n: number }[]; active_7d: number; active_30d: number; never_active: number; quiet_30d: number; new_in_period: number;
  staff_by_role: Record<string, number>; sales_total: { count: number; value: number }; sales_per_day: Day[]; sales_by_method: { method: string; n: number; value: number }[];
  mpesa_by_status: { status: string; n: number; value: number }[]; mpesa_per_day: Day[]; package_income: { status: string; n: number; value: number }[]; days: number;
}
export type InsightView = 'businesses' | 'sales' | 'mpesa';
const kes = (v: number) => `KES ${Math.round(Number(v) || 0).toLocaleString()}`;
const cap = (s: string) => s.replace(/[_-]/g, ' ').replace(/^./, (c) => c.toUpperCase());

function Tile({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return <div className="rounded-xl bg-slate-800/70 p-3"><div className="text-lg font-semibold tnum leading-tight">{value}</div><div className="text-[11px] text-slate-400">{label}</div>{sub && <div className="text-[10px] text-slate-500 mt-0.5">{sub}</div>}</div>;
}
function Daily({ rows, money }: { rows: Day[]; money?: boolean }) {
  if (!rows.length) return <EmptyState message="Nothing in this period yet." />;
  const key = (r: Day) => (money ? Number(r.value ?? 0) : Number(r.n));
  const max = Math.max(1, ...rows.map(key));
  return (
    <div>
      <div className="flex items-end gap-[2px] h-28" role="img" aria-label="Daily chart">
        {rows.map((r) => <div key={r.day} title={`${r.day}: ${money ? kes(key(r)) : key(r)}`} className="flex-1 min-w-[2px] rounded-t bg-gradient-to-t from-teal-700 to-teal-400" style={{ height: `${Math.max(3, (key(r) / max) * 100)}%` }} />)}
      </div>
      <div className="flex justify-between text-[10px] text-slate-500 mt-1"><span>{rows[0].day}</span><span>{rows[rows.length - 1].day}</span></div>
    </div>
  );
}
function BarList({ rows, money }: { rows: { label: string; n: number; value?: number }[]; money?: boolean }) {
  if (!rows.length) return <EmptyState message="Nothing yet." />;
  const k = (r: { n: number; value?: number }) => (money ? Number(r.value ?? 0) : r.n);
  const max = Math.max(1, ...rows.map(k));
  return (
    <ul className="space-y-2">
      {rows.map((r) => (
        <li key={r.label}>
          <div className="flex justify-between gap-2 text-sm"><span className="truncate">{r.label}</span><span className="tnum text-slate-300 shrink-0">{r.n}{money ? ` · ${kes(r.value ?? 0)}` : ''}</span></div>
          <div className="h-1.5 rounded-full bg-slate-800 mt-1 overflow-hidden"><div className="h-full rounded-full bg-teal-500" style={{ width: `${(k(r) / max) * 100}%` }} /></div>
        </li>
      ))}
    </ul>
  );
}

/** More detailed platform numbers: businesses and growth, sales, and M-Pesa money. One admin-only database function feeds all three. */
export function PlatformInsights({ supabase, view }: { supabase: SupabaseClient; view: InsightView }) {
  const [days, setDays] = useState(30);
  const [d, setD] = useState<Insights | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    setD(null); setErr(null);
    void supabase.rpc('admin_insights', { p_days: days }).then(({ data, error }) => { if (error) setErr(friendlyError(error, 'Could not load these numbers.')); else setD(data as Insights); });
  }, [supabase, days]);
  const range = (
    <div className="flex gap-1.5">
      {[7, 30, 90, 365].map((x) => <button key={x} onClick={() => setDays(x)} className={`text-xs rounded-full px-3 py-1 border ${days === x ? 'bg-field-600 border-field-600 text-white' : 'border-slate-700 text-slate-400'}`}>{x === 365 ? '1 year' : `${x} days`}</button>)}
    </div>
  );
  if (err) return <Card><p className="text-sm text-rust-500">{err}</p></Card>;
  if (!d) return <Skeleton rows={3} />;
  const st: Record<string, number> = d.by_status ?? {};
  const totalBiz = Object.values(st).reduce((a, b) => a + Number(b), 0);

  if (view === 'businesses') return (
    <div className="space-y-3">
      {range}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <Tile label="Businesses" value={totalBiz} /><Tile label={`New in ${days} days`} value={d.new_in_period} />
        <Tile label="Active in 7 days" value={d.active_7d} /><Tile label="Active in 30 days" value={d.active_30d} />
        <Tile label="Quiet for 30+ days" value={d.quiet_30d} sub="Worth a check-in" /><Tile label="Never opened" value={d.never_active} />
        <Tile label="Owners" value={d.staff_by_role?.owner ?? 0} /><Tile label="Staff accounts" value={Object.entries(d.staff_by_role ?? {}).filter(([r]) => r !== 'owner').reduce((a, [, n]) => a + Number(n), 0)} />
      </div>
      <Card className="space-y-2"><h3 className="font-medium">New businesses per day</h3><Daily rows={d.signups_per_day} /></Card>
      <div className="grid md:grid-cols-2 gap-3">
        <Card className="space-y-2"><h3 className="font-medium">By status</h3><BarList rows={Object.entries(st).map(([k, n]) => ({ label: cap(k), n: Number(n) }))} /></Card>
        <Card className="space-y-2"><h3 className="font-medium">By business type</h3><BarList rows={(d.by_type ?? []).map((t) => ({ label: cap(t.type), n: Number(t.n) }))} /></Card>
      </div>
    </div>
  );

  if (view === 'sales') return (
    <div className="space-y-3">
      {range}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        <Tile label={`Sales in ${days} days`} value={Number(d.sales_total?.count ?? 0).toLocaleString()} /><Tile label="Value sold" value={kes(d.sales_total?.value ?? 0)} />
        <Tile label="Average sale" value={kes(Number(d.sales_total?.count) ? Number(d.sales_total.value) / Number(d.sales_total.count) : 0)} />
      </div>
      <Card className="space-y-2"><h3 className="font-medium">Sales per day (number)</h3><Daily rows={d.sales_per_day} /></Card>
      <Card className="space-y-2"><h3 className="font-medium">Value sold per day</h3><Daily rows={d.sales_per_day} money /></Card>
      <Card className="space-y-2"><h3 className="font-medium">How customers paid</h3><BarList money rows={(d.sales_by_method ?? []).map((m) => ({ label: cap(m.method), n: Number(m.n), value: Number(m.value) }))} /></Card>
    </div>
  );

  const paid = (d.mpesa_by_status ?? []).reduce((a, r) => a + Number(r.value), 0);
  return (
    <div className="space-y-3">
      {range}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        <Tile label="M-Pesa payments" value={(d.mpesa_by_status ?? []).reduce((a, r) => a + Number(r.n), 0)} /><Tile label="Money through M-Pesa" value={kes(paid)} />
        <Tile label="Package payments" value={(d.package_income ?? []).reduce((a, r) => a + Number(r.n), 0)} sub={kes((d.package_income ?? []).filter((r) => /paid|success|complet|confirm/i.test(r.status)).reduce((a, r) => a + Number(r.value), 0)) + ' paid'} />
      </div>
      <Card className="space-y-2"><h3 className="font-medium">M-Pesa payments per day</h3><Daily rows={d.mpesa_per_day} /></Card>
      <Card className="space-y-2"><h3 className="font-medium">Money through M-Pesa per day</h3><Daily rows={d.mpesa_per_day} money /></Card>
      <div className="grid md:grid-cols-2 gap-3">
        <Card className="space-y-2"><h3 className="font-medium">Shop payments by result</h3><BarList money rows={(d.mpesa_by_status ?? []).map((r) => ({ label: cap(r.status), n: Number(r.n), value: Number(r.value) }))} /></Card>
        <Card className="space-y-2"><h3 className="font-medium">Package payments by result</h3><BarList money rows={(d.package_income ?? []).map((r) => ({ label: cap(r.status), n: Number(r.n), value: Number(r.value) }))} /></Card>
      </div>
    </div>
  );
}
