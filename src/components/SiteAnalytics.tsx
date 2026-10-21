import { useCallback, useEffect, useMemo, useState } from 'react';
import { SupabaseClient } from '@supabase/supabase-js';
import { Card } from './ui';
import { friendlyError } from '../lib/friendlyError';
import { Download, Loader2, RefreshCw } from 'lucide-react';

interface Overview {
  visitors: number; prev_visitors: number; sessions: number; prev_sessions: number; pageviews: number; prev_pageviews: number; new_visitors: number;
  bounce_rate: number | null; avg_pages: number | null; avg_seconds: number | null; live_now: number; installs: number; demos: number;
  signed_in_visitors: number; pwa_visitors: number; desktop_downloads: number;
}
interface Point { bucket: string; visitors: number; sessions: number; pageviews: number }
interface Row { label: string; visitors: number; pageviews: number }
interface Recent { created_at: string; event: string; path: string; country: string | null; city: string | null; device: string | null; os: string | null; browser: string | null; referrer_host: string | null; signed_in: boolean; visitor: string }
interface Heat { dow: number; hr: number; pageviews: number }
interface Step { step: string; visitors: number }
interface TypeRow { business_type: string; businesses: number }

const PERIODS: { d: number; label: string }[] = [{ d: 1, label: 'Today' }, { d: 7, label: '7 days' }, { d: 30, label: '30 days' }, { d: 90, label: '90 days' }];
const BREAKDOWNS: { dim: string; title: string }[] = [
  { dim: 'path', title: 'Top pages' }, { dim: 'country', title: 'Countries' }, { dim: 'city', title: 'Cities' }, { dim: 'referrer', title: 'Where visitors come from' },
  { dim: 'device', title: 'Devices' }, { dim: 'os', title: 'Operating systems' }, { dim: 'browser', title: 'Browsers' }, { dim: 'entry', title: 'How they open ShopOS' },
  { dim: 'utm_source', title: 'Campaigns (utm_source)' }, { dim: 'lang', title: 'Languages' }, { dim: 'event', title: 'Actions taken' }
];
const TYPE_LABEL: Record<string, string> = { retail: 'Shop / duka', supermarket: 'Supermarket', wholesale: 'Wholesale', bar: 'Bar & liquor store', restaurant: 'Restaurant / café', chemist: 'Pharmacy / chemist', hardware: 'Hardware', electronics: 'Electronics & phones', boutique: 'Clothes & shoes', butchery: 'Butchery', agrovet: 'Agrovet', salon: 'Salon & barber', cosmetics: 'Cosmetics & beauty', stationery: 'Stationery & books', greengrocer: 'Fruits & vegetables', autospares: 'Auto spares & garage', manufacturing: 'Manufacturer', services: 'Services', other: 'Other', not_set: 'Not chosen yet' };
const EVENT_LABEL: Record<string, string> = { demo_start: 'Started the demo', app_installed: 'Installed the app', login_view: 'Opened sign-in', signup_start: 'Started sign-up', download_click: 'Clicked a download', guide_view: 'Read a guide', install_prompt: 'Saw the install prompt' };
const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const n = (v: unknown) => Number(v ?? 0);
const fmt = (v: number) => v.toLocaleString();
const delta = (cur: number, prev: number) => (prev === 0 ? (cur > 0 ? null : 0) : Math.round(((cur - prev) / prev) * 100));
const dur = (s: number | null) => { if (s == null) return '–'; const m = Math.floor(s / 60); return m ? `${m}m ${Math.round(s % 60)}s` : `${Math.round(s)}s`; };
const flag = (cc: string) => (/^[A-Z]{2}$/.test(cc) ? String.fromCodePoint(...[...cc].map((c) => 127397 + c.charCodeAt(0))) : '');
let regionNames: Intl.DisplayNames | null = null;
const country = (cc: string) => { try { regionNames ??= new Intl.DisplayNames(['en'], { type: 'region' }); return /^[A-Z]{2}$/.test(cc) ? `${flag(cc)} ${regionNames.of(cc) ?? cc}` : cc; } catch { return cc; } };
const ago = (iso: string) => { const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000); return s < 60 ? `${Math.floor(s)}s ago` : s < 3600 ? `${Math.floor(s / 60)}m ago` : s < 86400 ? `${Math.floor(s / 3600)}h ago` : `${Math.floor(s / 86400)}d ago`; };

