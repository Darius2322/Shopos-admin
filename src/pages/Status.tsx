import { useEffect, useState } from 'react';
import { SupabaseClient } from '@supabase/supabase-js';
import { Loader2, RefreshCw, ExternalLink } from 'lucide-react';
import { Card, EmptyState, ErrorText, Skeleton } from '../components/ui';
import { describeError } from '../lib/errors';
import { askConfirm } from '../lib/dialog';

interface Day { d: string; up: number | null; n: number }
interface Hour { h: string; ms: number | null; up: number | null }
interface Comp { key: string; label: string; state: 'up' | 'down' | 'unknown'; uptime30: number | null; uptime7: number | null; days: Day[]; hours: Hour[] }
interface Incident { key: string; label: string; start: string; last: string; checks: number }
interface Overview { incident_map?: Record<string, { start: string; last: string; n: number }[]>; enabled: boolean; message: string | null; components: Comp[]; incidents: Incident[]; at: string }

const dayColor = (up: number | null) => up === null ? 'bg-slate-700' : up >= 99.9 ? 'bg-emerald-500' : up >= 98 ? 'bg-amber-500' : 'bg-rose-500';
const fmtDay = (d: string) => new Date(d + 'T12:00:00').toLocaleDateString([], { day: 'numeric', month: 'short' });
const STATE = { up: ['Operational', 'text-emerald-400', 'bg-emerald-500'], down: ['Down', 'text-rose-400', 'bg-rose-500'], unknown: ['No recent check', 'text-slate-400', 'bg-slate-500'] } as const;

function HoursChart({ hours }: { hours: Hour[] }) {
  const W = 480, H = 56;
  const pts = hours.map((h, i) => ({ x: (i / Math.max(1, hours.length - 1)) * W, y: h.up === null ? null : H - (h.up / 100) * (H - 6) - 3 }));
  const segs: string[] = []; let cur: string[] = [];
  pts.forEach((p) => { if (p.y === null) { if (cur.length) segs.push(cur.join(' ')); cur = []; } else cur.push(`${p.x.toFixed(1)},${p.y.toFixed(1)}`); });
  if (cur.length) segs.push(cur.join(' '));
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-14" preserveAspectRatio="none" role="img" aria-label="Uptime by hour, last 48 hours">
      <line x1="0" x2={W} y1="3" y2="3" stroke="currentColor" className="text-slate-700" strokeDasharray="3 4" />
      {segs.map((s, i) => <polyline key={i} points={s} fill="none" strokeWidth="2" stroke="currentColor" className="text-emerald-400" vectorEffect="non-scaling-stroke" />)}
      {hours.map((h, i) => h.up !== null && h.up < 100 ? <circle key={i} cx={pts[i].x} cy={pts[i].y as number} r="3" className="fill-rose-500" /> : null)}
    </svg>
  );
}

interface Inc { start: string; last: string; n: number }
const incLen = (n: number) => { const m = n * 5; return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${m % 60} min`; };
const fmtTime = (t: string) => new Date(t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
const fmtLong = (d: string) => new Date(d + 'T12:00:00').toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'long' });

/** 30 day bars. Tap a day to see what happened: uptime, checks, and each outage with when it started and how long it lasted. */
function UptimeBars({ days, incidents }: { days: Day[]; incidents?: Inc[] }) {
  const [sel, setSel] = useState<string | null>(null);
  const day = days.find((d) => d.d === sel);
  const list = (incidents ?? []).filter((i) => i.start.slice(0, 10) === sel);
  return (
    <div>
      <div className="flex gap-[3px] h-9 items-stretch" aria-label="Daily uptime for the last 30 days">
        {days.map((d) => (
          <button key={d.d} type="button" onClick={() => setSel(sel === d.d ? null : d.d)} aria-pressed={sel === d.d} aria-label={`${fmtDay(d.d)}: ${d.up === null ? 'no data' : d.up + '% up'}. Tap for details`} title={`${fmtDay(d.d)}: ${d.up === null ? 'no data' : d.up + '% up'}`} className={`flex-1 rounded-sm ${dayColor(d.up)} ${sel === d.d ? 'ring-2 ring-offset-1 ring-slate-500' : ''}`} />
        ))}
      </div>
      {day && (
        <div className="rounded-lg border border-slate-700 p-3 mt-2 text-sm space-y-1">
          <div className="flex justify-between gap-2"><p className="font-medium">{fmtLong(day.d)}</p><button type="button" className="text-xs text-slate-400" onClick={() => setSel(null)}>Close</button></div>
          <p className="text-xs text-slate-400">{day.up === null ? 'No checks were recorded this day.' : `${day.up}% up · ${day.n} check${day.n === 1 ? '' : 's'}`}</p>
          {day.up !== null && list.length === 0 && <p className="text-xs">{day.up >= 99.9 ? 'No downtime.' : 'Some checks failed, but no full outage was logged.'}</p>}
          {list.map((i) => <p key={i.start} className="text-xs">Down from {fmtTime(i.start)}{i.n > 1 ? ` to ${fmtTime(i.last)}` : ''} · about {incLen(i.n)}</p>)}
        </div>
      )}
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
              <UptimeBars days={c.days} incidents={o.incident_map?.[c.key]} />
              <div className="flex justify-between text-[11px] text-slate-400 mt-1 mb-3"><span>30 days ago</span><span>{c.uptime30 === null ? 'No data yet' : `${c.uptime30}% uptime (30 days)`}</span><span>Today</span></div>
              <p className="text-[11px] text-slate-400 mb-1">Last 48 hours{c.uptime7 !== null ? ` · ${c.uptime7}% over 7 days` : ''}</p>
              <HoursChart hours={c.hours} />
            </Card>
          );
        })}
      </div>
    </div>
  );
}
