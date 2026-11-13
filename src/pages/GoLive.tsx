import { useCallback, useEffect, useState } from 'react';
import { SupabaseClient } from '@supabase/supabase-js';
import { Rocket, ExternalLink, RefreshCw, GitBranch, CheckCircle2, Smartphone } from 'lucide-react';
import { Card, Skeleton } from '../components/ui';
import { askConfirm, showAlert } from '../lib/dialog';

const STAGING_URL = 'https://shopos-app-staging.vercel.app';
const PROD_URL = 'https://www.shopos.co.ke';
const GH_KEY = 'shopos-admin:gh-repo';
interface Br { sha: string; short: string; message: string; date?: string; author?: string }
interface St { repo: string; staging: Br; main: Br; ahead: number; behind: number; commits: Br[]; build: { status?: string; conclusion?: string | null; at?: string } | null }

const when = (d?: string) => (d ? new Date(d).toLocaleString('en-KE', { timeZone: 'Africa/Nairobi', dateStyle: 'medium', timeStyle: 'short' }) : '');
const ERR: Record<string, string> = {
  token_missing: 'GitHub is not connected yet. In Supabase → Edge Functions → Secrets add GITHUB_TOKEN (a GitHub token with write access to the app repository).',
  token_invalid: 'The GitHub token was refused. Make a new one and replace GITHUB_TOKEN in Supabase.',
  token_cannot_write: 'The GitHub token cannot change this repository. Give it Contents and Actions write access.',
  repo_not_found: 'Repository not found. Check the name above.',
  conflict: 'Staging and production have conflicting changes. Fix it in GitHub first.',
  not_authorized: 'Only platform admins can do this.',
};

