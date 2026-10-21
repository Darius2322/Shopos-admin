import { useCallback, useEffect, useRef, useState } from 'react';
import { SupabaseClient } from '@supabase/supabase-js';
import { friendlyError } from '../lib/friendlyError';

type Tone = 'out' | 'dim' | 'ok' | 'warn' | 'err' | 'sec' | 'cmd';
interface Line { id: number; tone: Tone; text: string }
interface Ev { id: number; created_at: string; level: string; source: string; kind: string; message: string | null; business_name: string | null; path: string | null; app_version: string | null }

const TONE: Record<Tone, string> = { out: 'text-slate-200', dim: 'text-slate-500', ok: 'text-emerald-400', warn: 'text-amber-400', err: 'text-red-400', sec: 'text-fuchsia-400', cmd: 'text-sky-300' };
const LEVEL_TONE: Record<string, Tone> = { info: 'out', warn: 'warn', error: 'err', security: 'sec' };
const COMMANDS: [string, string, string][] = [
  ['health', 'platform health: database size, connections, last activity, errors', 'health   (alias: status)'],
  ['stats', 'events, visitors, sales and blocked requests', 'stats [minutes]   default 60, up to 10080'],
  ['tail', 'last n events', 'tail [n] [level]   n default 30, level: info|warn|error|security'],
  ['errors', 'last 30 errors', 'errors'],
  ['security', 'last 30 security events (rate limits, blocked bursts)', 'security   (alias: sec)'],
  ['watch', 'live stream of new events', 'watch [level]   stop it with: stop'],
  ['stop', 'stop the live stream', 'stop'],
  ['db', 'database size, plan usage, version and uptime', 'db'],
  ['tables', 'biggest tables by size, with rows', 'tables [n]   default 10, up to 80'],
  ['capacity', 'estimated room left for businesses, sales and products', 'capacity'],
  ['cleanup', 'how much old data the quick actions could clear (read-only)', 'cleanup   run the jobs from Database -> Quick actions'],
  ['deleted', 'soft-deleted businesses and days left before purge', 'deleted'],
  ['uptime', 'how long the database server has been running', 'uptime'],
  ['whoami', 'the admin account you are signed in as', 'whoami'],
  ['date', 'current time here and in Nairobi', 'date'],
  ['history', 'commands you ran this session', 'history'],
  ['clear', 'clear the screen', 'clear   (alias: cls)'],
  ['help', 'this list, or details for one command', 'help [command]'],
];
const HELP = [
  'ShopOS monitor — read-only. Commands:',
  ...COMMANDS.map(([n, d]) => `  ${n.padEnd(10)} ${d}`),
  'Type "help <command>" for usage. Up/Down arrows recall earlier commands. Nothing here can change data.'
];
const fmtBytes = (b: number) => b >= 1073741824 ? `${(b / 1073741824).toFixed(2)} GB` : b >= 1048576 ? `${(b / 1048576).toFixed(1)} MB` : `${Math.round(b / 1024)} KB`;
const fmtUp = (iso: string) => { const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000); const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60); return `${d}d ${h}h ${m}m`; };
interface DbOverview { info: { version: string; started_at: string; size_bytes: number; limit_bytes: number; used_pct: number; tables: number; soft_deleted: number; soft_deleted_overdue: number; app_events: number; expired_link_requests: number; stale_rate_limits: number }; health: { status: string; notes: string[]; cache_hit_pct: number; connections: number; max_connections: number; tables_without_rls: number }; capacity: { remaining_bytes: number; bytes_per_sale: number; bytes_per_product: number; bytes_per_business_actual: number; businesses: number }; tables: { name: string; rows: number; bytes: number }[] }
const hhmmss = (iso: string) => new Date(iso).toLocaleTimeString([], { hour12: false });
const ago = (iso: string | null) => { if (!iso) return 'never'; const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000); return s < 60 ? `${Math.floor(s)}s ago` : s < 3600 ? `${Math.floor(s / 60)}m ago` : s < 86400 ? `${Math.floor(s / 3600)}h ago` : `${Math.floor(s / 86400)}d ago`; };
const fmtEv = (e: Ev) => `${hhmmss(e.created_at)} ${e.level.toUpperCase().padEnd(8)} ${e.source.padEnd(5)} ${e.kind}${e.business_name ? ` [${e.business_name}]` : ''}${e.message ? ` — ${e.message}` : ''}${e.app_version ? ` (v${e.app_version})` : ''}`;
const LEVELS = ['info', 'warn', 'error', 'security'];

