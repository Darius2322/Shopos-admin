import { useCallback, useEffect, useState, type ReactNode } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { RefreshCw } from 'lucide-react';
import { Card, Skeleton } from './ui';

type Any = Record<string, any>;
type Part = 'overview' | 'sales' | 'shops' | 'bookings' | 'website' | 'apps' | 'health';
const PARTS: [Part, string][] = [['overview', 'Overview'], ['sales', 'Sales'], ['shops', 'Shops & people'], ['bookings', 'Bookings'], ['website', 'Website visitors'], ['apps', 'Apps & devices'], ['health', 'Health & money']];
const RANGES: [number, string][] = [[1, 'Today'], [7, '7 days'], [30, '30 days'], [90, '90 days']];

const n0 = (v: unknown) => Number(v ?? 0);
const fmt = (v: unknown) => n0(v).toLocaleString('en-KE');
const kes = (v: unknown) => `KES ${n0(v).toLocaleString('en-KE', { maximumFractionDigits: 0 })}`;
const when = (d?: string | null) => (d ? new Date(d).toLocaleString('en-KE', { timeZone: 'Africa/Nairobi', dateStyle: 'medium', timeStyle: 'short' }) : 'Never');
const pct = (a: number, b: number) => (b > 0 ? `${Math.round((a / b) * 100)}%` : '–');

function Tile({ label, value, note, tone }: { label: string; value: ReactNode; note?: string; tone?: 'good' | 'warn' | 'bad' }) {
  const c = tone === 'good' ? 'text-emerald-400' : tone === 'warn' ? 'text-amber-400' : tone === 'bad' ? 'text-red-400' : '';
  return <Card className="p-3"><div className="text-[11px] text-slate-400">{label}</div><div className={`text-xl font-semibold leading-tight mt-0.5 ${c}`}>{value}</div>{note && <div className="text-[11px] text-slate-500 mt-0.5">{note}</div>}</Card>;
}
function Tiles({ children }: { children: ReactNode }) { return <div className="grid grid-cols-2 md:grid-cols-4 gap-2">{children}</div>; }

/** Plain bar chart: one bar per row, value in the tooltip and printed under the bar when there is room. */
function Bars({ title, rows, color = '#10b981', unit = '', hint }: { title: string; rows: { k: string; v: number }[]; color?: string; unit?: string; hint?: string }) {
  const max = Math.max(1, ...rows.map((r) => r.v));
  const total = rows.reduce((a, r) => a + r.v, 0);
  return (
    <Card className="p-4">
      <div className="flex items-baseline justify-between gap-2"><div className="text-sm font-medium">{title}</div><div className="text-[11px] text-slate-500">{unit ? `${unit} ` : ''}{fmt(total)} in total</div></div>
      {hint && <p className="text-[11px] text-slate-500 mt-0.5">{hint}</p>}
      {rows.length === 0 ? <p className="text-xs text-slate-500 mt-3">Nothing in this time.</p> : (
        <div className="mt-3 flex items-end gap-[3px] h-28" role="img" aria-label={title}>
          {rows.map((r) => <div key={r.k} title={`${r.k}: ${fmt(r.v)}`} className="flex-1 min-w-[3px] rounded-t" style={{ height: `${Math.max(3, (r.v / max) * 100)}%`, background: color, opacity: r.v === 0 ? 0.25 : 1 }} />)}
        </div>)}
      {rows.length > 0 && <div className="flex justify-between text-[10px] text-slate-500 mt-1"><span>{rows[0].k}</span><span>{rows[rows.length - 1].k}</span></div>}
    </Card>
  );
}
function Rank({ title, rows, fmtV, hint }: { title: string; rows: { k: string; v: number; sub?: string }[]; fmtV?: (v: number) => string; hint?: string }) {
  const max = Math.max(1, ...rows.map((r) => r.v));
  return (
    <Card className="p-4">
      <div className="text-sm font-medium">{title}</div>{hint && <p className="text-[11px] text-slate-500">{hint}</p>}
      {rows.length === 0 ? <p className="text-xs text-slate-500 mt-2">Nothing yet.</p> : <ul className="mt-2 space-y-1.5">{rows.map((r) => (
        <li key={r.k} className="text-xs"><div className="flex justify-between gap-2"><span className="truncate">{r.k}{r.sub ? <span className="text-slate-500"> · {r.sub}</span> : null}</span><span className="shrink-0 font-medium">{(fmtV ?? fmt)(r.v)}</span></div>
          <div className="h-1.5 rounded bg-slate-700/50 mt-0.5 overflow-hidden"><div className="h-full rounded bg-emerald-500" style={{ width: `${(r.v / max) * 100}%` }} /></div></li>))}</ul>}
    </Card>
  );
}
const HOURS = Array.from({ length: 24 }, (_, i) => i);
const byHour = (rows: Any[]) => HOURS.map((h) => ({ k: `${String(h).padStart(2, '0')}:00`, v: n0(rows.find((r) => r.hour === h)?.n) }));

