import { ReactNode, useCallback, useEffect, useState } from 'react';
import { SupabaseClient } from '@supabase/supabase-js';
import { Card } from './ui';
import { Copy, Download, Loader2, Search, X } from 'lucide-react';
import { DAYS_LONG, EVENT_LABEL, ago, call, country, dur, download, fmt, n, when, where } from '../lib/siteUtil';

export type VisitorView = 'overview' | 'live' | 'places' | 'sources' | 'pages' | 'devices' | 'people' | 'network' | 'bots' | 'security';
export const VISITOR_VIEWS: [VisitorView, string][] = [
  ['overview', 'Overview'], ['live', 'Live feed'], ['places', 'Places'], ['sources', 'Sources'], ['pages', 'Pages'], ['devices', 'Devices'],
  ['people', 'People'], ['network', 'IP addresses'], ['bots', 'Bots & crawlers'], ['security', 'Security']
];

interface Top { label: string; visitors: number; pageviews: number; sessions: number; last_seen: string }
interface Recent { created_at: string; event: string; path: string; country: string | null; region: string | null; city: string | null; device: string | null; os: string | null; browser: string | null; referrer_host: string | null; signed_in: boolean; visitor: string; visitor_full: string; ip: string | null; channel: string | null; is_bot: boolean; bot_name: string | null; lang: string | null; tz: string | null; screen_w: number | null; user_agent: string | null }
interface Person { visitor: string; first_seen: string; last_seen: string; sessions: number; pageviews: number; actions: number; country: string | null; city: string | null; device: string | null; os: string | null; browser: string | null; channel: string | null; ip: string | null; signed_in: boolean; referrer: string | null; entry_path: string | null; seconds: number; came_back: boolean }
interface IpRow { ip: string; country: string | null; region: string | null; city: string | null; ip_tz: string | null; hits: number; pageviews: number; bot_hits: number; visitors: number; sessions: number; first_seen: string; last_seen: string; bot_name: string | null; user_agent: string | null; lat: number | null; lon: number | null }
interface BotRow { bot_name: string; hits: number; ips: number; countries: number; first_seen: string; last_seen: string; top_path: string }
interface Trail { created_at: string; event: string; path: string; duration_ms: number | null; ip: string | null; city: string | null; country: string | null; referrer_host: string | null; visitor: string; is_bot: boolean; bot_name: string | null; user_agent: string | null; session_id: string }
interface Slot { views: number; visitors: number; sessions: number; dates: number; signed_in: number; pages: SRow[]; countries: SRow[]; cities: SRow[]; devices: SRow[]; sources: SRow[]; by_hour: { hr: number; views: number }[]; recent: { created_at: string; path: string; country: string | null; city: string | null; device: string | null; os: string | null; browser: string | null; referrer_host: string | null; visitor: string; visitor_full: string; ip: string | null }[] }
interface SRow { label: string; visitors: number; pageviews: number }
interface Security {
  bot_hits: number; probe_hits: number; probe_ips: number; ips_recorded: number; oldest_ip: string | null; blocked_total: number;
  probes: { ip: string; country: string | null; hits: number; paths: string[]; last_seen: string }[];
  heavy: { ip: string; country: string | null; city: string | null; hits: number; visitors: number }[];
  many_ids: { ip: string; country: string | null; city: string | null; visitors: number; hits: number }[];
  blocked: { kind: string; n: number; last_seen: string }[];
}

