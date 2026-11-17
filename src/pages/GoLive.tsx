import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { SupabaseClient } from '@supabase/supabase-js';
import { Rocket, ExternalLink, RefreshCw, CheckCircle2, XCircle, Smartphone, History, Link2, ScrollText, LayoutDashboard, Undo2, Copy, Activity, MonitorSmartphone, ShieldCheck, Bell, BarChart3, Loader2 } from 'lucide-react';
import { Card, Skeleton } from '../components/ui';
import { askConfirm, showAlert } from '../lib/dialog';
import { PlatformAnalytics } from '../components/PlatformAnalytics';

const PROD = 'https://www.shopos.co.ke';
const STAGING = 'https://shopos-app-staging.vercel.app';
const ADMIN = 'https://admin.shopos.co.ke';
const APP_REPO = 'Darius2322/shopos-app';
const ADMIN_REPO = 'Darius2322/Shopos-admin';
const ANDROID: { id: 'owner' | 'admin' | 'booker'; label: string; file: string; meta: string }[] = [
  { id: 'owner', label: 'Owner app', file: 'ShopOS.apk', meta: 'latest.json' },
  { id: 'admin', label: 'Admin app', file: 'ShopOS-Admin.apk', meta: 'latest-admin.json' },
  { id: 'booker', label: 'Booker app', file: 'ShopOS-Booker.apk', meta: 'latest-booker.json' },
];
interface Br { sha: string; short: string; message: string; date?: string; author?: string; url?: string; build?: boolean; parents?: number }
interface St { repo: string; staging: Br | null; main: Br; liveSince?: string; liveCommit?: Br; ahead: number; behind: number; commits: Br[] }
interface Meta { version?: string; builtAt?: string; size?: number; sha256?: string; signed?: boolean; push?: boolean }
interface Run { id: number; number: number; status: string; conclusion: string | null; at: string; url: string }
interface Ping { url: string; ok: boolean; status: number; ms: number }
interface LogRow { id: string; at: string; app: string; action: string; from_sha: string | null; to_sha: string | null; note: string | null }
type Sub = 'overview' | 'analytics' | 'release' | 'history' | 'apps' | 'safety' | 'preview' | 'links' | 'activity';
type Any = Record<string, any>;

const ERR: Record<string, string> = {
  token_missing: 'GitHub is not connected yet. In Supabase → Edge Functions → Secrets add GITHUB_TOKEN (a GitHub token with write access: Contents and Actions).',
  token_invalid: 'The GitHub token was refused. Make a new one and replace GITHUB_TOKEN in Supabase.',
  token_cannot_write: 'The GitHub token cannot change this repository. Give it Contents and Actions write access.',
  repo_not_found: 'Repository or version not found.',
  conflict: 'Staging and production have conflicting changes. Fix it in GitHub first.',
  workflow_outdated: 'The Android build file on GitHub is the old one. Release the latest app first, then try again.',
  not_authorized: 'Only platform admins can do this.',
};
const when = (d?: string | null) => (d ? new Date(d).toLocaleString('en-KE', { timeZone: 'Africa/Nairobi', dateStyle: 'medium', timeStyle: 'short' }) : '—');
function span(from?: string | null, to: number | string = Date.now()) {
  if (!from) return '—';
  const ms = Math.max(0, (typeof to === 'number' ? to : new Date(to).getTime()) - new Date(from).getTime());
  const m = Math.floor(ms / 60000), h = Math.floor(m / 60), d = Math.floor(h / 24);
  if (d >= 1) return `${d} day${d === 1 ? '' : 's'} ${h % 24} h`;
  if (h >= 1) return `${h} h ${m % 60} min`;
  return `${m} min`;
}
const mb = (n?: number) => (n ? `${(n / 1048576).toFixed(1)} MB` : '—');
const SUBS: [Sub, string, typeof Rocket][] = [['overview', 'Overview', LayoutDashboard], ['analytics', 'Analytics', BarChart3], ['release', 'Release', Rocket], ['history', 'History & roll back', History], ['apps', 'Apps', Smartphone], ['safety', 'Data safety', ShieldCheck], ['preview', 'Preview', MonitorSmartphone], ['links', 'Links', Link2], ['activity', 'Activity log', ScrollText]];


const DEVICES: { id: string; label: string; w: number; h: number }[] = [
  { id: 'phone', label: 'Phone', w: 390, h: 780 }, { id: 'small', label: 'Small phone', w: 360, h: 640 },
  { id: 'tablet', label: 'Tablet', w: 768, h: 1024 }, { id: 'desktop', label: 'Desktop', w: 1180, h: 760 },
];
const TARGETS: { id: string; label: string; path: string; staging?: string; prod: string }[] = [
  { id: 'website', label: 'Website', path: '/', staging: STAGING, prod: PROD },
  { id: 'owner', label: 'Owner app (POS)', path: '/login', staging: STAGING, prod: PROD },
  { id: 'booker', label: 'Booker app', path: '/book/app', staging: STAGING, prod: PROD },
  { id: 'admin', label: 'Admin portal', path: '/', prod: ADMIN },
];

