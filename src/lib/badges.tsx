import { useEffect, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';

export interface Badges { requests: number; package_requests: number; packages_expiring: number; features: number; reviews: number; support: number; installers: number }
const EMPTY: Badges = { requests: 0, package_requests: 0, packages_expiring: 0, features: 0, reviews: 0, support: 0, installers: 0 };

let current: Badges = EMPTY;
const listeners = new Set<(b: Badges) => void>();
let timer: ReturnType<typeof setInterval> | null = null;
let client: SupabaseClient | null = null;

export async function refreshBadges() {
  if (!client) return;
  const { data, error } = await client.rpc('admin_badge_counts');
  if (error || !data) return; // a failed refresh keeps the last numbers instead of flashing zeros
  current = { ...EMPTY, ...(data as Partial<Badges>) };
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
  : tab === 'reviews' ? b.reviews : tab === 'support' ? b.support : tab === 'installers' ? b.installers : 0;

export function BadgeDot({ n, className = '' }: { n: number; className?: string }) {
  if (!n) return null;
  return <span aria-label={`${n} new`} className={`min-w-[18px] h-[18px] px-1 rounded-full bg-rust-500 text-paper text-[10px] leading-[18px] text-center font-semibold ${className}`}>{n > 99 ? '99+' : n}</span>;
}