function Tile({ label, value, sub }: { label: string; value: ReactNode; sub?: ReactNode }) {
  return <div className="rounded-xl bg-slate-800/70 p-3 min-w-0"><div className="text-[11px] text-slate-400">{label}</div><div className="text-xl font-semibold tnum mt-0.5 truncate">{value}</div>{sub && <div className="text-[10px] text-slate-500 mt-0.5">{sub}</div>}</div>;
}
function Bars({ rows, render, onPick }: { rows: { label: string; visitors: number; pageviews: number; sessions?: number }[]; render?: (l: string) => string; onPick?: (l: string) => void }) {
  const max = Math.max(1, ...rows.map((r) => r.pageviews));
  if (!rows.length) return <p className="text-xs text-slate-500">No data yet.</p>;
  return (
    <ul className="space-y-1.5">
      {rows.map((r) => {
        const inner = (
          <>
            <div className="flex justify-between gap-2"><span className="truncate text-left" title={r.label}>{render ? render(r.label) : r.label}</span><span className="tnum text-slate-300 shrink-0">{fmt(r.visitors)}<span className="text-slate-500"> · {fmt(r.pageviews)}{r.sessions != null ? ` · ${fmt(r.sessions)}` : ''}</span></span></div>
            <div className="h-1 rounded-full bg-slate-800/80 mt-1"><div className="h-full rounded-full bg-gradient-to-r from-teal-600 to-teal-400" style={{ width: `${Math.max(3, (r.pageviews / max) * 100)}%` }} /></div>
          </>
        );
        return <li key={r.label} className="text-xs">{onPick ? <button type="button" onClick={() => onPick(r.label)} className="w-full text-left rounded hover:bg-slate-800/50">{inner}</button> : inner}</li>;
      })}
    </ul>
  );
}
function Loading() { return <p className="text-sm text-slate-500 flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Loading…</p>; }
function Err({ text }: { text: string }) { return <p role="alert" className="text-sm text-rust-500">{text}</p>; }
const Th = ({ children }: { children: ReactNode }) => <th className="px-1.5 py-1 font-medium whitespace-nowrap">{children}</th>;
const Td = ({ children, mono, dim }: { children: ReactNode; mono?: boolean; dim?: boolean }) => <td className={`px-1.5 py-1.5 whitespace-nowrap ${mono ? 'font-mono' : ''} ${dim ? 'text-slate-400' : ''}`}>{children}</td>;

function CopyIp({ ip }: { ip: string }) {
  const [done, setDone] = useState(false);
  return <button type="button" aria-label={`Copy ${ip}`} title="Copy" onClick={(e) => { e.stopPropagation(); void navigator.clipboard?.writeText(ip).then(() => { setDone(true); window.setTimeout(() => setDone(false), 1200); }).catch(() => undefined); }} className="ml-1 text-slate-500 hover:text-ink align-middle">{done ? <span className="text-[10px] text-field-500">copied</span> : <Copy className="w-3 h-3 inline" />}</button>;
}

/** A group of breakdown lists loaded together. */
function Lists({ supabase, days, items, bots, onPick }: { supabase: SupabaseClient; days: number; items: { dim: string; title: string; render?: (l: string) => string; limit?: number }[]; bots?: boolean; onPick?: (dim: string, label: string) => void }) {
  const [data, setData] = useState<Record<string, Top[]> | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    let live = true; setData(null); setErr(null);
    void Promise.all(items.map((i) => call<Top[]>(supabase, 'admin_site_top', { p_days: days, p_dim: i.dim, p_limit: i.limit ?? 15, p_bots: !!bots }))).then((r) => {
      if (!live) return;
      const bad = r.find((x) => x.error); if (bad?.error) { setErr(bad.error); return; }
      const d: Record<string, Top[]> = {}; items.forEach((i, k) => { d[i.dim] = (r[k].data ?? []).map((t) => ({ ...t, visitors: n(t.visitors), pageviews: n(t.pageviews), sessions: n(t.sessions) })); }); setData(d);
    });
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabase, days, bots, items.map((i) => i.dim).join(',')]);
  if (err) return <Err text={err} />;
  if (!data) return <Loading />;
  return (
    <div className="grid sm:grid-cols-2 gap-3">
      {items.map((i) => (
        <Card key={i.dim}><div className="text-sm font-medium mb-2">{i.title} <span className="text-[10px] text-slate-500 font-normal">{bots ? 'IPs · hits' : 'visitors · views · visits'}</span></div>
          <Bars rows={data[i.dim] ?? []} render={i.render} onPick={onPick ? (l) => onPick(i.dim, l) : undefined} /></Card>
      ))}
    </div>
  );
}

const cc = (l: string) => (/^[A-Z]{2}$/.test(l) ? country(l) : l);
const channelLabel = (l: string) => l;

/** Everything about one visitor (or one IP address): every request in time order. */
export function TrailModal({ supabase, visitor, ip, onClose }: { supabase: SupabaseClient; visitor?: string | null; ip?: string | null; onClose: () => void }) {
  const [rows, setRows] = useState<Trail[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => { void call<Trail[]>(supabase, 'admin_site_trail', { p_visitor: visitor ?? null, p_ip: ip ?? null, p_limit: 300 }).then((r) => { if (r.error) setErr(r.error); else setRows(r.data ?? []); }); }, [supabase, visitor, ip]);
  const first = rows?.[rows.length - 1]; const last = rows?.[0];
  const sessions = new Set((rows ?? []).map((r) => r.session_id)).size;
  const ips = Array.from(new Set((rows ?? []).map((r) => r.ip).filter(Boolean) as string[]));
  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-end sm:items-center justify-center p-0 sm:p-4" role="dialog" aria-modal="true" onClick={onClose}>
      <div className="bg-paper w-full sm:max-w-3xl max-h-[92vh] overflow-y-auto rounded-t-2xl sm:rounded-2xl border border-slate-700 p-4" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="min-w-0"><h3 className="font-display font-semibold">{visitor ? 'Visitor' : 'IP address'} <span className="font-mono text-teal-300">{(visitor ?? ip ?? '').slice(0, 40)}</span></h3>
            {rows && rows.length > 0 && <p className="text-xs text-slate-400 mt-0.5">{rows.length} requests · {sessions} visits · first {when(first?.created_at)} · last {when(last?.created_at)}{ips.length > 0 && <> · IP {ips.join(', ')}</>}</p>}</div>
          <button onClick={onClose} aria-label="Close" className="p-1.5 text-slate-400 hover:text-ink"><X className="w-5 h-5" /></button>
        </div>
        {err && <Err text={err} />}{!rows && !err && <Loading />}
        {rows && rows.length === 0 && <p className="text-sm text-slate-500">Nothing found.</p>}
        {rows && rows.length > 0 && (
          <div className="overflow-x-auto"><table className="w-full text-xs min-w-[520px]">
            <thead><tr className="text-slate-500 text-left"><Th>When (Kenya)</Th><Th>What</Th><Th>Where</Th><Th>IP</Th><Th>From</Th><Th>Stayed</Th></tr></thead>
            <tbody>{rows.map((r, i) => (
              <tr key={i} className="border-t border-slate-800 align-top">
                <Td dim>{when(r.created_at)}</Td>
                <Td>{r.is_bot ? <span className="text-amber-400">{r.bot_name ?? 'Bot'} · </span> : null}{r.event === 'pageview' || r.event === 'bot_hit' || r.event === 'engage' ? r.path : (EVENT_LABEL[r.event] ?? r.event)}{r.event === 'engage' && <span className="text-slate-500"> (time on page)</span>}</Td>
                <Td>{where(r.city, r.country)}</Td><Td mono dim>{r.ip ?? '–'}</Td><Td dim>{r.referrer_host ?? '–'}</Td><Td dim>{r.duration_ms ? dur(Math.round(r.duration_ms / 1000)) : '–'}</Td>
              </tr>))}</tbody>
          </table></div>
        )}
        {rows?.some((r) => r.user_agent) && <p className="text-[11px] text-slate-500 mt-3 break-all">Browser identity: {rows.find((r) => r.user_agent)?.user_agent}</p>}
      </div>
    </div>
  );
}

