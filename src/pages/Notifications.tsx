import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { SupabaseClient } from '@supabase/supabase-js';
import { Bell, LayoutDashboard, ScrollText, Smartphone, Send, ListChecks, Stethoscope, Wrench, RefreshCw, CheckCircle2, XCircle, Trash2 } from 'lucide-react';
import { Card, Skeleton } from '../components/ui';
import { askConfirm } from '../lib/dialog';

type Sub = 'overview' | 'log' | 'devices' | 'send' | 'rings' | 'reports' | 'setup';
const SUBS: [Sub, string, typeof Bell][] = [['overview', 'Overview', LayoutDashboard], ['log', 'Sent log', ScrollText], ['devices', 'Devices', Smartphone], ['send', 'Send', Send], ['rings', 'What rings', ListChecks], ['reports', 'Phone reports', Stethoscope], ['setup', 'Set-up steps', Wrench]];
const APPS = [['owner', 'Owner app'], ['booker', 'Booker app'], ['admin', 'Admin app']] as const;
const APP_LABEL: Record<string, string> = { owner: 'Owner app', booker: 'Booker app', admin: 'Admin app', all: 'All apps', unknown: 'Unknown' };
const KIND_LABEL: Record<string, string> = { booking_new: 'New booking', booking_changed: 'Booking time changed', booking_cancelled: 'Booking cancelled', booking_confirmed: 'Booking confirmed', booking_reminder: 'Booking reminder', review_new: 'New review', admin_request: 'Request for the admin', update_ready: 'App update ready', test: 'Test', custom: 'Sent by you', other: 'Other' };
const when = (d?: string | null) => (d ? new Date(d).toLocaleString('en-KE', { timeZone: 'Africa/Nairobi', dateStyle: 'medium', timeStyle: 'short' }) : '—');
const ago = (d?: string | null) => { if (!d) return ''; const m = Math.max(0, Math.floor((Date.now() - new Date(d).getTime()) / 60000)); if (m < 1) return 'just now'; if (m < 60) return `${m} min ago`; const h = Math.floor(m / 60); return h < 48 ? `${h} h ago` : `${Math.floor(h / 24)} days ago`; };

interface Tot { notifications: number; recipients: number; sent: number; failed: number; removed: number }
interface Grp { app: string; kind: string; today: number; d7: number; d30: number; sent: number; failed: number; removed: number }
interface Stats { phones: { app: string; phones: number; last: string | null }[]; totals: { today: Tot; d7: Tot; d30: Tot }; groups: Grp[] }
interface LogRow { id: number; at: string; app: string | null; kind: string | null; title: string | null; body: string | null; recipients: number; sent: number; failed: number; removed: number; error: string | null }
interface Dev { app: string; token: string; token_masked: string; who: string; last_seen: string }
interface Diag { id: number; at: string; app: string; stage: string; detail: string | null }
interface Meta { version?: string; builtAt?: string; push?: boolean }

