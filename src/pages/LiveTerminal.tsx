import { useEffect, useMemo, useRef, useState } from 'react';
import { SupabaseClient } from '@supabase/supabase-js';

type Row = { at: string; source: string; level: string; line: string; business: string | null; detail: Record<string, unknown> | null };
const COLOR: Record<string, string> = { ok: '#4ade80', info: '#7dd3fc', warn: '#fbbf24', err: '#f87171' };
const SOURCES = ['all', 'site', 'sale', 'booking', 'review', 'signup', 'payment', 'security', 'request', 'support', 'audit', 'app', 'status', 'release', 'push'];
const LEVELS = [['all', 'All levels'], ['err', 'Errors'], ['warn', 'Warnings'], ['ok', 'Success'], ['info', 'Info']];
const tz = 'Africa/Nairobi';
const clock = (iso: string) => new Date(iso).toLocaleTimeString('en-GB', { timeZone: tz, hour12: false });
const stamp = (iso: string, withDate: boolean) => withDate ? `${new Date(iso).toLocaleDateString('en-GB', { timeZone: tz, day: '2-digit', month: 'short' })} ${clock(iso)}` : clock(iso);
const full = (iso: string) => new Date(iso).toLocaleString('en-GB', { timeZone: tz, weekday: 'short', day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
const key = (r: Row) => `${r.at}|${r.source}|${r.line}`;
/** datetime-local value (Nairobi wall time, UTC+3) from a Date. */
const toLocalInput = (d: Date) => new Date(d.getTime() + 3 * 3600_000).toISOString().slice(0, 16);
const fromLocalInput = (s: string) => new Date(`${s}:00+03:00`);

function Detail({ r }: { r: Row }) {
  const entries = Object.entries(r.detail ?? {}).filter(([, v]) => v !== null && v !== '' && v !== undefined);
  return (
    <div className="ml-[88px] mb-2 mt-0.5 rounded-lg p-3 text-[12px] leading-5" style={{ background: '#111a18', boxShadow: 'inset 0 0 0 1px #1f2a27' }}>
      <div style={{ color: '#9ca3af' }}>{full(r.at)} · <span style={{ color: COLOR[r.level] }}>{r.level}</span> · {r.source}{r.business ? ` · ${r.business}` : ''}</div>
      <div className="mt-1 break-words">{r.line}</div>
      {entries.length > 0 && <dl className="mt-2 grid grid-cols-[auto,1fr] gap-x-4 gap-y-0.5">
        {entries.map(([k, v]) => <div key={k} className="contents"><dt style={{ color: '#6b7280' }}>{k.replace(/_/g, ' ')}</dt><dd className="break-all whitespace-pre-wrap">{typeof v === 'object' ? JSON.stringify(v, null, 1) : String(v)}</dd></div>)}
      </dl>}
    </div>
  );
}

/** Everything happening on the platform, live, plus a searchable history of everything that happened before. */
export default function LiveTerminal({ supabase }: { supabase: SupabaseClient }) {
  const [mode, setMode] = useState<'live' | 'history'>('live');
  const [rows, setRows] = useState<Row[]>([]);
  const [paused, setPaused] = useState(false);
  const [src, setSrc] = useState('all'); const [level, setLevel] = useState('all'); const [search, setSearch] = useState('');
  const [err, setErr] = useState(''); const [busy, setBusy] = useState(false);
  const [fresh, setFresh] = useState<Set<string>>(new Set());
  const [last, setLast] = useState<Date | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [from, setFrom] = useState(() => toLocalInput(new Date(Date.now() - 24 * 3600_000))); const [to, setTo] = useState(() => toLocalInput(new Date()));
  const [more, setMore] = useState(false);
  const seen = useRef<Set<string>>(new Set()); const box = useRef<HTMLDivElement>(null); const stick = useRef(true);
  const histLimit = 500;

  // Live mode: refresh every 2 seconds with the last 6 hours.
  useEffect(() => {
    if (mode !== 'live') return;
    let live = true; let first = true; seen.current = new Set();
    async function pull() {
      if (paused) return;
      const { data, error } = await supabase.rpc('admin_live_feed2', { p_since: new Date(Date.now() - 6 * 3600_000).toISOString(), p_until: new Date(Date.now() + 60_000).toISOString(), p_limit: 400, p_source: src, p_level: level, p_search: search || null });
      if (!live) return;
      if (error) { setErr(error.message); return; }
      setErr(''); setLast(new Date());
      const list = ((data ?? []) as Row[]).slice().reverse();
      const newKeys = new Set<string>();
      for (const r of list) { const k = key(r); if (!seen.current.has(k)) { seen.current.add(k); if (!first) newKeys.add(k); } }
      first = false; setRows(list);
      if (newKeys.size) { setFresh(newKeys); window.setTimeout(() => live && setFresh(new Set()), 2500); }
    }
    void pull(); const t = window.setInterval(pull, 2000);
    return () => { live = false; window.clearInterval(t); };
  }, [supabase, paused, mode, src, level, search]);

  async function runHistory(older = false) {
    setBusy(true); setErr('');
    const until = older && rows.length ? new Date(new Date(rows[0].at).getTime()) : fromLocalInput(to);
    const since = fromLocalInput(from);
    if (!(since < until)) { setErr('Choose a start that is before the end.'); setBusy(false); return; }
    const { data, error } = await supabase.rpc('admin_live_feed2', { p_since: since.toISOString(), p_until: until.toISOString(), p_limit: histLimit, p_source: src, p_level: level, p_search: search || null });
    setBusy(false);
    if (error) { setErr(error.message); return; }
    const list = ((data ?? []) as Row[]).slice().reverse();
    setMore(list.length >= histLimit);
    setRows(older ? [...list, ...rows] : list); setOpen(null);
  }
  useEffect(() => { if (mode === 'history') { setRows([]); setMore(false); } }, [mode]);

  useEffect(() => { const el = box.current; if (el && stick.current && mode === 'live') el.scrollTop = el.scrollHeight; }, [rows, mode]);
  const lastFive = rows.filter((r) => r.source === 'site' && Date.now() - new Date(r.at).getTime() < 5 * 60000).length;
  const counts = useMemo(() => { const c: Record<string, number> = {}; for (const r of rows) c[r.level] = (c[r.level] ?? 0) + 1; return c; }, [rows]);
  const spansDays = rows.length > 0 && new Date(rows[0].at).toDateString() !== new Date(rows[rows.length - 1].at).toDateString();

  function exportCsv() {
    const esc = (s: unknown) => `"${String(s ?? '').replace(/"/g, '""')}"`;
    const csv = ['time,source,level,business,line,detail', ...rows.map((r) => [r.at, r.source, r.level, r.business, r.line, JSON.stringify(r.detail ?? {})].map(esc).join(','))].join('\n');
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' })); a.download = `shopos-activity-${new Date().toISOString().slice(0, 10)}.csv`; a.click(); URL.revokeObjectURL(a.href);
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 justify-between">
        <div>
          <h1 className="text-xl font-semibold flex items-center gap-2"><span className={`inline-block w-2.5 h-2.5 rounded-full ${mode === 'live' && !paused ? 'bg-green-500 animate-pulse' : 'bg-slate-400'}`} />Live terminal</h1>
          <p className="text-xs text-slate-500">{mode === 'live' ? `Updates every 2 seconds. Showing the last 6 hours, Nairobi time.${last ? ` Last checked ${clock(last.toISOString())}.` : ''} Tap any line for every detail.` : 'Search everything that happened in a past period, up to 31 days at a time. Nairobi time. Tap any line for every detail.'}</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <div className="inline-flex rounded-lg border overflow-hidden text-sm">
            {(['live', 'history'] as const).map((m) => <button key={m} onClick={() => setMode(m)} className={`px-3 py-1.5 ${mode === m ? 'bg-slate-800 text-white' : 'text-slate-500'}`}>{m === 'live' ? 'Live' : 'Past logs'}</button>)}
          </div>
          {mode === 'live' && <button onClick={() => setPaused((p) => !p)} className="px-3 py-1.5 rounded-lg border text-sm">{paused ? 'Resume' : 'Pause'}</button>}
          <button onClick={exportCsv} disabled={!rows.length} className="px-3 py-1.5 rounded-lg border text-sm disabled:opacity-40">Download CSV</button>
        </div>
      </div>

      {mode === 'history' && (
        <div className="flex flex-wrap items-end gap-2">
          <label className="text-xs text-slate-500">From<input type="datetime-local" value={from} onChange={(e) => setFrom(e.target.value)} className="block mt-0.5 rounded-lg border bg-transparent px-2 py-1.5 text-sm" /></label>
          <label className="text-xs text-slate-500">To<input type="datetime-local" value={to} onChange={(e) => setTo(e.target.value)} className="block mt-0.5 rounded-lg border bg-transparent px-2 py-1.5 text-sm" /></label>
          {[['Last hour', 1], ['Today', 0], ['Yesterday', -1], ['7 days', 168], ['30 days', 720]].map(([l, h]) => (
            <button key={l as string} type="button" className="px-2.5 py-1.5 rounded-full border text-xs text-slate-500" onClick={() => {
              const now = new Date(); const startOfToday = new Date(`${new Date(now.getTime() + 3 * 3600_000).toISOString().slice(0, 10)}T00:00:00+03:00`);
              if (h === 0) { setFrom(toLocalInput(startOfToday)); setTo(toLocalInput(now)); }
              else if (h === -1) { setFrom(toLocalInput(new Date(startOfToday.getTime() - 86400_000))); setTo(toLocalInput(startOfToday)); }
              else { setFrom(toLocalInput(new Date(now.getTime() - (h as number) * 3600_000))); setTo(toLocalInput(now)); }
            }}>{l}</button>
          ))}
          <button onClick={() => void runHistory()} disabled={busy} className="px-4 py-1.5 rounded-lg bg-emerald-600 text-white text-sm disabled:opacity-50">{busy ? 'Searching…' : 'Show logs'}</button>
        </div>
      )}

      <div className="flex flex-wrap gap-2 items-center">
        <input value={search} onChange={(e) => setSearch(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && mode === 'history') void runHistory(); }} placeholder="Search business, receipt, phone, text…" className="rounded-lg border bg-transparent px-3 py-1.5 text-sm w-64 max-w-full" aria-label="Search logs" />
        <select value={level} onChange={(e) => setLevel(e.target.value)} className="rounded-lg border bg-transparent px-2 py-1.5 text-sm" aria-label="Level">{LEVELS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
        {mode === 'live' && <span className="px-3 py-1.5 rounded-lg border text-sm text-slate-500">{lastFive} site events in 5 min</span>}
        <span className="text-xs text-slate-500">{rows.length} lines{counts.err ? ` · ${counts.err} errors` : ''}{counts.warn ? ` · ${counts.warn} warnings` : ''}</span>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {SOURCES.map((s) => <button key={s} onClick={() => setSrc(s)} className={`px-2.5 py-1 rounded-full text-xs border ${src === s ? 'bg-slate-800 text-white border-slate-800' : 'text-slate-500'}`}>{s}</button>)}
      </div>
      {err && <p className="text-sm text-red-500">{err}</p>}
      <div ref={box} onScroll={(e) => { const el = e.currentTarget; stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40; }}
        className="rounded-xl overflow-y-auto font-mono text-[12.5px] leading-6 p-4 h-[65vh]" style={{ background: '#0b1110', color: '#d1d5db', boxShadow: 'inset 0 0 0 1px #1f2a27' }}>
        <div style={{ color: '#6b7280' }}>{mode === 'live' ? 'shopos@platform:~$ tail -f activity.log' : `shopos@platform:~$ grep ${search ? `"${search}" ` : ''}activity.log   # ${from.replace('T', ' ')} to ${to.replace('T', ' ')}`}</div>
        {mode === 'history' && more && <button onClick={() => void runHistory(true)} disabled={busy} className="my-1 text-xs underline" style={{ color: '#7dd3fc' }}>Load older lines</button>}
        {rows.length === 0 && <div style={{ color: '#6b7280' }}>{mode === 'live' ? 'Waiting for activity…' : busy ? 'Searching…' : 'Pick a period and tap “Show logs”.'}</div>}
        {rows.map((r) => (
          <div key={key(r)}>
            <button type="button" onClick={() => setOpen(open === key(r) ? null : key(r))} aria-expanded={open === key(r)} className="w-full text-left flex gap-3 rounded px-1 transition-colors hover:bg-white/5" style={fresh.has(key(r)) ? { background: 'rgba(74,222,128,.14)' } : undefined}>
              <span style={{ color: '#6b7280' }} className="shrink-0">{stamp(r.at, mode === 'history' || spansDays)}</span>
              <span className="shrink-0 w-[68px] uppercase" style={{ color: COLOR[r.level] ?? '#9ca3af' }}>{r.source}</span>
              <span className="min-w-0 break-words">{r.business ? <span style={{ color: '#9ca3af' }}>[{r.business}] </span> : null}{r.line}</span>
            </button>
            {open === key(r) && <Detail r={r} />}
          </div>
        ))}
        {mode === 'live' && <div><span style={{ color: '#4ade80' }}>▍</span></div>}
      </div>
    </div>
  );
}