/** Opens when a box in the "Busiest times" grid is pressed: everything that happened in that hour (or that whole day). */
export function SlotModal({ supabase, days, dow, hr: hr0, onClose, onTrail }: { supabase: SupabaseClient; days: number; dow: number; hr: number | null; onClose: () => void; onTrail: (v: string) => void }) {
  const [hr, setHr] = useState<number | null>(hr0);
  const [d, setD] = useState<Slot | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => { setD(null); setErr(null); void call<Slot>(supabase, 'admin_site_slot', { p_days: days, p_dow: dow, p_hr: hr }).then((r) => { if (r.error) setErr(r.error); else setD(r.data); }); }, [supabase, days, dow, hr]);
  const hh = (h: number) => `${String(h).padStart(2, '0')}:00`;
  const hours = Array.from({ length: 24 }, (_, h) => ({ h, v: n(d?.by_hour?.find((x) => x.hr === h)?.views) }));
  const maxH = Math.max(1, ...hours.map((x) => x.v));
  const list = (rows: SRow[]) => rows.map((r) => ({ label: r.label, visitors: n(r.visitors), pageviews: n(r.pageviews) }));
  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-end sm:items-center justify-center p-0 sm:p-4" role="dialog" aria-modal="true" onClick={onClose}>
      <div className="bg-paper w-full sm:max-w-3xl max-h-[92vh] overflow-y-auto rounded-t-2xl sm:rounded-2xl border border-slate-700 p-4" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3 mb-1">
          <div><h3 className="font-display font-semibold text-lg">{DAYS_LONG[dow]}{hr != null ? `, ${hh(hr)} to ${String(hr).padStart(2, '0')}:59` : ', the whole day'}</h3>
            <p className="text-xs text-slate-400">All {DAYS_LONG[dow]}s in the last {Math.max(days, 7)} days, Kenya time{d ? ` · ${d.dates} ${DAYS_LONG[dow]}${d.dates === 1 ? '' : 's'} had visits` : ''}</p></div>
          <button onClick={onClose} aria-label="Close" className="p-1.5 text-slate-400 hover:text-ink"><X className="w-5 h-5" /></button>
        </div>
        <div className="flex gap-1.5 my-3 flex-wrap">
          <button onClick={() => setHr(null)} aria-pressed={hr == null} className={`text-xs px-3 min-h-[32px] rounded-full ${hr == null ? 'bg-field-600 text-white' : 'bg-slate-800 text-slate-300'}`}>Whole day</button>
          {hr != null && <>
            <button onClick={() => setHr((hr + 23) % 24)} className="text-xs px-3 min-h-[32px] rounded-full bg-slate-800 text-slate-300">← {hh((hr + 23) % 24)}</button>
            <button onClick={() => setHr((hr + 1) % 24)} className="text-xs px-3 min-h-[32px] rounded-full bg-slate-800 text-slate-300">{hh((hr + 1) % 24)} →</button>
          </>}
        </div>
        {err && <Err text={err} />}{!d && !err && <Loading />}
        {d && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <Tile label="Page views" value={fmt(d.views)} /><Tile label="Visitors" value={fmt(d.visitors)} /><Tile label="Visits" value={fmt(d.sessions)} /><Tile label="Signed-in visitors" value={fmt(d.signed_in)} />
            </div>
            <Card>
              <div className="text-sm font-medium mb-2">Hour by hour <span className="text-[10px] text-slate-500 font-normal">press an hour to look at it</span></div>
              <div className="flex items-end gap-[3px] h-24">
                {hours.map(({ h, v }) => (
                  <button key={h} type="button" onClick={() => setHr(h)} title={`${hh(h)}: ${v} page views`} aria-label={`${hh(h)}: ${v} page views`} className="flex-1 h-full flex flex-col justify-end items-stretch group">
                    <span className={`rounded-t ${hr === h ? 'bg-field-500' : 'bg-teal-600/70 group-hover:bg-teal-400'}`} style={{ height: `${v ? Math.max(6, (v / maxH) * 100) : 2}%` }} />
                  </button>
                ))}
              </div>
              <div className="flex justify-between text-[9px] text-slate-500 mt-1"><span>00</span><span>06</span><span>12</span><span>18</span><span>23</span></div>
            </Card>
            <div className="grid sm:grid-cols-2 gap-3">
              <Card><div className="text-sm font-medium mb-2">Pages</div><Bars rows={list(d.pages)} /></Card>
              <Card><div className="text-sm font-medium mb-2">Countries</div><Bars rows={list(d.countries)} render={cc} /></Card>
              <Card><div className="text-sm font-medium mb-2">Cities</div><Bars rows={list(d.cities)} /></Card>
              <Card><div className="text-sm font-medium mb-2">Where from</div><Bars rows={list(d.sources)} /></Card>
              <Card><div className="text-sm font-medium mb-2">Devices</div><Bars rows={list(d.devices)} /></Card>
            </div>
            <Card>
              <div className="text-sm font-medium mb-2">Latest visits in this slot <span className="text-[10px] text-slate-500 font-normal">press a row for that visitor's full trail</span></div>
              {d.recent.length === 0 ? <p className="text-xs text-slate-500">No visits in this slot.</p> : (
                <div className="overflow-x-auto"><table className="w-full text-xs min-w-[520px]"><thead><tr className="text-slate-500 text-left"><Th>When (Kenya)</Th><Th>Page</Th><Th>Where</Th><Th>Device</Th><Th>IP</Th><Th>Visitor</Th></tr></thead>
                  <tbody>{d.recent.map((r, i) => (
                    <tr key={i} onClick={() => onTrail(r.visitor_full)} className="border-t border-slate-800 cursor-pointer hover:bg-slate-800/40">
                      <Td dim>{when(r.created_at)}</Td><Td>{r.path}</Td><Td>{where(r.city, r.country)}</Td><Td dim>{[r.device, r.os, r.browser].filter(Boolean).join(' · ')}</Td><Td mono dim>{r.ip ?? '–'}</Td><Td mono dim>{r.visitor}</Td>
                    </tr>))}</tbody></table></div>
              )}
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}

