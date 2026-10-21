import { useEffect, useRef, useState } from 'react';
import { SupabaseClient } from '@supabase/supabase-js';
import { Plus, Save, Trash2, ArrowUp, ArrowDown, MoreVertical, Pencil, Eye, EyeOff, Clock, ExternalLink, ImagePlus, X } from 'lucide-react';
import { Card, ErrorText, Skeleton } from '../components/ui';

interface OtherApp { id: string; name: string; description: string; url: string; color: string; enabled: boolean; soon: boolean; thumb: string }
const newId = () => Math.random().toString(36).slice(2, 10);
const validUrl = (u: string) => /^https:\/\/[^\s]+$/i.test(u.trim());
const MAX_THUMB = 90_000; // characters of the saved picture, keeps the settings row small

/** Shrinks a picked photo to a small JPEG so it can be saved inside the settings itself (no file storage needed). */
function toThumb(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image(); const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      for (const [w, q] of [[480, 0.8], [360, 0.7], [280, 0.6]] as const) {
        const scale = Math.min(1, w / img.width); const c = document.createElement('canvas');
        c.width = Math.max(1, Math.round(img.width * scale)); c.height = Math.max(1, Math.round(img.height * scale));
        const g = c.getContext('2d'); if (!g) break;
        g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); g.drawImage(img, 0, 0, c.width, c.height);
        const out = c.toDataURL('image/jpeg', q);
        if (out.length <= MAX_THUMB) return resolve(out);
      }
      reject(new Error('That picture is too detailed. Try a simpler or smaller one.'));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Could not read that picture.')); };
    img.src = url;
  });
}

function Thumb({ a, className = '' }: { a: Pick<OtherApp, 'name' | 'color' | 'thumb'>; className?: string }) {
  return a.thumb
    ? <img src={a.thumb} alt="" className={`object-cover ${className}`} />
    : <span className={`flex items-center justify-center text-white font-semibold ${className}`} style={{ background: a.color }}>{a.name.slice(0, 1).toUpperCase() || '?'}</span>;
}

