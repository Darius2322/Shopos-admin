import { create } from 'zustand';

export type ThemePreference = 'light' | 'dark' | 'system';

const STORAGE_KEY = 'shopos:theme';

function systemPrefersDark(): boolean {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches;
}

function applyTheme(pref: ThemePreference) {
  const dark = pref === 'dark' || (pref === 'system' && systemPrefersDark());
  document.documentElement.classList.toggle('dark', dark);
}

interface ThemeState {
  preference: ThemePreference;
  setPreference: (pref: ThemePreference) => void;
}

export const useTheme = create<ThemeState>((set) => ({
  preference: (localStorage.getItem(STORAGE_KEY) as ThemePreference) || 'system',
  setPreference: (pref) => {
    localStorage.setItem(STORAGE_KEY, pref);
    applyTheme(pref);
    set({ preference: pref });
  }
}));

/** Call once, as early as possible (main.tsx), so the correct theme is
 * applied before first paint — avoids a flash of the wrong theme. */
export function initTheme() {
  const stored = (localStorage.getItem(STORAGE_KEY) as ThemePreference) || 'system';
  applyTheme(stored);
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    if (useTheme.getState().preference === 'system') applyTheme('system');
  });
}
