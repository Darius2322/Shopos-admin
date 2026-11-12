import { useEffect, useState } from 'react';
import { SupabaseClient } from '@supabase/supabase-js';
import { Card, ErrorText } from './ui';
import { LEGAL_DEFAULTS } from '../lib/legalDefaults';
import { askConfirm } from '../lib/dialog';

const PAGES: [string, string, string][] = [
  ['terms', 'Terms & Conditions', '/legal#terms'],
  ['privacy', 'Privacy Policy', '/legal#privacy'],
  ['cookies', 'Cookies', '/legal#cookies'],
  ['refunds', 'Refunds', '/legal#refunds'],
];
const SITE = 'https://www.shopos.co.ke';
interface Version { id: number; title: string; body: string; action: 'saved' | 'cleared'; created_at: string }
const when = (s: string) => new Date(s).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });

/** Edit the public legal pages. The editor always opens with what visitors see right now: your own text if you wrote one, otherwise the built-in text. Every save is kept in the history. */
export function LegalEditor({ supabase }: { supabase: SupabaseClient }) {
  const [key, setKey] = useState('terms');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [live, setLive] = useState<'custom' | 'standard' | 'none'>('standard');
  const [liveAt, setLiveAt] = useState<string | null>(null);
  const [orig, setOrig] = useState('');
  const [hist, setHist] = useState<Version[]>([]);
  const [showHist, setShowHist] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let alive = true;
    setErr(null); setMsg(null); setShowHist(false);
    void Promise.all([supabase.rpc('site_content_get', { p_key: key }), supabase.rpc('admin_content_history', { p_key: key })]).then(([c, h]) => {
      if (!alive) return;
      const d = c.data as { title?: string; body?: string; updated_at?: string } | null;
      const std = LEGAL_DEFAULTS[key] ?? '';
      const label = PAGES.find((p) => p[0] === key)![1];
      const text = d?.body ?? std;
      setLive(d?.body ? 'custom' : std ? 'standard' : 'none');
      setLiveAt(d?.updated_at ?? null);
      setTitle(d?.title ?? label); setBody(text); setOrig(text);
      setHist(Array.isArray(h.data) ? (h.data as Version[]) : []);
    });
    return () => { alive = false; };
  }, [key, supabase, tick]);

  async function save(clear = false) {
    setBusy(true); setErr(null); setMsg(null);
    const { error } = await supabase.rpc('admin_save_content', { p_key: key, p_title: title, p_body: clear ? '' : body });
    setBusy(false);
    if (error) { setErr('Could not save. Please try again.'); return; }
    setMsg(clear ? 'Back to the built-in text.' : 'Saved. It is live now.');
    setTick((t) => t + 1);
  }
  const changed = body !== orig;

  return (
    <div className="space-y-3">
      <div>
        <h2 className="font-display font-semibold text-lg">Legal pages</h2>
        <p className="text-xs text-slate-400">This is the text visitors read on each page. Change it and press Save to publish. Every saved version is kept in the history so you can look back or restore one.</p>
      </div>
      <div className="flex gap-1.5 overflow-x-auto">
        {PAGES.map(([k, l]) => (
          <button key={k} onClick={() => setKey(k)} className={`whitespace-nowrap text-xs font-medium rounded-full px-3 py-1.5 border ${key === k ? 'bg-field-600 border-field-600 text-white' : 'border-slate-700 text-slate-400 hover:text-ink'}`}>{l}</button>
        ))}
      </div>
      <Card className="space-y-3">
        <p className="text-xs text-slate-400">
          {live === 'custom' ? `Live: your own text${liveAt ? `, saved ${when(liveAt)}` : ''}.` : live === 'standard' ? 'Live: the built-in text that comes with the app. Edit it below and Save to make it your own.' : 'Not published. Visitors do not see this page yet. Write it below and Save to publish.'}
        </p>
        <label className="block"><span className="block text-xs text-slate-400 mb-1">Page title</span><input className="input" maxLength={120} value={title} onChange={(e) => setTitle(e.target.value)} /></label>
        <label className="block"><span className="block text-xs text-slate-400 mb-1">Text</span>
          <textarea className="input min-h-[360px] font-mono text-xs leading-relaxed" value={body} onChange={(e) => setBody(e.target.value)} maxLength={60000} placeholder={'## 1. First heading\nA paragraph of text.\n\n- A bullet point\n- Another bullet point'} /></label>
        <p className="text-[11px] text-slate-500">Start a heading with ##. Start list lines with a dash. Leave a blank line between paragraphs.</p>
        <ErrorText>{err}</ErrorText>
        {msg && <p className="text-sm text-field-600" role="status">{msg}</p>}
        <div className="flex flex-wrap gap-2">
          <button onClick={() => void save()} disabled={busy || !body.trim() || (live !== 'none' && !changed && live === 'custom')} className="btn-primary text-sm">{busy ? 'Saving…' : live === 'standard' && !changed ? 'Save as my own text' : 'Save'}</button>
          {changed && <button onClick={() => setBody(orig)} className="btn-secondary text-sm">Undo my edits</button>}
          {live === 'custom' && <button onClick={async () => { if (await askConfirm('Go back to the built-in text? Your version stays in the history.')) void save(true); }} disabled={busy} className="btn-secondary text-sm">Use the built-in text</button>}
          <a href={`${SITE}${PAGES.find((p) => p[0] === key)![2]}`} target="_blank" rel="noreferrer" className="btn-secondary text-sm inline-flex items-center">View page</a>
        </div>
      </Card>
      <Card className="space-y-2">
        <button onClick={() => setShowHist(!showHist)} className="w-full flex items-center justify-between text-left">
          <span className="font-medium text-sm">History <span className="text-slate-400 font-normal">({hist.length} saved version{hist.length === 1 ? '' : 's'})</span></span>
          <span className="text-xs text-slate-400">{showHist ? 'Hide' : 'Show'}</span>
        </button>
        {showHist && (hist.length === 0
          ? <p className="text-xs text-slate-400">Nothing saved yet. Your first save will appear here.</p>
          : <ul className="space-y-2">{hist.map((h) => (
              <li key={h.id} className="rounded-lg border border-slate-700 p-3">
                <div className="flex items-center justify-between gap-2"><span className="text-sm">{h.action === 'cleared' ? 'Went back to built-in text' : 'Saved'} · <span className="text-slate-400">{when(h.created_at)}</span></span>
                  <button onClick={() => { setTitle(h.title); setBody(h.body); setMsg('That version is loaded below. Press Save to publish it again.'); window.scrollTo({ top: 0, behavior: 'smooth' }); }} className="btn-secondary text-xs shrink-0">Load this version</button></div>
                <p className="text-xs text-slate-500 mt-1 line-clamp-2">{h.body.slice(0, 160)}</p>
              </li>))}</ul>)}
      </Card>
    </div>
  );
}
