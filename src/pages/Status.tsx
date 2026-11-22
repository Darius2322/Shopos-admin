import { useEffect, useState } from 'react';
import { SupabaseClient } from '@supabase/supabase-js';
import { Loader2, RefreshCw, ExternalLink } from 'lucide-react';
import { Card, EmptyState, ErrorText, Skeleton } from '../components/ui';
import { describeError } from '../lib/errors';
import { askConfirm } from '../lib/dialog';
import { supabase } from '../lib/supabase';

interface Day { d: string; up: number | null; n: number }
interface Hour { h: string; ms: number | null; up: number | null }
interface Comp { public?: boolean; key: string; label: string; state: 'up' | 'down' | 'unknown'; uptime30: number | null; uptime7: number | null; days: Day[]; hours: Hour[] }
interface Incident { key: string; label: string; start: string; last: string; checks: number }
interface Overview { incident_map?: Record<string, { start: string; last: string; n: number }[]>; enabled: boolean; message: string | null; components: Comp[]; incidents: Incident[]; at: string }

const dayColor = (up: number | null) => up === null ? 'bg-slate-700' : up >= 99.9 ? 'bg-emerald-500' : up >= 98 ? 'bg-amber-500' : 'bg-rose-500';
const fmtDay = (d: string) => new Date(d + 'T12:00:00').toLocaleDateString([], { day: 'numeric', month: 'short' });
const STATE = { up: ['Operational', 'text-emerald-400', 'bg-emerald-500'], down: ['Down', 'text-rose-400', 'bg-rose-500'], unknown: ['No recent check', 'text-slate-400', 'bg-slate-500'] } as const;


