import { useCallback, useEffect, useState } from 'react';
import { SupabaseClient } from '@supabase/supabase-js';
import { Card } from './ui';
import { friendlyError } from '../lib/friendlyError';
import { Check, X, Ban, Upload, Loader2, Download, Star, EyeOff, Copy, RotateCcw, HardDrive } from 'lucide-react';

type Platform = 'windows' | 'mac' | 'linux';
interface Row { id: string; business_id: string; platform: Platform; status: 'pending' | 'approved' | 'rejected' | 'revoked'; reason: string | null; admin_reason: string | null; expires_at: string | null; download_count: number; last_download_at: string | null; created_at: string; businesses: { name: string } | null }
type Arch = 'x64' | 'ia32' | 'arm64' | 'universal';
interface Rel { id: string; platform: Platform; arch: Arch; version: string; file_name: string; file_path: string; external_url?: string | null; size_bytes: number | null; sha256: string | null; notes: string | null; created_at: string; published: boolean; is_current: boolean }
const ARCHES: Record<Platform, { id: Arch; label: string }[]> = {
  windows: [{ id: 'x64', label: '64-bit (most tills)' }, { id: 'ia32', label: '32-bit (older tills)' }, { id: 'arm64', label: 'ARM' }],
  mac: [{ id: 'universal', label: 'Intel + Apple chip' }, { id: 'x64', label: 'Intel only' }, { id: 'arm64', label: 'Apple chip only' }],
  linux: [{ id: 'x64', label: '64-bit' }, { id: 'arm64', label: 'ARM (Raspberry Pi)' }]
};
const archLabel = (p: Platform, a: Arch) => ARCHES[p].find((x) => x.id === a)?.label ?? a;
const mb = (n?: number | null) => (n ? `${(n / 1048576).toFixed(0)} MB` : '');
const LABEL: Record<Platform, string> = { windows: 'Windows', mac: 'Mac', linux: 'Linux' };
const EXT: Record<Platform, string[]> = { windows: ['.exe', '.msi'], mac: ['.dmg', '.pkg'], linux: ['.appimage', '.deb', '.rpm'] };
const day = (s?: string | null) => (s ? new Date(s).toLocaleDateString() : '');
const clean = (s: string) => s.replace(/[^A-Za-z0-9._-]/g, '_').slice(0, 120);