/** Read-only terminal for watching the platform: health, statistics and a live event stream. */
export default function Monitor({ supabase }: { supabase: SupabaseClient }) {
  const seq = useRef(0);
  const [lines, setLines] = useState<Line[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [watching, setWatching] = useState<string | null | false>(false);
  const history = useRef<string[]>([]);
  const hpos = useRef(-1);
  const lastId = useRef(0);
  const box = useRef<HTMLDivElement>(null);
  const field = useRef<HTMLInputElement>(null);

  const push = useCallback((tone: Tone, ...texts: string[]) => setLines((l) => [...l, ...texts.map((text) => ({ id: ++seq.current, tone, text }))].slice(-600)), []);

  useEffect(() => { box.current?.scrollTo({ top: box.current.scrollHeight }); }, [lines]);
  useEffect(() => {
    push('ok', 'ShopOS monitor ready.'); push('dim', 'Type "help" for commands, or try: health');
    void run('health', true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Live stream
  useEffect(() => {
    if (watching === false) return;
    let off = false;
    const tick = async () => {
      const { data, error } = await supabase.rpc('admin_monitor_tail', { p_after: lastId.current, p_limit: 100, p_level: watching, p_source: null });
      if (off) return;
      if (error) { push('err', friendlyError(error, 'Live stream interrupted. Retrying…')); return; }
      const evs = ((data ?? []) as Ev[]).slice().sort((a, b) => a.id - b.id);
      for (const e of evs) { lastId.current = Math.max(lastId.current, e.id); push(LEVEL_TONE[e.level] ?? 'out', fmtEv(e)); }
    };
    const t = setInterval(tick, 3000);
    return () => { off = true; clearInterval(t); };
  }, [watching, supabase, push]);

  async function tailCmd(n: number, level: string | null) {
    const { data, error } = await supabase.rpc('admin_monitor_tail', { p_after: 0, p_limit: n, p_level: level, p_source: null });
    if (error) { push('err', friendlyError(error)); return; }
    const evs = ((data ?? []) as Ev[]).slice().sort((a, b) => a.id - b.id);
    if (!evs.length) { push('dim', level ? `No ${level} events recorded.` : 'No events recorded yet.'); return; }
    for (const e of evs) { lastId.current = Math.max(lastId.current, e.id); push(LEVEL_TONE[e.level] ?? 'out', fmtEv(e)); }
  }

  async function run(raw: string, silent = false) {
    const cmd = raw.trim();
    if (!cmd) return;
    if (!silent) { push('cmd', `$ ${cmd}`); history.current = [cmd, ...history.current.filter((c) => c !== cmd)].slice(0, 50); }
    hpos.current = -1;
    const [name, ...args] = cmd.toLowerCase().split(/\s+/);
    setBusy(true);
    try {
      switch (name) {
        case 'help': case '?': {
          const c = COMMANDS.find(([n]) => n === args[0]);
          if (args[0] && !c) { push('warn', `No command "${args[0]}". Type "help".`); break; }
          if (c) push('out', `${c[0]} — ${c[1]}`, `usage: ${c[2]}`); else push('out', ...HELP);
          break;
        }
        case 'history': {
          const h = history.current.slice().reverse();
          if (!h.length) push('dim', 'No commands yet.'); else push('out', ...h.map((c, i) => `${String(i + 1).padStart(3)}  ${c}`));
          break;
        }
        case 'date': case 'time': {
          const now = new Date();
          push('out', `local    ${now.toLocaleString()}`, `nairobi  ${now.toLocaleString('en-GB', { timeZone: 'Africa/Nairobi', dateStyle: 'medium', timeStyle: 'medium' })}`, `utc      ${now.toISOString().replace('T', ' ').slice(0, 19)}`);
          break;
        }
        case 'whoami': {
          const { data: { user } } = await supabase.auth.getUser();
          push('out', user ? `${user.email ?? 'admin'}  (platform admin)` : 'Not signed in.');
          break;
        }
        case 'db': case 'uptime': case 'tables': case 'capacity': case 'cleanup': {
          const { data, error } = await supabase.rpc('admin_db_overview');
          if (error) { push('err', friendlyError(error)); break; }
          const o = data as DbOverview;
          if (name === 'uptime') { push('out', `database up ${fmtUp(o.info.started_at)} (since ${new Date(o.info.started_at).toLocaleString()})`); break; }
          if (name === 'db') {
            const used = Number(o.info.used_pct);
            push(used >= 90 ? 'err' : used >= 75 ? 'warn' : 'ok', `plan usage      ${used}% (${fmtBytes(o.info.size_bytes)} of ${fmtBytes(o.info.limit_bytes)})`);
            push('out', `engine          ${o.info.version}`, `uptime          ${fmtUp(o.info.started_at)}`, `tables          ${o.info.tables}`, `connections     ${o.health.connections} of ${o.health.max_connections}`, `cache hit       ${o.health.cache_hit_pct}%`, `rls gaps        ${o.health.tables_without_rls === 0 ? 'none' : o.health.tables_without_rls + ' table(s) without RLS'}`, `health          ${o.health.status}`);
            for (const n of o.health.notes) push('warn', `  ! ${n}`);
            break;
          }
          if (name === 'tables') {
            const n = Math.min(Math.max(parseInt(args[0] ?? '10', 10) || 10, 1), 80);
            push('dim', `${'table'.padEnd(28)} ${'rows'.padStart(10)} ${'size'.padStart(10)}`);
            for (const t of o.tables.slice(0, n)) push('out', `${t.name.padEnd(28)} ${String(t.rows).padStart(10)} ${fmtBytes(t.bytes).padStart(10)}`);
            break;
          }
          if (name === 'capacity') {
            const c = o.capacity;
            push('out', `free space       ${fmtBytes(c.remaining_bytes)}`, `businesses now  ${c.businesses} (about ${c.bytes_per_business_actual ? fmtBytes(c.bytes_per_business_actual) : 'n/a'} each)`,
              `room for sales  ~${Math.floor(c.remaining_bytes / Math.max(1, c.bytes_per_sale)).toLocaleString()} (${c.bytes_per_sale} B each)`,
              `room for items  ~${Math.floor(c.remaining_bytes / Math.max(1, c.bytes_per_product)).toLocaleString()} products (${c.bytes_per_product} B each)`);
            push('dim', 'Estimates. Each figure assumes all free space goes to that one thing.');
            break;
          }
          push('out', `monitor events (>30d)   ${o.info.app_events} on record`, `rate-limit counters    ${o.info.stale_rate_limits} stale`, `device-link codes      ${o.info.expired_link_requests} expired`, `soft-deleted           ${o.info.soft_deleted} (${o.info.soft_deleted_overdue} past 30 days)`);
          push('dim', 'To clear them use Database -> Quick actions.');
          break;
        }
        case 'deleted': {
          const { data, error } = await supabase.rpc('admin_deleted_businesses');
          if (error) { push('err', friendlyError(error)); break; }
          const rows = (data ?? []) as { name: string; deleted_at: string; days_left: number | null; overdue: boolean }[];
          if (!rows.length) { push('dim', 'No soft-deleted businesses.'); break; }
          for (const r of rows) push(r.overdue ? 'warn' : 'out', `${r.name.padEnd(28)} deleted ${new Date(r.deleted_at).toLocaleDateString()}  ${r.overdue ? 'PAST 30 DAYS' : r.days_left == null ? 'no expiry' : r.days_left + ' day(s) left'}`);
          push('dim', 'Manage them under Soft Delete.');
          break;
        }
        case 'clear': case 'cls': setLines([]); break;
        case 'stop': if (watching !== false) { setWatching(false); push('dim', 'Live stream stopped.'); } else push('dim', 'Nothing is streaming.'); break;
        case 'watch': {
          const lvl = args[0] && LEVELS.includes(args[0]) ? args[0] : null;
          if (args[0] && !lvl) { push('warn', `Unknown level "${args[0]}". Use: ${LEVELS.join(', ')}`); break; }
          const { data } = await supabase.rpc('admin_monitor_tail', { p_after: 0, p_limit: 1, p_level: null, p_source: null });
          lastId.current = Math.max(0, ...(((data ?? []) as Ev[]).map((e) => e.id)));
          setWatching(lvl); push('ok', `Streaming ${lvl ?? 'all'} events. New lines appear here. Type "stop" to end.`); break;
        }
        case 'tail': {
          const n = Math.min(Math.max(parseInt(args.find((a) => /^\d+$/.test(a)) ?? '30', 10), 1), 200);
          const lvl = args.find((a) => LEVELS.includes(a)) ?? null;
          await tailCmd(n, lvl); break;
        }
        case 'errors': await tailCmd(30, 'error'); break;
        case 'security': case 'sec': await tailCmd(30, 'security'); break;
        case 'health': case 'status': {
          const { data, error } = await supabase.rpc('admin_monitor_health');
          if (error) { push('err', friendlyError(error)); break; }
          const h = data as Record<string, unknown>;
          const errs = Number(h.errors_24h ?? 0), sec = Number(h.security_24h ?? 0);
          push(errs === 0 ? 'ok' : errs < 10 ? 'warn' : 'err', `status          ${errs === 0 ? 'healthy' : errs < 10 ? 'some errors in the last 24h' : 'needs attention'}`);
          push('out',
            `database        ${h.db_size_mb} MB · ${h.connections} connections`,
            `businesses      ${h.businesses} total · ${h.active_businesses_24h} active in 24h`,
            `last sale       ${ago(h.last_sale_at as string | null)}`,
            `last visit      ${ago(h.last_visit_at as string | null)}`,
            `last event      ${ago(h.last_event_at as string | null)}`,
            `errors (24h)    ${errs}`,
            `security (24h)  ${sec}`,
            `installers live ${h.installers_live}`);
          break;
        }
        case 'stats': {
          const mins = Math.min(Math.max(parseInt(args[0] ?? '60', 10) || 60, 1), 10080);
          const { data, error } = await supabase.rpc('admin_monitor_stats', { p_minutes: mins });
          if (error) { push('err', friendlyError(error)); break; }
          const s = data as { events: Record<string, number>; top_kinds: { kind: string; level: string; count: number }[]; affected_businesses: number; visits: number; visitors: number; sales: number; rate_limited: number; rate_scopes: { scope: string; buckets: number }[] };
          push('out', `last ${mins} minutes`,
            `events          info ${s.events.info ?? 0} · warn ${s.events.warn ?? 0} · error ${s.events.error ?? 0} · security ${s.events.security ?? 0}`,
            `visitors        ${s.visitors} (${s.visits} page views)`,
            `sales synced    ${s.sales}`,
            `businesses hit  ${s.affected_businesses} with warnings or errors`,
            `blocked bursts  ${s.rate_limited}`);
          for (const k of s.top_kinds ?? []) push(LEVEL_TONE[k.level] ?? 'out', `  ${String(k.count).padStart(4)} × ${k.kind}`);
          for (const r of s.rate_scopes ?? []) push('sec', `  rate limit hit: ${r.scope} (${r.buckets})`);
          break;
        }
        default: push('warn', `Unknown command "${name}". Type "help".`);
      }
    } catch (e) { push('err', friendlyError(e)); } finally { setBusy(false); field.current?.focus(); }
  }

  function onKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowUp') { e.preventDefault(); const n = Math.min(hpos.current + 1, history.current.length - 1); if (n >= 0) { hpos.current = n; setInput(history.current[n]); } }
    if (e.key === 'ArrowDown') { e.preventDefault(); const n = hpos.current - 1; hpos.current = n; setInput(n >= 0 ? history.current[n] : ''); }
  }

  return (
    <div className="space-y-3">
      <div>
        <h2 className="font-display font-semibold text-lg">Monitor</h2>
        <p className="text-xs text-slate-400">A read-only terminal for keeping an eye on the app: health, errors, blocked requests and a live event stream. Details are scrubbed of names, emails, phone numbers and tokens.</p>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {['health', 'db', 'tables', 'capacity', 'deleted', 'stats', 'errors', 'security', 'tail', watching === false ? 'watch' : 'stop', 'clear', 'help'].map((c) => (
          <button key={c} onClick={() => run(c)} disabled={busy} className="text-xs font-mono px-2.5 min-h-[32px] rounded-lg bg-slate-800 text-slate-200 hover:bg-slate-700">{c}</button>
        ))}
      </div>
      <div className="rounded-xl border border-slate-700 bg-black overflow-hidden" onClick={() => field.current?.focus()}>
        <div className="flex items-center gap-1.5 px-3 py-2 border-b border-slate-800 bg-slate-900/80">
          <span className="w-2.5 h-2.5 rounded-full bg-red-500/80" /><span className="w-2.5 h-2.5 rounded-full bg-amber-500/80" /><span className="w-2.5 h-2.5 rounded-full bg-emerald-500/80" />
          <span className="ml-2 text-[11px] font-mono text-slate-500">shopos@monitor {watching === false ? '' : '· ● live'}</span>
        </div>
        <div ref={box} role="log" aria-live="polite" className="h-[55vh] min-h-[280px] overflow-y-auto p-3 font-mono text-[12px] leading-5">
          {lines.map((l) => <div key={l.id} className={`whitespace-pre-wrap break-words ${TONE[l.tone]}`}>{l.text}</div>)}
        </div>
        <form onSubmit={(e) => { e.preventDefault(); const v = input; setInput(''); void run(v); }} className="flex items-center gap-2 border-t border-slate-800 px-3 py-2 font-mono text-[12px]">
          <span className="text-emerald-400">$</span>
          <input ref={field} value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={onKey} disabled={busy} autoComplete="off" autoCapitalize="none" autoCorrect="off" spellCheck={false} aria-label="Command" placeholder="type a command, e.g. health" className="flex-1 min-w-0 bg-transparent outline-none text-slate-100 placeholder:text-slate-600" />
        </form>
      </div>
    </div>
  );
}