/** Look at staging and production, in a phone, tablet or desktop frame, side by side if you like, without leaving the portal. */
function Preview({ staging, live, start }: { staging?: Br | null; live?: Br | null; start?: string }) {
  const [target, setTarget] = useState(start && TARGETS.some((x) => x.id === start) ? start : 'website'); const [env, setEnv] = useState<'staging' | 'prod'>('staging'); const [dev, setDev] = useState('phone');
  const [both, setBoth] = useState(false); const [custom, setCustom] = useState(''); const [nonce, setNonce] = useState(0);
  const [box, setBox] = useState<HTMLDivElement | null>(null); const [avail, setAvail] = useState(360);
  useEffect(() => { if (!box) return; const ro = new ResizeObserver(() => setAvail(box.clientWidth)); ro.observe(box); setAvail(box.clientWidth); return () => ro.disconnect(); }, [box]);
  const t = TARGETS.find((x) => x.id === target)!; const d = DEVICES.find((x) => x.id === dev)!;
  const path = custom.trim() ? (custom.trim().startsWith('/') ? custom.trim() : '/' + custom.trim()) : t.path;
  const url = (e: 'staging' | 'prod') => { const base = e === 'staging' ? t.staging : t.prod; return base ? base + path : null; };
  const panes: ('staging' | 'prod')[] = both ? ['staging', 'prod'] : [env];
  const each = both ? (avail - 12) / 2 : avail;
  const scale = Math.min(1, Math.max(0.25, each / d.w));
  const info = (e: 'staging' | 'prod') => (e === 'staging' ? staging : live);
  const chip = (on: boolean) => `text-xs px-3 py-1.5 rounded-full border ${on ? 'bg-field-500 text-white border-field-500' : 'border-slate-600 text-slate-300'}`;
  return (
    <div className="space-y-3">
      <Card className="p-3 space-y-2.5">
        <div className="flex flex-wrap gap-2">{TARGETS.map((x) => <button key={x.id} onClick={() => { setTarget(x.id); setCustom(''); if (!x.staging) setEnv('prod'); }} className={chip(target === x.id)}>{x.label}</button>)}</div>
        <div className="flex flex-wrap gap-2 items-center">
          <button onClick={() => setEnv('staging')} disabled={!t.staging || both} className={`${chip(env === 'staging' && !both)} disabled:opacity-40`}>Staging (testing)</button>
          <button onClick={() => setEnv('prod')} disabled={both} className={`${chip(env === 'prod' && !both)} disabled:opacity-40`}>Production (live)</button>
          {t.staging && <button onClick={() => setBoth((b) => !b)} className={chip(both)}>Side by side</button>}
          <span className="text-slate-600">|</span>
          {DEVICES.map((x) => <button key={x.id} onClick={() => setDev(x.id)} className={chip(dev === x.id)}>{x.label}</button>)}
        </div>
        <div className="flex flex-wrap gap-2 items-center">
          <input value={custom} onChange={(e) => setCustom(e.target.value)} placeholder="Open a page, e.g. /book/swat or /products" className="input text-xs flex-1 min-w-[12rem]" />
          <button onClick={() => setNonce((n) => n + 1)} className="btn-secondary text-xs inline-flex items-center gap-1"><RefreshCw className="w-3 h-3" />Reload</button>
        </div>
        {!t.staging && <p className="text-[11px] text-slate-500">The admin portal has no staging copy, so only production can be previewed.</p>}
        <p className="text-[11px] text-slate-500">Sign in inside the frame to test. A frame is a browser preview: phone buttons such as Back and push notifications only work in the installed Android app.</p>
      </Card>
      <div ref={setBox} className="w-full">
        <div className={`flex gap-3 ${both ? 'items-start' : 'justify-center'}`}>
          {panes.map((e) => { const u = url(e); return (
            <div key={e} className="space-y-1.5" style={{ width: d.w * scale }}>
              <div className="flex items-center justify-between gap-2 text-xs"><span className={`px-2 py-0.5 rounded-full ${e === 'prod' ? 'bg-field-500/15 text-field-500' : 'bg-amber-500/15 text-amber-500'}`}>{e === 'prod' ? 'PRODUCTION' : 'STAGING'}</span>
                {u && <a href={u} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-slate-400 hover:text-ink">Open<ExternalLink className="w-3 h-3" /></a>}</div>
              <div className="text-[11px] text-slate-500 truncate">{info(e)?.message ?? '—'}{info(e)?.short ? ` · ${info(e)!.short}` : ''}</div>
              <div className="rounded-[1.75rem] border-4 border-slate-700 bg-black overflow-hidden" style={{ width: d.w * scale, height: d.h * scale }}>
                {u ? <iframe key={`${e}-${nonce}-${u}-${dev}`} title={`${t.label} ${e}`} src={u} style={{ width: d.w, height: d.h, transform: `scale(${scale})`, transformOrigin: 'top left', border: 0, background: '#fff' }} allow="clipboard-write; camera" />
                  : <div className="p-4 text-xs text-slate-400">Not available</div>}
              </div>
            </div>); })}
        </div>
      </div>
    </div>
  );
}

/** Before any address move: how many phones still have changes that have not reached the server. */
function DataSafetyPanel({ supabase }: { supabase: SupabaseClient }) {
  const [ov, setOv] = useState<Record<string, any> | null>(null); const [rows, setRows] = useState<Record<string, any>[]>([]); const [all, setAll] = useState(false); const [err, setErr] = useState('');
  const load = useCallback(async () => {
    const a = await supabase.rpc('sync_overview'); if (a.error) { setErr(a.error.message); return; } setErr(''); setOv(a.data as Record<string, any>);
    const b = await supabase.rpc('sync_devices_list', { p_only_waiting: !all }); if (!b.error) setRows((b.data as Record<string, any>[]) ?? []);
  }, [supabase, all]);
  useEffect(() => { void load(); }, [load]);
  const ready = ov && Number(ov.waiting) === 0 && Number(ov.failed) === 0 && Number(ov.lost) === 0;
  const Tile = ({ label, value, warn }: { label: string; value: ReactNode; warn?: boolean }) => <div className="rounded-xl border border-slate-700/60 p-3"><div className="text-[11px] text-slate-500">{label}</div><div className={`text-xl font-semibold tnum ${warn ? 'text-amber-500' : ''}`}>{value}</div></div>;
  return (
    <div className="space-y-3">
      <Card className="p-4 space-y-3">
        <div className="flex items-center justify-between gap-2"><div className="flex items-center gap-2 font-medium text-sm"><ShieldCheck className="w-4 h-4 text-field-500" />Is it safe to move people to a new address?</div><button onClick={() => void load()} className="text-xs text-slate-400 hover:text-ink inline-flex items-center gap-1"><RefreshCw className="w-3 h-3" />Refresh</button></div>
        {err && <p className="text-xs text-rust-500">{err}</p>}
        {!ov ? <Skeleton rows={2} /> : <>
          <p className={`text-sm ${ready ? 'text-field-500' : 'text-amber-500'}`}>{ready ? 'Yes: no phone is reporting unsent changes. Phones that have not opened the app yet are not counted, so keep the old address running for the overlap period.' : `Not yet: ${ov.waiting} phone${Number(ov.waiting) === 1 ? '' : 's'} still ${Number(ov.waiting) === 1 ? 'has' : 'have'} changes waiting (${ov.waiting_items} in total).`}</p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <Tile label="Phones reporting" value={ov.devices} /><Tile label="Seen in 7 days" value={ov.active7} />
            <Tile label="With changes waiting" value={ov.waiting} warn={Number(ov.waiting) > 0} /><Tile label="Waiting, silent 2+ days" value={ov.silent_waiting} warn={Number(ov.silent_waiting) > 0} />
            <Tile label="With failed changes" value={ov.failed} warn={Number(ov.failed) > 0} /><Tile label="Refused by server" value={ov.lost} warn={Number(ov.lost) > 0} /><Tile label="Changes waiting" value={ov.waiting_items} warn={Number(ov.waiting_items) > 0} />
          </div>
          {(ov.by_app ?? []).length > 0 && <p className="text-xs text-slate-500">{(ov.by_app as { app: string; devices: number; waiting: number }[]).map((x) => `${x.app}: ${x.devices} phones, ${x.waiting} waiting`).join(' · ')}</p>}
        </>}
      </Card>
      <Card className="p-4 space-y-2">
        <div className="flex items-center justify-between"><div className="font-medium text-sm">{all ? 'All phones' : 'Phones with changes waiting'}</div><button onClick={() => setAll((a) => !a)} className="text-xs text-slate-400 hover:text-ink underline">{all ? 'Show only waiting' : 'Show all'}</button></div>
        {rows.length === 0 ? <p className="text-xs text-slate-500">{all ? 'No phone has reported yet. Phones report after they get the latest app version and are signed in.' : 'None. Nothing is waiting.'}</p>
          : <ul className="divide-y divide-slate-700/60 text-xs">{rows.map((r) => <li key={r.device_id} className="py-2 flex justify-between gap-2 flex-wrap"><span><b>{r.app}</b> · {r.who} · v{r.version ?? '?'}</span><span className="text-slate-400">{r.pending} waiting{r.failed > 0 ? ` · ${r.failed} failed` : ''}{r.dead > 0 ? ` · ${r.dead} refused` : ''} · {when(r.updated_at)}</span></li>)}</ul>}
        <p className="text-[11px] text-slate-500">Phones send only these numbers, no business data. Each phone can also save a backup file of its unsent changes from Settings → Sync Center.</p>
      </Card>
    </div>
  );
}

/** Go live: its own menu. What is on staging and production and for how long, releasing one app or all, moving back to an earlier version,
 * the Android apps, every link, and a log of who released what. */
export default function GoLive({ supabase, onGoNotifications }: { supabase: SupabaseClient; onGoNotifications?: () => void }) {
  const [sub, setSub] = useState<Sub>('overview');
  const [previewStart, setPreviewStart] = useState('website');
  const [histProd, setHistProd] = useState<'website' | 'owner' | 'booker' | 'admin'>('website');
  const histApp: 'web' | 'admin' = histProd === 'admin' ? 'admin' : 'web';
  const [web, setWeb] = useState<St | null>(null); const [adm, setAdm] = useState<St | null>(null);
  const [hist, setHist] = useState<Br[]>([]); 
  const [runs, setRuns] = useState<Run[]>([]); const [metas, setMetas] = useState<Record<string, Meta | null>>({});
  const [pings, setPings] = useState<Ping[]>([]); const [log, setLog] = useState<LogRow[]>([]);
  type Ver = { version: string | null; commit: string | null; builtAt: string | null } | null;
  type Sched = { id: string; run_at: string; note: string | null; status: string; result: string | null };
  const [vers, setVers] = useState<{ production: Ver; staging: Ver; admin: Ver } | null>(null);
  const [sched, setSched] = useState<Sched[]>([]); const [schedAt, setSchedAt] = useState(''); const [schedNote, setSchedNote] = useState('');
  const [prevWeb, setPrevWeb] = useState<Br[]>([]);
  const [prevJob, setPrevJob] = useState<{ sha: string; url: string; state: 'starting' | 'building' | 'ready' | 'error'; msg?: string } | null>(null);
  const [access, setAccess] = useState<boolean | null>(null); const [accessBusy, setAccessBusy] = useState(false);
  const [editId, setEditId] = useState<string | null>(null); const [editAt, setEditAt] = useState('');
  const [relTab, setRelTab] = useState<'now' | 'release' | 'schedule' | 'previous'>('now');
  const [appTab, setAppTab] = useState<'android' | 'desktop' | 'mac'>('android'); const [deskRuns, setDeskRuns] = useState<Run[]>([]);
  const [pick, setPick] = useState<'all' | 'owner' | 'admin' | 'booker'>('all');
  const [busy, setBusy] = useState(false); const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null); const [done, setDone] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const t = window.setInterval(() => setNow(Date.now()), 30000); return () => window.clearInterval(t); }, []);

  const call = useCallback(async (body: Any): Promise<Any> => {
    const { data, error } = await supabase.functions.invoke('github-release', { body });
    if (error) return { error: 'failed' };
    return (data ?? {}) as Any;
  }, [supabase]);

  const loadAll = useCallback(async () => {
    setLoading(true); setErr(null);
    const [w, a, r, p, l] = await Promise.all([
      call({ action: 'status', repo: APP_REPO, app: 'web' }), call({ action: 'status', repo: ADMIN_REPO, app: 'admin' }),
      call({ action: 'runs', repo: APP_REPO }),
      call({ action: 'ping', urls: [`${PROD}/`, `${STAGING}/`, `${ADMIN}/`, `${PROD}/downloads/android/ShopOS.apk`, `${PROD}/downloads/android/ShopOS-Admin.apk`, `${PROD}/downloads/android/ShopOS-Booker.apk`] }),
      supabase.from('release_log').select('*').order('at', { ascending: false }).limit(60),
    ]);
    if (w.error) setErr(ERR[w.error as string] ?? 'Could not reach GitHub. Try again.'); else setWeb(w as unknown as St);
    if (!a.error) setAdm(a as unknown as St);
    if (!r.error) setRuns((r.runs ?? []) as Run[]);
    setPings((p.results ?? []) as Ping[]);
    setLog((l.data ?? []) as LogRow[]);
    const m: Record<string, Meta | null> = {};
    await Promise.all(ANDROID.map(async (x) => { try { const res = await fetch(`${PROD}/downloads/android/${x.meta}`, { cache: 'no-store' }); m[x.id] = res.ok ? await res.json() : null; } catch { m[x.id] = null; } }));
    setMetas(m); setLoading(false);
  }, [call, supabase]);
  useEffect(() => { void loadAll(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const loadHist = useCallback(async (which: 'web' | 'admin') => {
    const h = await call({ action: 'history', repo: which === 'web' ? APP_REPO : ADMIN_REPO, app: which, n: 40 });
    setHist(h.error ? [] : ((h.commits ?? []) as Br[]));
  }, [call]);
  useEffect(() => { void loadHist(histApp); }, [histApp, loadHist]);

  const loadSched = useCallback(async () => { const { data } = await supabase.from('release_schedule').select('id, run_at, note, status, result').order('run_at', { ascending: false }).limit(10); setSched((data ?? []) as Sched[]); }, [supabase]);
  useEffect(() => {
    if (sub !== 'release') return;
    void call({ action: 'versions' }).then((v) => { if (!v.error) setVers(v as never); });
    void loadSched();
    void call({ action: 'history', repo: APP_REPO, app: 'web', n: 40 }).then((h) => setPrevWeb(h.error ? [] : ((h.commits ?? []) as Br[]).filter((c) => !c.build && (c.parents ?? 1) <= 2)));
    const t = window.setInterval(() => void loadSched(), 30000); return () => window.clearInterval(t);
  }, [sub, call, loadSched]);
  useEffect(() => { if (sub !== 'release') return; void supabase.rpc('preview_is_public').then(({ data }) => setAccess(typeof data === 'boolean' ? data : null)); }, [sub, supabase]);
  useEffect(() => {
    if (!prevJob || prevJob.state !== 'building') return;
    let stop = false; let tries = 0; let timer = 0;
    const tick = async () => {
      tries++;
      const { data } = await supabase.functions.invoke('release-preview', { body: { action: 'check', url: prevJob.url } });
      if (stop) return;
      if ((data as Any)?.ready) { setPrevJob((j) => (j ? { ...j, state: 'ready' } : j)); return; }
      if (tries > 50) { setPrevJob((j) => (j ? { ...j, state: 'error', msg: 'It is taking too long. Try again in a minute.' } : j)); return; }
      timer = window.setTimeout(() => void tick(), 6000);
    };
    timer = window.setTimeout(() => void tick(), 4000);
    return () => { stop = true; window.clearTimeout(timer); };
  }, [prevJob?.state, prevJob?.url, supabase]);
  const fail = (code?: string) => setErr(ERR[code ?? ''] ?? 'That did not work. Try again.');
  async function promote(which: 'web' | 'admin'): Promise<boolean> {
    const st = which === 'web' ? web : adm; if (!st?.staging) return false;
    const d = await call({ action: 'promote', repo: which === 'web' ? APP_REPO : ADMIN_REPO, app: which, message: `Release: ${st.staging.message}`.slice(0, 150) });
    if (d.error) { fail(d.error); return false; }
    setDone(d.nothing ? 'Production already has everything from staging.' : `Released to production (${d.short}). It is live in about a minute.`); return true;
  }
  async function releaseOne(which: 'web' | 'admin') {
    const st = which === 'web' ? web : adm; if (!st) return;
    if (!(await askConfirm(`Send ${st.ahead} change${st.ahead === 1 ? '' : 's'} from staging to production for the ${which === 'web' ? 'website app' : 'admin portal'}? Real users get it in about a minute.`))) return;
    setBusy(true); setErr(null); setDone(null); await promote(which); setBusy(false); void loadAll(); void loadHist(histApp);
  }
  async function build(apps: 'all' | 'owner' | 'admin' | 'booker') {
    const label = apps === 'all' ? 'all three Android apps' : `the ${apps} Android app`;
    if (!(await askConfirm(`Build ${label} now? It takes about 10 minutes, then the new file is on the download link.`))) return;
    setBusy(true); setErr(null); setDone(null);
    const d = await call({ action: 'build_apk', repo: APP_REPO, app: 'android', apps }); setBusy(false);
    if (d.error) { fail(d.error); return; }
    setDone(`Building ${label}. Check the Android apps menu in about 10 minutes.`); void loadAll();
  }
  useEffect(() => { if (sub !== 'apps' || appTab === 'android') return; void call({ action: 'runs', repo: APP_REPO, workflow: 'desktop' }).then((r) => { if (!r.error) setDeskRuns((r.runs ?? []) as Run[]); }); }, [sub, appTab]);
  async function scheduleRelease() {
    if (!schedAt) { setErr('Pick the date and time first.'); return; }
    const at = new Date(schedAt);
    if (isNaN(at.getTime()) || at.getTime() < Date.now() + 60_000) { setErr('Pick a time at least a minute from now.'); return; }
    setErr(null);
    const { error } = await supabase.from('release_schedule').insert({ run_at: at.toISOString(), note: schedNote.trim() || null });
    if (error) { setErr('Could not save the schedule.'); return; }
    setSchedAt(''); setSchedNote(''); setDone(`Scheduled for ${when(at.toISOString())}. Staging goes to production by itself at that time.`); void loadSched();
  }
  async function cancelSchedule(id: string) { if (!(await askConfirm('Cancel this scheduled release?'))) return; await supabase.from('release_schedule').update({ status: 'cancelled' }).eq('id', id).eq('status', 'pending'); void loadSched(); }
  async function openVersion(c: Br) {
    setErr(null); setPrevJob({ sha: c.sha, url: '', state: 'starting' });
    const { data, error } = await supabase.functions.invoke('release-preview', { body: { action: 'create', sha: c.sha } });
    const d = (data ?? {}) as Any;
    if (error || d.error || !d.url) { setPrevJob(null); fail(error ? 'failed' : d.error); return; }
    setPrevJob({ sha: c.sha, url: d.url as string, state: 'building' });
  }
  async function cleanupPreviews() {
    if (!(await askConfirm('Remove the separate copies made for old versions? Production and staging are not touched. You can open any version again later.'))) return;
    const { data, error } = await supabase.functions.invoke('release-preview', { body: { action: 'cleanup' } });
    if (error || (data as Any)?.error) { fail('failed'); return; }
    setPrevJob(null); setDone(`Removed ${(data as Any).removed ?? 0} old copies.`);
  }
  async function toggleAccess() {
    if (access === null) return; const next = !access;
    if (next && !(await askConfirm('Turn on open access? Anyone who has the staging or old-version link will be able to open it with no password. Production is not affected.'))) return;
    setAccessBusy(true); const { error } = await supabase.rpc('admin_set_preview_public', { p_public: next }); setAccessBusy(false);
    if (error) { setErr('Could not change the setting.'); return; }
    setAccess(next); setDone(next ? 'Staging and old versions are now open to anyone with the link.' : 'Staging and old versions now ask for an admin sign-in.');
  }
  const localInput = (d: Date) => { const z = (n: number) => String(n).padStart(2, '0'); return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}T${z(d.getHours())}:${z(d.getMinutes())}`; };
  const picks = (): [string, string][] => {
    const n = new Date(); const t = (h: number, addDays = 0) => { const d = new Date(n); d.setDate(d.getDate() + addDays); d.setHours(h, 0, 0, 0); return d; };
    const tonight = t(22); if (tonight.getTime() < n.getTime() + 600000) tonight.setDate(tonight.getDate() + 1);
    const mon = t(6); do { mon.setDate(mon.getDate() + 1); } while (mon.getDay() !== 1);
    return [['In 1 hour', localInput(new Date(n.getTime() + 3600000))], ['Tonight 10 pm', localInput(tonight)], ['Tomorrow 6 am', localInput(t(6, 1))], ['Monday 6 am', localInput(mon)]];
  };
  async function releaseScheduledNow(id: string) {
    if (!(await askConfirm('Release staging to production now? It goes out within a minute.'))) return;
    await supabase.from('release_schedule').update({ run_at: new Date().toISOString() }).eq('id', id).eq('status', 'pending'); setDone('It will go out within a minute.'); void loadSched();
  }
  async function saveEdit(id: string) {
    const at = new Date(editAt);
    if (isNaN(at.getTime()) || at.getTime() < Date.now() + 60_000) { setErr('Pick a time at least a minute from now.'); return; }
    setErr(null); await supabase.from('release_schedule').update({ run_at: at.toISOString() }).eq('id', id).eq('status', 'pending'); setEditId(null); setDone(`Moved to ${when(at.toISOString())}.`); void loadSched();
  }
  async function cancelAllPending() {
    if (!(await askConfirm('Cancel every waiting scheduled release?'))) return;
    await supabase.from('release_schedule').update({ status: 'cancelled' }).eq('status', 'pending'); void loadSched();
  }
  const nothingToRelease = !web || web.ahead === 0;
  const verLine = (v: Ver | undefined) => v ? `v${v.version ?? '?'} · ${v.commit ? v.commit.slice(0, 7) : 'unknown build'} · built ${when(v.builtAt)}` : 'Could not read the version';
  const renderRunning = () => (
      <Card className="p-4 space-y-3">
        <div className="font-medium text-sm">Running now</div>
        {([['Production', vers?.production, PROD, 'text-field-500'], ['Staging', vers?.staging, STAGING, 'text-amber-500'], ['Admin portal', vers?.admin, ADMIN, 'text-sky-400']] as const).map(([label, v, base, tone]) => (
          <div key={label} className="rounded-lg border border-slate-700/60 p-2.5 space-y-1.5">
            <div className="flex items-center justify-between gap-2"><span className={`text-xs font-medium ${tone}`}>{label}</span><span className="text-[11px] text-slate-500">{vers ? verLine(v as Ver) : 'Checking…'}</span></div>
            <div className="flex flex-wrap gap-1.5 text-xs">
              {label === 'Admin portal' ? <a href={base} target="_blank" rel="noreferrer" className="btn-secondary text-xs inline-flex items-center gap-1"><ExternalLink className="w-3 h-3" />Open portal</a>
                : ([['Website', '/'], ['Owner app', '/login'], ['Booker app', '/book/app']] as const).map(([n, path]) => <a key={n} href={base + path} target="_blank" rel="noreferrer" className="btn-secondary text-xs inline-flex items-center gap-1"><ExternalLink className="w-3 h-3" />{n}</a>)}
            </div>
          </div>))}
        <p className="text-[11px] text-slate-500">Android apps: owner {metas.owner?.version ? `v${metas.owner.version}` : '—'} · booker {metas.booker?.version ? `v${metas.booker.version}` : '—'} · admin {metas.admin?.version ? `v${metas.admin.version}` : '—'}. The phone apps open the live website, so they always show what is running on production.</p>
      </Card>
  );
  const renderAccess = () => (
      <Card className="p-4">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0"><div className="font-medium text-sm">Staging and preview access</div>
            <p className="text-xs text-slate-400 mt-0.5">{access === null ? 'Checking…' : access ? 'On: anyone with the link can open staging and old versions, with no password or code. Production is never affected.' : 'Off: staging and old versions ask for an admin sign-in first.'}</p></div>
          <button role="switch" aria-checked={!!access} aria-label="Staging and preview access" disabled={access === null || accessBusy} onClick={() => void toggleAccess()} className={`relative inline-flex h-7 w-12 shrink-0 rounded-full transition-colors disabled:opacity-50 ${access ? 'bg-emerald-600' : 'bg-slate-600'}`}><span className={`absolute top-0.5 left-0.5 h-6 w-6 rounded-full bg-white transition-transform ${access ? 'translate-x-5' : ''}`} /></button>
        </div>
      </Card>
  );
  const renderRelease = () => (
      <Card className="p-4 space-y-3">
        <div className="font-medium text-sm">Release</div>
        <p className="text-xs text-slate-400">A release sends everything waiting on staging in one go ({web ? web.ahead : '…'} change{web?.ahead === 1 ? '' : 's'} now). Phones and browsers jump straight to the newest version, so nobody has to take the updates one by one.</p>
        <button onClick={() => void releaseOne('web')} disabled={busy || nothingToRelease} className="w-full inline-flex items-center justify-center gap-2 text-sm font-medium rounded-card px-4 py-2.5 bg-field-600 text-white disabled:bg-slate-700 disabled:text-slate-400 disabled:cursor-not-allowed"><Rocket className="w-4 h-4" />{nothingToRelease ? 'Nothing to release' : `Release ${web!.ahead} change${web!.ahead === 1 ? '' : 's'} now`}</button>
      </Card>
  );
  const renderSchedule = () => {
    const pending = sched.filter((r) => r.status === 'pending');
    return (
      <div className="space-y-3">
        <Card className="p-4 space-y-3">
          <div className="font-medium text-sm">Schedule a release</div>
          <p className="text-xs text-slate-400">At the time you choose, everything waiting on staging goes to production by itself. Phones and browsers jump straight to the newest version.</p>
          <div className="flex flex-wrap gap-1.5">{picks().map(([l, v]) => <button key={l} onClick={() => setSchedAt(v)} className={`px-2.5 py-1 rounded-full text-xs border ${schedAt === v ? 'bg-emerald-600 text-white border-transparent' : 'border-slate-600 text-slate-300'}`}>{l}</button>)}</div>
          <input type="datetime-local" value={schedAt} onChange={(e) => setSchedAt(e.target.value)} className="input w-full" aria-label="Release date and time" />
          <input value={schedNote} onChange={(e) => setSchedNote(e.target.value)} placeholder="Note (optional), e.g. Friday night release" maxLength={120} className="input w-full" />
          <button onClick={() => void scheduleRelease()} disabled={!schedAt} className="btn-primary text-sm disabled:!bg-slate-700 disabled:!text-slate-400">Schedule it</button>
          <p className="text-[11px] text-slate-500">Nairobi time. Whatever is on staging at that moment is what goes live. Needs the GitHub connection (GITHUB_TOKEN).</p>
        </Card>
        <Card className="p-4 space-y-2">
          <div className="flex items-center justify-between gap-2"><div className="font-medium text-sm">Scheduled releases</div>{pending.length > 1 && <button onClick={() => void cancelAllPending()} className="btn-secondary text-xs">Cancel all waiting</button>}</div>
          {sched.length === 0 ? <p className="text-xs text-slate-500">Nothing scheduled yet.</p> : <ul className="text-sm divide-y divide-slate-700/60">{sched.map((r) => (
            <li key={r.id} className="py-2 space-y-1.5">
              <div className="flex items-start justify-between gap-2">
                <span className="min-w-0"><span className="block">{when(r.run_at)}{r.note ? <span className="text-slate-400"> · {r.note}</span> : null}</span>
                  <span className={`block text-[11px] ${r.status === 'pending' ? 'text-amber-400' : r.status === 'done' ? 'text-emerald-400' : r.status === 'failed' ? 'text-red-400' : 'text-slate-500'}`}>{r.status === 'pending' ? 'Waiting' : r.status === 'running' ? 'Releasing…' : r.status === 'done' ? 'Released' : r.status === 'nothing' ? 'Nothing was waiting' : r.status === 'cancelled' ? 'Cancelled' : 'Failed'}{r.result ? `: ${r.result}` : ''}</span></span>
              </div>
              {r.status === 'pending' && (editId === r.id
                ? <div className="flex flex-wrap gap-1.5 items-center"><input type="datetime-local" value={editAt} onChange={(e) => setEditAt(e.target.value)} className="input !py-1 text-xs" aria-label="New time" /><button onClick={() => void saveEdit(r.id)} className="btn-primary text-xs">Save</button><button onClick={() => setEditId(null)} className="btn-secondary text-xs">Back</button></div>
                : <div className="flex flex-wrap gap-1.5"><button onClick={() => { setEditId(r.id); setEditAt(localInput(new Date(r.run_at))); }} className="btn-secondary text-xs">Change time</button><button onClick={() => void releaseScheduledNow(r.id)} className="btn-secondary text-xs">Release now</button><button onClick={() => void cancelSchedule(r.id)} className="btn-secondary text-xs !text-red-400">Cancel</button></div>)}
            </li>))}</ul>}
        </Card>
      </div>
    );
  };
  const renderPrevious = () => (
      <Card className="p-4 space-y-2">
        <div className="flex items-center justify-between gap-2"><div className="font-medium text-sm">Previous versions</div><button onClick={() => void cleanupPreviews()} className="btn-secondary text-xs">Remove old copies</button></div>
        {prevJob && <div className={`rounded-lg border p-3 text-xs space-y-1.5 ${prevJob.state === 'ready' ? 'border-emerald-600/60' : 'border-slate-600'}`} role="status">
          {(prevJob.state === 'starting' || prevJob.state === 'building') && <div className="flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" />Building a separate copy of version {prevJob.sha.slice(0, 7)}. This takes 1 to 2 minutes. You can leave this screen open.</div>}
          {prevJob.state === 'ready' && <div className="flex items-center justify-between gap-2"><span>Version {prevJob.sha.slice(0, 7)} is ready on its own address. Production is untouched.</span><a href={prevJob.url} target="_blank" rel="noreferrer" className="btn-primary text-xs inline-flex items-center gap-1 shrink-0"><ExternalLink className="w-3 h-3" />Open it</a></div>}
          {prevJob.state === 'error' && <span className="text-red-400">{prevJob.msg ?? 'Something went wrong.'}</span>}
        </div>}
        <p className="text-xs text-slate-400">“Run it” opens that version on its own address, so you can look at it and use it. Production is not touched. It uses the same shop data as production, so avoid saving new records while testing. “Move back” makes production that version again.</p>
        {prevWeb.length === 0 ? <p className="text-xs text-slate-500">Loading…</p> : <ul className="text-sm divide-y divide-slate-700/60">{prevWeb.slice(0, 10).map((c, i) => (
          <li key={c.sha} className="py-2 flex items-center justify-between gap-2">
            <span className="min-w-0"><span className="block truncate">{c.message}</span><span className="block text-[11px] text-slate-500">{c.short} · {when(c.date)}{i === 0 ? ' · running now' : ''}</span></span>
            <span className="flex gap-1.5 shrink-0"><button onClick={() => void openVersion(c)} disabled={prevJob?.sha === c.sha && (prevJob.state === 'starting' || prevJob.state === 'building')} className="btn-secondary text-xs">{prevJob?.sha === c.sha && prevJob.state !== 'error' ? (prevJob.state === 'ready' ? 'Ready' : 'Building…') : 'Run it'}</button>{i > 0 && <button onClick={() => { setHistProd('website'); setSub('history'); }} className="btn-secondary text-xs">Move back</button>}</span>
          </li>))}</ul>}
      </Card>
  );
  async function buildDesktop() {
    if (!(await askConfirm('Build the desktop apps (Windows, Mac and Linux) now? It takes about 15 minutes. When it finishes they appear in the Installer library, and signed-in shop owners can download them.'))) return;
    setBusy(true); setErr(null); setDone(null);
    const d = await call({ action: 'build_desktop', repo: APP_REPO, app: 'desktop' }); setBusy(false);
    if (d.error) { fail(d.error); return; }
    setDone('Building the desktop apps. Check the Installer library in about 15 minutes.'); void loadAll(); setAppTab((t) => t);
  }
  async function everything() {
    if (!(await askConfirm('Release EVERYTHING: send the website app and the admin portal from staging to production (where there is something waiting), then build all three Android apps?'))) return;
    setBusy(true); setErr(null); setDone(null);
    if (web?.staging && web.ahead > 0) { if (!(await promote('web'))) { setBusy(false); return; } }
    if (adm?.staging && adm.ahead > 0) { if (!(await promote('admin'))) { setBusy(false); return; } }
    const d = await call({ action: 'build_apk', repo: APP_REPO, app: 'android', apps: 'all' }); setBusy(false);
    if (d.error) { fail(d.error); return; }
    setDone('Released. The Android apps are building (about 10 minutes).'); void loadAll();
  }
  async function rollback(which: 'web' | 'admin', c: Br) {
    if (!(await askConfirm(`Move production back to "${c.message}" (${c.short}, ${when(c.date)})? The ${which === 'web' ? 'website app' : 'admin portal'} will look like it did then. Newer work stays in history and can be released again.`))) return;
    setBusy(true); setErr(null); setDone(null);
    const d = await call({ action: 'rollback', repo: which === 'web' ? APP_REPO : ADMIN_REPO, app: which, sha: c.sha });
    setBusy(false);
    if (d.error) { fail(d.error); return; }
    setDone(`Production is going back to ${d.backTo}. It is live in about a minute.`); void loadAll(); void loadHist(which);
  }
  async function tellPhones(apps: 'all' | 'owner' | 'admin' | 'booker') {
    if (!(await askConfirm('Send a notification to the phones that have the selected Android app(s), telling them a new version is ready?'))) return;
    setBusy(true); const out: string[] = [];
    for (const x of ANDROID.filter((a) => apps === 'all' || a.id === apps)) {
      const version = metas[x.id]?.version;
      if (!version) { out.push(`${x.label}: no file published yet`); continue; }
      const { data, error } = await supabase.rpc('push_announce_update', { p_app: x.id, p_version: version });
      out.push(error ? `${x.label}: failed` : `${x.label} ${version}: sent to ${data ?? 0} phone${data === 1 ? '' : 's'}`);
    }
    setBusy(false); void showAlert(out.join('\n'));
  }
  const copy = (t: string) => { void navigator.clipboard?.writeText(t).then(() => setDone('Link copied.')).catch(() => undefined); };

  const histCodeOnly = useMemo(() => hist.filter((c) => !c.build), [hist]);
  const liveCommit = (histApp === 'web' ? web : adm)?.liveCommit;
  const previous = useMemo(() => { const s = web; if (!s) return null; const code = hist.filter((c) => !c.build); return histApp === 'web' && code.length > 1 ? code[1] : null; }, [hist, histApp, web]);
  const Pill = ({ ok, text }: { ok: boolean; text: string }) => <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full ${ok ? 'bg-field-500/15 text-field-500' : 'bg-rust-500/15 text-rust-500'}`}>{ok ? <CheckCircle2 className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}{text}</span>;
  const A = ({ href, children }: { href: string; children: ReactNode }) => <a href={href} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-field-500 hover:underline break-all">{children}<ExternalLink className="w-3 h-3 shrink-0" /></a>;

  const BranchCard = ({ title, tag, c, extra }: { title: string; tag: string; c?: Br | null; extra?: ReactNode }) => (
    <Card className="p-4 space-y-1"><div className="text-xs text-slate-400">{tag}</div><div className="font-medium text-sm">{title}</div>
      {c ? <><div className="text-sm">{c.message}</div><div className="text-xs text-slate-500">{c.short} · {c.author ?? ''} · {when(c.date)}</div>{extra}{c.url && <div className="text-xs"><A href={c.url}>See this version on GitHub</A></div>}</> : <div className="text-xs text-slate-500">Not available</div>}
    </Card>);


  /** Every product on one screen: what is on production, what is on staging, and what you can do with it. */
  const ProductCards = () => {
    const defs: { id: 'website' | 'owner' | 'booker' | 'admin'; label: string; note: string; path: string }[] = [
      { id: 'website', label: 'Website (marketing pages)', note: 'www.shopos.co.ke — the public pages people find on Google', path: '/' },
      { id: 'owner', label: 'Owner app (POS)', note: 'The shop till, stock and reports. Same web deployment as the Website', path: '/login' },
      { id: 'booker', label: 'Booker app', note: 'Customers booking appointments. Same web deployment as the Website', path: '/book/app' },
      { id: 'admin', label: 'Admin portal', note: 'admin.shopos.co.ke — this portal. Its own deployment', path: '/' },
    ];
    return (
      <div className="space-y-3">
        <div className="grid md:grid-cols-2 gap-3">{defs.map((d) => {
          const st = d.id === 'admin' ? adm : web; const live = st?.liveCommit ?? st?.main; const isAdmin = d.id === 'admin';
          const prodUrl = (isAdmin ? ADMIN : PROD) + d.path; const stagingUrl = isAdmin ? null : STAGING + d.path;
          return (
            <Card key={d.id} className="p-4 space-y-2.5">
              <div><div className="font-medium text-sm">{d.label}</div><div className="text-[11px] text-slate-500">{d.note}</div></div>
              <div className="rounded-lg border border-field-500/30 p-2.5 space-y-0.5"><div className="flex items-center justify-between gap-2"><span className="text-[11px] text-field-500 font-medium">PRODUCTION · live now</span>{st && <Pill ok text={`Live for ${span(st.liveSince, now)}`} />}</div>
                <div className="text-sm">{live?.message ?? '—'}</div><div className="text-xs text-slate-500">{live?.short ?? ''}{live?.short ? ' · ' : ''}since {when(st?.liveSince)} · last update {when(live?.date)}</div></div>
              <div className="rounded-lg border border-amber-500/30 p-2.5 space-y-0.5"><div className="flex items-center justify-between gap-2"><span className="text-[11px] text-amber-500 font-medium">STAGING · being tested</span>
                {isAdmin ? <span className="text-xs text-slate-500">No staging copy</span> : web && (web.ahead > 0 ? <Pill ok={false} text={`${web.ahead} change${web.ahead === 1 ? '' : 's'} ahead`} /> : <Pill ok text="Same as production" />)}</div>
                {isAdmin ? <div className="text-xs text-slate-500">Changes go live as soon as they are pushed to GitHub.</div> : <><div className="text-sm">{web?.staging?.message ?? '—'}</div><div className="text-xs text-slate-500">{web?.staging?.short ?? ''}{web?.staging?.short ? ' · ' : ''}{when(web?.staging?.date)}</div></>}</div>
              <div className="flex flex-wrap gap-2 text-xs">
                {!isAdmin && <button onClick={() => void releaseOne('web')} disabled={busy || !web || web.ahead === 0} className="btn-primary text-xs inline-flex items-center gap-1 disabled:!bg-slate-700 disabled:!text-slate-400 disabled:opacity-100"><Rocket className="w-3 h-3" />{web && web.ahead === 0 ? 'Nothing to release' : 'Release to production'}</button>}
                <button onClick={() => { setHistProd(d.id); setSub('history'); }} className="btn-secondary text-xs inline-flex items-center gap-1"><Undo2 className="w-3 h-3" />Move back</button>
                <button onClick={() => { setPreviewStart(d.id); setSub('preview'); }} className="btn-secondary text-xs inline-flex items-center gap-1"><MonitorSmartphone className="w-3 h-3" />Preview</button>
                <a href={prodUrl} target="_blank" rel="noreferrer" className="btn-secondary text-xs inline-flex items-center gap-1"><ExternalLink className="w-3 h-3" />Open live</a>
                {stagingUrl && <a href={stagingUrl} target="_blank" rel="noreferrer" className="btn-secondary text-xs inline-flex items-center gap-1"><ExternalLink className="w-3 h-3" />Open staging</a>}
              </div>
            </Card>); })}</div>
        <div className="grid md:grid-cols-3 gap-3">{ANDROID.map((x) => { const m = metas[x.id]; return (
          <Card key={x.id} className="p-4 space-y-2"><div className="flex items-center justify-between gap-2"><div className="font-medium text-sm">{x.label} (Android)</div>{m?.version ? <Pill ok text={`v${m.version}`} /> : <Pill ok={false} text="Not published" />}</div>
            <div className="text-xs text-slate-500 space-y-0.5"><div><b className="text-slate-300">Production file:</b> {m?.version ? `v${m.version}, built ${when(m.builtAt)} (${span(m.builtAt, now)} ago)` : 'none yet'}</div><div><b className="text-slate-300">Staging:</b> none. The app opens the live {x.id === 'admin' ? 'admin portal' : x.id === 'booker' ? 'booker page' : 'website'}, so most changes need no new install.</div>
              {m && <div>{m.signed ? 'Signed' : 'Not signed'} · notifications {m.push ? 'on' : 'off'}</div>}</div>
            <div className="flex flex-wrap gap-2"><button onClick={() => void build(x.id)} disabled={busy} className="btn-primary text-xs">Build</button><button onClick={() => void tellPhones(x.id)} disabled={busy} className="btn-secondary text-xs">Tell phones</button>
              <button onClick={() => { setPreviewStart(x.id); setSub('preview'); }} className="btn-secondary text-xs">Preview</button><a href={`${PROD}/downloads/android/${x.file}`} className="btn-secondary text-xs inline-flex items-center gap-1"><ExternalLink className="w-3 h-3" />Download</a></div></Card>); })}</div>
      </div>
    );
  };

  return (
    <div className="space-y-4">
      <div role="tablist" aria-label="Go live" className="flex gap-1 border-b border-slate-700 overflow-x-auto">
        {SUBS.map(([id, label, Icon]) => (
          <button key={id} role="tab" aria-selected={sub === id} onClick={() => setSub(id)} className={`flex items-center gap-2 px-3 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 -mb-px ${sub === id ? 'border-field-500 text-ink' : 'border-transparent text-slate-400 hover:text-ink'}`}><Icon className="w-4 h-4" />{label}</button>
        ))}
        <button onClick={() => void loadAll()} disabled={loading || busy} className="ml-auto px-3 text-slate-400 hover:text-ink" aria-label="Refresh"><RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /></button>
      </div>
      {err && <p className="text-sm text-rust-500">{err}</p>}
      {done && <p className="text-sm text-field-500 flex items-center gap-1.5"><CheckCircle2 className="w-4 h-4" />{done}</p>}
      {loading && !web && <Skeleton rows={4} />}

      {sub === 'overview' && web && <>
        <ProductCards />
        <div className="grid sm:grid-cols-2 gap-3">
          <BranchCard tag="PRODUCTION · what users have now" title="Website & owner app (www.shopos.co.ke)" c={web.liveCommit ?? web.main}
            extra={<div className="text-xs mt-1"><Pill ok text={`Live for ${span(web.liveSince, now)}`} /> <span className="text-slate-500">since {when(web.liveSince)}</span></div>} />
          <BranchCard tag="STAGING · the one you are working on" title="Test copy (shopos-app-staging)" c={web.staging}
            extra={<div className="text-xs mt-1">{web.ahead > 0 ? <Pill ok={false} text={`${web.ahead} change${web.ahead === 1 ? '' : 's'} not on production`} /> : <Pill ok text="Same as production" />}</div>} />
          <BranchCard tag="PRODUCTION · admin" title="Admin portal (admin.shopos.co.ke)" c={adm?.liveCommit ?? adm?.main}
            extra={adm && <div className="text-xs mt-1"><Pill ok text={`Live for ${span(adm.liveSince, now)}`} /> <span className="text-slate-500">since {when(adm.liveSince)}</span></div>} />
          <Card className="p-4 space-y-2"><div className="text-xs text-slate-400">LAST ACTIVITY</div>
            {log[0] ? <div className="text-sm"><b>{log[0].action}</b> · {log[0].app}<div className="text-xs text-slate-500">{when(log[0].at)} · {span(log[0].at, now)} ago</div></div> : <div className="text-sm text-slate-500">Nothing released from here yet.</div>}
            <div className="flex flex-wrap gap-2 pt-1"><button onClick={() => setSub('release')} className="btn-primary text-xs inline-flex items-center gap-1"><Rocket className="w-3 h-3" />Release</button>
              {previous && <button onClick={() => void rollback('web', previous)} disabled={busy} className="btn-secondary text-xs inline-flex items-center gap-1"><Undo2 className="w-3 h-3" />Move to previous production</button>}</div>
          </Card>
        </div>
        <Card className="p-4 space-y-2"><div className="flex items-center gap-2"><Activity className="w-4 h-4 text-field-500" /><h3 className="font-medium text-sm">Are the sites answering?</h3></div>
          <ul className="text-sm space-y-1.5">{pings.map((p) => <li key={p.url} className="flex items-center justify-between gap-2"><span className="truncate text-slate-400">{p.url.replace('https://', '')}</span><Pill ok={p.ok} text={p.ok ? `${p.status} · ${p.ms} ms` : p.status ? `Error ${p.status}` : 'No answer'} /></li>)}</ul>
        </Card>
        <Card className="p-4 space-y-2"><div className="flex items-center gap-2"><Smartphone className="w-4 h-4 text-field-500" /><h3 className="font-medium text-sm">Android apps at a glance</h3></div>
          <ul className="text-sm divide-y divide-slate-700/60">{ANDROID.map((x) => { const m = metas[x.id]; return <li key={x.id} className="py-2 flex items-center justify-between gap-2 flex-wrap"><span>{x.label}</span><span className="text-xs text-slate-400">{m?.version ? `v${m.version} · built ${span(m.builtAt, now)} ago · notifications ${m.push ? 'on' : 'off'}` : 'Not published'}</span></li>; })}</ul>
          <div className="flex gap-2 pt-1"><button onClick={() => setSub('preview')} className="btn-secondary text-xs">Preview apps</button><button onClick={() => onGoNotifications?.()} className="btn-secondary text-xs">Notifications</button></div>
        </Card>
        {web.ahead > 0 && <Card className="p-4"><div className="text-sm"><b>{web.ahead}</b> change{web.ahead === 1 ? '' : 's'} waiting on staging:</div><ul className="text-xs text-slate-500 space-y-1 mt-2 max-h-44 overflow-y-auto">{web.commits.map((c) => <li key={c.sha}>• {c.message} <span className="text-slate-400">({c.short})</span></li>)}</ul></Card>}
      </>}

      {sub === 'analytics' && <PlatformAnalytics supabase={supabase} />}

      {sub === 'release' && web && <div className="space-y-3">
        <div className="flex gap-1.5 overflow-x-auto" role="tablist" aria-label="Release sections">{([['now', 'Running now'], ['release', 'Release'], ['schedule', 'Schedule'], ['previous', 'Previous versions']] as const).map(([id, label]) => (
          <button key={id} role="tab" aria-selected={relTab === id} onClick={() => setRelTab(id)} className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap border ${relTab === id ? 'bg-emerald-600 text-white border-transparent' : 'border-slate-600 text-slate-300'}`}>{label}{id === 'schedule' && sched.some((r) => r.status === 'pending') ? ' •' : ''}</button>))}</div>
        {relTab === 'now' && <>{renderRunning()}{renderAccess()}</>}
        {relTab === 'release' && <>
          <ProductCards />
          <div className="grid md:grid-cols-2 gap-3 items-start">
            {renderRelease()}
            <Card className="p-4 space-y-3"><div className="font-medium text-sm">Everything at once</div><p className="text-xs text-slate-400">Release the website app and the admin portal (when something is waiting) and build all three Android apps.</p>
              <button onClick={() => void everything()} disabled={busy} className="btn-primary w-full inline-flex items-center justify-center gap-2 disabled:!bg-slate-700 disabled:!text-slate-400"><Rocket className="w-4 h-4" />Release everything</button></Card>
          </div>
          <Card className="p-4 text-sm"><div className="font-medium">Building the apps</div><p className="text-xs text-slate-400 mt-1">Android, Windows, Linux and Mac builds are in the Apps menu above.</p></Card>
        </>}
        {relTab === 'schedule' && renderSchedule()}
        {relTab === 'previous' && renderPrevious()}
      </div>}

      {sub === 'history' && <div className="space-y-3">
        <div className="flex flex-wrap gap-2">{([['website', 'Website'], ['owner', 'Owner app (POS)'], ['booker', 'Booker app'], ['admin', 'Admin portal']] as const).map(([k, l]) => <button key={k} onClick={() => setHistProd(k)} className={`text-xs px-3 py-1.5 rounded-full border ${histProd === k ? 'bg-field-500 text-white border-field-500' : 'border-slate-600 text-slate-300'}`}>{l}</button>)}</div>
        {histProd !== 'admin' ? <p className="text-[11px] text-amber-500">The Website, Owner app and Booker app are one web deployment (shopos-app). Moving one back moves all three together.</p> : <p className="text-[11px] text-slate-500">The Admin portal is its own deployment (Shopos-admin).</p>}
        <p className="text-xs text-slate-400">Every version that went to production, newest first. Tap “Move back here” to put production back to that version. Nothing is deleted, so you can release the newer work again.</p>
        {histCodeOnly.length === 0 && <Skeleton rows={3} />}
        <div className="space-y-2">{histCodeOnly.map((c, i) => {
          const newer = histCodeOnly[i - 1]; const liveFor = span(c.date, i === 0 ? now : newer?.date ?? now);
          return <Card key={c.sha} className={`p-4 space-y-1.5 border-l-4 ${i === 0 ? 'border-l-field-500' : 'border-l-slate-600'}`}><div className="flex items-start justify-between gap-2"><div className="min-w-0"><div className="text-sm font-medium">{c.message}</div><div className="text-xs text-slate-500">{c.short} · {c.author ?? ''} · {when(c.date)}</div></div>{i === 0 && <Pill ok text="Live now" />}</div>
            <div className="text-xs text-slate-400">{i === 0 ? 'Live for' : 'Was live for'} {liveFor}</div>
            <div className="flex flex-wrap gap-3 text-xs items-center">{c.url && <A href={c.url}>GitHub</A>}{i > 0 && <button onClick={() => void rollback(histApp, c)} disabled={busy} className="inline-flex items-center gap-1 text-amber-500 hover:underline"><Undo2 className="w-3 h-3" />Move back here</button>}</div></Card>; })}</div>
        {liveCommit && <p className="text-[11px] text-slate-500">Commits that only add the Android app files are hidden here.</p>}
      </div>}

      {sub === 'apps' && <div className="space-y-3">
        <div className="flex gap-1.5">{([['android', 'Android'], ['desktop', 'Desktop'], ['mac', 'Mac']] as const).map(([id, l]) => <button key={id} onClick={() => setAppTab(id)} className={`text-sm px-4 py-1.5 rounded-full border ${appTab === id ? 'bg-field-500 text-white border-field-500' : 'border-slate-600 text-slate-300'}`}>{l}</button>)}</div>
        {appTab === 'android' && <>
        <Card className="p-4 space-y-2"><div className="font-medium text-sm">Build Android apps</div>
          <p className="text-xs text-slate-400">The apps open the live website, so most changes need no new install. Build new apps only when the app itself changed.</p>
          <div className="flex flex-wrap gap-2">{(['all', 'owner', 'admin', 'booker'] as const).map((k) => <button key={k} onClick={() => setPick(k)} className={`text-xs px-3 py-1.5 rounded-full border ${pick === k ? 'bg-field-500 text-white border-field-500' : 'border-slate-600 text-slate-300'}`}>{k === 'all' ? 'All three' : k === 'owner' ? 'Owner app' : k === 'admin' ? 'Admin app' : 'Booker app'}</button>)}</div>
          <div className="flex flex-wrap gap-2"><button onClick={() => void build(pick)} disabled={busy} className="btn-primary text-xs">Build {pick === 'all' ? 'all apps' : `${pick} app`}</button><button onClick={() => void tellPhones(pick)} disabled={busy} className="btn-secondary text-xs">Tell phones it is ready</button></div></Card>
        {ANDROID.map((x) => { const m = metas[x.id]; return (
          <Card key={x.id} className="p-4 space-y-2"><div className="flex items-center justify-between gap-2"><div className="font-medium text-sm">{x.label}</div>{m?.version ? <Pill ok text={`v${m.version}`} /> : <Pill ok={false} text="Not published" />}</div>
            {m && <div className="text-xs text-slate-500 space-y-0.5"><div>Built {when(m.builtAt)}{m.builtAt ? ` · ${span(m.builtAt, now)} ago` : ''}</div><div>Size {mb(m.size)} · {m.signed ? 'signed (installs over the old one)' : 'not signed'} · notifications {m.push ? 'on' : 'off (Firebase file missing)'}</div>{m.sha256 && <div className="break-all">SHA-256 {m.sha256}</div>}</div>}
            <div className="flex flex-wrap gap-2 text-xs"><a href={`${PROD}/downloads/android/${x.file}`} className="btn-secondary inline-flex items-center gap-1"><ExternalLink className="w-3 h-3" />Download</a><button onClick={() => copy(`${PROD}/downloads/android/${x.file}`)} className="btn-secondary inline-flex items-center gap-1"><Copy className="w-3 h-3" />Copy link</button><button onClick={() => void build(x.id)} disabled={busy} className="btn-secondary">Build this app</button><button onClick={() => void tellPhones(x.id)} disabled={busy} className="btn-secondary">Tell phones</button></div></Card>); })}
        <Card className="p-4 space-y-2"><div className="font-medium text-sm">Recent builds</div>
          {runs.length === 0 ? <p className="text-xs text-slate-500">No builds yet.</p> : <ul className="text-sm space-y-1.5">{runs.map((r) => <li key={r.id} className="flex items-center justify-between gap-2"><span className="text-slate-400">#{r.number} · {when(r.at)}</span><span className="flex items-center gap-2"><Pill ok={r.status === 'completed' ? r.conclusion === 'success' : true} text={r.status === 'completed' ? (r.conclusion === 'success' ? 'Done' : r.conclusion ?? 'Stopped') : 'Building…'} /><A href={r.url}>Log</A></span></li>)}</ul>}</Card>
        </>}
        {appTab !== 'android' && <>
        <Card className="p-4 space-y-2"><div className="font-medium text-sm">{appTab === 'mac' ? 'Mac app' : 'Desktop apps (Windows and Linux)'}</div>
          <p className="text-xs text-slate-400">One build makes the Windows, Mac and Linux programs together. When it finishes they appear in the Installer library, and signed-in shop owners can download them from their account.{appTab === 'mac' ? ' The Mac file is not code-signed: on first open, right-click it and choose Open.' : ' Windows may show a SmartScreen warning the first time: More info, then Run anyway.'}</p>
          <div className="flex flex-wrap gap-2"><button onClick={() => void buildDesktop()} disabled={busy} className="btn-primary text-xs">Build {appTab === 'mac' ? 'Mac' : 'desktop'} apps</button><a href={`https://github.com/${APP_REPO}/actions/workflows/desktop-build.yml`} target="_blank" rel="noreferrer" className="btn-secondary text-xs">See the build</a></div></Card>
        <Card className="p-4 space-y-2"><div className="font-medium text-sm">Recent desktop builds</div>
          {deskRuns.length === 0 ? <p className="text-xs text-slate-500">No builds yet.</p> : <ul className="text-sm space-y-1.5">{deskRuns.map((r) => <li key={r.id} className="flex items-center justify-between gap-2"><span className="text-slate-400">#{r.number} · {when(r.at)}</span><a href={r.url} target="_blank" rel="noreferrer" className="text-field-400 underline text-xs">{r.status === 'completed' ? (r.conclusion === 'success' ? 'Done' : 'Failed') : 'Building…'}</a></li>)}</ul>}</Card>
        </>}
      </div>}

      {sub === 'safety' && <DataSafetyPanel supabase={supabase} />}
      {sub === 'preview' && <Preview key={previewStart} start={previewStart} staging={web?.staging} live={web?.liveCommit ?? web?.main} />}

      {sub === 'links' && <Card className="p-4"><ul className="text-sm divide-y divide-slate-700/60">{([
        ['Production app', `${PROD}/`], ['Staging app', `${STAGING}/`], ['Admin portal', `${ADMIN}/`], ['Booker app page', `${PROD}/book/app`],
        ['Owner app (APK)', `${PROD}/downloads/android/ShopOS.apk`], ['Admin app (APK)', `${PROD}/downloads/android/ShopOS-Admin.apk`], ['Booker app (APK)', `${PROD}/downloads/android/ShopOS-Booker.apk`],
        ['Website app on GitHub', `https://github.com/${APP_REPO}`], ['Admin portal on GitHub', `https://github.com/${ADMIN_REPO}`], ['Android builds (GitHub Actions)', `https://github.com/${APP_REPO}/actions/workflows/android-build.yml`],
        ['Vercel: website app', 'https://vercel.com/darius2322s-projects/shopos-app'], ['Vercel: admin portal', 'https://vercel.com/darius2322s-projects/shopos-admin'],
        ['Supabase project', 'https://supabase.com/dashboard/project/frhhldkotckfexsegtjx'], ['Cloudflare Turnstile', 'https://dash.cloudflare.com/?to=/:account/turnstile'], ['Firebase console', 'https://console.firebase.google.com/']] as [string, string][]).map(([l, u]) =>
        <li key={u} className="py-2 flex items-start justify-between gap-2"><div className="min-w-0"><div className="text-xs text-slate-400">{l}</div><A href={u}>{u.replace('https://', '')}</A></div><button onClick={() => copy(u)} aria-label={`Copy ${l}`} className="p-1.5 text-slate-400 hover:text-ink shrink-0"><Copy className="w-4 h-4" /></button></li>)}</ul></Card>}

      {sub === 'activity' && <div className="space-y-2">
        {log.length === 0 && !loading && <p className="text-sm text-slate-500">Nothing has been released from here yet. Releases, roll backs and builds you start on this page appear here.</p>}
        {log.map((l) => <Card key={l.id} className="p-3"><div className="flex items-center justify-between gap-2"><span className="text-sm font-medium capitalize">{l.action} · {l.app}</span><span className="text-xs text-slate-500">{when(l.at)}</span></div>
          {l.note && <div className="text-xs text-slate-400 mt-0.5">{l.note}</div>}{(l.from_sha || l.to_sha) && <div className="text-xs text-slate-500 mt-0.5">{l.from_sha?.slice(0, 7) ?? '—'} → {l.to_sha?.slice(0, 7) ?? '—'}</div>}</Card>)}
      </div>}
    </div>
  );
}