/** Go live: shows what is on the staging copy and on production, and moves staging to production with one tap. */
export default function GoLive({ supabase }: { supabase: SupabaseClient }) {
  const [repo, setRepo] = useState(() => { try { return (JSON.parse(localStorage.getItem(GH_KEY) ?? '{}') as Record<string, string>).shopos_app ?? 'Darius2322/shopos-app'; } catch { return 'Darius2322/shopos-app'; } });
  const [st, setSt] = useState<St | null>(null); const [busy, setBusy] = useState(false); const [err, setErr] = useState<string | null>(null); const [done, setDone] = useState<string | null>(null);

  const call = useCallback(async (action: string, extra: Record<string, unknown> = {}) => {
    const { data, error } = await supabase.functions.invoke('github-release', { body: { repo, action, ...extra } });
    if (error) return { error: 'failed' } as { error: string };
    return data as Record<string, any>;
  }, [supabase, repo]);

  const load = useCallback(async () => {
    setBusy(true); setErr(null);
    try { const all = JSON.parse(localStorage.getItem(GH_KEY) ?? '{}'); localStorage.setItem(GH_KEY, JSON.stringify({ ...all, shopos_app: repo })); } catch { /* ignore */ }
    const d = await call('status'); setBusy(false);
    if (d.error) { setSt(null); setErr(ERR[d.error as string] ?? 'Could not reach GitHub. Try again.'); return; }
    setSt(d as unknown as St);
  }, [call, repo]);
  useEffect(() => { void load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function promote() {
    if (!st) return;
    if (!(await askConfirm(`Send ${st.ahead} change${st.ahead === 1 ? '' : 's'} from staging to production? Real users get it in about a minute.`))) return;
    setBusy(true); setErr(null); setDone(null);
    const d = await call('promote', { message: `Release: ${st.staging.message}`.slice(0, 150) });
    setBusy(false);
    if (d.error) { setErr(ERR[d.error as string] ?? 'Could not release. Try again.'); return; }
    setDone(d.nothing ? 'Production already has everything from staging.' : `Released to production (${d.short}). The website updates in about a minute.`);
    void load();
  }
  async function buildApk() {
    if (!(await askConfirm('Build new Android apps (owner, admin, booker) from production now? It takes about 10 minutes.'))) return;
    setBusy(true); const d = await call('build_apk'); setBusy(false);
    if (d.error) { setErr(ERR[d.error as string] ?? 'Could not start the build.'); return; }
    void showAlert('The Android build has started. The new apps appear on the download links in about 10 minutes.'); void load();
  }

  const same = st && st.ahead === 0;
  return (
    <div className="space-y-4">
      <Card className="p-4 space-y-3">
        <div className="flex items-center gap-2"><Rocket className="w-4 h-4 text-field-500" /><h3 className="font-medium text-sm">Staging → Production</h3></div>
        <p className="text-xs text-slate-400">Test on the staging app first. When you are happy, send it to production here. The admin portal itself goes live as soon as it is pushed.</p>
        <div className="flex flex-wrap gap-2">
          <a href={STAGING_URL} target="_blank" rel="noreferrer" className="btn-secondary text-xs inline-flex items-center gap-1"><ExternalLink className="w-3 h-3" />Open staging app</a>
          <a href={PROD_URL} target="_blank" rel="noreferrer" className="btn-secondary text-xs inline-flex items-center gap-1"><ExternalLink className="w-3 h-3" />Open production app</a>
        </div>
        <div className="flex items-center gap-2"><GitBranch className="w-4 h-4 text-slate-400" /><input className="input flex-1 min-w-0" value={repo} onChange={(e) => setRepo(e.target.value)} aria-label="GitHub repository" placeholder="owner/repository" /><button onClick={() => void load()} disabled={busy} className="btn-secondary text-xs inline-flex items-center gap-1"><RefreshCw className={`w-3 h-3 ${busy ? 'animate-spin' : ''}`} />Check</button></div>
      </Card>
      {err && <p className="text-sm text-rust-500">{err}</p>}
      {done && <p className="text-sm text-field-500 flex items-center gap-1.5"><CheckCircle2 className="w-4 h-4" />{done}</p>}
      {busy && !st && <Skeleton rows={3} />}
      {st && <>
        <div className="grid sm:grid-cols-2 gap-3">
          <Card className="p-4"><div className="text-xs text-slate-400">STAGING · the one you are working on</div><div className="font-medium mt-1">{st.staging.message}</div><div className="text-xs text-slate-500 mt-1">{st.staging.short} · {when(st.staging.date)}</div></Card>
          <Card className="p-4"><div className="text-xs text-slate-400">PRODUCTION · what users have now</div><div className="font-medium mt-1">{st.main.message}</div><div className="text-xs text-slate-500 mt-1">{st.main.short} · {when(st.main.date)}</div></Card>
        </div>
        <Card className="p-4 space-y-3">
          {same ? <p className="text-sm flex items-center gap-1.5 text-field-500"><CheckCircle2 className="w-4 h-4" />Production is up to date with staging.</p>
            : <><p className="text-sm"><b>{st.ahead}</b> change{st.ahead === 1 ? '' : 's'} on staging {st.ahead === 1 ? 'is' : 'are'} not on production yet:</p>
              <ul className="text-xs text-slate-500 space-y-1 max-h-56 overflow-y-auto">{st.commits.map((c) => <li key={c.sha}>• {c.message} <span className="text-slate-400">({c.short})</span></li>)}</ul></>}
          <button onClick={() => void promote()} disabled={busy || !!same} className="btn-primary w-full inline-flex items-center justify-center gap-2 disabled:opacity-50"><Rocket className="w-4 h-4" />Release to production</button>
        </Card>
        <Card className="p-4 space-y-2">
          <div className="flex items-center gap-2"><Smartphone className="w-4 h-4 text-field-500" /><h3 className="font-medium text-sm">Android apps</h3></div>
          <p className="text-xs text-slate-400">The apps open the live website, so most changes need no new install. Build new apps only when the app shell itself changed.{st.build ? ` Last build: ${st.build.status === 'completed' ? (st.build.conclusion === 'success' ? 'succeeded' : st.build.conclusion) : st.build.status}, ${when(st.build.at)}.` : ''}</p>
          <button onClick={() => void buildApk()} disabled={busy} className="btn-secondary text-xs">Build Android apps now</button>
        </Card>
      </>}
    </div>
  );
}
