import { useEffect, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';

export interface Badges { requests: number; package_requests: number; packages_expiring: number; features: number; reviews: number; support: number; installers: number }
const EMPTY: Badges = { requests: 0, package_requests: 0, packages_expiring: 0, features: 0, reviews: 0, support: 0, installers: 0 };

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
export function chime() {
  const c = audio();
  if (!c || c.state !== 'running') return;
  // Full-volume square-ish tones through a compressor so it is clearly audible on a phone speaker, three rising notes.
  const comp = c.createDynamicsCompressor(); comp.connect(c.destination);
  [[784, 0], [988, 0.18], [1319, 0.36]].forEach(([f, at]) => {
    const o = c.createOscillator(); const g = c.createGain();
    o.type = 'triangle'; o.frequency.value = f;
    const t = c.currentTime + at;
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(1, t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.5);
    o.connect(g).connect(comp); o.start(t); o.stop(t + 0.55);
  });
}
const total = (b: Badges) => b.requests + b.package_requests + b.features + b.reviews + b.support + b.installers;
let seeded = false;

export async function refreshBadges() {
  if (!client) return;
  const { data, error } = await client.rpc('admin_badge_counts');
  if (error || !data) return; // a failed refresh keeps the last numbers instead of flashing zeros
  const next = { ...EMPTY, ...(data as Partial<Badges>) };
  if (seeded && total(next) > total(current) && soundOn()) chime();
  seeded = true;
  current = next;
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

export const badgeFor = (b: Badges, tab: string): number =>
  tab === 'requests' ? b.requests : tab === 'packages' ? b.package_requests : tab === 'features' ? b.features
  : tab === 'reviews' ? b.reviews : tab === 'support' ? b.support : (tab === 'installers' || tab === 'apps') ? b.installers : 0;

/** Menu groups: the number on a group is the sum of what is new inside it. */
export const groupCount = (b: Badges, tabs: string[]): number => tabs.reduce((n, t) => n + badgeFor(b, t), 0);

export function BadgeDot({ n, className = '' }: { n: number; className?: string }) {
  if (!n) return null;
  return <span aria-label={`${n} new`} className={`min-w-[18px] h-[18px] px-1 rounded-full bg-rust-500 text-paper text-[10px] leading-[18px] text-center font-semibold ${className}`}>{n > 99 ? '99+' : n}</span>;
}
