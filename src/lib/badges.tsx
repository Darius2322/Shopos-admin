import { useEffect, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';

export interface Badges { requests: number; package_requests: number; packages_expiring: number; features: number; reviews: number; support: number; installers: number; bk_hide_requests: number }
const EMPTY: Badges = { requests: 0, package_requests: 0, packages_expiring: 0, features: 0, reviews: 0, support: 0, installers: 0, bk_hide_requests: 0 };

let current: Badges = EMPTY;
const listeners = new Set<(b: Badges) => void>();
let timer: ReturnType<typeof setInterval> | null = null;
let client: SupabaseClient | null = null;

// ---- sound: a short two-note chime when something new arrives. Browsers only allow audio after a tap, so we unlock on the first one. ----
const MUTE_KEY = 'shopos-admin-sound';
export const soundOn = (): boolean => { try { return localStorage.getItem(MUTE_KEY) !== 'off'; } catch { return true; } };
export const setSoundOn = (on: boolean) => { try { localStorage.setItem(MUTE_KEY, on ? 'on' : 'off'); } catch { /* ignore */ } };
let ctx: AudioContext | null = null;
function audio(): AudioContext | null {
  try {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return null;
    ctx = ctx ?? new AC();
    if (ctx.state === 'suspended') void ctx.resume();
    return ctx;
  } catch { return null; }
}
if (typeof window !== 'undefined') window.addEventListener('pointerdown', () => { audio(); }, { once: true });
export function chime(notes: [number, number][] = [[784, 0], [988, 0.18], [1319, 0.36]]) {
  const c = audio();
  if (!c || c.state !== 'running') return;
  // Full-volume square-ish tones through a compressor so it is clearly audible on a phone speaker, three rising notes.
  const comp = c.createDynamicsCompressor(); comp.connect(c.destination);
  notes.forEach(([f, at]) => {
    const o = c.createOscillator(); const g = c.createGain();
    o.type = 'triangle'; o.frequency.value = f;
    const t = c.currentTime + at;
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(1, t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.5);
    o.connect(g).connect(comp); o.start(t); o.stop(t + 0.55);
  });
}

// Each kind of news has its own sound, a buzz and a line of text, so the admin knows what arrived without looking.
const KINDS: [keyof Badges, string, [number, number][], number[]][] = [
  ['requests', 'New owner request', [[784, 0], [988, 0.18], [1319, 0.36]], [200, 100, 200]],
  ['package_requests', 'New package request', [[659, 0], [880, 0.16], [1175, 0.32], [1568, 0.48]], [300, 100, 300]],
  ['support', 'New support message', [[880, 0], [698, 0.2]], [150]],
  ['reviews', 'New review', [[1047, 0]], [100]],
  ['bk_hide_requests', 'A business asked to hide a review', [[523, 0], [659, 0.15], [523, 0.3]], [200, 100, 200]],
  ['features', 'New feature request', [[440, 0], [554, 0.15]], [150]],
  ['installers', 'New installer request', [[587, 0], [740, 0.15]], [150]],
];
function toast(text: string) {
  try {
    const el = document.createElement('div'); el.textContent = text; el.setAttribute('role', 'status');
    el.style.cssText = 'position:fixed;left:50%;top:calc(14px + env(safe-area-inset-top,0px));transform:translateX(-50%);z-index:2147483000;max-width:88vw;background:#0f766e;color:#fff;font:600 13px system-ui,sans-serif;padding:10px 16px;border-radius:14px;box-shadow:0 6px 24px rgba(0,0,0,.35)';
    document.body.appendChild(el); window.setTimeout(() => el.remove(), 4000);
  } catch { /* ignore */ }
}
function announce(next: Badges, prev: Badges) {
  const grown = KINDS.filter(([k]) => next[k] > prev[k]);
  if (!grown.length) return;
  const [, label, notes, buzz] = grown[0];
  const extra = grown.length > 1 ? ` (+${grown.length - 1} more)` : '';
  toast(label + extra);
  if (soundOn()) chime(notes);
  try { navigator.vibrate?.(buzz); } catch { /* ignore */ }
  try { if (document.hidden && 'Notification' in window && Notification.permission === 'granted') new Notification('ShopOS Admin', { body: label + extra, icon: '/logo-emblem.png' }); } catch { /* ignore */ }
}
const total = (b: Badges) => b.requests + b.package_requests + b.features + b.reviews + b.support + b.installers + b.bk_hide_requests;
let seeded = false;

export async function refreshBadges() {
  if (!client) return;
  const { data, error } = await client.rpc('admin_badge_counts');
  if (error || !data) return; // a failed refresh keeps the last numbers instead of flashing zeros
  const next = { ...EMPTY, ...(data as Partial<Badges>) };
  if (seeded && total(next) > total(current)) announce(next, current);
  seeded = true;
  current = next;
  for (const t of ['requests', 'packages', 'features', 'reviews', 'support', 'installers', 'apps']) if (seen[t] != null && seen[t] > rawFor(next, t)) seen[t] = rawFor(next, t);
  listeners.forEach((l) => l(current));
}

/** Live "new" counts for the menus and sub-menus. Refreshes every minute, when the tab regains focus and after any change made here. */
export function useBadges(supabase: SupabaseClient): Badges {
  const [b, setB] = useState<Badges>(current);
  useEffect(() => {
    client = supabase;
    listeners.add(setB);
    void refreshBadges();
    if (!timer) timer = setInterval(() => { void refreshBadges(); }, 60_000);
    const onFocus = () => { void refreshBadges(); };
    window.addEventListener('focus', onFocus);
    window.addEventListener('badges:refresh', onFocus);
    return () => {
      listeners.delete(setB);
      window.removeEventListener('focus', onFocus);
      window.removeEventListener('badges:refresh', onFocus);
      if (listeners.size === 0 && timer) { clearInterval(timer); timer = null; }
    };
  }, [supabase]);
  return b;
}

// A menu's number drops as soon as it is opened and returns only for requests that arrive afterwards.
const SEEN_KEY = 'shopos-admin-seen';
let seen: Record<string, number> = (() => { try { return JSON.parse(localStorage.getItem(SEEN_KEY) ?? '{}'); } catch { return {}; } })();
export function markTabSeen(tab: string) {
  const n = rawFor(current, tab); if (seen[tab] === n) return;
  seen = { ...seen, [tab]: n }; try { localStorage.setItem(SEEN_KEY, JSON.stringify(seen)); } catch { /* ignore */ }
  listeners.forEach((l) => l({ ...current }));
}
export const badgeFor = (b: Badges, tab: string): number => Math.max(0, rawFor(b, tab) - Math.min(seen[tab] ?? 0, rawFor(b, tab)));
const rawFor = (b: Badges, tab: string): number =>
  tab === 'requests' ? b.requests : tab === 'packages' ? b.package_requests : tab === 'features' ? b.features
  : tab === 'reviews' ? b.reviews + b.bk_hide_requests : tab === 'support' ? b.support : (tab === 'installers' || tab === 'apps') ? b.installers : 0;

/** Menu groups: the number on a group is the sum of what is new inside it. */
export const groupCount = (b: Badges, tabs: string[]): number => tabs.reduce((n, t) => n + badgeFor(b, t), 0);

export function BadgeDot({ n, className = '' }: { n: number; className?: string }) {
  if (!n) return null;
  return <span aria-label={`${n} new`} className={`min-w-[18px] h-[18px] px-1 rounded-full bg-rust-500 text-paper text-[10px] leading-[18px] text-center font-semibold ${className}`}>{n > 99 ? '99+' : n}</span>;
}
