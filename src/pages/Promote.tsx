import { useEffect, useRef, useState } from 'react';
import { drawPoster, generatePosters, loadLogo, type PosterSpec, type Product } from '../lib/posters';
import { generateCaptions, TONES, type Tone } from '../lib/captions';
import { Card } from '../components/ui';

const BASE = 'https://www.shopos.co.ke';
const ADS = [
  { id: 'pos', title: 'POS (shop) advert', link: `${BASE}/?utm_source=whatsapp&utm_medium=ad`, text: '🛒 *Run your shop from your phone with ShopOS*\nSales, stock, M-Pesa, debts, receipts and daily reports, even offline.' },
  { id: 'booking', title: 'Booking advert', link: `${BASE}/book?utm_source=whatsapp&utm_medium=ad`, text: '📅 *Let customers book you online 24/7*\nSalons, barbers, clinics and studios: get your own booking link, reminders and M-Pesa deposits. Set up in minutes.' },
];

function Thumb({ spec, link, selected, onPick }: { spec: PosterSpec; link: string; selected: boolean; onPick: () => void }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => { let off = false; void loadLogo().then((lg) => { if (!off && ref.current) drawPoster(ref.current, spec, link, 360, lg); }); return () => { off = true; }; }, [spec, link]);
  return <button onClick={onPick} aria-label={`Choose design: ${spec.headline}`} aria-pressed={selected} className={`rounded-xl overflow-hidden border-2 ${selected ? 'border-emerald-500' : 'border-transparent'}`}><canvas ref={ref} className="w-full h-auto block" /></button>;
}

function PosterStudio({ source }: { source: string }) {
  const [product, setProduct] = useState<Product>('pos'); const [set, setSet] = useState<PosterSpec[]>(() => generatePosters('pos')); const [sel, setSel] = useState<PosterSpec | null>(null); const [note, setNote] = useState<string | null>(null);
  const link = product === 'pos' ? 'shopos.co.ke' : 'shopos.co.ke/book';
  const full = `${BASE}${product === 'pos' ? '/' : '/book'}?utm_source=${source}&utm_medium=ad`;
  const regen = (p: Product = product) => { setSet(generatePosters(p)); setSel(null); };
  const blob = async () => { if (!sel) return null; const lg = await loadLogo(); return new Promise<Blob | null>((res) => { const c = document.createElement('canvas'); drawPoster(c, sel, link, 1080, lg); c.toBlob((b) => res(b), 'image/png'); }); };
  const download = async () => { const b = await blob(); if (!b) return; const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = `shopos-${product}-advert.png`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000); };
  const share = async () => {
    const b = await blob(); if (!b) return; const file = new File([b], `shopos-${product}-advert.png`, { type: 'image/png' });
    try { if (navigator.canShare?.({ files: [file] })) { await navigator.share({ files: [file], text: full }); return; } } catch { /* cancelled */ }
    setNote('Sharing pictures is not supported here. Use Download, then add it to your WhatsApp Status.'); setTimeout(() => setNote(null), 4000);
  };
  return (
    <Card>
      <h2 className="text-sm font-semibold">Advert pictures</h2>
      <p className="text-xs text-slate-400">Press Generate for a new set of designs, tap the one you like, then share it to WhatsApp or download it. Sized for WhatsApp Status.</p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {([['pos', 'POS (shops)'], ['booking', 'Booking']] as const).map(([k, l]) => <button key={k} onClick={() => { setProduct(k); regen(k); }} className={`rounded-full border px-3 py-1 text-xs ${product === k ? 'bg-emerald-600 border-emerald-600 text-white' : 'border-slate-600 text-slate-300'}`}>{l}</button>)}
        <button className="btn-secondary text-xs" onClick={() => regen()}>Generate new designs</button>
      </div>
      <div className="mt-3 grid grid-cols-2 sm:grid-cols-3 gap-3">{set.map((p) => <Thumb key={p.id} spec={p} link={link} selected={sel?.id === p.id} onPick={() => setSel(p)} />)}</div>
      {sel && <div className="mt-3 flex flex-wrap gap-2 items-center"><button className="btn-secondary text-xs" onClick={() => void share()}>Share picture</button><button className="btn-secondary text-xs" onClick={() => void download()}>Download</button><button className="btn-secondary text-xs" onClick={() => void navigator.clipboard?.writeText(full)}>Copy link</button>{note && <span className="text-xs text-amber-400">{note}</span>}</div>}
    </Card>
  );
}

