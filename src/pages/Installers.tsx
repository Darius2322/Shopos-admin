import { useCallback, useEffect, useState } from 'react';
import { SupabaseClient } from '@supabase/supabase-js';
import { Card } from '../components/ui';
import { DesktopSetups } from '../components/DesktopSetups';
import { friendlyError } from '../lib/friendlyError';
import { CheckCircle2, AlertTriangle, Link2, Loader2 } from 'lucide-react';

type Platform = 'windows' | 'mac' | 'linux';
type Arch = 'x64' | 'ia32' | 'arm64' | 'universal';
const ARCHES: Record<Platform, { id: Arch; label: string }[]> = {
  windows: [{ id: 'x64', label: '64-bit (most tills)' }, { id: 'ia32', label: '32-bit (older tills)' }, { id: 'arm64', label: 'ARM' }],
  mac: [{ id: 'universal', label: 'Intel + Apple chip' }, { id: 'x64', label: 'Intel only' }, { id: 'arm64', label: 'Apple chip only' }],
  linux: [{ id: 'x64', label: '64-bit' }, { id: 'arm64', label: 'ARM (Raspberry Pi)' }]
};
const LABEL: Record<Platform, string> = { windows: 'Windows', mac: 'Mac', linux: 'Linux' };
const clean = (s: string) => s.replace(/[^A-Za-z0-9._-]/g, '_').slice(0, 120);

interface Status { total: number; current: Record<Platform, number>; downloads: number }

