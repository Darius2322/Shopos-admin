import { useEffect, useState } from 'react';
import { SupabaseClient } from '@supabase/supabase-js';
import { Globe, Megaphone, Home, Info, Mail, Star, Scale, ExternalLink, Phone } from 'lucide-react';
import { Card, ErrorText, Skeleton } from '../components/ui';
import { LegalEditor } from '../components/LegalEditor';
import Reviews from './Reviews';
import { askConfirm } from '../lib/dialog';

const SITE = 'https://www.shopos.co.ke';
type Sub = 'overview' | 'home' | 'banner' | 'about' | 'contact' | 'reviews' | 'legal';
const SUBS: [Sub, string, typeof Globe][] = [
  ['overview', 'Overview', Globe], ['home', 'Home page', Home], ['banner', 'Announcement', Megaphone], ['about', 'About page', Info],
  ['contact', 'Contact', Mail], ['reviews', 'Reviews', Star], ['legal', 'Legal pages', Scale],
];
interface Version { id: number; title: string; body: string; action: 'saved' | 'cleared'; created_at: string }
const when = (s: string) => new Date(s).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });

interface EditorCfg { key: 'home' | 'about' | 'banner' | 'contact_note'; heading: string; help: string; titleLabel: string; titleHint: string; bodyLabel: string; bodyHint: string; titleOptional?: boolean; builtInTitle: string; builtInBody: string; page: string }
const CFG: Record<string, EditorCfg> = {
  home: { key: 'home', heading: 'Home page', help: 'The big headline and the line under it, at the top of the home page.', titleLabel: 'Headline', titleHint: 'The point of sale built for how your shop actually runs', bodyLabel: 'Line under the headline', bodyHint: 'One or two sentences.', builtInTitle: 'The point of sale built for how your shop actually runs', builtInBody: 'Sell, track stock, manage staff and see your reports in one app that keeps working when the internet goes down.', page: '/home' },
  about: { key: 'about', heading: 'About page', help: 'The heading and the introduction at the top of the About page.', titleLabel: 'Heading', titleHint: 'Built for the way Kenyan businesses really sell', bodyLabel: 'Introduction', bodyHint: 'A short paragraph.', builtInTitle: 'Built for the way Kenyan businesses really sell', builtInBody: 'ShopOS is a point of sale and stock system for shops, bars, pharmacies, garages, salons and many more. It works on a phone, a tablet or a computer, and it keeps selling when the internet goes down.', page: '/about' },
  banner: { key: 'banner', heading: 'Announcement banner', help: 'A coloured strip across the top of every website page, for offers, downtime or news. Clear the text to remove it.', titleLabel: 'Link (optional)', titleHint: '/packages or https://…', titleOptional: true, bodyLabel: 'Message', bodyHint: 'Short, for example: "New plans from KES 500 a month".', builtInTitle: '', builtInBody: '', page: '/home' },
  contact_note: { key: 'contact_note', heading: 'Contact page text', help: 'The sentence under "Contact us". The phone, WhatsApp and email themselves are set in the Contact details box above.', titleLabel: 'Title (not shown)', titleHint: 'Contact text', titleOptional: true, bodyLabel: 'Sentence', bodyHint: 'Questions before signing up, or help with an existing account.', builtInTitle: '', builtInBody: 'Questions before signing up, or help with an existing account. Reach us using any of these.', page: '/contact' },
};