function Live({ supabase, onTrail }: { supabase: SupabaseClient; onTrail: (v: string, ip?: string | null) => void }) {
  const [rows, setRows] = useState<Recent[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [paused, setPaused] = useState(false);
  const load = useCallback(async () => { const r = await call<Recent[]>(supabase, 'admin_site_recent2', { p_limit: 120, p_bots: false }); if (r.error) setErr(r.error); else { setErr(null); setRows(r.data ?? []); } }, [supabase]);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => { if (paused) return; const t = window.setInterval(() => { if (document.visibilityState === 'visible') void load(); }, 15000); return () => window.clearInterval(t); }, [load, paused]);
  return (
    <Card>
      <div className="flex items-center justify-between gap-2 mb-2"><div className="text-sm font-medium">Live feed <span className="text-[10px] text-slate-500 font-normal">newest first · press a row for the visitor's trail</span></div>
        <button onClick={() => setPaused((p) => !p)} className="text-xs px-3 min-h-[30px] rounded-full bg-slate-800 text-slate-300">{paused ? 'Resume' : 'Pause'} updates</button></div>
      {err && <Err text={err} />}{!rows && !err && <Loading />}
      {rows && (rows.length === 0 ? <p className="text-xs text-slate-500">Nothing yet.</p> : (
        <div className="overflow-x-auto -mx-1"><table className="w-full text-xs min-w-[760px]">
          <thead><tr className="text-slate-500 text-left"><Th>When</Th><Th>What</Th><Th>Where</Th><Th>IP address</Th><Th>Device</Th><Th>Screen</Th><Th>Language</Th><Th>From</Th><Th>Visitor</Th></tr></thead>
          <tbody>{rows.map((r, i) => (
            <tr key={i} onClick={() => onTrail(r.visitor_full)} className="border-t border-slate-800 cursor-pointer hover:bg-slate-800/40">
              <Td dim>{ago(r.created_at)}</Td>
              <Td>{r.event === 'pageview' ? r.path : (EVENT_LABEL[r.event] ?? r.event)}{r.signed_in && <span className="ml-1 text-[9px] bg-slate-700 rounded px-1">signed in</span>}</Td>
              <Td>{where(r.city, r.country)}</Td><Td mono dim>{r.ip ?? '–'}{r.ip && <CopyIp ip={r.ip} />}</Td>
              <Td dim>{[r.device, r.os, r.browser].filter(Boolean).join(' · ')}</Td><Td dim>{r.screen_w ? `${r.screen_w}px` : '–'}</Td><Td dim>{r.lang ?? '–'}</Td><Td dim>{r.referrer_host ?? 'Direct'}</Td><Td mono dim>{r.visitor}</Td>
            </tr>))}</tbody>
        </table></div>
      ))}
    </Card>
  );
}

