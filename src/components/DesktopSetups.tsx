import { useCallback, useEffect, useState } from 'react';
import { SupabaseClient } from '@supabase/supabase-js';
import { Card } from './ui';
import { Check, X, Ban, Upload, Loader2 } from 'lucide-react';

type Platform = 'windows' | 'mac' | 'linux';
interface Row { id: string; business_id: string; platform: Platform; status: 'pending' | 'approved' | 'rejected' | 'revoked'; reason: string | null; admin_reason: string | null; expires_at: string | null; download_count: number; last_download_at: string | null; created_at: string; businesses: { name: string } | null }
interface Rel { id: string; platform: Platform; version: string; file_name: string; size_bytes: number | null; created_at: string; published: boolean }
const LABEL: Record<Platform, string> = { windows: 'Windows', mac: 'Mac', linux: 'Linux' };
const EXT: Record<Platform, string> = { windows: '.exe', mac: '.dmg', linux: '.appimage' };
const day = (s?: string | null) => (s ? new Date(s).toLocaleDateString() : '');
const clean = (s: string) => s.replace(/[^A-Za-z0-9._-]/g, '_').slice(0, 120);

async function sha256(file: File) {
  const buf = await file.arrayBuffer();
  const d = await crypto.subtle.digest('SHA-256', buf);
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Dashboard section: approve or reject shops' requests for the desktop setup file, and publish new installers.
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
  const [pubVersion, setPubVersion] = useState('');
  const [pubFile, setPubFile] = useState<File | null>(null);
  const [pubMsg, setPubMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [r, l] = await Promise.all([
      supabase.from('desktop_setup_requests').select('id, business_id, platform, status, reason, admin_reason, expires_at, download_count, last_download_at, created_at, businesses(name)').order('created_at', { ascending: false }).limit(60),
      supabase.from('desktop_releases').select('id, platform, version, file_name, size_bytes, created_at, published').order('created_at', { ascending: false }).limit(12)
    ]);
    if (r.error) { setError(r.error.message); setRows([]); return; }
    setRows(((r.data ?? []) as unknown as (Omit<Row, 'businesses'> & { businesses: { name: string } | { name: string }[] | null })[]).map((x) => ({ ...x, businesses: Array.isArray(x.businesses) ? x.businesses[0] ?? null : x.businesses })));
    setRels((l.data ?? []) as Rel[]);
  }, [supabase]);
  useEffect(() => { void load(); }, [load]);

  async function decide(id: string, decision: 'approve' | 'reject' | 'revoke', why?: string) {
    setBusy(id); setError(null);
    const { error: e } = await supabase.rpc('admin_decide_desktop_request', { p_request_id: id, p_decision: decision, p_reason: why?.trim() || null, p_valid_days: days });
    setBusy(null);
    if (e) { setError(e.message); return; }
    setReasonFor(null); setReason(''); await load();
  }

  async function publish() {
    if (!pubFile || !pubVersion.trim()) { setPubMsg('Choose the file and type its version.'); return; }
    if (!pubFile.name.toLowerCase().endsWith(EXT[pubPlatform])) { setPubMsg(`A ${LABEL[pubPlatform]} installer should end in ${EXT[pubPlatform]}.`); return; }
    setBusy('publish'); setPubMsg(null);
    try {
      const hash = await sha256(pubFile);
      const version = pubVersion.trim().replace(/^v/i, '');
      const path = `${pubPlatform}/${clean(version)}/${clean(pubFile.name)}`;
      const up = await supabase.storage.from('desktop-installers').upload(path, pubFile, { upsert: true, contentType: 'application/octet-stream' });
      if (up.error) { setPubMsg(/size|large|exceed/i.test(up.error.message) ? `The file is larger than your Supabase storage upload limit (${up.error.message}). Raise it in Supabase → Storage → Settings, or use a smaller build.` : up.error.message); return; }
      const ins = await supabase.from('desktop_releases').upsert({ platform: pubPlatform, version, file_path: path, file_name: clean(pubFile.name), size_bytes: pubFile.size, sha256: hash, published: true }, { onConflict: 'platform,version' });
      if (ins.error) { setPubMsg(ins.error.message); return; }
      setPubMsg(`Published ${LABEL[pubPlatform]} version ${version}. Checksum ${hash.slice(0, 12)}…`); setPubFile(null); await load();
    } catch (e) { setPubMsg(e instanceof Error ? e.message : 'Upload failed.'); } finally { setBusy(null); }
  }

  const pending = (rows ?? []).filter((r) => r.status === 'pending');
  const approved = (rows ?? []).filter((r) => r.status === 'approved');
  const rest = (rows ?? []).filter((r) => r.status === 'rejected' || r.status === 'revoked').slice(0, 8);
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
      {rest.length > 0 && <p className="text-[11px] text-slate-500 mb-3">Recently closed: {rest.map((r) => `${name(r)} (${LABEL[r.platform]}, ${r.status})`).join(' · ')}</p>}

      <Card className="space-y-3">
        <div className="text-sm font-medium">Publish an installer</div>
        <p className="text-xs text-slate-400">Build the files in GitHub → Actions → “Build desktop installers”, download them, then upload each here. Only approved shops can ever download them, through a private two-minute link.</p>
        <div className="grid grid-cols-2 gap-2">
          <select value={pubPlatform} onChange={(e) => setPubPlatform(e.target.value as Platform)} className="bg-slate-800 rounded-lg px-3 py-2.5 text-sm">{(['windows', 'mac', 'linux'] as Platform[]).map((p) => <option key={p} value={p}>{LABEL[p]} ({EXT[p]})</option>)}</select>
          <input value={pubVersion} onChange={(e) => setPubVersion(e.target.value)} placeholder="Version e.g. 1.0.0" className="bg-slate-800 rounded-lg px-3 py-2.5 text-sm" />
        </div>
        <input type="file" onChange={(e) => setPubFile(e.target.files?.[0] ?? null)} className="block w-full text-xs text-slate-300 file:mr-3 file:rounded-lg file:border-0 file:bg-slate-700 file:px-3 file:py-2 file:text-slate-200" />
        <button disabled={busy === 'publish'} onClick={publish} className="inline-flex items-center justify-center gap-2 w-full text-sm font-semibold bg-field-600 text-white rounded-lg min-h-[44px]">{busy === 'publish' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />} {busy === 'publish' ? 'Uploading…' : 'Upload and publish'}</button>
        {pubMsg && <p className="text-xs text-slate-300 break-words">{pubMsg}</p>}
        {rels.length > 0 && <ul className="text-xs text-slate-400 space-y-1">{rels.map((x) => <li key={x.id}>{LABEL[x.platform]} · v{x.version} · {x.file_name}{x.size_bytes ? ` · ${(x.size_bytes / 1048576).toFixed(0)} MB` : ''} · {day(x.created_at)}</li>)}</ul>}
      </Card>
    </div>
  );
}
