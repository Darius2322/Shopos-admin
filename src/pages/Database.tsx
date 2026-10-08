import { useCallback, useEffect, useMemo, useState } from 'react';
import { SupabaseClient } from '@supabase/supabase-js';
import { Loader2, RefreshCw, CheckCircle2, AlertTriangle, XCircle } from 'lucide-react';
import { Card, Skeleton, ErrorText } from '../components/ui';
import { friendlyError } from '../lib/friendlyError';

interface TableRow { name: string; rows: number; bytes: number; dead: number; row_bytes: number; scoped: boolean; last_maintained: string | null }
interface Overview {
  info: { version: string; started_at: string; size_bytes: number; limit_bytes: number; used_pct: number; extensions: number; tables: number; timezone: string; app_events: number; expired_link_requests: number; stale_rate_limits: number; soft_deleted: number; soft_deleted_overdue: number };
  health: { status: 'good' | 'watch' | 'critical'; notes: string[]; cache_hit_pct: number; connections: number; max_connections: number; long_queries: number; idle_in_transaction: number; tables_without_rls: number; dead_rows: number; live_rows: number };
  capacity: { remaining_bytes: number; bytes_per_sale: number; bytes_per_product: number; bytes_per_customer: number; bytes_per_business_actual: number; businesses: number };
  tables: TableRow[];
}

type Sub = 'overview' | 'capacity' | 'health' | 'actions' | 'details';
const SUBS: [Sub, string][] = [['overview', 'Overview'], ['capacity', 'Capacity'], ['health', 'Health'], ['actions', 'Quick actions'], ['details', 'Details']];

const bytes = (b: number) => b >= 1073741824 ? `${(b / 1073741824).toFixed(2)} GB` : b >= 1048576 ? `${(b / 1048576).toFixed(1)} MB` : b >= 1024 ? `${Math.round(b / 1024)} KB` : `${Math.round(b)} B`;
const num = (v: number) => Math.floor(v).toLocaleString();
const ago = (iso: string | null) => { if (!iso) return 'never'; const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000); return s < 3600 ? `${Math.max(1, Math.floor(s / 60))}m ago` : s < 86400 ? `${Math.floor(s / 3600)}h ago` : `${Math.floor(s / 86400)}d ago`; };

function Meter({ pct }: { pct: number }) {
  const tone = pct >= 90 ? 'from-red-600 to-red-400' : pct >= 75 ? 'from-amber-600 to-amber-400' : 'from-teal-600 to-teal-400';
  return <div className="h-2.5 rounded-full bg-slate-800 overflow-hidden" role="progressbar" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100}><div className={`h-full rounded-full bg-gradient-to-r ${tone}`} style={{ width: `${Math.min(100, Math.max(pct > 0 ? 1.5 : 0, pct))}%` }} /></div>;
}
function Tile({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return <div className="rounded-xl bg-slate-800/70 p-3 min-w-0"><div className="text-[11px] text-slate-400">{label}</div><div className="text-xl font-semibold tnum mt-0.5 break-words">{value}</div>{sub && <div className="text-[11px] text-slate-500 mt-0.5">{sub}</div>}</div>;
}

/** Database: how full it is, how many more businesses and transactions fit, health, safe maintenance jobs and table details.
 * Capacity figures are ESTIMATES built from the real average row sizes in your database (including a margin for indexes). */
export default function DatabasePage({ supabase }: { supabase: SupabaseClient }) {
  const [sub, setSub] = useState<Sub>('overview');
  const [data, setData] = useState<Overview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    const { data: d, error: e } = await supabase.rpc('admin_db_overview');
    if (e) setError(friendlyError(e, 'Could not read the database details.')); else setData(d as Overview);
    setLoading(false);
  }, [supabase]);
  useEffect(() => { void load(); }, [load]);

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="font-display font-semibold text-lg">Database</h2>
          <p className="text-xs text-slate-400">Space, capacity and health of the ShopOS database. Figures are read live; capacity numbers are estimates.</p>
        </div>
        <button onClick={() => void load()} disabled={loading} className="btn-secondary inline-flex items-center gap-1.5 text-xs min-h-[36px] px-3 shrink-0"><RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} /> Refresh</button>
      </div>
      <div className="flex gap-1 overflow-x-auto pb-1" role="tablist">
        {SUBS.map(([k, l]) => (
          <button key={k} role="tab" aria-selected={sub === k} onClick={() => setSub(k)} className={`text-sm px-3.5 min-h-[36px] rounded-full whitespace-nowrap ${sub === k ? 'bg-field-600 text-white' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'}`}>{l}</button>
        ))}
      </div>
      <ErrorText>{error}</ErrorText>
      {loading && !data ? <Skeleton /> : data && (
        <>
          {sub === 'overview' && <Overview d={data} />}
          {sub === 'capacity' && <Capacity d={data} supabase={supabase} onChanged={load} />}
          {sub === 'health' && <Health d={data} />}
          {sub === 'actions' && <Actions d={data} supabase={supabase} onDone={load} />}
          {sub === 'details' && <Details d={data} />}
        </>
      )}
    </div>
  );
}