function People({ supabase, days, onTrail }: { supabase: SupabaseClient; days: number; onTrail: (v: string) => void }) {
  const [q, setQ] = useState(''); const [term, setTerm] = useState('');
  const [rows, setRows] = useState<Person[] | null>(null); const [err, setErr] = useState<string | null>(null);
  useEffect(() => { const t = window.setTimeout(() => setTerm(q), 350); return () => window.clearTimeout(t); }, [q]);
  useEffect(() => { setRows(null); void call<Person[]>(supabase, 'admin_site_visitors', { p_days: days, p_limit: 200, p_search: term || null }).then((r) => { if (r.error) setErr(r.error); else { setErr(null); setRows(r.data ?? []); } }); }, [supabase, days, term]);
  const csv = () => rows && download(`shopos-visitors-${days}d.csv`, [['visitor', 'first_seen', 'last_seen', 'visits', 'pages', 'actions', 'country', 'city', 'device', 'os', 'browser', 'opens_as', 'ip', 'from', 'entry_page', 'seconds', 'signed_in', 'returning'], ...rows.map((r) => [r.visitor, r.first_seen, r.last_seen, r.sessions, r.pageviews, r.actions, r.country, r.city, r.device, r.os, r.browser, r.channel, r.ip, r.referrer, r.entry_path, r.seconds, r.signed_in ? 'yes' : 'no', r.came_back ? 'yes' : 'no'])]);
  return (
    <Card>
      <div className="flex items-center gap-2 mb-2 flex-wrap">
        <div className="text-sm font-medium mr-auto">People <span className="text-[10px] text-slate-500 font-normal">one row per browser · press a row for everything they did</span></div>
        <label className="relative"><Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500" /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search id, IP, city, page…" className="input !min-h-[32px] !py-1 pl-8 text-xs w-52" aria-label="Search visitors" /></label>
        <button onClick={csv} disabled={!rows?.length} className="min-h-[32px] px-3 rounded-full bg-slate-800 text-slate-300 text-xs inline-flex items-center gap-1 disabled:opacity-40"><Download className="w-3.5 h-3.5" /> CSV</button>
      </div>
      {err && <Err text={err} />}{!rows && !err && <Loading />}
      {rows && (rows.length === 0 ? <p className="text-xs text-slate-500">No visitors match.</p> : (
        <div className="overflow-x-auto -mx-1"><table className="w-full text-xs min-w-[900px]">
          <thead><tr className="text-slate-500 text-left"><Th>Visitor</Th><Th>Last seen</Th><Th>First seen</Th><Th>Visits</Th><Th>Pages</Th><Th>Actions</Th><Th>Where</Th><Th>IP address</Th><Th>Device</Th><Th>Opens as</Th><Th>From</Th><Th>Entered on</Th><Th>Time</Th><Th>Type</Th></tr></thead>
          <tbody>{rows.map((r) => (
            <tr key={r.visitor} onClick={() => onTrail(r.visitor)} className="border-t border-slate-800 cursor-pointer hover:bg-slate-800/40">
              <Td mono>{r.visitor.slice(0, 8)}</Td><Td dim>{ago(r.last_seen)}</Td><Td dim>{when(r.first_seen)}</Td><Td>{fmt(r.sessions)}</Td><Td>{fmt(r.pageviews)}</Td><Td>{fmt(r.actions)}</Td>
              <Td>{where(r.city, r.country)}</Td><Td mono dim>{r.ip ?? '–'}</Td><Td dim>{[r.device, r.os, r.browser].filter(Boolean).join(' · ')}</Td><Td dim>{r.channel ?? '–'}</Td><Td dim>{r.referrer ?? 'Direct'}</Td><Td dim>{r.entry_path ?? '–'}</Td><Td dim>{dur(r.seconds)}</Td>
              <Td>{r.signed_in && <span className="text-[9px] bg-slate-700 rounded px-1 mr-1">signed in</span>}<span className={`text-[9px] rounded px-1 ${r.came_back ? 'bg-teal-900 text-teal-200' : 'bg-slate-700'}`}>{r.came_back ? 'returning' : 'new'}</span></Td>
            </tr>))}</tbody>
        </table></div>
      ))}
    </Card>
  );
}

