import { useEffect, useState } from 'react';
import { SupabaseClient } from '@supabase/supabase-js';
import { Plus, Trash2, Eye, EyeOff, Save } from 'lucide-react';
import { Card, ErrorText, Skeleton } from '../components/ui';

interface Lesson { id: string; title: string; summary: string; body: string; video_url: string; category: string; sort_order: number; published: boolean }

/** Lessons shown in every shop's "Lessons" page. Write, reorder by number, hide or delete. */
export default function LessonsPage({ supabase }: { supabase: SupabaseClient }) {
  const [rows, setRows] = useState<Lesson[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  async function load() {
    const { data, error } = await supabase.from('lessons').select('*').order('category').order('sort_order');
    if (error) { setError(error.message); setRows([]); return; }
    setRows((data ?? []).map((r: any) => ({ id: r.id, title: r.title ?? '', summary: r.summary ?? '', body: r.body ?? '', video_url: r.video_url ?? '', category: r.category ?? 'General', sort_order: r.sort_order ?? 0, published: !!r.published })));
  }
  useEffect(() => { void load(); }, []);
  if (!rows) return <Skeleton />;

  const patch = (id: string, p: Partial<Lesson>) => setRows(rows.map((r) => (r.id === id ? { ...r, ...p } : r)));
  async function add() {
    setError(null);
    const { data, error } = await supabase.from('lessons').insert({ title: 'New lesson', category: 'General', body: '', published: false, sort_order: rows!.length + 1 }).select('id').single();
    if (error) { setError(error.message); return; }
    await load(); setOpen(data.id);
  }
  async function save(r: Lesson) {
    setBusy(r.id); setError(null);
    if (r.video_url && !/^https:\/\//.test(r.video_url)) { setError('The video link must start with https://'); setBusy(null); return; }
    const { error } = await supabase.from('lessons').update({ title: r.title.trim() || 'Untitled', summary: r.summary.trim() || null, body: r.body, video_url: r.video_url.trim() || null, category: r.category.trim() || 'General', sort_order: r.sort_order, published: r.published, updated_at: new Date().toISOString() }).eq('id', r.id);
    setBusy(null);
    if (error) setError(error.message); else await load();
  }
  async function remove(id: string) {
    if (!window.confirm('Delete this lesson for every shop?')) return;
    const { error } = await supabase.from('lessons').delete().eq('id', id);
    if (error) setError(error.message); else await load();
  }
  return (
    <div className="space-y-3 max-w-3xl">
      <div className="flex items-center justify-between"><p className="text-sm text-slate-500">Lessons appear in every shop under More, Lessons. Only published ones are visible.</p>
        <button onClick={() => void add()} className="btn-primary inline-flex items-center gap-1.5 text-sm"><Plus className="w-4 h-4" /> New lesson</button></div>
      {error && <ErrorText>{error}</ErrorText>}
      {rows.length === 0 && <Card><p className="text-sm text-slate-400 text-center py-4">No lessons yet.</p></Card>}
      {rows.map((r) => (
        <Card key={r.id}>
          <button onClick={() => setOpen(open === r.id ? null : r.id)} className="w-full flex items-center justify-between gap-2 text-left">
            <span className="font-medium truncate">{r.title || 'Untitled'} <span className="text-xs text-slate-400 font-normal">· {r.category}</span></span>
            <span className={`text-xs px-2 py-0.5 rounded-full ${r.published ? 'bg-emerald-500/15 text-emerald-400' : 'bg-slate-500/20 text-slate-400'}`}>{r.published ? 'Published' : 'Hidden'}</span>
          </button>
          {open === r.id && (
            <div className="mt-3 space-y-2">
              <input className="input w-full" placeholder="Title" value={r.title} onChange={(e) => patch(r.id, { title: e.target.value })} />
              <div className="grid grid-cols-3 gap-2">
                <input className="input col-span-2" placeholder="Category" value={r.category} onChange={(e) => patch(r.id, { category: e.target.value })} />
                <input className="input" type="number" placeholder="Order" value={r.sort_order} onChange={(e) => patch(r.id, { sort_order: Number(e.target.value) || 0 })} />
              </div>
              <input className="input w-full" placeholder="One-line summary" value={r.summary} onChange={(e) => patch(r.id, { summary: e.target.value })} />
              <textarea className="input w-full" rows={8} placeholder="Lesson text" value={r.body} onChange={(e) => patch(r.id, { body: e.target.value })} />
              <input className="input w-full" placeholder="Video link (https://…, optional)" value={r.video_url} onChange={(e) => patch(r.id, { video_url: e.target.value })} />
              <div className="flex flex-wrap gap-2">
                <button onClick={() => patch(r.id, { published: !r.published })} className="btn-secondary text-sm inline-flex items-center gap-1.5">{r.published ? <><EyeOff className="w-4 h-4" /> Hide</> : <><Eye className="w-4 h-4" /> Publish</>}</button>
                <button onClick={() => void save(r)} disabled={busy === r.id} className="btn-primary text-sm inline-flex items-center gap-1.5 disabled:opacity-60"><Save className="w-4 h-4" /> {busy === r.id ? 'Saving…' : 'Save'}</button>
                <button onClick={() => void remove(r.id)} className="btn-secondary text-sm inline-flex items-center gap-1.5 !text-rose-400 ml-auto"><Trash2 className="w-4 h-4" /> Delete</button>
              </div>
              <p className="text-xs text-slate-500">Changes to the publish switch apply when you press Save.</p>
            </div>
          )}
        </Card>
      ))}
    </div>
  );
}