function Overview({ d }: { d: Overview }) {
  const { info, health, capacity } = d;
  const StatusIcon = health.status === 'good' ? CheckCircle2 : health.status === 'watch' ? AlertTriangle : XCircle;
  const tone = health.status === 'good' ? 'text-emerald-400' : health.status === 'watch' ? 'text-amber-400' : 'text-red-400';
  return (
    <div className="space-y-4">
      <Card>
        <div className="flex items-baseline justify-between gap-3 mb-2"><div className="text-sm font-medium">Space used</div><div className="text-sm tnum">{bytes(info.size_bytes)} of {bytes(info.limit_bytes)}</div></div>
        <Meter pct={Number(info.used_pct)} />
        <p className="text-xs text-slate-400 mt-2">{Number(info.used_pct)}% used · {bytes(capacity.remaining_bytes)} free on the plan size set under Capacity.</p>
      </Card>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <Tile label="Businesses" value={num(capacity.businesses)} sub="not deleted" />
        <Tile label="Tables" value={num(info.tables)} />
        <Tile label="Live rows" value={num(health.live_rows)} />
        <Tile label="Soft-deleted" value={num(info.soft_deleted)} sub={info.soft_deleted_overdue ? `${info.soft_deleted_overdue} past 30 days` : undefined} />
      </div>
      <Card>
        <div className={`flex items-center gap-2 text-sm font-medium ${tone}`}><StatusIcon className="w-4 h-4" /> {health.status === 'good' ? 'Healthy' : health.status === 'watch' ? 'Worth watching' : 'Needs attention'}</div>
        {health.notes.length > 0 ? <ul className="text-xs text-slate-300 mt-2 space-y-1 list-disc pl-4">{health.notes.map((n) => <li key={n}>{n}</li>)}</ul> : <p className="text-xs text-slate-400 mt-1">No problems found.</p>}
      </Card>
    </div>
  );
}

