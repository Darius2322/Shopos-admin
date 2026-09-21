import { create } from 'zustand';
import { startBreak, endBreak, getAutoLockMinutes } from './breaks';

interface LockState {
  locked: boolean;
  reason: 'break' | 'idle' | null;
  activeBreakId: string | null;
  lock: (reason: 'break' | 'idle') => void;
  unlock: () => void;
  takeBreak: (businessId: string, branchId: string, userId: string) => Promise<void>;
  resumeFromBreak: () => Promise<void>;
}

export const useLock = create<LockState>((set, get) => ({
  locked: false,
  reason: null,
  activeBreakId: null,

  lock: (reason) => set({ locked: true, reason }),
  unlock: () => set({ locked: false, reason: null }),

  async takeBreak(businessId, branchId, userId) {
    const id = await startBreak({ businessId, branchId, userId });
    set({ locked: true, reason: 'break', activeBreakId: id });
  },

  async resumeFromBreak() {
    const id = get().activeBreakId;
    if (id) await endBreak(id);
    set({ locked: false, reason: null, activeBreakId: null });
  }
}));

let idleTimer: number | undefined;

/** Resets the idle countdown on any user interaction. Call once from the
 * app shell; does nothing if auto-lock is set to "Never" (0 minutes). */
export function initAutoLock() {
  const resetTimer = () => {
    const minutes = getAutoLockMinutes();
    if (idleTimer) window.clearTimeout(idleTimer);
    if (minutes <= 0) return;
    idleTimer = window.setTimeout(() => {
      if (!useLock.getState().locked) useLock.getState().lock('idle');
    }, minutes * 60 * 1000);
  };
  ['mousedown', 'keydown', 'touchstart', 'scroll'].forEach((evt) =>
    window.addEventListener(evt, resetTimer, { passive: true })
  );
  resetTimer();
}