/** The Installers menu: what owners can download right now, how to add more, and the full library. */
export default function Installers({ supabase }: { supabase: SupabaseClient }) {
  const [status, setStatus] = useState<Status | null>(null);
  const [key, setKey] = useState(0);
  const [platform, setPlatform] = useState<Platform>('windows');
  const [arch, setArch] = useState<Arch>('x64');
  const [version, setVersion] = useState('');
  const [url, setUrl] = useState('');
  const [fileName, setFileName] = useState('');
  const [notes, setNotes] = useState('');
  const [makeCurrent, setMakeCurrent] = useState(true);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const load = useCallback(async () => {
    const [r, d] = await Promise.all([
      supabase.from('desktop_releases').select('platform, is_current, published').limit(500),
      supabase.from('desktop_downloads').select('id', { count: 'exact', head: true })
    ]);
    const rows = (r.data ?? []) as { platform: Platform; is_current: boolean; published: boolean }[];
    const current: Record<Platform, number> = { windows: 0, mac: 0, linux: 0 };
    for (const x of rows) if (x.is_current && x.published) current[x.platform] += 1;
    setStatus({ total: rows.length, current, downloads: d.count ?? 0 });
  }, [supabase]);
  useEffect(() => { void load(); }, [load, key]);

  async function addLink() {
    setMsg(null);
    const v = version.trim().replace(/^v/i, '');
    let u: URL;
    try { u = new URL(url.trim()); } catch { setMsg({ ok: false, text: 'Paste the full download link, starting with https://' }); return; }
    if (u.protocol !== 'https:') { setMsg({ ok: false, text: 'The link must start with https://' }); return; }
    if (!v) { setMsg({ ok: false, text: 'Type the version, for example 1.1.0.' }); return; }
    const name = clean(fileName.trim() || decodeURIComponent(u.pathname.split('/').pop() || '') || `ShopOS-${v}`);
    setBusy(true);
    try {
      const ins = await supabase.from('desktop_releases').upsert(
        { platform, arch, version: v, file_path: `external/${platform}/${arch}/${clean(v)}`, external_url: u.toString(), file_name: name, notes: notes.trim() || null, published: true, published_at: new Date().toISOString() },
        { onConflict: 'platform,arch,version' }
      ).select('id').single();
      if (ins.error || !ins.data) { setMsg({ ok: false, text: friendlyError(ins.error, 'Could not save the link.') }); return; }
      if (makeCurrent) {
        const cur = await supabase.rpc('admin_set_current_desktop_release', { p_id: ins.data.id });
        if (cur.error) { setMsg({ ok: false, text: `Saved, but could not make it current: ${friendlyError(cur.error)}` }); setKey((k) => k + 1); return; }
      }
      setMsg({ ok: true, text: `Added ${LABEL[platform]} version ${v}${makeCurrent ? ' and made it the current download' : ''}. Owners see it in More → Desktop app.` });
      setUrl(''); setNotes(''); setFileName(''); setKey((k) => k + 1);
    } catch (e) { setMsg({ ok: false, text: friendlyError(e, 'Could not save the link.') }); } finally { setBusy(false); }
  }

  const live = status ? (['windows', 'mac', 'linux'] as Platform[]).filter((p) => status.current[p] > 0) : [];

  return (
    <div className="space-y-4">
      <div>
        <h2 className="font-display font-semibold text-lg">Installers</h2>
        <p className="text-xs text-slate-400">The desktop setup files shop owners download from More → Desktop app. No request or approval is needed.</p>
      </div>

      <Card className="space-y-2">
        <div className="flex items-start gap-2">
          {status && live.length > 0 ? <CheckCircle2 className="w-5 h-5 text-field-500 shrink-0 mt-0.5" /> : <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />}
          <div className="min-w-0">
            <div className="text-sm font-medium">
              {!status ? 'Checking…' : live.length > 0 ? `Owners can download for: ${live.map((p) => LABEL[p]).join(', ')}` : 'No installer is available to owners yet'}
            </div>
            <div className="text-xs text-slate-400">
              {status ? `${status.total} version${status.total === 1 ? '' : 's'} in the library · ${status.downloads} download${status.downloads === 1 ? '' : 's'} so far` : ''}
            </div>
          </div>
        </div>
        {status && live.length === 0 && (
          <div className="rounded-xl bg-slate-800/60 p-3 text-xs text-slate-300 space-y-1.5">
            <p className="font-medium text-slate-200">Nothing has been published yet, so the library below is empty. Two ways to fill it:</p>
            <p><b>1. Automatic (recommended).</b> In GitHub add the secret <code>SHOPOS_INGEST_TOKEN</code> to your app repo, then Actions → “Build desktop installers” → Run workflow. Each finished installer is zipped to save space and appears here by itself. Owners unzip it after downloading.</p>
            <p><b>2. By hand.</b> Upload a file (a .zip is best, it saves space) in “Add a new installer” below (limit 50 MB on Supabase’s free plan), or paste a download link in the box underneath. Installers are usually bigger than 50 MB, so a link (for example a GitHub release file) is the easy way.</p>
          </div>
        )}
      </Card>

      <Card className="space-y-3">
        <div className="text-sm font-medium flex items-center gap-2"><Link2 className="w-4 h-4" /> Link an installer hosted elsewhere</div>
        <p className="text-xs text-slate-400">For files too big to upload. Paste the https download link; owners get that link when they tap Download. Add the checksum afterwards if you have one.</p>
        <div className="grid grid-cols-2 gap-2">
          <select value={platform} onChange={(e) => { const p = e.target.value as Platform; setPlatform(p); setArch(ARCHES[p][0].id); }} className="bg-slate-800 rounded-lg px-3 py-2.5 text-sm">{(['windows', 'mac', 'linux'] as Platform[]).map((p) => <option key={p} value={p}>{LABEL[p]}</option>)}</select>
          <select value={arch} onChange={(e) => setArch(e.target.value as Arch)} className="bg-slate-800 rounded-lg px-3 py-2.5 text-sm">{ARCHES[platform].map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}</select>
        </div>
        <input value={version} onChange={(e) => setVersion(e.target.value)} placeholder="Version e.g. 1.1.0" className="w-full bg-slate-800 rounded-lg px-3 py-2.5 text-sm" />
        <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://github.com/…/ShopOS-Setup-1.1.0-x64.exe" inputMode="url" className="w-full bg-slate-800 rounded-lg px-3 py-2.5 text-sm" />
        <input value={fileName} onChange={(e) => setFileName(e.target.value)} placeholder="File name (optional)" className="w-full bg-slate-800 rounded-lg px-3 py-2.5 text-sm" />
        <input value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={200} placeholder="What changed? (optional)" className="w-full bg-slate-800 rounded-lg px-3 py-2.5 text-sm" />
        <label className="flex items-center gap-2 text-xs text-slate-300"><input type="checkbox" checked={makeCurrent} onChange={(e) => setMakeCurrent(e.target.checked)} /> Make this the current version owners download</label>
        <button disabled={busy} onClick={addLink} className="inline-flex items-center justify-center gap-2 w-full text-sm font-semibold bg-field-600 text-white rounded-lg min-h-[44px]">{busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Link2 className="w-4 h-4" />} {busy ? 'Saving…' : 'Add link'}</button>
        {msg && <p role="status" className={`text-xs break-words ${msg.ok ? 'text-field-500' : 'text-rust-500'}`}>{msg.text}</p>}
      </Card>

      <div key={key}><DesktopSetups supabase={supabase} /></div>
    </div>
  );
}