function Delta({ cur, prev }: { cur: number; prev: number }) {
  const d = delta(cur, prev);
  if (d === null) return <span className="text-[10px] text-field-500">new</span>;
  if (d === 0) return <span className="text-[10px] text-slate-500">no change</span>;
  return <span className={`text-[10px] tnum ${d > 0 ? 'text-field-500' : 'text-rust-500'}`}>{d > 0 ? '▲' : '▼'} {Math.abs(d)}% vs before</span>;
}
function Tile({ label, value, sub }: { label: string; value: string | number; sub?: React.ReactNode }) {
  return <div className="rounded-xl bg-slate-800/70 p-3 min-w-0"><div className="text-[11px] text-slate-400">{label}</div><div className="text-xl font-semibold tnum mt-0.5">{value}</div><div className="min-h-[14px]">{sub}</div></div>;
}

function Chart({ data, hourly }: { data: Point[]; hourly: boolean }) {
  const W = 640, H = 180, P = { l: 34, r: 10, t: 12, b: 24 };
  const max = Math.max(1, ...data.map((d) => d.pageviews));
  const x = (i: number) => P.l + (data.length <= 1 ? (W - P.l - P.r) / 2 : (i / (data.length - 1)) * (W - P.l - P.r));
  const y = (v: number) => P.t + (1 - v / max) * (H - P.t - P.b);
  const path = (key: 'pageviews' | 'visitors') => data.map((d, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(d[key]).toFixed(1)}`).join(' ');
  const area = data.length > 1 ? `${path('pageviews')} L${x(data.length - 1).toFixed(1)},${H - P.b} L${x(0).toFixed(1)},${H - P.b} Z` : '';
  const label = (b: string) => (hourly ? b.slice(11) : new Date(b).toLocaleDateString(undefined, { day: 'numeric', month: 'short' }));
  const ticks = [0, Math.floor((data.length - 1) / 2), data.length - 1].filter((v, i, a) => data.length > 0 && a.indexOf(v) === i);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" role="img" aria-label="Visitors and page views over time">
      <defs><linearGradient id="sa-area" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#14b8a6" stopOpacity="0.28" /><stop offset="100%" stopColor="#14b8a6" stopOpacity="0" /></linearGradient></defs>
      {[0, 0.5, 1].map((f) => <g key={f}><line x1={P.l} x2={W - P.r} y1={y(max * f)} y2={y(max * f)} stroke="#334155" strokeWidth="0.6" strokeDasharray={f === 0 ? undefined : '3 4'} opacity={f === 0 ? 0.9 : 0.6} /><text x={P.l - 6} y={y(max * f) + 3} textAnchor="end" fontSize="9" fill="#94a3b8">{Math.round(max * f)}</text></g>)}
      {area && <path d={area} fill="url(#sa-area)" />}
      {data.length > 1 && <path d={path('pageviews')} fill="none" stroke="#14b8a6" strokeOpacity="0.55" strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />}
      {data.length > 1 && <path d={path('visitors')} fill="none" stroke="#5eead4" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />}
      {data.map((d, i) => <g key={d.bucket}><rect x={x(i) - (W - P.l - P.r) / Math.max(data.length, 1) / 2} y={P.t} width={(W - P.l - P.r) / Math.max(data.length, 1)} height={H - P.t - P.b} fill="transparent"><title>{`${label(d.bucket)}: ${d.pageviews} page views · ${d.visitors} visitors · ${d.sessions} visits`}</title></rect>{data.length <= 31 && <circle cx={x(i)} cy={y(d.visitors)} r="2.4" fill="#0f172a" stroke="#5eead4" strokeWidth="1.5" pointerEvents="none" />}</g>)}
      {ticks.map((i) => <text key={i} x={x(i)} y={H - 7} textAnchor={i === 0 ? 'start' : i === data.length - 1 ? 'end' : 'middle'} fontSize="9" fill="#94a3b8">{label(data[i].bucket)}</text>)}
    </svg>
  );
}

function Bars({ rows, render }: { rows: Row[]; render?: (l: string) => string }) {
  const max = Math.max(1, ...rows.map((r) => r.visitors));
  if (!rows.length) return <p className="text-xs text-slate-500">No data yet.</p>;
  return (
    <ul className="space-y-1.5">
      {rows.map((r) => (
        <li key={r.label} className="text-xs">
          <div className="flex justify-between gap-2"><span className="truncate" title={r.label}>{render ? render(r.label) : r.label}</span><span className="tnum text-slate-300 shrink-0">{fmt(r.visitors)}<span className="text-slate-500"> · {fmt(r.pageviews)}</span></span></div>
          <div className="h-1 rounded-full bg-slate-800/80 mt-1"><div className="h-full rounded-full bg-gradient-to-r from-teal-600 to-teal-400" style={{ width: `${Math.max(3, (r.visitors / max) * 100)}%` }} /></div>
        </li>
      ))}
    </ul>
  );
}

function Heatmap({ rows }: { rows: Heat[] }) {
  const grid = useMemo(() => { const g = Array.from({ length: 7 }, () => Array(24).fill(0) as number[]); rows.forEach((r) => { g[n(r.dow)][n(r.hr)] = n(r.pageviews); }); return g; }, [rows]);
  const max = Math.max(1, ...grid.flat());
  return (
    <div className="overflow-x-auto">
      <div className="min-w-[520px]">
        {grid.map((row, d) => (
          <div key={d} className="flex items-center gap-[2px] mb-[2px]">
            <span className="w-8 text-[10px] text-slate-500 shrink-0">{DOW[d]}</span>
            {row.map((v, h) => <div key={h} className="flex-1 h-4 rounded-[2px]" style={{ background: v ? `rgba(14,159,142,${0.15 + 0.85 * (v / max)})` : '#1e293b' }} title={`${DOW[d]} ${String(h).padStart(2, '0')}:00 — ${v} page views`} />)}
          </div>
        ))}
        <div className="flex pl-8 text-[9px] text-slate-500 justify-between mt-0.5"><span>00:00</span><span>06:00</span><span>12:00</span><span>18:00</span><span>23:00</span></div>
      </div>
    </div>
  );
}

/** Dashboard section: who visits ShopOS, from where, on what, and what they do. Anonymous: the database holds no names,
 * emails or raw IP addresses. Numbers come from admin-only database functions. Kenya time. */
export function SiteAnalytics({ supabase }: { supabase: SupabaseClient }) {
  const [days, setDays] = useState(30);
  const [ov, setOv] = useState<Overview | null>(null);
  const [series, setSeries] = useState<Point[]>([]);
  const [heat, setHeat] = useState<Heat[]>([]);
  const [funnel, setFunnel] = useState<Step[]>([]);
  const [recent, setRecent] = useState<Recent[]>([]);
  const [types, setTypes] = useState<TypeRow[]>([]);
  const [dims, setDims] = useState<Record<string, Row[]>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async (quiet = false) => {
    if (!quiet) setBusy(true);
    setError(null);
    try {
      const [o, s, h, f, r, t, ...b] = await Promise.all([
        supabase.rpc('admin_site_overview', { p_days: days }), supabase.rpc('admin_site_timeseries', { p_days: days }), supabase.rpc('admin_site_hourly', { p_days: days }),
        supabase.rpc('admin_site_funnel', { p_days: days }), supabase.rpc('admin_site_recent', { p_limit: 40 }), supabase.rpc('admin_business_types'),
        ...BREAKDOWNS.map((x) => supabase.rpc('admin_site_breakdown', { p_days: days, p_dim: x.dim, p_limit: 10 }))
      ]);
      const firstErr = [o, s, h, f, r, t, ...b].find((x) => x.error);
      if (firstErr?.error) { setError(friendlyError(firstErr.error, "Couldn't load visitor figures.")); return; }
      const raw = o.data as Overview;
      setOv(Object.fromEntries(Object.entries(raw ?? {}).map(([k, v]) => [k, v == null ? null : Number(v)])) as unknown as Overview);
      setSeries(((s.data ?? []) as Point[]).map((p) => ({ bucket: p.bucket, visitors: n(p.visitors), sessions: n(p.sessions), pageviews: n(p.pageviews) })));
      setHeat((h.data ?? []) as Heat[]);
      setFunnel(((f.data ?? []) as Step[]).map((x) => ({ step: x.step, visitors: n(x.visitors) })));
      setRecent((r.data ?? []) as Recent[]);
      setTypes(((t.data ?? []) as TypeRow[]).map((x) => ({ business_type: x.business_type, businesses: n(x.businesses) })));
      const d: Record<string, Row[]> = {};
      BREAKDOWNS.forEach((x, i) => { d[x.dim] = ((b[i].data ?? []) as Row[]).map((row) => ({ label: row.label, visitors: n(row.visitors), pageviews: n(row.pageviews) })); });
      setDims(d);
    } finally { setBusy(false); }
  }, [supabase, days]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => { const t = window.setInterval(() => { if (document.visibilityState === 'visible') void load(true); }, 30000); return () => window.clearInterval(t); }, [load]);

  function csv() {
    const lines = ['period,visitors,visits,page_views', ...series.map((p) => `${p.bucket},${p.visitors},${p.sessions},${p.pageviews}`)];
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([lines.join('\n')], { type: 'text/csv' })); a.download = `shopos-visitors-${days}d.csv`; a.click(); URL.revokeObjectURL(a.href);
  }

  const returning = ov ? Math.max(0, ov.visitors - ov.new_visitors) : 0;
  const topFunnel = Math.max(1, funnel[0]?.visitors ?? 1);
  const totalBiz = types.reduce((a, b) => a + b.businesses, 0);

  return (
    <div>
      <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
        <div className="flex items-center gap-2">
          <h2 className="font-display font-semibold text-lg">Website visitors</h2>
          {ov && <span className="inline-flex items-center gap-1.5 text-[11px] rounded-full bg-slate-800 px-2.5 py-1"><span className={`w-2 h-2 rounded-full ${ov.live_now > 0 ? 'bg-field-500 animate-pulse' : 'bg-slate-600'}`} /> {ov.live_now} on now</span>}
        </div>
        <div className="flex items-center gap-1 flex-wrap">
          <div role="group" aria-label="Period" className="flex gap-1">{PERIODS.map((p) => <button key={p.d} onClick={() => setDays(p.d)} aria-pressed={days === p.d} className={`text-xs px-3 min-h-[32px] rounded-full ${days === p.d ? 'bg-field-600 text-white' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'}`}>{p.label}</button>)}</div>
          <button onClick={() => load()} aria-label="Refresh" className="min-h-[32px] min-w-[32px] rounded-full bg-slate-800 text-slate-300 inline-flex items-center justify-center">{busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}</button>
          <button onClick={csv} disabled={!series.length} aria-label="Download CSV" className="min-h-[32px] px-3 rounded-full bg-slate-800 text-slate-300 text-xs inline-flex items-center gap-1 disabled:opacity-40"><Download className="w-3.5 h-3.5" /> CSV</button>
        </div>
      </div>
      {error && <p role="alert" className="text-sm text-rust-500 mb-3">Could not load visitor figures: {error}</p>}
      {!ov && !error && <p className="text-sm text-slate-500">Loading…</p>}
      {ov && (
        <div className="space-y-3">
          {ov.pageviews === 0 && <Card><p className="text-sm text-slate-300">No visits recorded in this period yet. Visits appear here once the new app version is live and people open the site. Browsers that send “Do Not Track” and demo sessions are not counted.</p></Card>}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <Tile label="Visitors" value={fmt(ov.visitors)} sub={<Delta cur={ov.visitors} prev={ov.prev_visitors} />} />
            <Tile label="Visits (sessions)" value={fmt(ov.sessions)} sub={<Delta cur={ov.sessions} prev={ov.prev_sessions} />} />
            <Tile label="Page views" value={fmt(ov.pageviews)} sub={<Delta cur={ov.pageviews} prev={ov.prev_pageviews} />} />
            <Tile label="Avg time on site" value={dur(ov.avg_seconds)} />
            <Tile label="New visitors" value={fmt(ov.new_visitors)} />
            <Tile label="Returning" value={fmt(returning)} />
            <Tile label="Pages per visit" value={ov.avg_pages ?? '–'} />
            <Tile label="Bounce rate" value={ov.bounce_rate == null ? '–' : `${ov.bounce_rate}%`} sub={<span className="text-[10px] text-slate-500">left after one page</span>} />
            <Tile label="Tried the demo" value={fmt(ov.demos)} />
            <Tile label="Installed the app" value={fmt(ov.installs)} />
            <Tile label="Desktop downloads" value={fmt(ov.desktop_downloads)} />
            <Tile label="Signed-in visitors" value={fmt(ov.signed_in_visitors)} sub={<span className="text-[10px] text-slate-500">{fmt(ov.pwa_visitors)} via installed app</span>} />
          </div>

          <Card>
            <div className="flex items-center justify-between mb-2 gap-3"><div className="text-sm font-medium">Traffic over time</div><div className="text-[11px] text-slate-400 flex items-center gap-3"><span className="inline-flex items-center gap-1"><i className="w-2.5 h-0.5 bg-teal-500/60 inline-block" /> Page views</span><span className="inline-flex items-center gap-1"><i className="w-2.5 h-0.5 bg-teal-300 inline-block" /> Visitors</span></div></div>
            {series.length ? <Chart data={series} hourly={days <= 1} /> : <p className="text-xs text-slate-500">No data.</p>}
          </Card>

          <div className="grid md:grid-cols-2 gap-3">
            <Card>
              <div className="text-sm font-medium mb-2">From visit to sign-in</div>
              <ul className="space-y-2">
                {funnel.map((s, i) => (
                  <li key={s.step} className="text-xs">
                    <div className="flex justify-between"><span>{s.step}</span><span className="tnum text-slate-300">{fmt(s.visitors)}{i > 0 && funnel[0].visitors > 0 && <span className="text-slate-500"> · {Math.round((s.visitors / topFunnel) * 100)}%</span>}</span></div>
                    <div className="h-1.5 rounded-full bg-slate-800/80 mt-1"><div className="h-full rounded-full bg-gradient-to-r from-teal-600 to-teal-400" style={{ width: `${Math.max(2, (s.visitors / topFunnel) * 100)}%` }} /></div>
                  </li>
                ))}
              </ul>
              <p className="text-[11px] text-slate-500 mt-2">Each step counts different people, not in strict order, so a later step can include people who skipped an earlier one.</p>
            </Card>
            <Card>
              <div className="text-sm font-medium mb-2">Busiest times <span className="text-xs text-slate-500 font-normal">· page views, Kenya time</span></div>
              <Heatmap rows={heat} />
            </Card>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {BREAKDOWNS.map((b) => (
              <Card key={b.dim}>
                <div className="text-sm font-medium mb-2">{b.title} <span className="text-[10px] text-slate-500 font-normal">visitors · views</span></div>
                <Bars rows={dims[b.dim] ?? []} render={b.dim === 'country' ? country : b.dim === 'event' ? (l) => EVENT_LABEL[l] ?? l : undefined} />
              </Card>
            ))}
            <Card>
              <div className="text-sm font-medium mb-2">Businesses by type <span className="text-[10px] text-slate-500 font-normal">{fmt(totalBiz)} total</span></div>
              <Bars rows={types.slice(0, 12).map((x) => ({ label: x.business_type, visitors: x.businesses, pageviews: 0 }))} render={(l) => TYPE_LABEL[l] ?? l} />
            </Card>
          </div>

          <Card>
            <div className="text-sm font-medium mb-2">Latest activity <span className="text-[10px] text-slate-500 font-normal">refreshes every 30 seconds</span></div>
            {recent.length === 0 ? <p className="text-xs text-slate-500">Nothing yet.</p> : (
              <div className="overflow-x-auto -mx-1"><table className="w-full text-xs min-w-[560px]">
                <thead><tr className="text-slate-500 text-left"><th className="px-1 py-1 font-medium">When</th><th className="px-1 font-medium">What</th><th className="px-1 font-medium">Where</th><th className="px-1 font-medium">Device</th><th className="px-1 font-medium">From</th><th className="px-1 font-medium">Visitor</th></tr></thead>
                <tbody>{recent.map((r, i) => (
                  <tr key={i} className="border-t border-slate-800">
                    <td className="px-1 py-1.5 text-slate-400 whitespace-nowrap">{ago(r.created_at)}</td>
                    <td className="px-1">{r.event === 'pageview' ? r.path : (EVENT_LABEL[r.event] ?? r.event)}{r.signed_in && <span className="ml-1 text-[9px] bg-slate-700 rounded px-1">signed in</span>}</td>
                    <td className="px-1 text-slate-300">{[r.city, r.country ? country(r.country) : null].filter(Boolean).join(', ') || '–'}</td>
                    <td className="px-1 text-slate-300">{[r.device, r.os, r.browser].filter(Boolean).join(' · ')}</td>
                    <td className="px-1 text-slate-400">{r.referrer_host ?? '–'}</td>
                    <td className="px-1 text-slate-500 font-mono">{r.visitor}</td>
                  </tr>))}</tbody>
              </table></div>
            )}
          </Card>
          <p className="text-[11px] text-slate-500">Anonymous counting only: no names, emails, phone numbers or IP addresses are stored. A visitor is one browser. Bots and crawlers are filtered out. Countries and cities come from the network, so they are approximate.</p>
        </div>
      )}
    </div>
  );
}
