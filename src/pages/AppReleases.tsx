import { useEffect, useState } from 'react';
import { SupabaseClient } from '@supabase/supabase-js';
import { Plus, X, Pencil, Trash2, Eye, EyeOff, GitBranch, RefreshCw, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { Card, EmptyState, ErrorText, Skeleton, StatusBadge } from '../components/ui';

interface Release {
  id: string;
  target_app: 'shopos_app' | 'admin_portal';
  version: string;
  summary: string;
  release_notes: string | null;
  release_date: string;
  minimum_supported_version: string | null;
  mandatory: boolean;
  published: boolean;
  commit_sha?: string | null;
  source?: string;
  created_at: string;
  updated_at: string;
}

interface GhInfo { repo: string; branch: string; sha: string; shortSha: string; commitMessage: string; commitDate: string; author?: string; pkgVersion: string | null; lastReleaseVersion: string | null; lastReleaseSha: string | null; alreadyReleased: boolean; needsBump: boolean; suggestedVersion: string; summary: string; notes: string[]; commitCount: number }
type Prefill = { version: string; summary: string; notes: string; sha: string; target: Release['target_app'] };

const TARGET_LABEL: Record<Release['target_app'], string> = { shopos_app: 'ShopOS App', admin_portal: 'Admin Portal' };

/** Release/changelog management for both target apps. Deliberately one
 * shared list with a clear target-app column and filter, rather than two
 * separate CRUDs — the spec's core requirement here is that a ShopOS-app
 * release can never accidentally show up as an admin-portal release (or
 * vice versa), and a single table with an always-visible, always-required
 * target field makes that mistake harder to make than two similar-looking
 * screens would. */
export default function AppReleases({ supabase }: { supabase: SupabaseClient }) {
  const [releases, setReleases] = useState<Release[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | Release['target_app']>('all');
  const [editing, setEditing] = useState<Release | 'new' | null>(null);
  const [prefill, setPrefill] = useState<Prefill | null>(null);

  async function load() {
    const { data, error } = await supabase.from('app_releases').select('*').order('target_app').order('release_date', { ascending: false });
    if (error) setError(error.message);
    else setReleases(data as Release[]);
  }
  useEffect(() => { load(); }, []);

  async function togglePublished(r: Release) {
    setError(null);
    const { error } = await supabase.from('app_releases').update({ published: !r.published, updated_at: new Date().toISOString() }).eq('id', r.id);
    if (error) setError(error.message); else load();
  }

  async function remove(r: Release) {
    if (!confirm(`Delete release ${r.version} (${TARGET_LABEL[r.target_app]})? This can't be undone.`)) return;
    setError(null);
    const { error } = await supabase.from('app_releases').delete().eq('id', r.id);
    if (error) setError(error.message); else load();
  }

  const shown = releases?.filter((r) => filter === 'all' || r.target_app === filter) ?? [];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-display font-semibold text-lg">App Updates</h2>
          <p className="text-xs text-slate-400 mt-0.5">Release history shown to users inside the ShopOS app and (separately) the admin portal.</p>
        </div>
        <button onClick={() => setEditing('new')} className="btn-primary flex items-center gap-1.5 text-sm shrink-0">
          <Plus className="w-4 h-4" /> New release
        </button>
      </div>

      <ErrorText>{error}</ErrorText>

      <GitHubSync supabase={supabase} onUse={(p) => { setPrefill(p); setEditing('new'); }} />

      <div className="flex gap-1.5">
        {(['all', 'shopos_app', 'admin_portal'] as const).map((f) => (
          <button key={f} onClick={() => setFilter(f)} className={`text-xs font-medium px-3 py-1.5 rounded-full ${filter === f ? 'bg-field-600 text-paper' : 'bg-slate-800 text-slate-400'}`}>
            {f === 'all' ? 'All' : TARGET_LABEL[f]}
          </button>
        ))}
      </div>

      {releases === null ? (
        <Skeleton />
      ) : shown.length === 0 ? (
        <EmptyState message="No releases yet." />
      ) : (
        <div className="space-y-2">
          {shown.map((r) => (
            <Card key={r.id} className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap mb-1">
                  <span className="font-medium text-sm">v{r.version}</span>
                  <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-slate-800 text-slate-400">{TARGET_LABEL[r.target_app]}</span>
                  <StatusBadge status={r.published ? 'active' : 'pending'} />
                  {r.mandatory && <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-rust-500/20 text-rust-500">Mandatory</span>}
                </div>
                <p className="text-sm text-slate-300">{r.summary}</p>
                <p className="text-xs text-slate-500 mt-1">{new Date(r.release_date).toLocaleDateString()}{r.minimum_supported_version ? ` · min. supported v${r.minimum_supported_version}` : ''}</p>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <button onClick={() => togglePublished(r)} title={r.published ? 'Unpublish' : 'Publish'} className="p-1.5 text-slate-400 hover:text-ink">
                  {r.published ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
                <button onClick={() => setEditing(r)} title="Edit" className="p-1.5 text-slate-400 hover:text-ink"><Pencil className="w-4 h-4" /></button>
                <button onClick={() => remove(r)} title="Delete" className="p-1.5 text-slate-400 hover:text-rust-500"><Trash2 className="w-4 h-4" /></button>
              </div>
            </Card>
          ))}
        </div>
      )}

      {editing && (
        <ReleaseModal
          supabase={supabase}
          release={editing === 'new' ? null : editing}
          prefill={editing === 'new' ? prefill : null}
          onClose={() => { setEditing(null); setPrefill(null); }}
          onSaved={() => { setEditing(null); setPrefill(null); load(); }}
        />
      )}
    </div>
  );
}

function ReleaseModal({ supabase, release, prefill, onClose, onSaved }: { supabase: SupabaseClient; release: Release | null; prefill: Prefill | null; onClose: () => void; onSaved: () => void }) {
  const [targetApp, setTargetApp] = useState<Release['target_app']>(release?.target_app ?? prefill?.target ?? 'shopos_app');
  const [version, setVersion] = useState(release?.version ?? prefill?.version ?? '');
  const [summary, setSummary] = useState(release?.summary ?? prefill?.summary ?? '');
  const [releaseNotes, setReleaseNotes] = useState(release?.release_notes ?? prefill?.notes ?? '');
  const [releaseDate, setReleaseDate] = useState(release?.release_date ?? new Date().toISOString().slice(0, 10));
  const [minVersion, setMinVersion] = useState(release?.minimum_supported_version ?? '');
  const [mandatory, setMandatory] = useState(release?.mandatory ?? false);
  const [published, setPublished] = useState(release?.published ?? !!prefill);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function submit() {
    setError(null);
    if (!version.trim() || !summary.trim()) { setError('Version and summary are required'); return; }
    setSaving(true);
    try {
      const payload = {
        target_app: targetApp, version: version.trim(), summary: summary.trim(),
        release_notes: releaseNotes.trim() || null, release_date: releaseDate,
        minimum_supported_version: minVersion.trim() || null, mandatory, published,
        ...(prefill && !release ? { commit_sha: prefill.sha, source: 'github' } : {}),
        updated_at: new Date().toISOString()
      };
      const { error } = release
        ? await supabase.from('app_releases').update(payload).eq('id', release.id)
        : await supabase.from('app_releases').insert(payload);
      if (error) throw error;
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save release');
    } finally { setSaving(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center md:justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative w-full md:max-w-md bg-paper border border-slate-700 rounded-t-2xl md:rounded-2xl p-5 space-y-3 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between">
          <h3 className="font-display font-semibold text-lg">{release ? 'Edit release' : prefill ? 'Publish from GitHub' : 'New release'}</h3>
          {prefill && <span className="text-[11px] text-slate-400">Filled from commit {prefill.sha.slice(0, 7)}. Check it, then save.</span>}
          <button onClick={onClose}><X className="w-5 h-5" /></button>
        </div>

        <label className="block">
          <span className="block text-xs font-medium text-slate-400 mb-1">Target application</span>
          <select className="input" value={targetApp} onChange={(e) => setTargetApp(e.target.value as Release['target_app'])} disabled={!!release}>
            <option value="shopos_app">ShopOS App</option>
            <option value="admin_portal">Admin Portal</option>
          </select>
          {release && <span className="text-[11px] text-slate-500">Can't change the target app of an existing release — create a new one instead.</span>}
        </label>

        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="block text-xs font-medium text-slate-400 mb-1">Version</span>
            <input className="input" placeholder="2.4.0" value={version} onChange={(e) => setVersion(e.target.value)} />
          </label>
          <label className="block">
            <span className="block text-xs font-medium text-slate-400 mb-1">Release date</span>
            <input className="input" type="date" value={releaseDate} onChange={(e) => setReleaseDate(e.target.value)} />
          </label>
        </div>

        <label className="block">
          <span className="block text-xs font-medium text-slate-400 mb-1">Summary</span>
          <input className="input" placeholder="Faster sync and a redesigned login screen" value={summary} onChange={(e) => setSummary(e.target.value)} />
        </label>

        <label className="block">
          <span className="block text-xs font-medium text-slate-400 mb-1">Changelog (one line per change)</span>
          <textarea className="input" rows={4} placeholder={'Improved offline mode\nFaster synchronization\nImproved biometric login'} value={releaseNotes} onChange={(e) => setReleaseNotes(e.target.value)} />
        </label>

        <label className="block">
          <span className="block text-xs font-medium text-slate-400 mb-1">Minimum supported version (optional)</span>
          <input className="input" placeholder="Leave blank if not enforcing a minimum" value={minVersion} onChange={(e) => setMinVersion(e.target.value)} />
        </label>

        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={mandatory} onChange={(e) => setMandatory(e.target.checked)} /> Mandatory update
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={published} onChange={(e) => setPublished(e.target.checked)} /> Published: push to the app now (users are notified)
        </label>

        {error && <p className="text-sm text-rust-500">{error}</p>}
        <button onClick={submit} disabled={saving} className="btn-primary w-full">{saving ? 'Saving…' : 'Save release'}</button>
      </div>
    </div>
  );
}

const GH_KEY = 'shopos-admin:gh-repo';
const DEFAULT_REPO: Record<Release['target_app'], string> = { shopos_app: 'Darius2322/shopos-app', admin_portal: 'Darius2322/shopos-admin' };

/** Looks at GitHub for the newest commit and turns it into a ready-to-publish release: version from package.json,
 * summary and changelog from the commit messages since the last release. One click then pushes it to the app. */
function GitHubSync({ supabase, onUse }: { supabase: SupabaseClient; onUse: (p: Prefill) => void }) {
  const [target, setTarget] = useState<Release['target_app']>('shopos_app');
  const [repo, setRepo] = useState(() => { try { return JSON.parse(localStorage.getItem(GH_KEY) ?? '{}'); } catch { return {}; } });
  const [busy, setBusy] = useState(false); const [err, setErr] = useState<string | null>(null); const [info, setInfo] = useState<GhInfo | null>(null);
  const repoName = repo[target] ?? DEFAULT_REPO[target];

  async function check() {
    setBusy(true); setErr(null); setInfo(null);
    try { localStorage.setItem(GH_KEY, JSON.stringify({ ...repo, [target]: repoName })); } catch { /* ignore */ }
    const { data, error } = await supabase.functions.invoke('github-latest-release', { body: { repo: repoName, branch: 'main', target } });
    setBusy(false);
    if (error || (data as any)?.error) {
      const code = (data as any)?.error; const hint = (data as any)?.hint;
      setErr(code === 'repo_not_found' ? (hint ?? 'Repository not found.') : code === 'repo_not_allowed' ? 'That repository owner is not allowed.' : code === 'not_authorized' ? 'Only platform admins can do this.' : 'Could not reach GitHub. Try again.');
      return;
    }
    setInfo(data as GhInfo);
  }
  return (
    <div className="rounded-2xl border border-slate-700 p-4 space-y-3">
      <div className="flex items-center gap-2"><GitBranch className="w-4 h-4 text-field-500" /><h3 className="font-medium text-sm">Publish from GitHub</h3></div>
      <p className="text-xs text-slate-400">After you push to GitHub, check for the new version here. The form fills itself in, then one tap sends it to the app.</p>
      <div className="flex gap-2">
        <select className="input !w-auto" value={target} onChange={(e) => { setTarget(e.target.value as Release['target_app']); setInfo(null); setErr(null); }} aria-label="App">
          <option value="shopos_app">ShopOS App</option><option value="admin_portal">Admin Portal</option>
        </select>
        <input className="input flex-1 min-w-0" value={repoName} onChange={(e) => setRepo({ ...repo, [target]: e.target.value })} aria-label="GitHub repository" placeholder="owner/repository" />
        <button onClick={check} disabled={busy} className="btn-primary flex items-center gap-1.5 text-sm shrink-0"><RefreshCw className={`w-4 h-4 ${busy ? 'animate-spin' : ''}`} /> Check</button>
      </div>
      {err && <p className="text-sm text-rust-500 flex gap-2"><AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />{err}</p>}
      {info && (
        <div className="rounded-xl bg-slate-800/60 p-3 space-y-2 text-sm">
          <div className="flex justify-between gap-2"><span className="text-slate-400">Latest commit</span><span className="font-mono text-xs">{info.shortSha}</span></div>
          <p className="text-slate-200">{info.commitMessage}</p>
          <p className="text-xs text-slate-500">{info.author ? `${info.author} · ` : ''}{new Date(info.commitDate).toLocaleString()} · package.json says v{info.pkgVersion ?? '?'} · last release {info.lastReleaseVersion ? `v${info.lastReleaseVersion}` : 'none'}</p>
          {info.alreadyReleased ? (
            <p className="text-xs text-field-500 flex items-center gap-1.5"><CheckCircle2 className="w-4 h-4" /> This commit is already published. Push new code to GitHub to release again.</p>
          ) : (
            <>
              {info.needsBump && <p className="text-xs text-amber-500 flex gap-1.5"><AlertTriangle className="w-4 h-4 shrink-0" /> package.json still says v{info.pkgVersion}. The app will update, but its version number stays the same until you bump it. Suggested next number: v{info.suggestedVersion}.</p>}
              <button onClick={() => onUse({ version: info.suggestedVersion, summary: info.summary, notes: info.notes.join('\n'), sha: info.sha, target })} className="btn-primary w-full text-sm">Review and push v{info.suggestedVersion} to the app</button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