async function sha256(file: File) {
  const buf = await file.arrayBuffer();
  const d = await crypto.subtle.digest('SHA-256', buf);
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Installers menu section: approve or reject shops' requests for the desktop setup file, and publish new installers.
 * Only platform admins can do either (enforced by the database, not just this screen). */
export function DesktopSetups({ supabase }: { supabase: SupabaseClient }) {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [rels, setRels] = useState<Rel[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [days, setDays] = useState(30);
  const [reasonFor, setReasonFor] = useState<{ id: string; kind: 'reject' | 'revoke' } | null>(null);
  const [reason, setReason] = useState('');
  const [pubPlatform, setPubPlatform] = useState<Platform>('windows');
  const [pubArch, setPubArch] = useState<Arch>('x64');
  const [pubNotes, setPubNotes] = useState('');
  const [pubCurrent, setPubCurrent] = useState(true);
  const [dlMsg, setDlMsg] = useState<string | null>(null);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [pubVersion, setPubVersion] = useState('');
  const [pubFile, setPubFile] = useState<File | null>(null);
  const [pubMsg, setPubMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [r, l] = await Promise.all([
      supabase.from('desktop_setup_requests').select('id, business_id, platform, status, reason, admin_reason, expires_at, download_count, last_download_at, created_at, businesses(name)').order('created_at', { ascending: false }).limit(60),
      supabase.from('desktop_releases').select('id, platform, arch, version, file_name, file_path, external_url, size_bytes, sha256, notes, created_at, published, is_current').order('created_at', { ascending: false }).limit(80)
    ]);
    if (r.error) { setError(friendlyError(r.error)); setRows([]); return; }
    setRows(((r.data ?? []) as unknown as (Omit<Row, 'businesses'> & { businesses: { name: string } | { name: string }[] | null })[]).map((x) => ({ ...x, businesses: Array.isArray(x.businesses) ? x.businesses[0] ?? null : x.businesses })));
    setRels((l.data ?? []) as Rel[]);
    const dl = await supabase.from('desktop_downloads').select('platform, arch, version').order('created_at', { ascending: false }).limit(5000);
    const c: Record<string, number> = {};
    for (const d of (dl.data ?? []) as { platform: string; arch: string | null; version: string | null }[]) { const k = `${d.platform}|${d.arch}|${d.version}`; c[k] = (c[k] ?? 0) + 1; }
    setCounts(c);
  }, [supabase]);
  useEffect(() => { void load(); }, [load]);

  async function decide(id: string, decision: 'approve' | 'reject' | 'revoke' | 'reopen', why?: string) {
    setBusy(id); setError(null);
    const { error: e } = await supabase.rpc('admin_decide_desktop_request', { p_request_id: id, p_decision: decision, p_reason: why?.trim() || null, p_valid_days: days });
    setBusy(null);
    if (e) { setError(friendlyError(e)); return; }
    setReasonFor(null); setReason(''); await load();
  }

  async function publish() {
    if (!pubFile || !pubVersion.trim()) { setPubMsg('Choose the file and type its version.'); return; }
    const lower = pubFile.name.toLowerCase();
    if (!EXT[pubPlatform].some((x) => lower.endsWith(x))) { setPubMsg(`A ${LABEL[pubPlatform]} installer should end in ${EXT[pubPlatform].join(' or ')}.`); return; }
    setBusy('publish'); setPubMsg(null);
    try {
      const hash = await sha256(pubFile);
      const version = pubVersion.trim().replace(/^v/i, '');
      const path = `${pubPlatform}/${pubArch}/${clean(version)}/${clean(pubFile.name)}`;
      const up = await supabase.storage.from('desktop-installers').upload(path, pubFile, { upsert: true, contentType: 'application/octet-stream' });
      if (up.error) { setPubMsg(/size|large|exceed|413/i.test(up.error.message) ? 'This file is larger than your Supabase storage upload limit (50 MB on the free plan). Use "Link an installer hosted elsewhere" on the Installers page instead, for example a GitHub download link.' : friendlyError(up.error, 'Could not upload the file.')); return; }
      const ins = await supabase.from('desktop_releases').upsert({ platform: pubPlatform, arch: pubArch, version, file_path: path, file_name: clean(pubFile.name), size_bytes: pubFile.size, sha256: hash, notes: pubNotes.trim() || null, published: true }, { onConflict: 'platform,arch,version' }).select('id').single();
      if (ins.error || !ins.data) { setPubMsg(friendlyError(ins.error, 'Could not save the version.')); return; }
      if (pubCurrent) { const cur = await supabase.rpc('admin_set_current_desktop_release', { p_id: ins.data.id }); if (cur.error) { setPubMsg(`Saved, but could not make it current: ${friendlyError(cur.error)}`); await load(); return; } }
      setPubMsg(`Saved ${LABEL[pubPlatform]} ${archLabel(pubPlatform, pubArch)} version ${version}${pubCurrent ? ' and made it the current one' : ''}. Checksum ${hash.slice(0, 12)}…`); setPubFile(null); setPubNotes(''); await load();
    } catch (e) { setPubMsg(friendlyError(e, 'Upload failed.')); } finally { setBusy(null); }
  }

  async function makeCurrent(id: string) { setBusy(`cur-${id}`); setError(null); const { error: e } = await supabase.rpc('admin_set_current_desktop_release', { p_id: id }); setBusy(null); if (e) setError(friendlyError(e)); else await load(); }
  async function pull(id: string) { setBusy(`pull-${id}`); setError(null); const { error: e } = await supabase.rpc('admin_unpublish_desktop_release', { p_id: id }); setBusy(null); if (e) setError(friendlyError(e)); else await load(); }

  /** Admin download (for a USB stick). The link works for one hour and only for platform admins. */
  async function adminDownload(x: Rel) {
    if (x.external_url) { setDlMsg(`Opening the download link for ${x.file_name}${x.sha256 ? `. SHA-256: ${x.sha256}` : ''}`); window.open(x.external_url, '_blank', 'noopener,noreferrer'); return; }
    setBusy(`dl-${x.id}`); setDlMsg(null);
    const { data, error: e } = await supabase.storage.from('desktop-installers').createSignedUrl(x.file_path, 3600, { download: x.file_name });
    setBusy(null);
    if (e || !data?.signedUrl) { setDlMsg(friendlyError(e, 'Could not prepare the download.')); return; }
    setDlMsg(`Downloading ${x.file_name}${x.sha256 ? `. SHA-256: ${x.sha256}` : ''}`);
    window.location.href = data.signedUrl;
  }
  async function copyHash(h: string) { try { await navigator.clipboard.writeText(h); setDlMsg('Checksum copied.'); } catch { setDlMsg(h); } }

  const pending = (rows ?? []).filter((r) => r.status === 'pending');
  const approved = (rows ?? []).filter((r) => r.status === 'approved');
  const rest = (rows ?? []).filter((r) => r.status === 'rejected' || r.status === 'revoked').slice(0, 12);
  const name = (r: Row) => r.businesses?.name ?? 'Business';

  return (
    <div>
      <h2 className="font-display font-semibold text-lg mb-3">Desktop setups{pending.length ? <span className="ml-2 text-xs bg-amber-500 text-slate-900 rounded-full px-2 py-0.5 align-middle">{pending.length} waiting</span> : null}</h2>
      {error && <p role="alert" className="text-sm text-rust-500 mb-2">{error}</p>}
      <Card className="mb-3 space-y-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="text-sm font-medium">Requests waiting for approval</div>
          <label className="text-xs text-slate-400 flex items-center gap-2">Approval lasts
            <select value={days} onChange={(e) => setDays(Number(e.target.value))} className="bg-slate-800 rounded-lg px-2 py-1.5 text-slate-200">{[7, 14, 30, 90].map((d) => <option key={d} value={d}>{d} days</option>)}</select>
          </label>
        </div>
        {rows === null && <p className="text-xs text-slate-500">Loading…</p>}
        {rows && pending.length === 0 && <p className="text-xs text-slate-500">No requests waiting.</p>}
        {pending.map((r) => (
          <div key={r.id} className="rounded-xl bg-slate-800/60 p-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0"><div className="text-sm font-medium">{name(r)} · {LABEL[r.platform]}</div><div className="text-xs text-slate-400">Asked {day(r.created_at)}{r.reason ? ` — “${r.reason}”` : ''}</div></div>
              <div className="flex gap-1.5 shrink-0">
                <button disabled={busy === r.id} onClick={() => decide(r.id, 'approve')} className="inline-flex items-center gap-1 text-xs font-semibold bg-field-600 text-white rounded-lg px-3 min-h-[36px]">{busy === r.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />} Approve</button>
                <button disabled={busy === r.id} onClick={() => setReasonFor({ id: r.id, kind: 'reject' })} className="inline-flex items-center gap-1 text-xs font-semibold bg-slate-700 text-slate-200 rounded-lg px-3 min-h-[36px]"><X className="w-3.5 h-3.5" /> Reject</button>
              </div>
            </div>
            {reasonFor?.id === r.id && (
              <div className="mt-2 flex gap-2"><input className="flex-1 min-w-0 bg-slate-900 rounded-lg px-3 py-2 text-sm" placeholder="Reason (shown to the shop)" value={reason} maxLength={200} onChange={(e) => setReason(e.target.value)} />
                <button onClick={() => decide(r.id, reasonFor.kind, reason)} className="text-xs font-semibold bg-rust-500 text-white rounded-lg px-3">Confirm</button></div>
            )}
          </div>
        ))}
      </Card>

      {approved.length > 0 && (
        <Card className="mb-3 space-y-2">
          <div className="text-sm font-medium">Approved</div>
          {approved.map((r) => (
            <div key={r.id} className="flex items-center justify-between gap-3 text-xs border-t border-slate-800 pt-2">
              <div className="min-w-0"><div className="text-sm">{name(r)} · {LABEL[r.platform]}</div><div className="text-slate-400">until {day(r.expires_at)} · {r.download_count} download{r.download_count === 1 ? '' : 's'}{r.last_download_at ? ` (last ${day(r.last_download_at)})` : ''}</div></div>
              {reasonFor?.id === r.id ? (
                <div className="flex gap-1.5"><input className="w-40 bg-slate-900 rounded-lg px-2 py-1.5 text-xs" placeholder="Reason" value={reason} maxLength={200} onChange={(e) => setReason(e.target.value)} /><button onClick={() => decide(r.id, 'revoke', reason)} className="font-semibold bg-rust-500 text-white rounded-lg px-2.5">Revoke</button></div>
              ) : <button onClick={() => setReasonFor({ id: r.id, kind: 'revoke' })} className="inline-flex items-center gap-1 font-semibold text-slate-300 bg-slate-800 rounded-lg px-3 min-h-[34px]"><Ban className="w-3.5 h-3.5" /> Revoke</button>}
            </div>
          ))}
        </Card>
      )}
      {rest.length > 0 && (
        <Card className="mb-3 space-y-2">
          <div className="text-sm font-medium">Closed requests <span className="text-xs text-slate-500 font-normal">— changed your mind? You can turn any of them around.</span></div>
          {rest.map((r) => (
            <div key={r.id} className="flex items-center justify-between gap-3 text-xs border-t border-slate-800 pt-2">
              <div className="min-w-0"><div className="text-sm">{name(r)} · {LABEL[r.platform]}</div><div className="text-slate-400">{r.status === 'rejected' ? 'Rejected' : 'Revoked'} {day(r.created_at)}{r.admin_reason ? ` — “${r.admin_reason}”` : ''}</div></div>
              <div className="flex gap-1.5 shrink-0">
                <button disabled={busy === r.id} onClick={() => decide(r.id, 'approve')} className="inline-flex items-center gap-1 font-semibold bg-field-600 text-white rounded-lg px-3 min-h-[34px]">{busy === r.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />} Approve instead</button>
                <button disabled={busy === r.id} onClick={() => decide(r.id, 'reopen')} className="inline-flex items-center gap-1 font-semibold text-slate-300 bg-slate-800 rounded-lg px-2.5 min-h-[34px]" title="Send back to waiting"><RotateCcw className="w-3.5 h-3.5" /></button>
              </div>
            </div>
          ))}
        </Card>
      )}

      <Card className="space-y-3">
        <div className="text-sm font-medium flex items-center gap-2"><HardDrive className="w-4 h-4" /> Installer library</div>
        <p className="text-xs text-slate-400">Every version you upload is kept here. The one marked <b>Current</b> is what shop owners download from More → Desktop app, with no request or approval needed. Builds from GitHub appear here by themselves. When you update the app, upload the new build, then make it current. You can go back to an older version at any time. Download any file to put on a USB stick and install on tills without internet.</p>
        {dlMsg && <p className="text-xs text-slate-300 break-all">{dlMsg}</p>}
        {(['windows', 'mac', 'linux'] as Platform[]).map((p) => {
          const list = rels.filter((x) => x.platform === p);
          return (
            <div key={p} className="border-t border-slate-800 pt-2">
              <div className="text-xs font-semibold text-slate-300 mb-1">{LABEL[p]}</div>
              {list.length === 0 && <p className="text-xs text-slate-500">Nothing uploaded yet.</p>}
              <ul className="space-y-2">
                {list.map((x) => (
                  <li key={x.id} className="rounded-xl bg-slate-800/60 p-2.5 text-xs">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="text-sm">v{x.version} · {archLabel(p, x.arch)} {x.is_current && <span className="ml-1 text-[10px] bg-field-600 text-white rounded-full px-1.5 py-0.5 align-middle">Current</span>}{!x.published && <span className="ml-1 text-[10px] bg-slate-600 text-slate-200 rounded-full px-1.5 py-0.5 align-middle">Pulled</span>}</div>
                        <div className="text-slate-400 break-all">{x.file_name}{x.external_url ? ' · linked' : ''}{x.size_bytes ? ` · ${mb(x.size_bytes)}` : ''} · {day(x.created_at)} · {counts[`${x.platform}|${x.arch}|${x.version}`] ?? 0} downloads</div>
                        {x.notes && <div className="text-slate-400 mt-0.5">{x.notes}</div>}
                      </div>
                      <div className="flex gap-1 shrink-0">
                        <button title="Download (for USB)" disabled={busy === `dl-${x.id}`} onClick={() => adminDownload(x)} className="bg-slate-700 text-slate-100 rounded-lg px-2.5 min-h-[32px] inline-flex items-center">{busy === `dl-${x.id}` ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}</button>
                        {x.sha256 && <button title="Copy checksum" onClick={() => copyHash(x.sha256!)} className="bg-slate-700 text-slate-100 rounded-lg px-2.5 min-h-[32px] inline-flex items-center"><Copy className="w-3.5 h-3.5" /></button>}
                        {!x.is_current && <button title="Make current" disabled={busy === `cur-${x.id}`} onClick={() => makeCurrent(x.id)} className="bg-field-600 text-white rounded-lg px-2.5 min-h-[32px] inline-flex items-center gap-1">{busy === `cur-${x.id}` ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Star className="w-3.5 h-3.5" />}</button>}
                        {x.published && <button title="Pull (hide from shops)" disabled={busy === `pull-${x.id}`} onClick={() => pull(x.id)} className="bg-slate-700 text-slate-100 rounded-lg px-2.5 min-h-[32px] inline-flex items-center"><EyeOff className="w-3.5 h-3.5" /></button>}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
        <p className="text-[11px] text-slate-500">USB steps: download the file here, copy it to a USB stick, plug it into the till, run it. Windows may warn because the file is not yet signed (More info, then Run anyway). Check the checksum matches if you want to be sure the file is intact.</p>
      </Card>

      <Card className="space-y-3 mt-3">
        <div className="text-sm font-medium">Add a new installer or update</div>
        <p className="text-xs text-slate-400">Normally you do not need this: running GitHub → Actions → “Build desktop installers” publishes every installer here automatically. Use this form only to add a file by hand (for example a build you made elsewhere). Owners download through a private two-minute link.</p>
        <div className="grid grid-cols-2 gap-2">
          <select value={pubPlatform} onChange={(e) => { const p = e.target.value as Platform; setPubPlatform(p); setPubArch(ARCHES[p][0].id); }} className="bg-slate-800 rounded-lg px-3 py-2.5 text-sm">{(['windows', 'mac', 'linux'] as Platform[]).map((p) => <option key={p} value={p}>{LABEL[p]} ({EXT[p].join(' / ')})</option>)}</select>
          <select value={pubArch} onChange={(e) => setPubArch(e.target.value as Arch)} className="bg-slate-800 rounded-lg px-3 py-2.5 text-sm">{ARCHES[pubPlatform].map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}</select>
        </div>
        <input value={pubVersion} onChange={(e) => setPubVersion(e.target.value)} placeholder="Version e.g. 1.1.0" className="w-full bg-slate-800 rounded-lg px-3 py-2.5 text-sm" />
        <input value={pubNotes} onChange={(e) => setPubNotes(e.target.value)} maxLength={200} placeholder="What changed? (optional)" className="w-full bg-slate-800 rounded-lg px-3 py-2.5 text-sm" />
        <input type="file" onChange={(e) => setPubFile(e.target.files?.[0] ?? null)} className="block w-full text-xs text-slate-300 file:mr-3 file:rounded-lg file:border-0 file:bg-slate-700 file:px-3 file:py-2 file:text-slate-200" />
        <label className="flex items-center gap-2 text-xs text-slate-300"><input type="checkbox" checked={pubCurrent} onChange={(e) => setPubCurrent(e.target.checked)} /> Make this the current version shops download</label>
        <button disabled={busy === 'publish'} onClick={publish} className="inline-flex items-center justify-center gap-2 w-full text-sm font-semibold bg-field-600 text-white rounded-lg min-h-[44px]">{busy === 'publish' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />} {busy === 'publish' ? 'Uploading…' : 'Upload'}</button>
        {pubMsg && <p className="text-xs text-slate-300 break-words">{pubMsg}</p>}
      </Card>
    </div>
  );
}
