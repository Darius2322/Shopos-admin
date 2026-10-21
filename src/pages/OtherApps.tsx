import { useEffect, useState } from 'react';
import { SupabaseClient } from '@supabase/supabase-js';
import { Plus, Save, Trash2, ArrowUp, ArrowDown } from 'lucide-react';
import { Card, ErrorText, Skeleton } from '../components/ui';

interface OtherApp { id: string; name: string; description: string; url: string; color: string; enabled: boolean }
const newId = () => Math.random().toString(36).slice(2, 10);
const validUrl = (u: string) => /^https:\/\/[^\s]+$/i.test(u.trim());

/** Apps listed for shop owners under More > Other apps in the main app. Saved in platform_settings.other_apps. */
export default function OtherAppsPage({ supabase }: { supabase: SupabaseClient }) {
  const [apps, setApps] = useState<OtherApp[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase.from('platform_settings').select('other_apps').eq('id', 'default').maybeSingle();
      if (error) { setError(/other_apps/.test(error.message) ? 'The other_apps column is missing. Run supabase/other_apps.sql in the SQL editor first.' : error.message); setApps([]); return; }
      const list = Array.isArray(data?.other_apps) ? data!.other_apps : [];
      setApps(list.map((a: any) => ({ id: String(a.id ?? newId()), name: String(a.name ?? ''), description: String(a.description ?? ''), url: String(a.url ?? ''), color: /^#[0-9a-f]{6}$/i.test(a.color ?? '') ? a.color : '#146b4a', enabled: a.enabled !== false })));
    })();
  }, [supabase]);

  if (!apps) return <Skeleton />;
  const patch = (id: string, p: Partial<OtherApp>) => setApps(apps.map((a) => (a.id === id ? { ...a, ...p } : a)));
  const move = (i: number, d: number) => { const n = [...apps]; const j = i + d; if (j < 0 || j >= n.length) return; [n[i], n[j]] = [n[j], n[i]]; setApps(n); };

  async function save() {
    setError(null); setSaved(false);
    for (const a of apps!) {
      if (!a.name.trim()) { setError('Every app needs a name.'); return; }
      if (!validUrl(a.url)) { setError(`"${a.name}" needs a link starting with https://`); return; }
    }
    setSaving(true);
    try {
      const clean = apps!.map((a) => ({ id: a.id, name: a.name.trim().slice(0, 40), description: a.description.trim().slice(0, 120), url: a.url.trim(), color: a.color, enabled: a.enabled }));
      const { error } = await supabase.from('platform_settings').update({ other_apps: clean, updated_at: new Date().toISOString() }).eq('id', 'default');
      if (error) throw error;
      setSaved(true); setTimeout(() => setSaved(false), 2000);
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not save.'); }
    finally { setSaving(false); }
  }

  return (
    <div className="max-w-2xl space-y-4">
      <div>
        <h2 className="font-display font-semibold text-lg mb-1">Other apps</h2>
        <p className="text-xs text-slate-400">These show for every shop under More &gt; Other apps. Each opens its link in a new tab. Links must start with https://.</p>
      </div>
      <ErrorText>{error}</ErrorText>
      {apps.length === 0 && <p className="text-sm text-slate-400">No apps yet.</p>}
      {apps.map((a, i) => (
        <Card key={a.id} className="space-y-2">
          <div className="grid gap-2 sm:grid-cols-2">
            <input className="input" placeholder="App name" maxLength={40} value={a.name} onChange={(e) => patch(a.id, { name: e.target.value })} aria-label="App name" />
            <input className="input" placeholder="https://…" value={a.url} onChange={(e) => patch(a.id, { url: e.target.value })} aria-label="App link" inputMode="url" />
          </div>
          <input className="input" placeholder="Short description (optional)" maxLength={120} value={a.description} onChange={(e) => patch(a.id, { description: e.target.value })} aria-label="Description" />
          <div className="flex items-center gap-3 flex-wrap">
            <label className="flex items-center gap-2 text-xs text-slate-400">Colour <input type="color" value={a.color} onChange={(e) => patch(a.id, { color: e.target.value })} aria-label="Colour" /></label>
            <label className="flex items-center gap-2 text-xs text-slate-400"><input type="checkbox" checked={a.enabled} onChange={(e) => patch(a.id, { enabled: e.target.checked })} /> Show to shops</label>
            <span className="flex-1" />
            <button className="btn-secondary px-2" onClick={() => move(i, -1)} disabled={i === 0} aria-label="Move up"><ArrowUp className="w-4 h-4" /></button>
            <button className="btn-secondary px-2" onClick={() => move(i, 1)} disabled={i === apps.length - 1} aria-label="Move down"><ArrowDown className="w-4 h-4" /></button>
            <button className="btn-secondary px-2 text-rust-500" onClick={() => setApps(apps.filter((x) => x.id !== a.id))} aria-label="Remove app"><Trash2 className="w-4 h-4" /></button>
          </div>
        </Card>
      ))}
      <div className="flex gap-2">
        <button className="btn-secondary flex items-center gap-1.5" onClick={() => setApps([...apps, { id: newId(), name: '', description: '', url: '', color: '#146b4a', enabled: true }])}><Plus className="w-4 h-4" /> Add app</button>
        <button className="btn-primary flex items-center gap-1.5" onClick={save} disabled={saving}><Save className="w-4 h-4" /> {saving ? 'Saving…' : saved ? 'Saved' : 'Save'}</button>
      </div>
    </div>
  );
}
