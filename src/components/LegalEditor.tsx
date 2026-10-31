import { useEffect, useState } from 'react';
import { SupabaseClient } from '@supabase/supabase-js';
import { Card, ErrorText } from './ui';

const PAGES: [string, string, string][] = [
  ['terms', 'Terms & Conditions', '/legal#terms'],
  ['privacy', 'Privacy Policy', '/legal#privacy'],
  ['cookies', 'Cookies', '/legal#cookies'],
  ['refunds', 'Refunds', '/legal#refunds'],
];

/** Edit the public legal pages. Empty = the app shows its standard built-in text (Cookies and Refunds simply stay hidden). */
export function LegalEditor({ supabase }: { supabase: SupabaseClient }) {
  const [key, setKey] = useState('terms');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [has, setHas] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    setErr(null); setMsg(null);
    void supabase.rpc('site_content_get', { p_key: key }).then(({ data }) => {
      if (!alive) return;
      const d = data as { title?: string; body?: string } | null;
      setHas(!!d?.body); setTitle(d?.title ?? PAGES.find((p) => p[0] === key)![1]); setBody(d?.body ?? '');
    });
    return () => { alive = false; };
  }, [key, supabase]);

  async function save() {
    setBusy(true); setErr(null); setMsg(null);
    const { error } = await supabase.rpc('admin_save_content', { p_key: key, p_title: title, p_body: body });
    setBusy(false);
    if (error) { setErr('Could not save. Please try again.'); return; }
    setHas(!!body.trim());
    setMsg(body.trim() ? 'Saved. It is live now.' : 'Cleared. The standard text is shown again.');
  }

  return (
    <div className="space-y-3">
      <div>
        <h2 className="font-display font-semibold text-lg">Legal pages</h2>
        <p className="text-xs text-slate-400">Write the text people see on the public Legal page. Leave a page empty and save to go back to the standard text (Cookies and Refunds stay hidden until you write them).</p>
      </div>
      <div className="flex gap-1.5 overflow-x-auto">
        {PAGES.map(([k, l]) => (
          <button key={k} onClick={() => setKey(k)} className={`whitespace-nowrap text-xs font-medium rounded-full px-3 py-1.5 border ${key === k ? 'bg-field-600 border-field-600 text-white' : 'border-slate-700 text-slate-400 hover:text-ink'}`}>{l}</button>
        ))}
      </div>
      <Card className="space-y-3">
        <p className="text-xs text-slate-400">{has ? 'You have written your own text for this page.' : 'Showing the standard text. Write below to replace it.'}</p>
        <label className="block"><span className="block text-xs text-slate-400 mb-1">Page title</span><input className="input" maxLength={120} value={title} onChange={(e) => setTitle(e.target.value)} /></label>
        <label className="block"><span className="block text-xs text-slate-400 mb-1">Text</span>
          <textarea className="input min-h-[320px] font-mono text-xs leading-relaxed" value={body} onChange={(e) => setBody(e.target.value)} maxLength={60000} placeholder={'## 1. First heading\nA paragraph of text.\n\n- A bullet point\n- Another bullet point\n\n## 2. Second heading\nMore text.'} /></label>
        <p className="text-[11px] text-slate-500">Start a heading with ##. Start list lines with a dash. Leave a blank line between paragraphs.</p>
        <ErrorText>{err}</ErrorText>
        {msg && <p className="text-sm text-field-600" role="status">{msg}</p>}
        <div className="flex gap-2">
          <button onClick={() => void save()} disabled={busy} className="btn-primary text-sm">{busy ? 'Saving…' : 'Save'}</button>
          <a href={PAGES.find((p) => p[0] === key)![2]} target="_blank" rel="noreferrer" className="btn-secondary text-sm inline-flex items-center">View page</a>
        </div>
      </Card>
    </div>
  );
}