function Network({ supabase, days, onIp }: { supabase: SupabaseClient; days: number; onIp: (ip: string) => void }) {
  const [kind, setKind] = useState<'all' | 'humans' | 'bots'>('all');
  const [q, setQ] = useState(''); const [term, setTerm] = useState('');
  const [rows, setRows] = useState<IpRow[] | null>(null); const [err, setErr] = useState<string | null>(null);
  useEffect(() => { const t = window.setTimeout(() => setTerm(q), 350); return () => window.clearTimeout(t); }, [q]);
  useEffect(() => { setRows(null); void call<IpRow[]>(supabase, 'admin_site_ips', { p_days: days, p_limit: 300, p_search: term || null, p_kind: kind }).then((r) => { if (r.error) setErr(r.error); else { setErr(null); setRows(r.data ?? []); } }); }, [supabase, days, term, kind]);
  const csv = () => rows && download(`shopos-ips-${days}d.csv`, [['ip', 'country', 'region', 'city', 'ip_timezone', 'requests', 'page_views', 'bot_requests', 'visitors', 'visits', 'first_seen', 'last_seen', 'bot', 'browser_identity'], ...rows.map((r) => [r.ip, r.country, r.region, r.city, r.ip_tz, r.hits, r.pageviews, r.bot_hits, r.visitors, r.sessions, r.first_seen, r.last_seen, r.bot_name, r.user_agent])]);
  return (
    <Card>
      <div className="flex items-center gap-2 mb-2 flex-wrap">
        <div className="text-sm font-medium mr-auto">IP addresses <span className="text-[10px] text-slate-500 font-normal">kept 90 days, then erased · visible only here</span></div>
        <div role="group" aria-label="Kind" className="flex gap-1">{(['all', 'humans', 'bots'] as const).map((k) => <button key={k} onClick={() => setKind(k)} aria-pressed={kind === k} className={`text-xs px-3 min-h-[30px] rounded-full ${kind === k ? 'bg-field-600 text-white' : 'bg-slate-800 text-slate-300'}`}>{k === 'all' ? 'All' : k === 'humans' ? 'People' : 'Bots'}</button>)}</div>
        <label className="relative"><Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500" /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="IP, city, country code…" className="input !min-h-[32px] !py-1 pl-8 text-xs w-44" aria-label="Search IP addresses" /></label>
        <button onClick={csv} disabled={!rows?.length} className="min-h-[32px] px-3 rounded-full bg-slate-800 text-slate-300 text-xs inline-flex items-center gap-1 disabled:opacity-40"><Download className="w-3.5 h-3.5" /> CSV</button>
      </div>
      {err && <Err text={err} />}{!rows && !err && <Loading />}
      {rows && (rows.length === 0 ? <p className="text-xs text-slate-500">No IP addresses recorded in this period yet. They appear for visits after the new website version is live.</p> : (
        <div className="overflow-x-auto -mx-1"><table className="w-full text-xs min-w-[900px]">
          <thead><tr className="text-slate-500 text-left"><Th>IP address</Th><Th>Country</Th><Th>Region</Th><Th>City</Th><Th>Requests</Th><Th>Pages</Th><Th>Bot hits</Th><Th>People</Th><Th>Last seen</Th><Th>First seen</Th><Th>Identity</Th></tr></thead>
          <tbody>{rows.map((r) => (
            <tr key={r.ip} onClick={() => onIp(r.ip)} className="border-t border-slate-800 cursor-pointer hover:bg-slate-800/40">
              <Td mono>{r.ip}<CopyIp ip={r.ip} /></Td><Td>{country(r.country)}</Td><Td dim>{r.region ?? '–'}</Td><Td dim>{r.city ?? '–'}</Td><Td>{fmt(r.hits)}</Td><Td>{fmt(r.pageviews)}</Td>
              <Td>{r.bot_hits > 0 ? <span className="text-amber-400">{fmt(r.bot_hits)}{r.bot_name ? ` · ${r.bot_name}` : ''}</span> : '–'}</Td><Td>{fmt(r.visitors)}</Td><Td dim>{ago(r.last_seen)}</Td><Td dim>{when(r.first_seen)}</Td>
              <td className="px-1.5 py-1.5 text-slate-500 max-w-[220px] truncate" title={r.user_agent ?? ''}>{r.user_agent ?? '–'}</td>
            </tr>))}</tbody>
        </table></div>
      ))}
    </Card>
  );
}

function Bots({ supabase, days, onIp }: { supabase: SupabaseClient; days: number; onIp: (ip: string) => void }) {
  const [sum, setSum] = useState<BotRow[] | null>(null); const [rec, setRec] = useState<Recent[] | null>(null); const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    setSum(null); setRec(null); setErr(null);
    void Promise.all([call<BotRow[]>(supabase, 'admin_site_bot_summary', { p_days: days }), call<Recent[]>(supabase, 'admin_site_recent2', { p_limit: 100, p_bots: true })]).then(([a, b]) => {
      if (a.error || b.error) { setErr(a.error ?? b.error); return; } setSum(a.data ?? []); setRec(b.data ?? []);
    });
  }, [supabase, days]);
  const total = (sum ?? []).reduce((a, r) => a + n(r.hits), 0);
  return (
    <div className="space-y-3">
      <Card><p className="text-xs text-slate-400">Bots and crawlers do not run the website's scripts, so they are noted by the website server instead: search engines (Google, Bing), AI assistants, link previews (WhatsApp, Facebook), uptime checkers, scripts and break-in probes. They are never counted as visitors. Logging starts when the new website version goes live.</p></Card>
      {err && <Err text={err} />}{!sum && !err && <Loading />}
      {sum && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2"><Tile label="Bot requests" value={fmt(total)} /><Tile label="Different bots" value={fmt(sum.length)} /><Tile label="Break-in probes" value={fmt(sum.filter((s) => s.bot_name === 'Probe').reduce((a, r) => a + n(r.hits), 0))} /><Tile label="Distinct IPs" value={fmt(sum.reduce((a, r) => a + n(r.ips), 0))} /></div>
          <Card>
            <div className="text-sm font-medium mb-2">Who is knocking</div>
            {sum.length === 0 ? <p className="text-xs text-slate-500">No bot requests recorded in this period yet.</p> : (
              <div className="overflow-x-auto"><table className="w-full text-xs min-w-[560px]"><thead><tr className="text-slate-500 text-left"><Th>Bot</Th><Th>Requests</Th><Th>IPs</Th><Th>Countries</Th><Th>Most asked page</Th><Th>First seen</Th><Th>Last seen</Th></tr></thead>
                <tbody>{sum.map((r) => (<tr key={r.bot_name} className="border-t border-slate-800"><Td><span className={r.bot_name === 'Probe' ? 'text-rust-500' : ''}>{r.bot_name}</span></Td><Td>{fmt(r.hits)}</Td><Td>{fmt(r.ips)}</Td><Td>{fmt(r.countries)}</Td><Td mono dim>{r.top_path}</Td><Td dim>{when(r.first_seen)}</Td><Td dim>{ago(r.last_seen)}</Td></tr>))}</tbody></table></div>
            )}
          </Card>
          <Card>
            <div className="text-sm font-medium mb-2">Latest bot requests <span className="text-[10px] text-slate-500 font-normal">press a row for that IP's history</span></div>
            {!rec || rec.length === 0 ? <p className="text-xs text-slate-500">Nothing yet.</p> : (
              <div className="overflow-x-auto"><table className="w-full text-xs min-w-[640px]"><thead><tr className="text-slate-500 text-left"><Th>When</Th><Th>Bot</Th><Th>Asked for</Th><Th>Where</Th><Th>IP address</Th><Th>Identity</Th></tr></thead>
                <tbody>{rec.map((r, i) => (<tr key={i} onClick={() => r.ip && onIp(r.ip)} className="border-t border-slate-800 cursor-pointer hover:bg-slate-800/40"><Td dim>{ago(r.created_at)}</Td><Td>{r.bot_name ?? 'Bot'}</Td><Td mono>{r.path}</Td><Td>{where(r.city, r.country)}</Td><Td mono dim>{r.ip ?? '–'}</Td><td className="px-1.5 py-1.5 text-slate-500 max-w-[220px] truncate" title={r.user_agent ?? ''}>{r.user_agent ?? '–'}</td></tr>))}</tbody></table></div>
            )}
          </Card>
          <Lists supabase={supabase} days={days} bots items={[{ dim: 'country', title: 'Bot countries', render: cc }, { dim: 'path', title: 'Pages bots ask for' }, { dim: 'bot_name', title: 'Bots' }, { dim: 'ip', title: 'Busiest bot IPs' }]} />
        </>
      )}
    </div>
  );
}