function CaptionStudio({ source }: { source: string }) {
  const [product, setProduct] = useState<Product>('pos'); const [tone, setTone] = useState<Tone>('friendly'); const [tags, setTags] = useState(true); const [list, setList] = useState<string[]>([]); const [done, setDone] = useState<number | null>(null);
  const gen = (p = product, t = tone, h = tags) => setList(generateCaptions(p, t, `${BASE}${p === 'pos' ? '/' : '/book'}?utm_source=${source}&utm_medium=ad`, h));
  useEffect(() => { gen(); }, [source]); // eslint-disable-line react-hooks/exhaustive-deps
  const copy = async (i: number) => { try { await navigator.clipboard.writeText(list[i]); setDone(i); setTimeout(() => setDone(null), 1500); } catch { window.prompt('Copy this:', list[i]); } };
  return (
    <Card>
      <h2 className="text-sm font-semibold">Caption writer</h2>
      <p className="text-xs text-slate-400">Pick what you are advertising and the style, then Generate. Each press writes new captions.</p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {([['pos', 'POS (shops)'], ['booking', 'Booking']] as const).map(([k, l]) => <button key={k} onClick={() => { setProduct(k); gen(k, tone, tags); }} className={`rounded-full border px-3 py-1 text-xs ${product === k ? 'bg-emerald-600 border-emerald-600 text-white' : 'border-slate-600 text-slate-300'}`}>{l}</button>)}
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        {TONES.map(([k, l]) => <button key={k} onClick={() => { setTone(k); gen(product, k, tags); }} className={`rounded-full border px-3 py-1 text-xs ${tone === k ? 'bg-emerald-600 border-emerald-600 text-white' : 'border-slate-600 text-slate-300'}`}>{l}</button>)}
        <label className="flex items-center gap-1 text-xs text-slate-300"><input type="checkbox" checked={tags} onChange={(e) => { setTags(e.target.checked); gen(product, tone, e.target.checked); }} /> Hashtags</label>
        <button className="btn-secondary text-xs" onClick={() => gen()}>Generate new captions</button>
      </div>
      <div className="mt-3 space-y-3">
        {list.map((c, i) => (
          <div key={i} className="rounded-xl border border-slate-700 p-3">
            <pre className="whitespace-pre-wrap text-sm font-sans">{c}</pre>
            <div className="mt-2 flex flex-wrap gap-2"><button className="btn-secondary text-xs" onClick={() => void copy(i)}>{done === i ? 'Copied ✓' : 'Copy caption'}</button><a className="btn-secondary text-xs" target="_blank" rel="noopener noreferrer" href={`https://wa.me/?text=${encodeURIComponent(c)}`}>Share on WhatsApp</a></div>
          </div>
        ))}
      </div>
    </Card>
  );
}

/** Ready-to-post advert links and text for WhatsApp Status and chats. */
export default function Promote() {
  const [done, setDone] = useState<string | null>(null);
  const [custom, setCustom] = useState('whatsapp');
  const [view, setView] = useState<'posters' | 'captions' | 'links'>('posters');
  const copy = async (id: string, t: string) => {
    try { await navigator.clipboard.writeText(t); setDone(id); setTimeout(() => setDone(null), 1500); } catch { window.prompt('Copy this:', t); }
  };
  const src = custom.trim().replace(/[^a-z0-9_-]/gi, '') || 'whatsapp';
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Promote ShopOS</h1>
        <p className="text-xs text-slate-400">Copy an advert and paste it into your WhatsApp Status or send it to contacts. Visits from the links are tracked by source.</p>
      </div>
      <div className="flex items-center gap-2 text-xs text-slate-400">
        <label htmlFor="src">Tracking source</label>
        <input id="src" value={custom} onChange={(e) => setCustom(e.target.value)} className="w-32 rounded border border-slate-600 bg-transparent px-2 py-1 text-sm" />
        <span>e.g. whatsapp, facebook, flyer</span>
      </div>
      <div className="flex gap-2">{([['posters', 'Posters'], ['captions', 'Captions'], ['links', 'Links & text']] as const).map(([k, l]) => <button key={k} onClick={() => setView(k)} className={`rounded-full border px-3 py-1.5 text-xs ${view === k ? 'bg-emerald-600 border-emerald-600 text-white' : 'border-slate-600 text-slate-300'}`}>{l}</button>)}</div>
      {view === 'posters' && <PosterStudio source={src} />}
      {view === 'captions' && <CaptionStudio source={src} />}
      {view === 'links' && ADS.map((a) => {
        const link = a.link.replace('utm_source=whatsapp', `utm_source=${src}`);
        const full = `${a.text}\n👉 ${link}`;
        return (
          <Card key={a.id}>
            <h2 className="text-sm font-semibold">{a.title}</h2>
            <pre className="mt-2 whitespace-pre-wrap rounded bg-slate-900/60 p-3 text-sm font-sans">{full}</pre>
            <div className="mt-3 flex flex-wrap gap-2">
              <button className="btn-secondary text-xs" onClick={() => void copy(a.id + 't', full)}>{done === a.id + 't' ? 'Copied ✓' : 'Copy advert'}</button>
              <button className="btn-secondary text-xs" onClick={() => void copy(a.id + 'l', link)}>{done === a.id + 'l' ? 'Copied ✓' : 'Copy link only'}</button>
              <a className="btn-secondary text-xs" target="_blank" rel="noopener noreferrer" href={`https://wa.me/?text=${encodeURIComponent(full)}`}>Share on WhatsApp</a>
            </div>
          </Card>
        );
      })}
      <p className="text-[11px] text-slate-500">WhatsApp Status can't be posted automatically: tap Copy advert, open WhatsApp → Status → text, and paste.</p>
    </div>
  );
}