function TextEditor({ supabase, cfg }: { supabase: SupabaseClient; cfg: EditorCfg }) {
  const [title, setTitle] = useState(''); const [body, setBody] = useState('');
  const [orig, setOrig] = useState({ t: '', b: '' });
  const [live, setLive] = useState<'custom' | 'builtin' | 'none'>('builtin'); const [liveAt, setLiveAt] = useState<string | null>(null);
  const [hist, setHist] = useState<Version[]>([]); const [showHist, setShowHist] = useState(false);
  const [busy, setBusy] = useState(false); const [err, setErr] = useState<string | null>(null); const [msg, setMsg] = useState<string | null>(null); const [tick, setTick] = useState(0);

  useEffect(() => {
    let alive = true; setErr(null); setMsg(null); setShowHist(false);
    void Promise.all([supabase.rpc('site_content_get', { p_key: cfg.key }), supabase.rpc('admin_content_history', { p_key: cfg.key })]).then(([c, h]) => {
      if (!alive) return;
      const d = c.data as { title?: string; body?: string; updated_at?: string } | null;
      const custom = !!d?.body;
      const t = custom ? (d?.title ?? '') : cfg.builtInTitle; const b = custom ? (d?.body ?? '') : cfg.builtInBody;
      setLive(custom ? 'custom' : cfg.builtInBody ? 'builtin' : 'none'); setLiveAt(d?.updated_at ?? null);
      setTitle(custom && cfg.titleOptional && d?.title === cfg.key ? '' : t); setBody(b); setOrig({ t, b });
      setHist(Array.isArray(h.data) ? (h.data as Version[]) : []);
    });
    return () => { alive = false; };
  }, [cfg, supabase, tick]);

  async function save(clear = false) {
    setBusy(true); setErr(null); setMsg(null);
    const { error } = await supabase.rpc('admin_save_content', { p_key: cfg.key, p_title: title.trim() || cfg.key, p_body: clear ? '' : body });
    setBusy(false);
    if (error) { setErr('Could not save. Please try again.'); return; }
    setMsg(clear ? (cfg.builtInBody ? 'Back to the built-in text.' : 'Removed from the website.') : 'Saved. Visitors see it now (they may need to refresh).');
    setTick((x) => x + 1);
  }
  const changed = body !== orig.b || title !== orig.t;
  return (
    <div className="space-y-3">
      <div><h2 className="font-display font-semibold text-lg">{cfg.heading}</h2><p className="text-xs text-slate-400">{cfg.help}</p></div>
      <Card className="space-y-3">
        <p className="text-xs text-slate-400">{live === 'custom' ? `Live: your own text${liveAt ? `, saved ${when(liveAt)}` : ''}.` : live === 'builtin' ? 'Live: the built-in text. Edit and Save to make it your own.' : 'Nothing is showing on the website for this yet.'}</p>
        <label className="block"><span className="block text-xs text-slate-400 mb-1">{cfg.titleLabel}</span><input className="input" maxLength={300} value={title} onChange={(e) => setTitle(e.target.value)} placeholder={cfg.titleHint} /></label>
        <label className="block"><span className="block text-xs text-slate-400 mb-1">{cfg.bodyLabel}</span><textarea className="input min-h-[110px]" maxLength={2000} value={body} onChange={(e) => setBody(e.target.value)} placeholder={cfg.bodyHint} /></label>
        <ErrorText>{err}</ErrorText>
        {msg && <p className="text-sm text-field-600" role="status">{msg}</p>}
        <div className="flex flex-wrap gap-2">
          <button onClick={() => void save()} disabled={busy || !body.trim() || !changed} className="btn-primary text-sm">{busy ? 'Saving…' : 'Save and publish'}</button>
          {changed && <button onClick={() => { setTitle(orig.t); setBody(orig.b); }} className="btn-secondary text-sm">Undo my edits</button>}
          {live === 'custom' && <button disabled={busy} onClick={async () => { if (await askConfirm(cfg.builtInBody ? 'Go back to the built-in text? Your version stays in the history.' : 'Remove this from the website? Your version stays in the history.')) void save(true); }} className="btn-secondary text-sm">{cfg.builtInBody ? 'Use the built-in text' : 'Remove from website'}</button>}
          <a href={`${SITE}${cfg.page}`} target="_blank" rel="noreferrer" className="btn-secondary text-sm inline-flex items-center gap-1">View page <ExternalLink className="w-3.5 h-3.5" /></a>
        </div>
      </Card>
      <Card className="space-y-2">
        <button onClick={() => setShowHist(!showHist)} className="w-full flex items-center justify-between text-left"><span className="font-medium text-sm">History <span className="text-slate-400 font-normal">({hist.length})</span></span><span className="text-xs text-slate-400">{showHist ? 'Hide' : 'Show'}</span></button>
        {showHist && (hist.length === 0 ? <p className="text-xs text-slate-400">Nothing saved yet.</p> : <ul className="space-y-2">{hist.map((h) => (
          <li key={h.id} className="rounded-lg border border-slate-700 p-3">
            <div className="flex items-center justify-between gap-2"><span className="text-sm">{h.action === 'cleared' ? 'Removed' : 'Saved'} · <span className="text-slate-400">{when(h.created_at)}</span></span>
              <button onClick={() => { setTitle(h.title === cfg.key ? '' : h.title); setBody(h.body); setMsg('Loaded. Press Save to publish it again.'); }} className="btn-secondary text-xs shrink-0">Load</button></div>
            <p className="text-xs text-slate-500 mt-1 line-clamp-2">{h.body.slice(0, 160)}</p></li>))}</ul>)}
      </Card>
    </div>
  );
}