function SecurityView({ supabase, days, onIp }: { supabase: SupabaseClient; days: number; onIp: (ip: string) => void }) {
  const [d, setD] = useState<Security | null>(null); const [err, setErr] = useState<string | null>(null); const [msg, setMsg] = useState<string | null>(null); const [busy, setBusy] = useState(false);
  const load = useCallback(async () => { const r = await call<Security>(supabase, 'admin_site_security', { p_days: days }); if (r.error) setErr(r.error); else { setErr(null); setD(r.data); } }, [supabase, days]);
  useEffect(() => { setD(null); void load(); }, [load]);
  async function erase(older: number) {
    const what = older === 0 ? 'ALL stored IP addresses and browser identities' : `stored IP addresses older than ${older} days`;
    if (!window.confirm(`Erase ${what}? Counts and charts stay; only the IP details are removed. This cannot be undone.`)) return;
    setBusy(true); setMsg(null);
    const r = await call<number>(supabase, 'admin_site_clear_ips', { p_older_than_days: older });
    setBusy(false); setMsg(r.error ?? `Erased the IP details of ${fmt(r.data)} records.`); void load();
  }
  return (
    <div className="space-y-3">
      {err && <Err text={err} />}{!d && !err && <Loading />}
      {d && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
            <Tile label="Bot requests" value={fmt(d.bot_hits)} /><Tile label="Break-in probes" value={fmt(d.probe_hits)} sub={`${fmt(d.probe_ips)} IPs`} /><Tile label="Requests blocked" value={fmt(d.blocked_total)} sub="rate limits and guards" /><Tile label="IPs recorded" value={fmt(d.ips_recorded)} /><Tile label="Oldest IP kept" value={d.oldest_ip ? ago(d.oldest_ip) : '–'} sub="erased at 90 days" />
          </div>
          <Card>
            <div className="text-sm font-medium mb-2">Break-in probes <span className="text-[10px] text-slate-500 font-normal">requests for files like /.env, /wp-login.php, /phpmyadmin that ShopOS does not have</span></div>
            {d.probes.length === 0 ? <p className="text-xs text-slate-500">None recorded in this period.</p> : (
              <div className="overflow-x-auto"><table className="w-full text-xs min-w-[520px]"><thead><tr className="text-slate-500 text-left"><Th>IP address</Th><Th>Country</Th><Th>Tries</Th><Th>What they asked for</Th><Th>Last</Th></tr></thead>
                <tbody>{d.probes.map((p) => (<tr key={p.ip} onClick={() => onIp(p.ip)} className="border-t border-slate-800 cursor-pointer hover:bg-slate-800/40"><Td mono>{p.ip}<CopyIp ip={p.ip} /></Td><Td>{country(p.country)}</Td><Td>{fmt(p.hits)}</Td><Td mono dim>{(p.paths ?? []).join('  ')}</Td><Td dim>{ago(p.last_seen)}</Td></tr>))}</tbody></table></div>
            )}
            <p className="text-[11px] text-slate-500 mt-2">These are harmless: the site has nothing at those addresses. They show who is scanning ShopOS. Block a persistent one in Vercel under Firewall.</p>
          </Card>
          <div className="grid md:grid-cols-2 gap-3">
            <Card>
              <div className="text-sm font-medium mb-2">Unusually busy IPs <span className="text-[10px] text-slate-500 font-normal">150+ page views</span></div>
              {d.heavy.length === 0 ? <p className="text-xs text-slate-500">None.</p> : <ul className="space-y-1 text-xs">{d.heavy.map((h) => <li key={h.ip}><button onClick={() => onIp(h.ip)} className="w-full flex justify-between gap-2 hover:bg-slate-800/50 rounded px-1 py-0.5"><span className="font-mono">{h.ip}</span><span className="text-slate-400 truncate">{where(h.city, h.country)} · {fmt(h.hits)} views</span></button></li>)}</ul>}
            </Card>
            <Card>
              <div className="text-sm font-medium mb-2">One IP, many browsers <span className="text-[10px] text-slate-500 font-normal">6+ ids (shared Wi-Fi, or a script)</span></div>
              {d.many_ids.length === 0 ? <p className="text-xs text-slate-500">None.</p> : <ul className="space-y-1 text-xs">{d.many_ids.map((h) => <li key={h.ip}><button onClick={() => onIp(h.ip)} className="w-full flex justify-between gap-2 hover:bg-slate-800/50 rounded px-1 py-0.5"><span className="font-mono">{h.ip}</span><span className="text-slate-400 truncate">{where(h.city, h.country)} · {fmt(h.visitors)} ids</span></button></li>)}</ul>}
            </Card>
          </div>
          <Card>
            <div className="text-sm font-medium mb-2">Blocked or guarded requests <span className="text-[10px] text-slate-500 font-normal">from the security guard on every public service</span></div>
            {d.blocked.length === 0 ? <p className="text-xs text-slate-500">Nothing was blocked in this period.</p> : <ul className="space-y-1 text-xs">{d.blocked.map((b) => <li key={b.kind} className="flex justify-between gap-2"><span className="font-mono truncate">{b.kind}</span><span className="text-slate-400 shrink-0">{fmt(b.n)} · {ago(b.last_seen)}</span></li>)}</ul>}
          </Card>
          <Card>
            <div className="text-sm font-medium mb-2">How this data is protected</div>
            <ul className="text-xs text-slate-300 space-y-1 list-disc pl-4">
              <li>Visitor data lives in a database table with no public access. Only a signed-in platform administrator can read it, through checked database functions.</li>
              <li>The website server proves itself to the database with a secret. Anyone else sending fake IPs or locations is ignored.</li>
              <li>IP addresses and browser identities are erased automatically after 90 days. A one-way daily code stays for counting.</li>
              <li>Visits are only counted for people who accept analytics, and never for "Do Not Track". Bots are logged by the server only.</li>
              <li>Every public service has a rate limit and logs blocked bursts here.</li>
            </ul>
            <div className="flex gap-2 flex-wrap mt-3">
              <button disabled={busy} onClick={() => void erase(30)} className="text-xs px-3 min-h-[34px] rounded-full bg-slate-800 text-slate-200 disabled:opacity-50">Erase IPs older than 30 days</button>
              <button disabled={busy} onClick={() => void erase(0)} className="text-xs px-3 min-h-[34px] rounded-full border border-rust-500 text-rust-500 disabled:opacity-50">Erase all stored IPs now</button>
            </div>
            {msg && <p role="status" className="text-xs text-field-500 mt-2">{msg}</p>}
          </Card>
        </>
      )}
    </div>
  );
}

