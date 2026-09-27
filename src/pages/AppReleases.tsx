import { useEffect, useState } from 'react';
import { SupabaseClient } from '@supabase/supabase-js';
import { Plus, X, Pencil, Trash2, Eye, EyeOff } from 'lucide-react';
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
  created_at: string;
  updated_at: string;
}

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
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); load(); }}
        />
      )}
    </div>
  );
}

function ReleaseModal({ supabase, release, onClose, onSaved }: { supabase: SupabaseClient; release: Release | null; onClose: () => void; onSaved: () => void }) {
  const [targetApp, setTargetApp] = useState<Release['target_app']>(release?.target_app ?? 'shopos_app');
  const [version, setVersion] = useState(release?.version ?? '');
  const [summary, setSummary] = useState(release?.summary ?? '');
  const [releaseNotes, setReleaseNotes] = useState(release?.release_notes ?? '');
  const [releaseDate, setReleaseDate] = useState(release?.release_date ?? new Date().toISOString().slice(0, 10));
  const [minVersion, setMinVersion] = useState(release?.minimum_supported_version ?? '');
  const [mandatory, setMandatory] = useState(release?.mandatory ?? false);
  const [published, setPublished] = useState(release?.published ?? false);
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
          <h3 className="font-display font-semibold text-lg">{release ? 'Edit release' : 'New release'}</h3>
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
          <input type="checkbox" checked={published} onChange={(e) => setPublished(e.target.checked)} /> Published (visible to users)
        </label>

        {error && <p className="text-sm text-rust-500">{error}</p>}
        <button onClick={submit} disabled={saving} className="btn-primary w-full">{saving ? 'Saving…' : 'Save release'}</button>
      </div>
    </div>
  );
}
