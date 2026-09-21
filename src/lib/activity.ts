import { supabase, backendConfigured } from './supabase';
import { useAuth } from './auth';

export type ActivityKind = 'login' | 'logout' | 'sale' | 'inventory' | 'dashboard';

const lastSent: Record<string, number> = {};
const CLIENT_THROTTLE_MS = 60_000;

/**
 * Best-effort "this business did something meaningful" heartbeat for the
 * admin panel's Last Active column. Never blocks or throws: the POS is
 * offline-first, so a failed/skipped ping must never affect a sale.
 * The server (touch_business_activity) checks membership, whitelists the
 * kind and throttles again, so this is only a courtesy to save requests.
 */
export function touchActivity(kind: ActivityKind, businessId?: string | null): void {
  try {
    if (!backendConfigured() || !supabase || !navigator.onLine) return;
    const id = businessId ?? useAuth.getState().business?.id;
    if (!id) return;
    const now = Date.now();
    const force = kind === 'login' || kind === 'logout';
    if (!force && now - (lastSent[id + kind] ?? 0) < CLIENT_THROTTLE_MS) return;
    lastSent[id + kind] = now;
    void supabase.rpc('touch_business_activity', { p_business_id: id, p_kind: kind }).then(() => undefined, () => undefined);
  } catch { /* activity tracking must never break the app */ }
}