function Capacity({ d, supabase, onChanged }: { d: Overview; supabase: SupabaseClient; onChanged: () => Promise<void> }) {
  const { info, capacity: c } = d;
  const [limitMb, setLimitMb] = useState(String(Math.round(info.limit_bytes / 1048576)));
  const [planMb, setPlanMb] = useState(() => String(Math.max(1, Math.round((c.bytes_per_business_actual || 5 * 1048576) / 1048576 * 10) / 10)));
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const free = c.remaining_bytes;
  const perBiz = Math.max(1, Number(planMb) || 0) * 1048576;
  const moreBiz = Math.floor(free / perBiz);
  const perSaleKb = c.bytes_per_sale, perProd = c.bytes_per_product;
  const moreSales = Math.floor(free / Math.max(1, perSaleKb));
  const moreProducts = Math.floor(free / Math.max(1, perProd));

  async function saveLimit() {
    setBusy(true); setErr(null); setMsg(null);
    const { error } = await supabase.rpc('admin_set_db_limit', { p_mb: Math.round(Number(limitMb)) });
    if (error) setErr(friendlyError(error, 'Could not save the plan size. Enter a number between 100 and 1,000,000.')); else { setMsg('Plan size saved.'); await onChanged(); }
    setBusy(false);
  }

  return (
    <div className="space-y-4">
      <Card className="space-y-3">
        <div className="text-sm font-medium">How much room is left</div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          <Tile label="More businesses" value={num(moreBiz)} sub={`at ${planMb || 0} MB each`} />
          <Tile label="More transactions" value={num(moreSales)} sub={`about ${bytes(perSaleKb)} each`} />
          <Tile label="More products" value={num(moreProducts)} sub={`about ${bytes(perProd)} each`} />
        </div>
        <p className="text-[11px] text-slate-500">Each number assumes ALL the free space goes to that one thing, so they are not additive. Estimates use the real average size of rows in your tables plus a margin for indexes. Treat them as a guide, not a guarantee.</p>
      </Card>

      <Card className="space-y-2">
        <div className="text-sm font-medium">Planning size per business</div>
        <p className="text-xs text-slate-400">Today the {c.businesses} business{c.businesses === 1 ? '' : 'es'} use about {c.bytes_per_business_actual ? bytes(c.bytes_per_business_actual) : 'no measurable space'} each on average. Busy shops grow over time, so plan with a larger figure.</p>
        <label className="flex items-center gap-2 text-sm">
          <input type="number" min={0.1} step={0.1} value={planMb} onChange={(e) => setPlanMb(e.target.value)} className="input w-28" aria-label="Planning size per business in megabytes" /> MB per business
        </label>
        <div className="flex flex-wrap gap-1.5">
          {[5, 20, 50, 100].map((m) => <button key={m} onClick={() => setPlanMb(String(m))} className="text-xs px-2.5 min-h-[30px] rounded-full bg-slate-800 text-slate-300 hover:bg-slate-700">{m} MB</button>)}
        </div>
      </Card>

      <Card className="space-y-2">
        <div className="text-sm font-medium">Plan size</div>
        <p className="text-xs text-slate-400">The database size your Supabase plan includes. Set it so the percentages above are right. Supabase's own dashboard is the final word on billing.</p>
        <div className="flex items-center gap-2">
          <input type="number" min={100} value={limitMb} onChange={(e) => setLimitMb(e.target.value)} className="input w-32" aria-label="Plan size in megabytes" /> <span className="text-sm">MB</span>
          <button onClick={() => void saveLimit()} disabled={busy} className="btn-primary inline-flex items-center gap-1.5 min-h-[40px] px-4">{busy && <Loader2 className="w-4 h-4 animate-spin" />} Save</button>
        </div>
        {msg && <p className="text-xs text-emerald-400">{msg}</p>}<ErrorText>{err}</ErrorText>
      </Card>
    </div>
  );
}

function Health({ d }: { d: Overview }) {
  const { health: h } = d;
  const rows: [string, string, boolean][] = [
    ['Cache hit rate', `${h.cache_hit_pct}%`, Number(h.cache_hit_pct) >= 90],
    ['Connections', `${h.connections} of ${h.max_connections}`, h.connections / Math.max(1, h.max_connections) <= 0.8],
    ['Queries running over 5 min', String(h.long_queries), h.long_queries === 0],
    ['Stuck transactions', String(h.idle_in_transaction), h.idle_in_transaction === 0],
    ['Tables without row-level security', String(h.tables_without_rls), h.tables_without_rls === 0],
    ['Dead rows', `${num(h.dead_rows)} of ${num(h.live_rows + h.dead_rows)}`, !(h.live_rows > 1000 && h.dead_rows / Math.max(1, h.live_rows + h.dead_rows) > 0.2)],
  ];
  return (
    <Card className="divide-y divide-slate-800">
      {rows.map(([l, v, ok]) => (
        <div key={l} className="flex items-center justify-between gap-3 py-2.5 text-sm first:pt-0 last:pb-0">
          <span className="text-slate-300">{l}</span>
          <span className={`tnum inline-flex items-center gap-1.5 ${ok ? 'text-emerald-400' : 'text-amber-400'}`}>{ok ? <CheckCircle2 className="w-3.5 h-3.5" /> : <AlertTriangle className="w-3.5 h-3.5" />}{v}</span>
        </div>
      ))}
    </Card>
  );
}