function ContactDetails({ supabase }: { supabase: SupabaseClient }) {
  const [f, setF] = useState<{ support_email: string; support_whatsapp: string; support_phone: string } | null>(null);
  const [busy, setBusy] = useState(false); const [err, setErr] = useState<string | null>(null); const [ok, setOk] = useState(false);
  useEffect(() => { void supabase.from('platform_settings').select('support_email, support_whatsapp, support_phone').eq('id', 'default').maybeSingle().then(({ data }) => setF({ support_email: data?.support_email ?? '', support_whatsapp: data?.support_whatsapp ?? '', support_phone: data?.support_phone ?? '' })); }, [supabase]);
  if (!f) return <Skeleton />;
  async function save() {
    if (!f) return; setBusy(true); setErr(null); setOk(false);
    const { error } = await supabase.from('platform_settings').update({ support_email: f.support_email || null, support_whatsapp: f.support_whatsapp || null, support_phone: f.support_phone || null }).eq('id', 'default');
    setBusy(false); if (error) setErr('Could not save. Please try again.'); else { setOk(true); setTimeout(() => setOk(false), 2500); }
  }
  return (
    <Card className="space-y-3">
      <div><h3 className="font-medium flex items-center gap-1.5"><Phone className="w-4 h-4" /> Contact details</h3><p className="text-xs text-slate-400">Shown on the Contact page, and on the sign-in and register screens of the apps.</p></div>
      <label className="block"><span className="block text-xs text-slate-400 mb-1">Email</span><input className="input" type="email" value={f.support_email} onChange={(e) => setF({ ...f, support_email: e.target.value })} placeholder="support@yourbusiness.com" /></label>
      <label className="block"><span className="block text-xs text-slate-400 mb-1">WhatsApp</span><input className="input" value={f.support_whatsapp} onChange={(e) => setF({ ...f, support_whatsapp: e.target.value })} placeholder="254712345678 (no + or spaces)" /></label>
      <label className="block"><span className="block text-xs text-slate-400 mb-1">Phone</span><input className="input" value={f.support_phone} onChange={(e) => setF({ ...f, support_phone: e.target.value })} placeholder="+254712345678" /></label>
      <ErrorText>{err}</ErrorText>
      <div className="flex items-center gap-3"><button onClick={() => void save()} disabled={busy} className="btn-primary text-sm">{busy ? 'Saving…' : 'Save'}</button>{ok && <span className="text-sm text-field-600" role="status">Saved.</span>}</div>
    </Card>
  );
}