/** The sub-menus of Analytics > Visitors (everything except the Overview, which lives in SiteAnalytics). */
export function VisitorViews({ supabase, days, view }: { supabase: SupabaseClient; days: number; view: Exclude<VisitorView, 'overview'> }) {
  const [trail, setTrail] = useState<{ visitor?: string; ip?: string } | null>(null);
  const openV = (v: string) => setTrail({ visitor: v });
  const openIp = (ip: string) => setTrail({ ip });
  return (
    <div>
      {view === 'live' && <Live supabase={supabase} onTrail={openV} />}
      {view === 'places' && <Lists supabase={supabase} days={days} items={[{ dim: 'country', title: 'Countries', render: cc, limit: 30 }, { dim: 'region', title: 'Regions / counties', limit: 30 }, { dim: 'city', title: 'Cities', limit: 30 }, { dim: 'tz', title: "Visitors' own time zones" }, { dim: 'ip_tz', title: 'Network time zones' }, { dim: 'lang', title: 'Languages' }]} />}
      {view === 'sources' && <Lists supabase={supabase} days={days} items={[{ dim: 'referrer', title: 'Websites they came from', limit: 30 }, { dim: 'utm_source', title: 'Campaign source' }, { dim: 'utm_medium', title: 'Campaign medium' }, { dim: 'utm_campaign', title: 'Campaign name' }, { dim: 'entry', title: 'How they open ShopOS', render: channelLabel }, { dim: 'event', title: 'Actions taken', render: (l) => EVENT_LABEL[l] ?? l }]} />}
      {view === 'pages' && <Lists supabase={supabase} days={days} items={[{ dim: 'path', title: 'Top pages', limit: 40 }, { dim: 'hour', title: 'Hour of day (Kenya)', limit: 24 }, { dim: 'weekday', title: 'Day of week (Kenya)', limit: 7 }, { dim: 'signed_in', title: 'Signed in or not' }]} />}
      {view === 'devices' && <Lists supabase={supabase} days={days} items={[{ dim: 'device', title: 'Devices' }, { dim: 'os', title: 'Operating systems' }, { dim: 'browser', title: 'Browsers' }, { dim: 'screen', title: 'Screen widths' }, { dim: 'entry', title: 'App or browser' }, { dim: 'lang', title: 'Languages' }]} />}
      {view === 'people' && <People supabase={supabase} days={days} onTrail={openV} />}
      {view === 'network' && <Network supabase={supabase} days={days} onIp={openIp} />}
      {view === 'bots' && <Bots supabase={supabase} days={days} onIp={openIp} />}
      {view === 'security' && <SecurityView supabase={supabase} days={days} onIp={openIp} />}
      {trail && <TrailModal supabase={supabase} visitor={trail.visitor} ip={trail.ip} onClose={() => setTrail(null)} />}
    </div>
  );
}