const ACTIONS: { key: string; title: string; text: string; count?: (d: Overview) => number | null }[] = [
  { key: 'analyze', title: 'Refresh statistics', text: 'Updates the numbers the database uses to plan queries and these estimates. Safe at any time.' },
  { key: 'purge_events', title: 'Clear old monitor events', text: 'Removes monitor events older than 30 days.', count: (d) => d.info.app_events },
  { key: 'purge_rate_limits', title: 'Clear stale rate-limit counters', text: 'Removes request counters older than a day.', count: (d) => d.info.stale_rate_limits },
  { key: 'purge_link_requests', title: 'Clear expired device-link codes', text: 'Removes device-link codes older than a day. They expire after 2 minutes anyway.', count: (d) => d.info.expired_link_requests },
  { key: 'purge_site_visits', title: 'Clear old visit records', text: 'Removes website visit records older than 180 days. Older traffic charts will shrink.' },
];

function Actions({ d, supabase, onDone }: { d: Overview; supabase: SupabaseClient; onDone: () => Promise<void> }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);
  async function run(key: string) {
    setBusy(key); setResult(null);
    const { data, error } = await supabase.rpc('admin_db_action', { p_action: key });
    if (error) setResult({ ok: false, text: friendlyError(error, 'That did not work. Please try again.') });
    else { setResult({ ok: true, text: String((data as { message?: string })?.message ?? 'Done.') }); await onDone(); }
    setBusy(null);
  }
  return (
    <div className="space-y-3">
      <p className="text-xs text-slate-400">A fixed list of safe maintenance jobs. None of them touch business data (sales, products, customers). Each run is written to the audit log.</p>
      {result && <p className={`text-sm rounded-xl p-3 ${result.ok ? 'bg-emerald-500/10 text-emerald-300' : 'bg-red-500/10 text-red-300'}`} role="status">{result.text}</p>}
      {ACTIONS.map((a) => (
        <Card key={a.key} className="flex items-center justify-between gap-3">
          <div className="min-w-0"><p className="text-sm font-medium">{a.title}</p><p className="text-xs text-slate-400 mt-0.5">{a.text}</p>{a.count && <p className="text-[11px] text-slate-500 mt-0.5 tnum">{num(a.count(d) ?? 0)} on record</p>}</div>
          <button onClick={() => void run(a.key)} disabled={!!busy} className="btn-secondary shrink-0 inline-flex items-center gap-1.5 min-h-[40px] px-4 text-sm">{busy === a.key && <Loader2 className="w-4 h-4 animate-spin" />} Run</button>
        </Card>
      ))}
    </div>
  );
}

function Details({ d }: { d: Overview }) {
  const { info } = d;
  const [q, setQ] = useState('');
  const tables = useMemo(() => d.tables.filter((t) => t.name.includes(q.trim().toLowerCase())), [d.tables, q]);
  const total = d.tables.reduce((s, t) => s + t.bytes, 0) || 1;
  return (
    <div className="space-y-4">
      <Card className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
        {([['Engine', info.version], ['Time zone', info.timezone], ['Running since', new Date(info.started_at).toLocaleString()], ['Extensions', String(info.extensions)], ['Tables', String(info.tables)], ['Total size', bytes(info.size_bytes)]] as [string, string][]).map(([l, v]) => (
          <div key={l} className="min-w-0"><div className="text-[11px] text-slate-500">{l}</div><div className="truncate" title={v}>{v}</div></div>
        ))}
      </Card>
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find a table" className="input w-full" aria-label="Find a table" />
      <Card className="p-0 overflow-x-auto">
        <table className="w-full text-xs min-w-[520px]">
          <thead><tr className="text-left text-slate-500"><th className="p-3 font-medium">Table</th><th className="p-3 font-medium text-right">Rows</th><th className="p-3 font-medium text-right">Size</th><th className="p-3 font-medium w-28">Share</th><th className="p-3 font-medium text-right">Maintained</th></tr></thead>
          <tbody>
            {tables.map((t) => (
              <tr key={t.name} className="border-t border-slate-800">
                <td className="p-3 font-mono">{t.name}</td><td className="p-3 text-right tnum">{num(t.rows)}</td><td className="p-3 text-right tnum">{bytes(t.bytes)}</td>
                <td className="p-3"><div className="h-1 rounded-full bg-slate-800"><div className="h-full rounded-full bg-teal-500" style={{ width: `${Math.max(2, (t.bytes / total) * 100)}%` }} /></div></td>
                <td className="p-3 text-right text-slate-400">{ago(t.last_maintained)}</td>
              </tr>
            ))}
            {!tables.length && <tr><td colSpan={5} className="p-4 text-center text-slate-500">No table matches.</td></tr>}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
