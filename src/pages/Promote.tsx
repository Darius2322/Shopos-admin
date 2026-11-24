import { useState } from 'react';
import { Card } from '../components/ui';

const BASE = 'https://www.shopos.co.ke';
const ADS = [
  { id: 'pos', title: 'POS (shop) advert', link: `${BASE}/?utm_source=whatsapp&utm_medium=ad`, text: '🛒 *Run your shop from your phone with ShopOS*\nSales, stock, M-Pesa, debts, receipts and daily reports, even offline.' },
  { id: 'booking', title: 'Booking advert', link: `${BASE}/book?utm_source=whatsapp&utm_medium=ad`, text: '📅 *Let customers book you online 24/7*\nSalons, barbers, clinics and studios: get your own booking link, reminders and M-Pesa deposits. Set up in minutes.' },
];

/** Ready-to-post advert links and text for WhatsApp Status and chats. */
export default function Promote() {
  const [done, setDone] = useState<string | null>(null);
  const [custom, setCustom] = useState('whatsapp');
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
      {ADS.map((a) => {
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