export function PlatformAnalytics({ supabase }: { supabase: SupabaseClient }) {
  const [part, setPart] = useState<Part>('overview'); const [days, setDays] = useState(30);
  const [d, setD] = useState<Any | null>(null); const [site, setSite] = useState<Any | null>(null);
  const [err, setErr] = useState<string | null>(null); const [loading, setLoading] = useState(true); const [at, setAt] = useState<Date | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setErr(null);
    const a = await supabase.rpc('admin_platform_analytics', { p_days: days });
    if (a.error) { setErr('Could not load the figures. Check that you are signed in as an admin and try again.'); setLoading(false); return; }
    setD(a.data as Any);
    if (part === 'website') {
      const dims = ['country', 'city', 'device', 'browser', 'referrer', 'path', 'entry'];
      const rs = await Promise.all([supabase.rpc('admin_site_overview', { p_days: days }), supabase.rpc('admin_site_timeseries', { p_days: days }), ...dims.map((x) => supabase.rpc('admin_site_breakdown', { p_days: days, p_dim: x, p_limit: 8 }))]);
      const ov = (Array.isArray(rs[0].data) ? rs[0].data[0] : rs[0].data) as Any | null;
      setSite({ ov, series: (rs[1].data ?? []) as Any[], ...Object.fromEntries(dims.map((x, i) => [x, (rs[i + 2].data ?? []) as Any[]])) });
    }
    setAt(new Date()); setLoading(false);
  }, [supabase, days, part]);
  useEffect(() => { void load(); }, [load]);

  const t = d?.totals ?? {}; const s = d?.sales ?? {}; const act = d?.activity ?? {}; const bk = d?.bookings ?? {}; const dev = d?.devices ?? {}; const er = d?.errors ?? {}; const pay = d?.payments ?? {}; const sup = d?.support ?? {};
  const stk = (pay.stk ?? {}) as Record<string, number>; const stkTotal = Object.values(stk).reduce((a, b) => a + n0(b), 0);
  const ov = site?.ov as Any | undefined;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-1.5 overflow-x-auto" role="tablist" aria-label="Analytics sections">{PARTS.map(([id, label]) => (
        <button key={id} role="tab" aria-selected={part === id} onClick={() => setPart(id)} className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap border ${part === id ? 'bg-emerald-600 text-white border-transparent' : 'border-slate-600 text-slate-300'}`}>{label}</button>))}</div>
      <div className="flex items-center gap-2 flex-wrap">
        {RANGES.map(([v, l]) => <button key={v} onClick={() => setDays(v)} className={`px-2.5 py-1 rounded-full text-xs border ${days === v ? 'bg-slate-200 text-slate-900 border-transparent' : 'border-slate-600 text-slate-300'}`}>{l}</button>)}
        <button onClick={() => void load()} className="btn-secondary text-xs inline-flex items-center gap-1 ml-auto" aria-label="Refresh"><RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} />Refresh</button>
      </div>
      {at && <p className="text-[11px] text-slate-500">Updated {at.toLocaleTimeString('en-KE', { timeZone: 'Africa/Nairobi', hour: '2-digit', minute: '2-digit' })}. Times are Nairobi time. Figures count the last {days === 1 ? '24 hours' : `${days} days`}.</p>}
      {err && <p className="text-sm text-red-400" role="alert">{err}</p>}
      {!d && !err && <Skeleton rows={4} />}

      {d && part === 'overview' && <>
        <Tiles>
          <Tile label="Shops" value={fmt(t.businesses)} note={`${fmt(t.businesses_active)} active · ${fmt(t.businesses_new)} new`} />
          <Tile label="Users" value={fmt(t.users)} note={`${fmt(t.branches)} branches`} />
          <Tile label="Sales" value={fmt(s.count)} note={kes(s.revenue)} tone="good" />
          <Tile label="Bookings" value={fmt(bk.count)} note={`${fmt(bk.upcoming)} coming up`} />
          <Tile label="Active today" value={fmt(act.active_today)} note={`${fmt(act.active_7d)} this week`} />
          <Tile label="Not used for 30 days" value={fmt(act.dormant)} tone={n0(act.dormant) > 0 ? 'warn' : undefined} />
          <Tile label="Sign-ins" value={fmt(act.logins)} note={`${fmt(act.failed_logins)} failed`} tone={n0(act.failed_logins) > 5 ? 'warn' : undefined} />
          <Tile label="Errors" value={fmt(er.count)} note={`${fmt(er.warnings)} warnings`} tone={n0(er.count) > 0 ? 'bad' : 'good'} />
        </Tiles>
        <div className="grid md:grid-cols-2 gap-3">
          <Bars title="Money sold, by day" unit="KES" color="#10b981" rows={(d.sales_by_day ?? []).map((r: Any) => ({ k: r.day, v: n0(r.revenue) }))} />
          <Bars title="Bookings made, by day" color="#38bdf8" rows={(d.bookings_by_day ?? []).map((r: Any) => ({ k: r.day, v: n0(r.n) }))} />
        </div>
        <Rank title="Shops by sales" hint="Money sold in this time" fmtV={kes} rows={(d.top_shops ?? []).slice(0, 8).map((r: Any) => ({ k: r.name, v: n0(r.revenue), sub: `${fmt(r.sales)} sales` }))} />
      </>}

      {d && part === 'sales' && <>
        <Tiles>
          <Tile label="Sales" value={fmt(s.count)} />
          <Tile label="Money sold" value={kes(s.revenue)} tone="good" />
          <Tile label="Average sale" value={kes(s.avg)} />
          <Tile label="Owed by customers" value={kes(s.debt_open)} note="all shops, right now" tone={n0(s.debt_open) > 0 ? 'warn' : undefined} />
        </Tiles>
        <Bars title="Sales count, by day" color="#10b981" rows={(d.sales_by_day ?? []).map((r: Any) => ({ k: r.day, v: n0(r.n) }))} />
        <Bars title="Money sold, by day" unit="KES" color="#34d399" rows={(d.sales_by_day ?? []).map((r: Any) => ({ k: r.day, v: n0(r.revenue) }))} />
        <div className="grid md:grid-cols-2 gap-3">
          <Bars title="Busiest hours" hint="When sales are made (Nairobi time)" color="#f59e0b" rows={byHour(d.sales_by_hour ?? [])} />
          <Rank title="How customers pay" fmtV={kes} rows={(d.sales_by_method ?? []).map((r: Any) => ({ k: String(r.method), v: n0(r.revenue), sub: `${fmt(r.n)} sales` }))} />
        </div>
        <p className="text-xs text-slate-500">All time: {kes(s.all_time_revenue)} sold across all shops.</p>
      </>}

      {d && part === 'shops' && <>
        <Tiles>
          <Tile label="Shops" value={fmt(t.businesses)} note={`${fmt(t.businesses_active)} active`} />
          <Tile label="New shops" value={fmt(t.businesses_new)} />
          <Tile label="Users" value={fmt(t.users)} />
          <Tile label="Products listed" value={fmt(t.products)} note={`${fmt(t.customers)} customers`} />
        </Tiles>
        <Tiles>
          <Tile label="Active today" value={fmt(act.active_today)} note={pct(n0(act.active_today), n0(t.businesses)) + ' of shops'} />
          <Tile label="Active this week" value={fmt(act.active_7d)} note={pct(n0(act.active_7d), n0(t.businesses)) + ' of shops'} />
          <Tile label="Active this month" value={fmt(act.active_30d)} note={pct(n0(act.active_30d), n0(t.businesses)) + ' of shops'} />
          <Tile label="Dormant" value={fmt(act.dormant)} note="no use in 30 days" tone={n0(act.dormant) > 0 ? 'warn' : undefined} />
        </Tiles>
        <div className="grid md:grid-cols-2 gap-3">
          <Bars title="Sign-ins, by day" color="#38bdf8" rows={(d.logins_by_day ?? []).map((r: Any) => ({ k: r.day, v: n0(r.ok) }))} />
          <Bars title="Failed sign-ins, by day" color="#ef4444" rows={(d.logins_by_day ?? []).map((r: Any) => ({ k: r.day, v: n0(r.bad) }))} />
        </div>
        <Bars title="New shops, by day" color="#a78bfa" rows={(d.signups_by_day ?? []).map((r: Any) => ({ k: r.day, v: n0(r.shops) }))} />
        <Card className="p-4"><div className="text-sm font-medium mb-2">All shops</div>
          <div className="overflow-x-auto"><table className="w-full text-xs"><thead><tr className="text-left text-slate-400"><th className="py-1 pr-3">Shop</th><th className="pr-3">Status</th><th className="pr-3 text-right">Sales</th><th className="pr-3 text-right">Money sold</th><th>Last active</th></tr></thead>
            <tbody>{(d.top_shops ?? []).map((r: Any) => <tr key={r.name} className="border-t border-slate-700/60"><td className="py-1.5 pr-3">{r.name}</td><td className="pr-3">{r.status}</td><td className="pr-3 text-right">{fmt(r.sales)}</td><td className="pr-3 text-right">{kes(r.revenue)}</td><td>{when(r.last_active)}</td></tr>)}</tbody></table></div></Card>
        <Rank title="Packages" hint="How many shops are on each" rows={(d.packages ?? []).map((r: Any) => ({ k: String(r.name), v: n0(r.n) }))} />
      </>}

      {d && part === 'bookings' && <>
        <Tiles>
          <Tile label="Booking businesses" value={fmt(t.booking_businesses)} note={`${fmt(t.booking_businesses_new)} new`} />
          <Tile label="Bookings made" value={fmt(bk.count)} />
          <Tile label="Coming up" value={fmt(bk.upcoming)} />
          <Tile label="Booking value" value={kes(bk.value)} tone="good" />
        </Tiles>
        <Tiles>{Object.entries((bk.by_status ?? {}) as Record<string, number>).map(([k, v]) => <Tile key={k} label={k.replace('_', ' ')} value={fmt(v)} tone={k === 'no_show' ? 'bad' : k === 'cancelled' ? 'warn' : undefined} />)}</Tiles>
        <Bars title="Bookings made, by day" color="#38bdf8" rows={(d.bookings_by_day ?? []).map((r: Any) => ({ k: r.day, v: n0(r.n) }))} />
        <Rank title="Busiest booking businesses" rows={(d.top_booking_shops ?? []).map((r: Any) => ({ k: r.name, v: n0(r.bookings), sub: kes(r.value) }))} />
      </>}

      {part === 'website' && (!site ? <Skeleton rows={3} /> : <>
        <Tiles>
          <Tile label="Visitors" value={fmt(ov?.visitors)} note={`${fmt(ov?.new_visitors)} new · ${fmt(ov?.live_now)} here now`} />
          <Tile label="Page views" value={fmt(ov?.pageviews)} note={`${ov?.avg_pages ?? '–'} per visit`} />
          <Tile label="Sessions" value={fmt(ov?.sessions)} note={`${ov?.bounce_rate ?? '–'}% leave at once`} />
          <Tile label="Time on site" value={`${fmt(ov?.avg_seconds)} s`} note="average visit" />
          <Tile label="Installed the app" value={fmt(ov?.installs)} />
          <Tile label="Tried the demo" value={fmt(ov?.demos)} />
          <Tile label="Desktop downloads" value={fmt(ov?.desktop_downloads)} />
          <Tile label="Bots blocked from the count" value={fmt(ov?.bot_hits)} />
        </Tiles>
        <Bars title="Visitors, by day" color="#38bdf8" rows={(site.series as Any[]).map((r) => ({ k: String(r.bucket), v: n0(r.visitors) }))} />
        <Bars title="Page views, by day" color="#818cf8" rows={(site.series as Any[]).map((r) => ({ k: String(r.bucket), v: n0(r.pageviews) }))} />
        <div className="grid md:grid-cols-2 gap-3">
          <Rank title="Countries" rows={(site.country as Any[]).map((r) => ({ k: String(r.label), v: n0(r.visitors) }))} />
          <Rank title="Cities" rows={(site.city as Any[]).map((r) => ({ k: String(r.label), v: n0(r.visitors) }))} />
          <Rank title="Where visitors came from" rows={(site.referrer as Any[]).map((r) => ({ k: String(r.label), v: n0(r.visitors) }))} />
          <Rank title="How they opened it" hint="Browser, installed app or desktop program" rows={(site.entry as Any[]).map((r) => ({ k: String(r.label), v: n0(r.visitors) }))} />
          <Rank title="Devices" rows={(site.device as Any[]).map((r) => ({ k: String(r.label), v: n0(r.visitors) }))} />
          <Rank title="Browsers" rows={(site.browser as Any[]).map((r) => ({ k: String(r.label), v: n0(r.visitors) }))} />
        </div>
        <Rank title="Most visited pages" rows={(site.path as Any[]).map((r) => ({ k: String(r.label), v: n0(r.pageviews) }))} />
        <p className="text-[11px] text-slate-500">Visitors are counted without names, emails or full addresses. For the full visitor trail, use Website in the side menu.</p>
      </>)}

      {d && part === 'apps' && <>
        <Tiles>
          <Tile label="Devices syncing" value={fmt(dev.sync_devices)} note={`${fmt(dev.sync_seen_7d)} seen this week`} />
          <Tile label="Signed in on" value={fmt(dev.sessions_active)} note="devices in the last 30 days" />
          <Tile label="Waiting to sync" value={fmt(dev.sync_pending)} tone={n0(dev.sync_pending) > 20 ? 'warn' : undefined} />
          <Tile label="Failed to sync" value={fmt(dev.sync_failed)} tone={n0(dev.sync_failed) > 0 ? 'bad' : 'good'} />
        </Tiles>
        <Tiles>
          <Tile label="Phones with alerts: owner app" value={fmt(dev.push_owner)} />
          <Tile label="Phones with alerts: booker app" value={fmt(dev.push_booker)} />
          <Tile label="Phones with alerts: admin app" value={fmt(dev.push_admin)} />
        </Tiles>
        <Rank title="Versions people are running" hint="From devices that sync. Older versions mean people have not updated yet." rows={(d.versions ?? []).map((r: Any) => ({ k: String(r.version), v: n0(r.n), sub: String(r.app) }))} />
        <Card className="p-4"><div className="text-sm font-medium mb-2">Recent releases</div>
          {(d.releases ?? []).length === 0 ? <p className="text-xs text-slate-500">No releases recorded yet.</p> : <ul className="text-xs divide-y divide-slate-700/60">{(d.releases ?? []).map((r: Any, i: number) => <li key={i} className="py-1.5"><span className="font-medium">{r.action}</span> · {r.app} <span className="text-slate-500">· {when(r.at)}</span>{r.note ? <span className="block text-slate-400 truncate">{r.note}</span> : null}</li>)}</ul>}</Card>
      </>}

      {d && part === 'health' && <>
        <Tiles>
          <Tile label="Errors" value={fmt(er.count)} tone={n0(er.count) > 0 ? 'bad' : 'good'} />
          <Tile label="Warnings" value={fmt(er.warnings)} tone={n0(er.warnings) > 0 ? 'warn' : undefined} />
          <Tile label="Failed sign-ins" value={fmt(act.failed_logins)} tone={n0(act.failed_logins) > 5 ? 'warn' : undefined} />
          <Tile label="Support open" value={fmt(sup.tickets_open)} note={`${fmt(sup.feature_requests_pending)} feature requests`} />
        </Tiles>
        <Tiles>
          <Tile label="M-Pesa prompts sent" value={fmt(stkTotal)} />
          <Tile label="Paid" value={fmt(stk.success)} note={kes(pay.stk_amount)} tone="good" />
          <Tile label="Success rate" value={pct(n0(stk.success), stkTotal)} />
          <Tile label="Failed / cancelled" value={`${fmt(stk.failed)} / ${fmt(stk.cancelled)}`} tone={n0(stk.failed) > 0 ? 'warn' : undefined} />
        </Tiles>
        <Tiles>
          <Tile label="Package payments" value={kes(pay.package_paid)} />
          <Tile label="New shop requests waiting" value={fmt(sup.owner_requests_pending)} tone={n0(sup.owner_requests_pending) > 0 ? 'warn' : undefined} />
          <Tile label="Package requests waiting" value={fmt(sup.package_requests_pending)} tone={n0(sup.package_requests_pending) > 0 ? 'warn' : undefined} />
        </Tiles>
        <Card className="p-4"><div className="text-sm font-medium mb-2">What is going wrong most</div>
          {(er.top ?? []).length === 0 ? <p className="text-xs text-slate-500">No errors or warnings in this time.</p> : <ul className="text-xs divide-y divide-slate-700/60">{(er.top ?? []).map((r: Any, i: number) => <li key={i} className="py-1.5 flex justify-between gap-3"><span className="min-w-0"><span className="block truncate">{r.message}</span><span className="text-slate-500">last {when(r.last)}</span></span><span className="shrink-0 font-medium">{fmt(r.n)}×</span></li>)}</ul>}</Card>
      </>}
    </div>
  );
}
