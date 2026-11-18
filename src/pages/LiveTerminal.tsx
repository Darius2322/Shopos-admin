import { useEffect, useRef, useState } from 'react';
import { SupabaseClient } from '@supabase/supabase-js';

type Row = { at: string; source: string; level: string; line: string };
const COLOR: Record<string, string> = { ok: '#4ade80', info: '#7dd3fc', warn: '#fbbf24', err: '#f87171' };
const SOURCES = ['all', 'site', 'sale', 'booking', 'review', 'signup', 'security', 'request', 'support'];
const stamp = (iso: string) => new Date(iso).toLocaleTimeString('en-GB', { timeZone: 'Africa/Nairobi', hour12: false });

/** Everything happening on the platform, as it happens: sales, bookings, reviews, sign-ups, security events and requests. */
export default function LiveTerminal({ supabase }: { supabase: SupabaseClient }) {
  const [rows, setRows] = useState<Row[]>([]);
  const [paused, setPaused] = useState(false);
  const [src, setSrc] = useState('all');
  const [err, setErr] = useState('');
  const [fresh, setFresh] = useState<Set<string>>(new Set());
  const [last, setLast] = useState<Date | null>(null);
  const seen = useRef<Set<string>>(new Set());
  const box = useRef<HTMLDivElement>(null);
  const stick = useRef(true);
  const key = (r: Row) => `${r.at}|${r.source}|${r.line}`;

  useEffect(() => {
    let live = true; let first = true;
    async function pull() {
      if (paused) return;
      const { data, error } = await supabase.rpc('admin_live_feed', { p_since: new Date(Date.now() - 6 * 3600 * 1000).toISOString(), p_limit: 300 });
      if (!live) return;
      if (error) { setErr(error.message); return; }
      setErr(''); setLast(new Date());
      const list = ((data ?? []) as Row[]).slice().reverse();
      const newKeys = new Set<string>();
      for (const r of list) { const k = key(r); if (!seen.current.has(k)) { seen.current.add(k); if (!first) newKeys.add(k); } }
      first = false;
      setRows(list);
      if (newKeys.size) { setFresh(newKeys); window.setTimeout(() => live && setFresh(new Set()), 2500); }
    }
    void pull(); const t = window.setInterval(pull, 2000);
    return () => { live = false; window.clearInterval(t); };
  }, [supabase, paused]);

  useEffect(() => { const el = box.current; if (el && stick.current) el.scrollTop = el.scrollHeight; }, [rows, src]);
  const lastFive = rows.filter((r) => r.source === 'site' && Date.now() - new Date(r.at).getTime() < 5 * 60000).length;
  const shown = rows.filter((r) => src === 'all' || r.source === src);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 justify-between">
        <div>
          <h1 className="text-xl font-semibold flex items-center gap-2"><span className={`inline-block w-2.5 h-2.5 rounded-full ${paused ? 'bg-slate-400' : 'bg-green-500 animate-pulse'}`} />Live terminal</h1>
          <p className="text-xs text-slate-500">Updates every 2 seconds. “site” lines are visitors on www.shopos.co.ke (page views, bots, devices, places). Showing the last 6 hours, Nairobi time.{last ? ` Last checked ${stamp(last.toISOString())}.` : ''}</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setPaused((p) => !p)} className="px-3 py-1.5 rounded-lg border text-sm">{paused ? 'Resume' : 'Pause'}</button>
          <button onClick={() => { setRows([]); }} className="px-3 py-1.5 rounded-lg border text-sm">Clear screen</button>
          <span className="px-3 py-1.5 rounded-lg border text-sm text-slate-500">{lastFive} site events in 5 min</span>
        </div>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {SOURCES.map((s) => <button key={s} onClick={() => setSrc(s)} className={`px-2.5 py-1 rounded-full text-xs border ${src === s ? 'bg-slate-800 text-white border-slate-800' : 'text-slate-500'}`}>{s}</button>)}
      </div>
      {err && <p className="text-sm text-red-500">{err}</p>}
      <div ref={box} onScroll={(e) => { const el = e.currentTarget; stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40; }}
        className="rounded-xl overflow-y-auto font-mono text-[12.5px] leading-6 p-4 h-[65vh]" style={{ background: '#0b1110', color: '#d1d5db', boxShadow: 'inset 0 0 0 1px #1f2a27' }}>
        <div style={{ color: '#6b7280' }}>shopos@platform:~$ tail -f activity.log</div>
        {shown.length === 0 && <div style={{ color: '#6b7280' }}>Waiting for activity…</div>}
        {shown.map((r) => (
          <div key={key(r)} className="flex gap-3 rounded px-1 transition-colors" style={fresh.has(key(r)) ? { background: 'rgba(74,222,128,.14)' } : undefined}>
            <span style={{ color: '#6b7280' }} className="shrink-0">{stamp(r.at)}</span>
            <span className="shrink-0 w-[68px] uppercase" style={{ color: COLOR[r.level] ?? '#9ca3af' }}>{r.source}</span>
            <span className="min-w-0 break-words">{r.line}</span>
          </div>
        ))}
        <div><span style={{ color: '#4ade80' }}>▍</span></div>
      </div>
    </div>
  );
}
