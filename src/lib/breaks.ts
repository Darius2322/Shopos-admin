import { db, enqueueSync } from './db';
import { supabase } from './supabase';

export interface StartBreakInput {
  businessId: string;
  branchId: string;
  userId: string;
}

/** Starts a tracked break — the POS lock itself is a local UI state (see
 * useLockStore), this just creates the auditable record of when/who. */
export async function startBreak(input: StartBreakInput): Promise<string> {
  const id = crypto.randomUUID();
  const record = {
    id,
    businessId: input.businessId,
    branchId: input.branchId,
    userId: input.userId,
    startedAt: new Date().toISOString(),
    endedAt: null
  };
  // break_sessions has no offline sync mapper wired up in this build (it's
  // a low-stakes convenience log, not financial data) — written directly
  // when online, silently skipped offline rather than queued.
  if (supabase && navigator.onLine) {
    await supabase.from('break_sessions').insert({
      id, business_id: input.businessId, branch_id: input.branchId,
      user_id: input.userId, started_at: record.startedAt
    });
  }
  return id;
}

export async function endBreak(breakId: string) {
  if (supabase && navigator.onLine) {
    await supabase.from('break_sessions').update({ ended_at: new Date().toISOString() }).eq('id', breakId);
  }
}

/** Verifies the given password against the currently signed-in user's
 * account, without changing the active session — used to unlock the POS
 * after a break or an auto-lock timeout, and for biometric-unavailable
 * fallback. Supabase has no "verify without switching session" primitive,
 * so this re-authenticates in a way that refreshes (not replaces) the
 * existing session for the same user. */
export async function verifyPassword(email: string, password: string): Promise<boolean> {
  if (!supabase) return false;
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  return !error;
}

const AUTO_LOCK_KEY = 'shopos:autoLockMinutes';

export function getAutoLockMinutes(): number {
  const stored = localStorage.getItem(AUTO_LOCK_KEY);
  return stored ? parseInt(stored, 10) : 0; // 0 = never
}

export function setAutoLockMinutes(minutes: number) {
  localStorage.setItem(AUTO_LOCK_KEY, String(minutes));
}