interface Det { label: string; from: string; to: string; checks: number; failed: number; up: number | null; first: string | null; last: string | null; incidents: { start: string; end: string; n: number }[]; rows: { t: string; n?: number; fail?: number; ok?: boolean; code?: number | null }[] }
const incLen = (n: number) => { const m = n * 5; return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${m % 60} min`; };
const fmtTime = (t: string) => new Date(t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
const fmtLong = (d: string) => new Date(d + 'T12:00:00').toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'long' });
const fmtHour = (h: string) => { const a = new Date(h), b = new Date(a.getTime() + 3600_000); return `${a.toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' })}, ${fmtTime(a.toISOString())} – ${fmtTime(b.toISOString())}`; };

/** What happened in one day or one hour of one part: uptime, failed checks, each outage with when it began and how long it lasted. */
function DetailPanel({ k, from, to, title, onClose }: { k: string; from: Date; to: Date; title: string; onClose: () => void }) {
  const [d, setD] = useState<Det | null | undefined>(undefined);
  useEffect(() => {
    let off = false; setD(undefined);
    if (!supabase) { setD(null); return; }
    void supabase.rpc('status_detail', { p_key: k, p_from: from.toISOString(), p_to: to.toISOString() }).then(({ data, error }) => { if (!off) setD(error ? null : (data as Det | null)); });
    return () => { off = true; };
  }, [k, from.getTime(), to.getTime()]);
  const isHour = to.getTime() - from.getTime() <= 2 * 3600_000;
  const longest = d ? Math.max(0, ...d.incidents.map((i) => i.n)) : 0;
  return (
    <div className="rounded-lg border border-slate-700 p-3 mt-2 text-sm space-y-2">
      <div className="flex justify-between gap-2"><p className="font-medium">{title}</p><button type="button" className="text-xs text-slate-400" onClick={onClose}>Close</button></div>
      {d === undefined && <p className="text-xs text-slate-400">Loading…</p>}
      {d === null && <p className="text-xs text-slate-400">Details are not available right now.</p>}
      {d && d.checks === 0 && <p className="text-xs text-slate-400">No checks were recorded in this period.</p>}
      {d && d.checks > 0 && (
        <>
          <div className="grid grid-cols-3 gap-2 text-center">
            <div><p className="text-base font-semibold">{d.up}%</p><p className="text-[11px] text-slate-400">uptime</p></div>
            <div><p className="text-base font-semibold">{d.checks}</p><p className="text-[11px] text-slate-400">checks</p></div>
            <div><p className={`text-base font-semibold ${d.failed ? 'text-rose-400' : ''}`}>{d.failed}</p><p className="text-[11px] text-slate-400">failed</p></div>
          </div>
          <p className="text-[11px] text-slate-400">First check {d.first ? fmtTime(d.first) : '–'} · last check {d.last ? fmtTime(d.last) : '–'}{longest ? ` · longest outage about ${incLen(longest)}` : ''}</p>
          {d.incidents.length === 0 ? <p className="text-xs">No downtime in this period.</p> : (
            <ul className="space-y-1">{d.incidents.map((i) => <li key={i.start} className="text-xs text-rose-400">Down from {fmtTime(i.start)}{i.n > 1 ? ` to ${fmtTime(i.end)}` : ''} · about {incLen(i.n)}{i.n === 1 ? ' (one failed check)' : ''}</li>)}</ul>
          )}
          {isHour ? (
            <ul className="text-[11px] grid grid-cols-2 gap-x-3 gap-y-0.5">{d.rows.map((r) => <li key={r.t} className="flex justify-between"><span>{fmtTime(r.t)}</span><span className={r.ok ? 'text-emerald-400' : 'text-rose-400'}>{r.ok ? 'Up' : 'Down'}{r.code ? ` · ${r.code}` : ''}</span></li>)}</ul>
          ) : (
            <div>
              <p className="text-[11px] text-slate-400 mb-1">Hour by hour</p>
              <div className="flex gap-[2px] h-6">{d.rows.map((r) => <div key={r.t} title={`${fmtTime(r.t)}: ${r.fail ? `${r.fail} of ${r.n} checks failed` : 'all checks passed'}`} className={`flex-1 rounded-sm ${r.fail ? ((r.fail as number) >= (r.n as number) ? 'bg-rose-500' : 'bg-amber-400') : 'bg-emerald-500'}`} />)}</div>
              <div className="flex justify-between text-[10px] text-slate-400 mt-0.5"><span>{fmtTime(d.rows[0]?.t ?? d.from)}</span><span>{fmtTime(d.rows[d.rows.length - 1]?.t ?? d.to)}</span></div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

/** 30 day bars. Tap a day for its details. */
function UptimeBars({ days, compKey }: { days: Day[]; compKey: string }) {
  const [sel, setSel] = useState<string | null>(null);
  const day = days.find((d) => d.d === sel);
  return (
    <div>
      <div className="flex gap-[3px] h-9 items-stretch" aria-label="Daily uptime for the last 30 days">
        {days.map((d) => (
          <button key={d.d} type="button" onClick={() => setSel(sel === d.d ? null : d.d)} aria-pressed={sel === d.d} aria-label={`${fmtDay(d.d)}: ${d.up === null ? 'no data' : d.up + '% up'}. Tap for details`} title={`${fmtDay(d.d)}: ${d.up === null ? 'no data' : d.up + '% up'}`} className={`flex-1 rounded-sm ${dayColor(d.up)} ${sel === d.d ? 'ring-2 ring-offset-1 ring-slate-500' : ''}`} />
        ))}
      </div>
      {day && <DetailPanel k={compKey} from={new Date(day.d + 'T00:00:00+03:00')} to={new Date(new Date(day.d + 'T00:00:00+03:00').getTime() + 86400_000)} title={fmtLong(day.d)} onClose={() => setSel(null)} />}
    </div>
  );
}

/** Uptime by hour for the last 48 hours. Every dot can be tapped for what happened in that hour. */
function HoursChart({ hours, compKey }: { hours: Hour[]; compKey: string }) {
  const [sel, setSel] = useState<number | null>(null);
  const W = 480, H = 56;
  const pts = hours.map((h, i) => ({ x: (i / Math.max(1, hours.length - 1)) * 100, y: h.up === null ? null : H - (h.up / 100) * (H - 6) - 3 }));
  const segs: string[] = []; let cur: string[] = [];
  pts.forEach((p) => { if (p.y === null) { if (cur.length) segs.push(cur.join(' ')); cur = []; } else cur.push(`${(p.x * W / 100).toFixed(1)},${p.y.toFixed(1)}`); });
  if (cur.length) segs.push(cur.join(' '));
  const h = sel === null ? null : hours[sel];
  return (
    <div>
      <div className="relative h-14">
        <svg viewBox={`0 0 ${W} ${H}`} className="absolute inset-0 w-full h-full" preserveAspectRatio="none" role="img" aria-label="Uptime by hour for the last 48 hours">
          <line x1="0" x2={W} y1="3" y2="3" stroke="currentColor" className="text-slate-700" strokeDasharray="3 4" />
          {segs.map((s, i) => <polyline key={i} points={s} fill="none" strokeWidth="2" stroke="currentColor" className="text-emerald-500" vectorEffect="non-scaling-stroke" />)}
        </svg>
        {hours.map((x, i) => x.up === null || pts[i].y === null ? null : (
          <button key={x.h} type="button" onClick={() => setSel(sel === i ? null : i)} aria-label={`${fmtHour(x.h)}: ${x.up}% up. Tap for details`} title={`${fmtHour(x.h)}: ${x.up}% up`}
            className="absolute -translate-x-1/2 -translate-y-1/2 w-4 h-4 flex items-center justify-center" style={{ left: `${pts[i].x}%`, top: `${((pts[i].y as number) / H) * 100}%` }}>
            <span className={`block rounded-full ${x.up < 100 ? 'w-2.5 h-2.5 bg-rose-500' : 'w-1.5 h-1.5 bg-emerald-500'} ${sel === i ? 'ring-2 ring-slate-500' : ''}`} />
          </button>
        ))}
      </div>
      {h && <DetailPanel k={compKey} from={new Date(h.h)} to={new Date(new Date(h.h).getTime() + 3600_000)} title={fmtHour(h.h)} onClose={() => setSel(null)} />}
    </div>
  );
}

const dur = (n: number) => { const m = n * 5; return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${m % 60} min`; };

/** Uptime and downtime of every part of ShopOS, and the switch for the public status page on the main website. view: uptime | log | page */
export default function Status({ supabase, view }: { supabase: SupabaseClient; view: 'uptime' | 'log' | 'page' }) {
  const [o, setO] = useState<Overview | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [note, setNote] = useState<string | null>(null);

  async function load() {
    const { data, error } = await supabase.rpc('admin_status_overview');
    if (error) { setErr(describeError(error, 'Could not load the status')); setO(null); return; }
    setErr(null); setO(data as Overview); setMsg((data as Overview).message ?? '');
  }
  useEffect(() => { void load(); const t = setInterval(() => void load(), 60_000); return () => clearInterval(t); }, []);

  async function checkNow() {
    setBusy(true); setNote(null);
    const { error } = await supabase.rpc('admin_status_run_now');
    setBusy(false);
    if (error) { setNote(describeError(error, 'Could not run the checks')); return; }
    setNote('Checks sent. Results appear after the next run (within a few minutes), then press Refresh.');
  }
  async function save(enabled: boolean, message = msg) {
    setBusy(true); setNote(null);
    const { error } = await supabase.rpc('admin_status_set', { p_enabled: enabled, p_message: message });
    setBusy(false);
    if (error) { setNote(describeError(error, 'Could not save')); return; }
    setNote(enabled ? 'The status page is visible on the main website.' : 'The status page is hidden from the main website.');
    void load();
  }

  async function setPart(key: string, on: boolean) {
    setNote(null);
    setO((p) => p ? { ...p, components: p.components.map((c) => c.key === key ? { ...c, public: on } : c) } : p);
    const { error } = await supabase.rpc('admin_status_target_public', { p_key: key, p_public: on });
    if (error) { setNote(describeError(error, 'Could not save')); void load(); }
  }

  if (err) return <ErrorText>{err}</ErrorText>;
  if (!o) return <Skeleton />;
  const down = o.components.filter((c) => c.state === 'down');

  if (view === 'page') {
    return (
      <div className="space-y-4 max-w-xl">
        <Card className="p-4 space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="font-medium">Show the status page on the main website</p>
              <p className="text-xs text-slate-400">{o.enabled ? 'Visible: anyone can open it, and the website footer links to it.' : 'Hidden: the page shows "not available" and the footer link is removed.'}</p>
            </div>
            <button role="switch" aria-checked={o.enabled} aria-label="Status page on the main website" disabled={busy}
              onClick={() => { if (o.enabled) { void (async () => { if (await askConfirm('Hide the status page from the main website?')) void save(false); })(); } else void save(true); }}
              className={`relative inline-flex h-7 w-12 shrink-0 rounded-full transition-colors disabled:opacity-50 ${o.enabled ? 'bg-emerald-600' : 'bg-slate-600'}`}><span className={`absolute top-0.5 left-0.5 h-6 w-6 rounded-full bg-white transition-transform ${o.enabled ? 'translate-x-5' : ''}`} /></button>
          </div>
          <div>
            <label className="block text-xs text-slate-400 mb-1" htmlFor="smsg">Notice shown at the top of the public page (optional)</label>
            <input id="smsg" className="w-full rounded-xl border border-slate-600 bg-transparent px-3 py-2 text-sm" maxLength={300} value={msg} onChange={(e) => setMsg(e.target.value)} placeholder="e.g. We are investigating slow payments." />
          </div>
          <div className="flex gap-2 flex-wrap items-center">
            <button className="btn-secondary text-sm" disabled={busy} onClick={() => void save(o.enabled)}>Save notice</button>
            <a className="text-sm text-field-600 inline-flex items-center gap-1" href="https://www.shopos.co.ke/status" target="_blank" rel="noreferrer">Open the public page <ExternalLink className="w-3.5 h-3.5" /></a>
          </div>
          {note && <p className="text-sm text-slate-300">{note}</p>}
        </Card>
        <Card className="p-4 space-y-3">
          <div>
            <p className="font-medium">Parts shown on the public page</p>
            <p className="text-xs text-slate-400">Switch a part off and visitors no longer see it on the status page. It is still checked here. Changes save at once.</p>
          </div>
          <ul className="divide-y divide-slate-700/60">
            {o.components.filter((c) => c.key !== 'admin').map((c) => (
              <li key={c.key} className="flex items-center justify-between gap-3 py-2">
                <span className="text-sm">{c.label}<span className="block text-[11px] text-slate-400">{c.public === false ? 'Hidden from the public page' : 'Visible to everyone'}</span></span>
                <button role="switch" aria-checked={c.public !== false} aria-label={`Show ${c.label} on the public status page`} onClick={() => void setPart(c.key, c.public === false)}
                  className={`relative inline-flex h-7 w-12 shrink-0 rounded-full transition-colors ${c.public !== false ? 'bg-emerald-600' : 'bg-slate-600'}`}><span className={`absolute top-0.5 h-6 w-6 rounded-full bg-white transition-all ${c.public !== false ? 'left-[22px]' : 'left-0.5'}`} /></button>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    );
  }

  if (view === 'log') {
    return (
      <div className="space-y-3">
        <p className="text-xs text-slate-400">Every stretch where a check failed in the last 30 days. Checks run every 5 minutes, so the length is an estimate.</p>
        {o.incidents.length === 0 ? <EmptyState message="No downtime recorded in the last 30 days." /> : (
          <Card>
            <ul className="divide-y divide-slate-800">
              {o.incidents.map((i, idx) => (
                <li key={idx} className="p-3 flex items-center justify-between gap-3 text-sm">
                  <div><p className="font-medium">{i.label}</p><p className="text-xs text-slate-400">{new Date(i.start).toLocaleString()} to {new Date(i.last).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p></div>
                  <span className="text-rose-400 shrink-0">about {dur(i.checks)}</span>
                </li>
              ))}
            </ul>
          </Card>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className={`rounded-lg p-3 text-sm flex items-center justify-between gap-3 flex-wrap ${down.length ? 'bg-rose-500/15 text-rose-400' : o.components.some((c) => c.state !== 'unknown') ? 'bg-emerald-500/15 text-emerald-400' : 'bg-slate-700/40 text-slate-300'}`}>
        <span>{down.length ? `${down.map((d) => d.label).join(', ')} ${down.length === 1 ? 'is' : 'are'} down right now.` : o.components.some((c) => c.state !== 'unknown') ? 'Everything is operational.' : 'Collecting the first checks.'}</span>
        <span className="flex gap-2">
          <button className="btn-secondary text-xs inline-flex items-center gap-1" disabled={busy} onClick={() => void load()}><RefreshCw className="w-3.5 h-3.5" /> Refresh</button>
          <button className="btn-secondary text-xs inline-flex items-center gap-1" disabled={busy} onClick={() => void checkNow()}>{busy && <Loader2 className="w-3.5 h-3.5 animate-spin" />} Check now</button>
        </span>
      </div>
      {note && <p className="text-xs text-slate-300">{note}</p>}
      <div className="grid lg:grid-cols-2 gap-3">
        {o.components.map((c) => {
          const [text, tcls, dot] = STATE[c.state];
          return (
            <Card key={c.key} className="p-4">
              <div className="flex items-center justify-between gap-3 mb-3">
                <p className="font-medium inline-flex items-center gap-2"><span className={`w-2.5 h-2.5 rounded-full ${dot}`} />{c.label}</p>
                <p className={`text-sm ${tcls}`}>{text}</p>
              </div>
              <UptimeBars days={c.days} compKey={c.key} />
              <div className="flex justify-between text-[11px] text-slate-400 mt-1 mb-3"><span>30 days ago</span><span>{c.uptime30 === null ? 'No data yet' : `${c.uptime30}% uptime (30 days)`}</span><span>Today</span></div>
              <p className="text-[11px] text-slate-400 mb-1">Last 48 hours{c.uptime7 !== null ? ` · ${c.uptime7}% over 7 days` : ''}</p>
              <HoursChart hours={c.hours} compKey={c.key} />
            </Card>
          );
        })}
      </div>
    </div>
  );
}