export default function Website({ supabase }: { supabase: SupabaseClient }) {
  const [sub, setSub] = useState<Sub>('overview');
  const [stats, setStats] = useState<{ reviews: number; hidden: number; edited: string[] } | null>(null);
  useEffect(() => {
    if (sub !== 'overview') return;
    void (async () => {
      const keys = ['home', 'about', 'banner', 'contact_note', 'terms', 'privacy', 'cookies', 'refunds'];
      const got = await Promise.all(keys.map((k) => supabase.rpc('site_content_get', { p_key: k }).then(({ data }) => [k, data as { body?: string } | null] as const)));
      const rv = await supabase.rpc('get_public_reviews', { p_limit: 200 });
      setStats({ reviews: Array.isArray(rv.data) ? rv.data.length : 0, hidden: 0, edited: got.filter(([, d]) => d?.body).map(([k]) => k) });
    })();
  }, [sub, supabase]);
  const NAMES: Record<string, string> = { home: 'Home page', about: 'About page', banner: 'Announcement banner', contact_note: 'Contact text', terms: 'Terms', privacy: 'Privacy', cookies: 'Cookies', refunds: 'Refunds' };
  return (
    <div className="max-w-2xl space-y-4">
      <div role="tablist" aria-label="Website" className="flex gap-1.5 overflow-x-auto pb-1">
        {SUBS.map(([k, l, Icon]) => (
          <button key={k} role="tab" aria-selected={sub === k} onClick={() => setSub(k)} className={`whitespace-nowrap text-xs font-medium rounded-full px-3 py-1.5 border inline-flex items-center gap-1.5 ${sub === k ? 'bg-field-600 border-field-600 text-white' : 'border-slate-700 text-slate-400 hover:text-ink'}`}><Icon className="w-3.5 h-3.5" /> {l}</button>
        ))}
      </div>
      {sub === 'overview' && (
        <div className="space-y-3">
          <div><h2 className="font-display font-semibold text-lg">Marketing website</h2><p className="text-xs text-slate-400">The public site at www.shopos.co.ke. This is separate from the owner app: changes here only change what visitors read.</p></div>
          <Card className="space-y-2">
            <p className="text-sm font-medium">What you have written yourself</p>
            {!stats ? <Skeleton /> : stats.edited.length === 0 ? <p className="text-xs text-slate-400">Nothing yet. Every page shows its built-in text.</p> : <ul className="flex flex-wrap gap-1.5">{stats.edited.map((k) => <li key={k} className="text-xs rounded-full bg-field-600/15 text-field-600 px-2.5 py-1">{NAMES[k]}</li>)}</ul>}
            {stats && <p className="text-xs text-slate-400">{stats.reviews} review{stats.reviews === 1 ? '' : 's'} showing on the site.</p>}
          </Card>
          <Card className="space-y-1.5">
            <p className="text-sm font-medium mb-1">Open the live pages</p>
            {[['/home', 'Home'], ['/about', 'About'], ['/services', 'Services'], ['/packages', 'Packages'], ['/contact', 'Contact'], ['/reviews', 'Reviews'], ['/legal', 'Legal']].map(([p, l]) => (
              <a key={p} href={`${SITE}${p}`} target="_blank" rel="noreferrer" className="flex items-center justify-between text-sm py-1.5 border-b border-slate-800 last:border-0 hover:text-field-600">{l}<ExternalLink className="w-3.5 h-3.5 text-slate-500" /></a>))}
            <p className="text-[11px] text-slate-500 pt-1">Package prices are changed in the Packages menu.</p>
          </Card>
        </div>
      )}
      {sub === 'home' && <TextEditor supabase={supabase} cfg={CFG.home} />}
      {sub === 'banner' && <TextEditor supabase={supabase} cfg={CFG.banner} />}
      {sub === 'about' && <TextEditor supabase={supabase} cfg={CFG.about} />}
      {sub === 'contact' && <div className="space-y-4"><ContactDetails supabase={supabase} /><TextEditor supabase={supabase} cfg={CFG.contact_note} /></div>}
      {sub === 'reviews' && <Reviews supabase={supabase} />}
      {sub === 'legal' && <LegalEditor supabase={supabase} />}
    </div>
  );
}
