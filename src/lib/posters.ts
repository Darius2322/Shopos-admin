export type Product = 'pos' | 'booking';
export interface PosterSpec { id: string; product: Product; headline: string; sub: string; bullets: string[]; cta: string; pal: { bg1: string; bg2: string; ink: string; accent: string; chip: string }; layout: 'center' | 'left' | 'band'; }

const HEAD: Record<Product, string[]> = {
  pos: ['Run your shop from your phone', 'Know your profit every single day', 'Stop losing money to missing stock', 'Sell faster. Track every shilling.', 'Your shop. Your phone. Your control.', 'Sales, stock and debts in one app', 'Close the day without the headache'],
  booking: ['Let customers book you 24/7', 'Fewer no-shows. More bookings.', 'Your appointment book, online', 'Get booked while you sleep', 'Your own booking link in minutes', 'Stop answering "are you free?"'],
};
const SUB: Record<Product, string[]> = {
  pos: ['Made for shops in Kenya', 'Works even without internet', 'M-Pesa ready · receipts · reports'],
  booking: ['Made for salons, barbers and clinics', 'Reminders and deposits built in', 'Share one link on WhatsApp'],
};
const BUL: Record<Product, string[]> = {
  pos: ['Sell and print receipts', 'Track stock and low-stock alerts', 'Record debts and send reminders', 'Daily sales reports', 'Works offline', 'M-Pesa payments'],
  booking: ['Online booking page', 'Automatic reminders', 'M-Pesa deposits', 'Manage staff and services', 'No more double bookings', 'Share on WhatsApp'],
};
const CTA: Record<Product, string[]> = { pos: ['Try ShopOS today', 'Get ShopOS now'], booking: ['Get your booking link', 'Start taking bookings', 'Book a demo'] };
const PALS = [
  { bg1: '#064e3b', bg2: '#10b981', ink: '#ffffff', accent: '#fde68a', chip: 'rgba(255,255,255,.16)' },
  { bg1: '#0f172a', bg2: '#334155', ink: '#ffffff', accent: '#34d399', chip: 'rgba(255,255,255,.12)' },
  { bg1: '#7c2d12', bg2: '#f97316', ink: '#ffffff', accent: '#fff7ed', chip: 'rgba(255,255,255,.18)' },
  { bg1: '#1e1b4b', bg2: '#6366f1', ink: '#ffffff', accent: '#fcd34d', chip: 'rgba(255,255,255,.16)' },
  { bg1: '#f0fdf4', bg2: '#bbf7d0', ink: '#064e3b', accent: '#047857', chip: 'rgba(6,78,59,.10)' },
  { bg1: '#fffbeb', bg2: '#fde68a', ink: '#451a03', accent: '#b45309', chip: 'rgba(69,26,3,.10)' },
];
const pick = <T,>(a: T[], n: number) => a[n % a.length];
const rnd = () => Math.floor(Math.random() * 1e6);

/** A fresh set of different poster designs. Each press gives new combinations of wording, colours and layout. */
export function generatePosters(product: Product, n = 6): PosterSpec[] {
  const out: PosterSpec[] = []; const usedH = new Set<string>();
  const heads = [...HEAD[product]].sort(() => Math.random() - 0.5);
  const pals = [...PALS].sort(() => Math.random() - 0.5);
  for (let i = 0; i < n; i++) {
    const headline = heads[i % heads.length]; usedH.add(headline);
    const bl = [...BUL[product]].sort(() => Math.random() - 0.5).slice(0, 3);
    out.push({ id: `${Date.now()}-${i}-${rnd()}`, product, headline, sub: pick(SUB[product], rnd()), bullets: bl, cta: pick(CTA[product], rnd()), pal: pals[i % pals.length], layout: (['center', 'left', 'band'] as const)[i % 3] });
  }
  return out;
}

function wrap(ctx: CanvasRenderingContext2D, text: string, maxW: number): string[] {
  const words = text.split(' '); const lines: string[] = []; let cur = '';
  for (const w of words) { const t = cur ? `${cur} ${w}` : w; if (ctx.measureText(t).width > maxW && cur) { lines.push(cur); cur = w; } else cur = t; }
  if (cur) lines.push(cur); return lines;
}
function rr(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }

let logoP: Promise<HTMLImageElement | null> | null = null;
/** The ShopOS emblem, loaded once. Resolves to null if it can't be loaded so posters still draw. */
export function loadLogo(): Promise<HTMLImageElement | null> {
  logoP ??= new Promise((res) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => res(null); i.src = '/logo-emblem.png'; });
  return logoP;
}