const Pill = ({ ok, text }: { ok: boolean; text: string }) => <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full ${ok ? 'bg-field-500/15 text-field-500' : 'bg-rust-500/15 text-rust-500'}`}>{ok ? <CheckCircle2 className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}{text}</span>;
const Num = ({ label, value, sub }: { label: string; value: ReactNode; sub?: string }) => <Card className="p-3"><div className="text-[11px] text-slate-400">{label}</div><div className="text-xl font-display font-semibold">{value}</div>{sub && <div className="text-[11px] text-slate-500">{sub}</div>}</Card>;
const chip = (on: boolean) => `text-xs px-3 py-1.5 rounded-full border ${on ? 'bg-field-500 text-white border-field-500' : 'border-slate-600 text-slate-300'}`;

/** Notifications: its own menu. How many went out, to whom, whether they arrived, which phones are registered, and a way to send one yourself. */
export default function Notifications({ supabase }: { supabase: SupabaseClient }) {
  const [sub, setSub] = useState<Sub>('overview');
  const [stats, setStats] = useState<Stats | null>(null); const [log, setLog] = useState<LogRow[] | null>(null); const [devs, setDevs] = useState<Dev[] | null>(null); const [diag, setDiag] = useState<Diag[] | null>(null);
  const [metas, setMetas] = useState<Record<string, Meta | null>>({});
  const [err, setErr] = useState<string | null>(null); const [note, setNote] = useState<string | null>(null); const [busy, setBusy] = useState(false);
  const [appF, setAppF] = useState('all'); const [open, setOpen] = useState<number | null>(null);
  const [form, setForm] = useState({ app: 'all', title: '', body: '', url: '' });

  const loadStats = useCallback(async () => { const { data, error } = await supabase.rpc('push_stats'); if (error) setErr(error.message); else setStats(data as Stats); }, [supabase]);
  const loadLog = useCallback(async () => { const { data, error } = await supabase.rpc('push_log_list', { p_limit: 100, p_app: appF === 'all' ? null : appF }); if (error) setErr(error.message); else setLog((data as LogRow[]) ?? []); }, [supabase, appF]);
  const loadDevs = useCallback(async () => { const { data, error } = await supabase.rpc('push_devices', { p_app: appF === 'all' ? null : appF }); if (error) setErr(error.message); else setDevs((data as Dev[]) ?? []); }, [supabase, appF]);
  const loadDiag = useCallback(async () => { const { data, error } = await supabase.rpc('push_diag_list'); if (error) setErr(error.message); else setDiag((data as Diag[]) ?? []); }, [supabase]);
  const reload = useCallback(() => { setErr(null); void loadStats(); if (sub === 'log') void loadLog(); if (sub === 'devices') void loadDevs(); if (sub === 'reports') void loadDiag(); }, [sub, loadStats, loadLog, loadDevs, loadDiag]);
  useEffect(() => { void loadStats(); }, [loadStats]);
  useEffect(() => { if (sub === 'log') void loadLog(); }, [sub, loadLog]);
  useEffect(() => { if (sub === 'devices') void loadDevs(); }, [sub, loadDevs]);
  useEffect(() => { if (sub === 'reports') void loadDiag(); }, [sub, loadDiag]);
  useEffect(() => {
    if (sub !== 'setup') return;
    const files: [string, string][] = [['owner', 'latest.json'], ['admin', 'latest-admin.json'], ['booker', 'latest-booker.json']];
    void Promise.all(files.map(async ([id, f]) => { try { const r = await fetch(`https://www.shopos.co.ke/downloads/android/${f}`, { cache: 'no-store' }); return [id, r.ok ? await r.json() : null] as const; } catch { return [id, null] as const; } })).then((x) => setMetas(Object.fromEntries(x)));
  }, [sub]);

  async function test(app: string) {
    setBusy(true); setNote(null); setErr(null);
    const { data, error } = await supabase.rpc('push_test', { p_app: app }); setBusy(false);
    if (error) { setErr(error.message); return; }
    setNote(Number(data) === 0 ? 'No phone has registered for this app yet, so there is nobody to send to.' : `Sent to ${data} phone${Number(data) === 1 ? '' : 's'}. Close the app and wait a few seconds. Then check Sent log: it shows how many Google accepted, or the error.`);
    void loadStats();
  }
  async function sendNow() {
    if (!form.title.trim() || !form.body.trim()) { setErr('Write a title and a message first.'); return; }
    if (!(await askConfirm(`Send this to ${APP_LABEL[form.app]} now?`))) return;
    setBusy(true); setNote(null); setErr(null);
    const { data, error } = await supabase.rpc('push_send_custom', { p_app: form.app, p_title: form.title, p_body: form.body, p_url: form.url || null }); setBusy(false);
    if (error) { setErr(error.message); return; }
    setNote(Number(data) === 0 ? 'Nobody to send to: no phones are registered for that choice.' : `Sent to ${data} phone${Number(data) === 1 ? '' : 's'}. See the result in Sent log.`);
    void loadStats();
  }
  async function removeDev(d: Dev) {
    if (!(await askConfirm(`Remove this phone (${d.who})? It will register again next time the app is opened.`))) return;
    const { error } = await supabase.rpc('push_device_remove', { p_token: d.token }); if (error) setErr(error.message); else void loadDevs();
  }

  const total = (stats?.phones ?? []).reduce((n, p) => n + p.phones, 0);
  const T = ({ label, t }: { label: string; t?: Tot }) => <Card className="p-3 space-y-0.5"><div className="text-[11px] text-slate-400">{label}</div><div className="text-xl font-display font-semibold">{t?.notifications ?? 0} <span className="text-xs font-normal text-slate-500">notifications</span></div>
    <div className="text-[11px] text-slate-500">{t?.recipients ?? 0} phones targeted · <span className="text-field-500">{t?.sent ?? 0} delivered to Google</span> · <span className={t?.failed ? 'text-rust-500' : ''}>{t?.failed ?? 0} failed</span> · {t?.removed ?? 0} dead phones removed</div></Card>;
  const Step = ({ ok, title, children }: { ok: boolean; title: string; children: ReactNode }) => <li className="flex gap-2"><span className={`mt-0.5 shrink-0 ${ok ? 'text-field-500' : 'text-slate-500'}`}>{ok ? <CheckCircle2 className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}</span><div><div className="text-sm font-medium">{title}</div><div className="text-xs text-slate-400">{children}</div></div></li>;
  const AppFilter = () => <div className="flex flex-wrap gap-2">{(['all', 'owner', 'booker', 'admin'] as const).map((k) => <button key={k} onClick={() => setAppF(k)} className={chip(appF === k)}>{k === 'all' ? 'All apps' : APP_LABEL[k]}</button>)}</div>;

  const RINGS: [string, string, string, string, string][] = [
    ['booking_new', 'A customer books online (or you add a booking)', 'The business owner', 'Owner app', 'Opens the booking'],
    ['booking_changed', 'The customer or the owner changes a booking time', 'The other side: owner when the customer changes, customer when the owner changes', 'Owner app, Booker app', 'Opens the booking, shows old and new time'],
    ['booking_cancelled', 'A booking is cancelled by either side', 'The other side', 'Owner app, Booker app', 'Opens the booking'],
    ['booking_confirmed', 'The owner confirms a booking', 'The customer (by phone number)', 'Booker app', 'Opens the booking'],
    ['booking_reminder', 'A booking is coming up (the reminder times the owner set)', 'The customer, and the owner if they chose to', 'Booker app, Owner app', 'Opens the booking'],
    ['review_new', 'A customer leaves a review', 'The business owner', 'Owner app', 'Opens Reviews'],
    ['admin_request', 'New owner request, package request, feature request, support ticket, shop review, booking application, desktop setup request, or a review hidden request', 'Platform admins', 'Admin app', 'Opens that page in the portal'],
    ['update_ready', 'You tap “Tell phones it is ready” in Go live', 'Everyone with that app', 'Owner, Booker, Admin apps', 'Downloads the new app file'],
    ['custom', 'You send a message from the Send page', 'The apps you choose', 'Any', 'Opens the link you typed, if any'],
    ['test', 'You tap Send test', 'Phones of that app', 'Any', 'Opens the app'],
  ];
  const stagesHelp: Record<string, string> = { 'no-plugin': 'This app build has no push feature (built without Firebase).', permission: 'Android notification permission was not allowed.', 'registration-error': 'Google refused to give this phone a token.', 'got-token': 'Google gave the phone a token.', saved: 'The token was saved: this phone can receive notifications.', 'save-failed': 'The token could not be saved.', 'asked-google': 'The phone asked Google for a token.', exception: 'Something unexpected stopped it.' };

  return (
    <div className="space-y-4">
      <div role="tablist" aria-label="Notifications" className="flex gap-1 border-b border-slate-700 overflow-x-auto">
        {SUBS.map(([id, label, Icon]) => <button key={id} role="tab" aria-selected={sub === id} onClick={() => { setSub(id); setNote(null); setErr(null); }} className={`flex items-center gap-2 px-3 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 -mb-px ${sub === id ? 'border-field-500 text-ink' : 'border-transparent text-slate-400 hover:text-ink'}`}><Icon className="w-4 h-4" />{label}</button>)}
        <button onClick={reload} className="ml-auto px-3 text-slate-400 hover:text-ink" aria-label="Refresh"><RefreshCw className="w-4 h-4" /></button>
      </div>
      {err && <p className="text-sm text-rust-500">{err}</p>}
      {note && <p className="text-sm text-field-500">{note}</p>}

      {sub === 'overview' && (!stats ? <Skeleton rows={4} /> : <div className="space-y-3">
        <div className="grid sm:grid-cols-3 gap-3"><T label="TODAY" t={stats.totals.today} /><T label="LAST 7 DAYS" t={stats.totals.d7} /><T label="LAST 30 DAYS" t={stats.totals.d30} /></div>
        <Card className="p-4 space-y-2"><div className="flex items-center justify-between"><div className="font-medium text-sm">Phones registered</div><Pill ok={total > 0} text={`${total} in total`} /></div>
          <ul className="divide-y divide-slate-700/60">{APPS.map(([id, label]) => { const r = stats.phones.find((p) => p.app === id); return <li key={id} className="py-2 flex items-center justify-between gap-2 flex-wrap"><div><div className="text-sm">{label}</div><div className="text-xs text-slate-500">{r ? `${r.phones} phone${r.phones === 1 ? '' : 's'} · last seen ${when(r.last)} (${ago(r.last)})` : 'No phones yet'}</div></div>
            <button onClick={() => void test(id)} disabled={busy} className="btn-secondary text-xs inline-flex items-center gap-1"><Bell className="w-3 h-3" />Send test</button></li>; })}</ul></Card>
        <Card className="p-4 space-y-2"><div className="font-medium text-sm">By app and kind (last 30 days)</div>
          {stats.groups.length === 0 ? <p className="text-xs text-slate-500">Nothing has been sent yet. Notifications appear here as soon as the first one goes out.</p> :
            <div className="overflow-x-auto"><table className="w-full text-xs"><thead><tr className="text-left text-slate-400"><th className="py-1 pr-2">App</th><th className="pr-2">Kind</th><th className="pr-2 text-right">Today</th><th className="pr-2 text-right">7 days</th><th className="pr-2 text-right">30 days</th><th className="pr-2 text-right">Delivered</th><th className="pr-2 text-right">Failed</th><th className="text-right">Removed</th></tr></thead>
              <tbody className="divide-y divide-slate-700/60">{stats.groups.map((g, i) => <tr key={i}><td className="py-1.5 pr-2">{APP_LABEL[g.app] ?? g.app}</td><td className="pr-2">{KIND_LABEL[g.kind] ?? g.kind}</td><td className="pr-2 text-right">{g.today}</td><td className="pr-2 text-right">{g.d7}</td><td className="pr-2 text-right">{g.d30}</td><td className="pr-2 text-right text-field-500">{g.sent}</td><td className={`pr-2 text-right ${g.failed ? 'text-rust-500' : ''}`}>{g.failed}</td><td className="text-right">{g.removed}</td></tr>)}</tbody></table></div>}
          <p className="text-[11px] text-slate-500">“Delivered” means Google accepted it for that phone. It cannot say whether the person saw it.</p></Card>
      </div>)}

      {sub === 'log' && <div className="space-y-3"><AppFilter />
        {log === null ? <Skeleton rows={4} /> : log.length === 0 ? <p className="text-sm text-slate-500">Nothing has been sent yet.</p> :
          <div className="space-y-2">{log.map((l) => <Card key={l.id} className="p-3 space-y-1"><button className="w-full text-left" onClick={() => setOpen(open === l.id ? null : l.id)}>
            <div className="flex items-start justify-between gap-2"><div className="min-w-0"><div className="text-sm font-medium truncate">{l.title ?? '—'}</div><div className="text-xs text-slate-500">{when(l.at)} · {APP_LABEL[l.app ?? 'unknown'] ?? l.app} · {KIND_LABEL[l.kind ?? 'other'] ?? l.kind}</div></div>
              <span className="shrink-0">{l.error ? <Pill ok={false} text="Problem" /> : l.sent >= l.recipients && l.recipients > 0 ? <Pill ok text={`${l.sent}/${l.recipients}`} /> : <span className="text-xs text-slate-400">{l.sent}/{l.recipients} · {l.failed} failed</span>}</span></div></button>
            {open === l.id && <div className="text-xs text-slate-400 space-y-1 pt-1 border-t border-slate-700/60"><div>{l.body}</div><div>Phones targeted {l.recipients} · delivered {l.sent} · failed {l.failed} · removed {l.removed}</div>{l.error && <div className="text-rust-500 break-words">{l.error}</div>}{l.recipients > 0 && l.sent === 0 && l.failed === 0 && !l.error && <div>Waiting for Google’s answer, or Supabase has no FCM_SERVICE_ACCOUNT set.</div>}</div>}</Card>)}</div>}
      </div>}

      {sub === 'devices' && <div className="space-y-3"><AppFilter />
        {devs === null ? <Skeleton rows={3} /> : devs.length === 0 ? <p className="text-sm text-slate-500">No phones registered{appF === 'all' ? '' : ' for this app'}. Open the app on a phone, sign in and tap Allow on the notification question.</p> :
          <Card className="p-2"><ul className="divide-y divide-slate-700/60">{devs.map((d) => <li key={d.token} className="py-2 px-2 flex items-center justify-between gap-2"><div className="min-w-0"><div className="text-sm truncate">{d.who}</div><div className="text-xs text-slate-500">{APP_LABEL[d.app] ?? d.app} · {d.token_masked} · last seen {when(d.last_seen)} ({ago(d.last_seen)})</div></div>
            <button onClick={() => void removeDev(d)} aria-label="Remove phone" className="p-1.5 text-slate-400 hover:text-rust-500 shrink-0"><Trash2 className="w-4 h-4" /></button></li>)}</ul></Card>}
      </div>}

      {sub === 'send' && <Card className="p-4 space-y-3"><div className="font-medium text-sm">Send a notification now</div>
        <div className="flex flex-wrap gap-2">{(['all', 'owner', 'booker', 'admin'] as const).map((k) => <button key={k} onClick={() => setForm({ ...form, app: k })} className={chip(form.app === k)}>{APP_LABEL[k]}</button>)}</div>
        <input className="input w-full text-sm" placeholder="Title" maxLength={120} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
        <textarea className="input w-full text-sm" rows={3} placeholder="Message" maxLength={300} value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} />
        <input className="input w-full text-sm" placeholder="Page to open when tapped (optional), e.g. /book-manage" value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} />
        <div className="flex flex-wrap gap-2"><button onClick={() => void sendNow()} disabled={busy} className="btn-primary text-sm inline-flex items-center gap-1.5"><Send className="w-4 h-4" />Send now</button>
          {APPS.map(([id, label]) => <button key={id} onClick={() => void test(id)} disabled={busy} className="btn-secondary text-xs">Test {label}</button>)}</div>
        <p className="text-[11px] text-slate-500">This reaches every phone registered for the choice, including people outside your own team. Keep it short and useful.</p></Card>}

      {sub === 'rings' && <Card className="p-3 space-y-2"><div className="font-medium text-sm">Everything that can ring a phone</div>
        <div className="space-y-2">{RINGS.map(([k, ev, who, apps, tap]) => <div key={k} className="rounded-lg border border-slate-700/60 p-3 space-y-0.5"><div className="flex items-center justify-between gap-2"><span className="text-sm font-medium">{KIND_LABEL[k]}</span><code className="text-[11px] text-slate-500">{k}</code></div>
          <div className="text-xs text-slate-300">{ev}</div><div className="text-xs text-slate-500">Goes to: {who} · {apps}</div><div className="text-xs text-slate-500">Tap: {tap}</div></div>)}</div>
        <p className="text-[11px] text-slate-500">When the app is open a banner and a sound show instead of a system notification. A kind appears in Overview once it has sent for the first time.</p></Card>}

      {sub === 'reports' && <Card className="p-4 space-y-2"><div className="font-medium text-sm">What the phones report</div>
        {diag === null ? <Skeleton rows={3} /> : diag.length === 0 ? <p className="text-xs text-slate-500">Nothing yet. Open the new app on a phone, sign in and allow notifications; each step appears here.</p> :
          <ul className="text-xs divide-y divide-slate-700/60 max-h-[28rem] overflow-y-auto">{diag.map((x) => <li key={x.id} className="py-1.5"><div className="flex justify-between gap-2"><span><b>{x.app}</b> · {x.stage}{x.detail ? ` — ${x.detail}` : ''}</span><span className="text-slate-500 shrink-0">{when(x.at)}</span></div>{stagesHelp[x.stage] && <div className="text-slate-500">{stagesHelp[x.stage]}</div>}</li>)}</ul>}</Card>}

      {sub === 'setup' && <div className="space-y-3"><Card className="p-4 space-y-3"><div className="font-medium text-sm">What is needed for notifications when the app is closed</div>
        <ul className="space-y-3">
          <Step ok={APPS.some(([id]) => metas[id]?.push)} title="1. The Android apps are built with Firebase">In Firebase add an Android app for each package (owner, admin, booker) and download each google-services.json. In GitHub → shopos-app → Settings → Secrets and variables → Actions add GOOGLE_SERVICES_OWNER, GOOGLE_SERVICES_ADMIN and GOOGLE_SERVICES_BOOKER (the whole file each). Then build the apps again from Go live.
            <div className="mt-1 flex flex-wrap gap-2">{APPS.map(([id, label]) => <Pill key={id} ok={!!metas[id]?.push} text={`${label}: ${metas[id]?.version ? (metas[id]?.push ? 'built with notifications' : 'built without') : 'not published'}`} />)}</div></Step>
          <Step ok={total > 0} title="2. Phones have registered">Open the new app, sign in and tap Allow when Android asks about notifications. Devices lists them.</Step>
          <Step ok={!!stats && stats.totals.d30.sent > 0} title="3. Supabase can send through Google">Firebase → Project settings → Service accounts → Generate new private key. In Supabase → Edge Functions → Secrets add FCM_SERVICE_ACCOUNT with the whole JSON. The Sent log shows “FCM_SERVICE_ACCOUNT is not set” until this is done.</Step>
        </ul></Card>
        <Card className="p-4 text-xs text-slate-400">Anything unclear? Phone reports shows exactly where a phone stopped, and Send test checks the whole chain.</Card></div>}
    </div>
  );
}