/** Apps listed for shop owners under More > Other apps in the main app. Saved in platform_settings.other_apps. */
export default function OtherAppsPage({ supabase }: { supabase: SupabaseClient }) {
  const [apps, setApps] = useState<OtherApp[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [menu, setMenu] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [confirmDel, setConfirmDel] = useState<string | null>(null);
  const file = useRef<HTMLInputElement>(null);
  const fileFor = useRef<string | null>(null);

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase.from('platform_settings').select('other_apps').eq('id', 'default').maybeSingle();
      if (error) { setError(/other_apps/.test(error.message) ? 'The other_apps column is missing. Run supabase/other_apps.sql in the SQL editor first.' : error.message); setApps([]); return; }
      const list = Array.isArray(data?.other_apps) ? data!.other_apps : [];
      setApps(list.map((a: any) => ({ id: String(a.id ?? newId()), name: String(a.name ?? ''), description: String(a.description ?? ''), url: String(a.url ?? ''), color: /^#[0-9a-f]{6}$/i.test(a.color ?? '') ? a.color : '#146b4a', enabled: a.enabled !== false, soon: a.soon === true, thumb: typeof a.thumb === 'string' ? a.thumb : '' })));
    })();
  }, [supabase]);

  if (!apps) return <Skeleton />;
  const patch = (id: string, p: Partial<OtherApp>) => { setApps(apps.map((a) => (a.id === id ? { ...a, ...p } : a))); setDirty(true); setSaved(false); };
  const move = (i: number, d: number) => { const n = [...apps]; const j = i + d; if (j < 0 || j >= n.length) return; [n[i], n[j]] = [n[j], n[i]]; setApps(n); setDirty(true); setSaved(false); };
  const remove = (id: string) => { setApps(apps.filter((a) => a.id !== id)); setConfirmDel(null); setMenu(null); setDirty(true); setSaved(false); };

  async function pickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]; const id = fileFor.current; e.target.value = '';
    if (!f || !id) return;
    setError(null);
    try { patch(id, { thumb: await toThumb(f) }); } catch (err) { setError(err instanceof Error ? err.message : 'Could not use that picture.'); }
  }

  async function save() {
    setError(null); setSaved(false);
    for (const a of apps!) {
      if (!a.name.trim()) { setError('Every app needs a name.'); return; }
      if (!a.soon && !validUrl(a.url)) { setError(`"${a.name}" needs a link starting with https:// (or mark it Coming soon).`); return; }
      if (a.url.trim() && !validUrl(a.url)) { setError(`"${a.name}": the link must start with https://`); return; }
    }
    setSaving(true);
    try {
      const clean = apps!.map((a) => ({ id: a.id, name: a.name.trim().slice(0, 40), description: a.description.trim().slice(0, 120), url: a.url.trim(), color: a.color, enabled: a.enabled, soon: a.soon, thumb: a.thumb }));
      const { error } = await supabase.from('platform_settings').update({ other_apps: clean, updated_at: new Date().toISOString() }).eq('id', 'default');
      if (error) throw error;
      setSaved(true); setDirty(false); setEditing(null); setTimeout(() => setSaved(false), 2500);
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not save.'); }
    finally { setSaving(false); }
  }

  const item = 'w-full text-left flex items-center gap-2 px-3 py-2.5 text-sm hover:bg-slate-800 disabled:opacity-40';
  return (
    <div className="max-w-2xl space-y-4">
      <div>
        <h2 className="font-display font-semibold text-lg mb-1">Other apps</h2>
        <p className="text-xs text-slate-400">These show for every shop under More &gt; Other apps. A live app opens its link in a new tab. An app marked Coming soon is shown but can't be opened. Changes only reach shops after you tap Save.</p>
      </div>
      <ErrorText>{error}</ErrorText>
      <input ref={file} type="file" accept="image/*" className="hidden" onChange={pickFile} aria-label="Choose a picture" />
      {apps.length === 0 && <p className="text-sm text-slate-400">No apps yet.</p>}
      {apps.map((a, i) => (
        <Card key={a.id} className="space-y-3">
          <div className="flex items-center gap-3">
            <Thumb a={a} className="w-20 h-14 rounded-card shrink-0" />
            <div className="min-w-0 flex-1">
              <div className="font-medium text-sm truncate">{a.name || 'Untitled app'}</div>
              <div className="text-xs text-slate-400 truncate">{a.description || a.url || 'No link yet'}</div>
              <div className="flex gap-1.5 mt-1 flex-wrap">
                {a.soon && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-500/20 text-amber-400">Coming soon</span>}
                {!a.enabled && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-slate-700 text-slate-300">Hidden from shops</span>}
                {a.enabled && !a.soon && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-field-600/20 text-field-600">Live</span>}
              </div>
            </div>
            <div className="relative">
              <button className="btn-secondary px-2" onClick={() => setMenu(menu === a.id ? null : a.id)} aria-label={`Actions for ${a.name || 'app'}`} aria-expanded={menu === a.id}><MoreVertical className="w-4 h-4" /></button>
              {menu === a.id && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setMenu(null)} aria-hidden="true" />
                  <div className="absolute right-0 mt-1 w-56 card p-0 z-20 shadow-lg overflow-hidden" role="menu">
                    <button role="menuitem" className={item} onClick={() => { setEditing(editing === a.id ? null : a.id); setMenu(null); }}><Pencil className="w-4 h-4" /> {editing === a.id ? 'Close editor' : 'Edit details'}</button>
                    <button role="menuitem" className={item} onClick={() => { patch(a.id, { enabled: !a.enabled }); setMenu(null); }}>{a.enabled ? <><EyeOff className="w-4 h-4" /> Hide from shops</> : <><Eye className="w-4 h-4" /> Show to shops</>}</button>
                    <button role="menuitem" className={item} onClick={() => { patch(a.id, { soon: !a.soon }); setMenu(null); }}><Clock className="w-4 h-4" /> {a.soon ? 'Make it live' : 'Mark as Coming soon'}</button>
                    <button role="menuitem" className={item} onClick={() => { fileFor.current = a.id; setMenu(null); file.current?.click(); }}><ImagePlus className="w-4 h-4" /> {a.thumb ? 'Change picture' : 'Add picture'}</button>
                    {a.thumb && <button role="menuitem" className={item} onClick={() => { patch(a.id, { thumb: '' }); setMenu(null); }}><X className="w-4 h-4" /> Remove picture</button>}
                    {validUrl(a.url) && <a role="menuitem" className={item} href={a.url} target="_blank" rel="noopener noreferrer" onClick={() => setMenu(null)}><ExternalLink className="w-4 h-4" /> Open link</a>}
                    <button role="menuitem" className={item} disabled={i === 0} onClick={() => { move(i, -1); setMenu(null); }}><ArrowUp className="w-4 h-4" /> Move up</button>
                    <button role="menuitem" className={item} disabled={i === apps.length - 1} onClick={() => { move(i, 1); setMenu(null); }}><ArrowDown className="w-4 h-4" /> Move down</button>
                    <button role="menuitem" className={`${item} text-rust-500`} onClick={() => { setConfirmDel(a.id); setMenu(null); }}><Trash2 className="w-4 h-4" /> Delete</button>
                  </div>
                </>
              )}
            </div>
          </div>

          {confirmDel === a.id && (
            <div className="flex items-center gap-2 text-sm bg-rust-500/10 rounded-card p-2">
              <span className="flex-1">Delete "{a.name || 'this app'}"? Shops will stop seeing it after you save.</span>
              <button className="btn-secondary text-rust-500" onClick={() => remove(a.id)}>Delete</button>
              <button className="btn-secondary" onClick={() => setConfirmDel(null)}>Keep</button>
            </div>
          )}

          {editing === a.id && (
            <div className="space-y-2 border-t border-slate-700 pt-3">
              <div className="grid gap-2 sm:grid-cols-2">
                <input className="input" placeholder="App name" maxLength={40} value={a.name} onChange={(e) => patch(a.id, { name: e.target.value })} aria-label="App name" />
                <input className="input" placeholder={a.soon ? 'https://… (optional while coming soon)' : 'https://…'} value={a.url} onChange={(e) => patch(a.id, { url: e.target.value })} aria-label="App link" inputMode="url" />
              </div>
              <input className="input" placeholder="Short description (optional)" maxLength={120} value={a.description} onChange={(e) => patch(a.id, { description: e.target.value })} aria-label="Description" />
              <div className="flex items-center gap-3 flex-wrap text-xs text-slate-400">
                <label className="flex items-center gap-2">Colour <input type="color" value={a.color} onChange={(e) => patch(a.id, { color: e.target.value })} aria-label="Colour" /></label>
                <label className="flex items-center gap-2"><input type="checkbox" checked={a.soon} onChange={(e) => patch(a.id, { soon: e.target.checked })} /> Coming soon (can't be opened yet)</label>
                <label className="flex items-center gap-2"><input type="checkbox" checked={a.enabled} onChange={(e) => patch(a.id, { enabled: e.target.checked })} /> Show to shops</label>
              </div>
              <button className="btn-secondary text-sm flex items-center gap-1.5" onClick={() => { fileFor.current = a.id; file.current?.click(); }}><ImagePlus className="w-4 h-4" /> {a.thumb ? 'Change picture' : 'Add picture'}</button>
              <p className="text-xs text-slate-500">A wide picture (screenshot or logo) works best. It is shrunk automatically.</p>
            </div>
          )}
        </Card>
      ))}
      <div className="flex gap-2 flex-wrap items-center">
        <button className="btn-secondary flex items-center gap-1.5" onClick={() => { const id = newId(); setApps([...apps, { id, name: '', description: '', url: '', color: '#146b4a', enabled: true, soon: false, thumb: '' }]); setEditing(id); setDirty(true); }}><Plus className="w-4 h-4" /> Add app</button>
        <button className="btn-primary flex items-center gap-1.5" onClick={save} disabled={saving}><Save className="w-4 h-4" /> {saving ? 'Saving…' : saved ? 'Saved' : 'Save'}</button>
        {dirty && !saving && <span className="text-xs text-amber-400">Unsaved changes</span>}
      </div>
    </div>
  );
}