/** Draws a 9:16 poster (WhatsApp Status size). `link` is the short text shown at the bottom. */
export function drawPoster(canvas: HTMLCanvasElement, s: PosterSpec, link: string, width = 1080, logo: HTMLImageElement | null = null) {
  const W = width, H = Math.round(width * 16 / 9), k = W / 1080; canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d'); if (!ctx) return;
  const g = ctx.createLinearGradient(0, 0, W, H); g.addColorStop(0, s.pal.bg1); g.addColorStop(1, s.pal.bg2); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  // soft decorative shapes
  ctx.fillStyle = s.pal.chip; ctx.beginPath(); ctx.arc(W * 0.9, H * 0.12, 260 * k, 0, 7); ctx.fill(); ctx.beginPath(); ctx.arc(W * 0.05, H * 0.85, 330 * k, 0, 7); ctx.fill();
  if (s.layout === 'band') { ctx.fillStyle = s.pal.chip; ctx.fillRect(0, H * 0.36, W, H * 0.34); }
  const align: CanvasTextAlign = s.layout === 'left' ? 'left' : 'center'; const px = s.layout === 'left' ? 90 * k : W / 2; const maxW = W - 180 * k;
  ctx.textAlign = align; ctx.textBaseline = 'alphabetic'; ctx.fillStyle = s.pal.ink;
  // wordmark
  ctx.font = `800 ${72 * k}px system-ui, -apple-system, Segoe UI, Roboto, sans-serif`;
  const L = logo ? 150 * k : 0; const gap = logo ? 28 * k : 0; const tw = ctx.measureText('ShopOS').width; const rowW = L + gap + tw;
  const rx = align === 'left' ? px : px - rowW / 2; const ry = 100 * k;
  if (logo) { ctx.save(); rr(ctx, rx, ry, L, L, 34 * k); ctx.clip(); ctx.drawImage(logo, rx, ry, L, L); ctx.restore(); }
  ctx.textAlign = 'left'; ctx.fillText('ShopOS', rx + L + gap, ry + L / 2 + 25 * k); ctx.textAlign = align;
  // headline
  ctx.fillStyle = s.pal.ink; ctx.font = `800 ${112 * k}px system-ui, -apple-system, Segoe UI, Roboto, sans-serif`;
  let y = H * 0.30; for (const line of wrap(ctx, s.headline, maxW)) { ctx.fillText(line, px, y); y += 128 * k; }
  ctx.fillStyle = s.pal.accent; ctx.font = `600 ${46 * k}px system-ui, -apple-system, Segoe UI, Roboto, sans-serif`; y += 10 * k;
  for (const line of wrap(ctx, s.sub, maxW)) { ctx.fillText(line, px, y); y += 62 * k; }
  // bullets as chips
  y = Math.max(y + 60 * k, H * 0.58); ctx.font = `600 ${44 * k}px system-ui, -apple-system, Segoe UI, Roboto, sans-serif`;
  for (const b of s.bullets) {
    const tw = ctx.measureText(b).width + 120 * k; const bx = align === 'left' ? px : px - tw / 2;
    ctx.fillStyle = s.pal.chip; rr(ctx, bx, y - 56 * k, tw, 84 * k, 42 * k); ctx.fill();
    ctx.fillStyle = s.pal.accent; ctx.beginPath(); ctx.arc(bx + 42 * k, y - 14 * k, 12 * k, 0, 7); ctx.fill();
    ctx.fillStyle = s.pal.ink; ctx.textAlign = 'left'; ctx.fillText(b, bx + 76 * k, y); ctx.textAlign = align; y += 112 * k;
  }
  // call to action + link
  const cy = H - 330 * k; ctx.font = `800 ${54 * k}px system-ui, -apple-system, Segoe UI, Roboto, sans-serif`;
  const cw = ctx.measureText(s.cta).width + 140 * k; const cx = align === 'left' ? px : px - cw / 2;
  ctx.fillStyle = s.pal.accent; rr(ctx, cx, cy, cw, 118 * k, 59 * k); ctx.fill();
  ctx.fillStyle = s.pal.bg1.length ? (['#f0fdf4', '#fffbeb'].includes(s.pal.bg1) ? '#ffffff' : s.pal.bg1) : '#000'; ctx.textAlign = 'center'; ctx.fillText(s.cta, cx + cw / 2, cy + 77 * k);
  ctx.textAlign = align; ctx.fillStyle = s.pal.ink; ctx.font = `600 ${44 * k}px system-ui, -apple-system, Segoe UI, Roboto, sans-serif`; ctx.fillText(link, px, H - 150 * k);
}
