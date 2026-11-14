import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { SupabaseClient } from '@supabase/supabase-js';
import { Rocket, ExternalLink, RefreshCw, CheckCircle2, XCircle, Smartphone, History, Link2, ScrollText, LayoutDashboard, Undo2, Copy, Activity } from 'lucide-react';
import { Card, Skeleton } from '../components/ui';
import { askConfirm, showAlert } from '../lib/dialog';

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
type Sub = 'overview' | 'release' | 'history' | 'apps' | 'links' | 'activity';
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
const SUBS: [Sub, string, typeof Rocket][] = [['overview', 'Overview', LayoutDashboard], ['release', 'Release', Rocket], ['history', 'History & roll back', History], ['apps', 'Android apps', Smartphone], ['links', 'Links', Link2], ['activity', 'Activity log', ScrollText]];

/** Go live: its own menu. What is on staging and production and for how long, releasing one app or all, moving back to an earlier version,
 * the Android apps, every link, and a log of who released what. */
export default function GoLive({ supabase }: { supabase: SupabaseClient }) {
  const [sub, setSub] = useState<Sub>('overview');
  const [web, setWeb] = useState<St | null>(null); const [adm, setAdm] = useState<St | null>(null);
  const [hist, setHist] = useState<Br[]>([]); const [histApp, setHistApp] = useState<'web' | 'admin'>('web');
  const [runs, setRuns] = useState<Run[]>([]); const [metas, setMetas] = useState<Record<string, Meta | null>>({});
  const [pings, setPings] = useState<Ping[]>([]); const [log, setLog] = useState<LogRow[]>([]);
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
        {web.ahead > 0 && <Card className="p-4"><div className="text-sm"><b>{web.ahead}</b> change{web.ahead === 1 ? '' : 's'} waiting on staging:</div><ul className="text-xs text-slate-500 space-y-1 mt-2 max-h-44 overflow-y-auto">{web.commits.map((c) => <li key={c.sha}>• {c.message} <span className="text-slate-400">({c.short})</span></li>)}</ul></Card>}
      </>}

      {sub === 'release' && web && <div className="space-y-3">
        <Card className="p-4 space-y-2"><div className="font-medium text-sm">Website & owner app</div>
          <p className="text-xs text-slate-400">{web.ahead === 0 ? 'Production is up to date with staging.' : `${web.ahead} change${web.ahead === 1 ? '' : 's'} on staging are not on production.`}</p>
          <div className="flex flex-wrap gap-2"><a href={STAGING} target="_blank" rel="noreferrer" className="btn-secondary text-xs inline-flex items-center gap-1"><ExternalLink className="w-3 h-3" />Test on staging</a>
            <button onClick={() => void releaseOne('web')} disabled={busy || web.ahead === 0} className="btn-primary text-xs inline-flex items-center gap-1 disabled:opacity-50"><Rocket className="w-3 h-3" />Release website app</button></div></Card>
        <Card className="p-4 space-y-2"><div className="font-medium text-sm">Admin portal</div>
          {adm?.staging ? <><p className="text-xs text-slate-400">{adm.ahead === 0 ? 'Production is up to date with staging.' : `${adm.ahead} change${adm.ahead === 1 ? '' : 's'} waiting on staging.`}</p>
            <button onClick={() => void releaseOne('admin')} disabled={busy || adm.ahead === 0} className="btn-primary text-xs inline-flex items-center gap-1 disabled:opacity-50"><Rocket className="w-3 h-3" />Release admin portal</button></>
            : <p className="text-xs text-slate-400">The admin portal has no staging copy: it goes live as soon as it is pushed to GitHub. You can still move it back to an earlier version in History.</p>}</Card>
        <Card className="p-4 space-y-2"><div className="font-medium text-sm">Android apps</div>
          <p className="text-xs text-slate-400">The apps open the live website, so most changes need no new install. Build new apps only when the app itself changed.</p>
          <div className="flex flex-wrap gap-2">{(['all', 'owner', 'admin', 'booker'] as const).map((k) => <button key={k} onClick={() => setPick(k)} className={`text-xs px-3 py-1.5 rounded-full border ${pick === k ? 'bg-field-500 text-white border-field-500' : 'border-slate-600 text-slate-300'}`}>{k === 'all' ? 'All three' : k === 'owner' ? 'Owner app' : k === 'admin' ? 'Admin app' : 'Booker app'}</button>)}</div>
          <div className="flex flex-wrap gap-2"><button onClick={() => void build(pick)} disabled={busy} className="btn-primary text-xs">Build {pick === 'all' ? 'all apps' : `${pick} app`}</button><button onClick={() => void tellPhones(pick)} disabled={busy} className="btn-secondary text-xs">Tell phones it is ready</button></div></Card>
        <Card className="p-4 space-y-2"><div className="font-medium text-sm">Everything at once</div><p className="text-xs text-slate-400">Release the website app and the admin portal (when something is waiting) and build all three Android apps.</p>
          <button onClick={() => void everything()} disabled={busy} className="btn-primary w-full inline-flex items-center justify-center gap-2"><Rocket className="w-4 h-4" />Release everything</button></Card>
      </div>}

      {sub === 'history' && <div className="space-y-3">
        <div className="flex gap-2">{(['web', 'admin'] as const).map((k) => <button key={k} onClick={() => setHistApp(k)} className={`text-xs px-3 py-1.5 rounded-full border ${histApp === k ? 'bg-field-500 text-white border-field-500' : 'border-slate-600 text-slate-300'}`}>{k === 'web' ? 'Website & owner app' : 'Admin portal'}</button>)}</div>
        <p className="text-xs text-slate-400">Every version that went to production, newest first. Tap “Move back here” to put production back to that version. Nothing is deleted, so you can release the newer work again.</p>
        {histCodeOnly.length === 0 && <Skeleton rows={3} />}
        <div className="space-y-2">{histCodeOnly.map((c, i) => {
          const newer = histCodeOnly[i - 1]; const liveFor = span(c.date, i === 0 ? now : newer?.date ?? now);
          return <Card key={c.sha} className="p-3 space-y-1"><div className="flex items-start justify-between gap-2"><div className="min-w-0"><div className="text-sm font-medium">{c.message}</div><div className="text-xs text-slate-500">{c.short} · {c.author ?? ''} · {when(c.date)}</div></div>{i === 0 && <Pill ok text="Live now" />}</div>
            <div className="text-xs text-slate-400">{i === 0 ? 'Live for' : 'Was live for'} {liveFor}</div>
            <div className="flex flex-wrap gap-3 text-xs items-center">{c.url && <A href={c.url}>GitHub</A>}{i > 0 && <button onClick={() => void rollback(histApp, c)} disabled={busy} className="inline-flex items-center gap-1 text-amber-500 hover:underline"><Undo2 className="w-3 h-3" />Move back here</button>}</div></Card>; })}</div>
        {liveCommit && <p className="text-[11px] text-slate-500">Commits that only add the Android app files are hidden here.</p>}
      </div>}

      {sub === 'apps' && <div className="space-y-3">
        {ANDROID.map((x) => { const m = metas[x.id]; return (
          <Card key={x.id} className="p-4 space-y-2"><div className="flex items-center justify-between gap-2"><div className="font-medium text-sm">{x.label}</div>{m?.version ? <Pill ok text={`v${m.version}`} /> : <Pill ok={false} text="Not published" />}</div>
            {m && <div className="text-xs text-slate-500 space-y-0.5"><div>Built {when(m.builtAt)}{m.builtAt ? ` · ${span(m.builtAt, now)} ago` : ''}</div><div>Size {mb(m.size)} · {m.signed ? 'signed (installs over the old one)' : 'not signed'} · notifications {m.push ? 'on' : 'off (Firebase file missing)'}</div>{m.sha256 && <div className="break-all">SHA-256 {m.sha256}</div>}</div>}
            <div className="flex flex-wrap gap-2 text-xs"><a href={`${PROD}/downloads/android/${x.file}`} className="btn-secondary inline-flex items-center gap-1"><ExternalLink className="w-3 h-3" />Download</a><button onClick={() => copy(`${PROD}/downloads/android/${x.file}`)} className="btn-secondary inline-flex items-center gap-1"><Copy className="w-3 h-3" />Copy link</button><button onClick={() => void build(x.id)} disabled={busy} className="btn-secondary">Build this app</button><button onClick={() => void tellPhones(x.id)} disabled={busy} className="btn-secondary">Tell phones</button></div></Card>); })}
        <Card className="p-4 space-y-2"><div className="font-medium text-sm">Recent builds</div>
          {runs.length === 0 ? <p className="text-xs text-slate-500">No builds yet.</p> : <ul className="text-sm space-y-1.5">{runs.map((r) => <li key={r.id} className="flex items-center justify-between gap-2"><span className="text-slate-400">#{r.number} · {when(r.at)}</span><span className="flex items-center gap-2"><Pill ok={r.status === 'completed' ? r.conclusion === 'success' : true} text={r.status === 'completed' ? (r.conclusion === 'success' ? 'Done' : r.conclusion ?? 'Stopped') : 'Building…'} /><A href={r.url}>Log</A></span></li>)}</ul>}</Card>
      </div>}

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
