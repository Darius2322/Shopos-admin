import { useEffect, useRef } from 'react';

/** Phone navigation: the Android back button / swipe-back should close the open sheet or page, then go back a screen, instead of leaving the app.
 * Every pop-up, detail page and sheet registers here while it is open; one back press closes the top-most one. Menu tabs that are kept in
 * state (not in the address) register too, so back returns to the previous tab. */
type Entry = { id: number; close: () => void };
const overlays: Entry[] = [];
type TabEntry = { id: number; onBack: (t: string | null) => void };
const tabHandlers: TabEntry[] = [];
let n = 0; let ignore = 0; let wired = false;
type St = Record<string, unknown> | null;
const st = (): St => (window.history.state ?? null) as St;

function wire() {
  if (wired || typeof window === 'undefined') return; wired = true;
  window.addEventListener('popstate', () => {
    if (ignore > 0) { ignore--; return; }
    const top = overlays.pop();
    if (top) { top.close(); return; }
    const t = tabHandlers[tabHandlers.length - 1];
    if (t) t.onBack(typeof st()?.soTab === 'string' ? (st()!.soTab as string) : null);
  });
}

/** While `open` is true, the phone's back action calls onClose. Closing with the on-screen button leaves no extra history behind. */
export function useBackClose(open: boolean, onClose: () => void) {
  const ref = useRef(onClose); ref.current = onClose;
  useEffect(() => {
    if (!open) return; wire();
    const entry: Entry = { id: ++n, close: () => ref.current() };
    overlays.push(entry);
    window.history.pushState({ ...(st() ?? {}), soOverlay: entry.id }, '');
    return () => {
      const i = overlays.indexOf(entry);
      if (i === -1) return; // closed by the back button itself
      overlays.splice(i, 1);
      if (st()?.soOverlay === entry.id) { ignore++; window.history.back(); }
    };
  }, [open]);
}

/** Keeps a state-based tab in the phone's history: choosing a tab adds a step, back returns to the previous tab (and finally leaves). */
export function useTabHistory<T extends string>(tab: T, setTab: (t: T) => void, home: T) {
  const skip = useRef(true); const cur = useRef(tab); cur.current = tab;
  useEffect(() => {
    if (skip.current) { skip.current = false; return; }
    window.history.pushState({ ...(st() ?? {}), soTab: tab }, '');
  }, [tab]);
  useEffect(() => {
    wire();
    const entry: TabEntry = { id: ++n, onBack: (t) => { skip.current = true; setTab(((t as T | null) ?? home)); } };
    tabHandlers.push(entry);
    return () => { const i = tabHandlers.indexOf(entry); if (i !== -1) tabHandlers.splice(i, 1); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}

/** Safety net for every pop-up, sheet and full-screen panel that has not been wired one by one: when a full-screen layer opens, it is
 * added to the phone's history, so back closes it (by pressing its close/cancel button, or tapping outside it) instead of leaving the app. */
export function installOverlayAutoBack() {
  if (typeof window === 'undefined' || typeof MutationObserver === 'undefined') return;
  const seen = new WeakSet<Element>();
  const isLayer = (el: Element) => {
    const c = (el as HTMLElement).className; if (typeof c !== 'string') return false;
    if (!/(^|\s)fixed(\s|$)/.test(c) || !/(^|\s)inset-0(\s|$)/.test(c)) return false;
    if (/pointer-events-none|(^|\s)-z-|hidden/.test(c) || el.hasAttribute('data-no-back') || el.getAttribute('aria-busy') === 'true') return false;
    return true;
  };
  const closeIt = (el: Element) => {
    const q = (sel: string) => el.querySelector<HTMLElement>(sel);
    const btn = q('[data-close],button[aria-label*="lose" i],button[aria-label*="ancel" i],button[aria-label*="ismiss" i],button[aria-label*="ack" i]')
      ?? Array.from(el.querySelectorAll<HTMLElement>('button')).find((b) => /^(close|cancel|done|back|dismiss|not now|no)$/i.test((b.textContent ?? '').trim()));
    if (btn) { btn.click(); return; }
    (el as HTMLElement).dispatchEvent(new MouseEvent('click', { bubbles: true }));
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  };
  const register = (el: Element) => {
    if (seen.has(el)) return; seen.add(el);
    const before = overlays.length;
    window.setTimeout(() => {
      if (!el.isConnected || overlays.length > before) return; // gone already, or it already handles back itself
      wire();
      const entry: Entry = { id: ++n, close: () => {
        closeIt(el);
        window.setTimeout(() => { // still open: the press was used up, so keep a step in the history for the next one
          if (el.isConnected && !overlays.includes(entry)) { overlays.push(entry); window.history.pushState({ ...(st() ?? {}), soOverlay: entry.id }, ''); }
        }, 250);
      } };
      overlays.push(entry);
      window.history.pushState({ ...(st() ?? {}), soOverlay: entry.id }, '');
      const watch = new MutationObserver(() => {
        if (el.isConnected) return; watch.disconnect();
        const i = overlays.indexOf(entry); if (i === -1) return;
        overlays.splice(i, 1);
        if (st()?.soOverlay === entry.id) { ignore++; window.history.back(); }
      });
      watch.observe(document.body, { childList: true, subtree: true });
    }, 60);
  };
  new MutationObserver((muts) => {
    for (const m of muts) m.addedNodes.forEach((node) => {
      if (!(node instanceof Element)) return;
      if (isLayer(node)) register(node);
      else node.querySelectorAll('.fixed.inset-0').forEach((e) => { if (isLayer(e)) register(e); });
    });
  }).observe(document.body, { childList: true, subtree: true });
}

/** First-screen guard for the installed apps. A hidden step is kept under the first screen, so the phone's back button always reaches our own
 * code before the app can close. From there: go back to the page the person came from, or, on the home screen, ask to press back
 * once more to leave. This works the same in the Android app and in an installed web app, with or without the newest app file. */
type Nav = (to: string) => void;
let navFn: Nav | null = null; let trail: string[] = []; let armedAt = 0;
export function setGuardNavigator(fn: Nav) { navFn = fn; }
export function trackRoute(path: string, kind: 'PUSH' | 'REPLACE' | 'POP') {
  if (kind === 'REPLACE') { if (trail.length) trail[trail.length - 1] = path; else trail.push(path); }
  else if (kind === 'POP') { if (trail.length > 1 && trail[trail.length - 2] === path) trail.pop(); else if (trail[trail.length - 1] !== path) trail.push(path); }
  else if (trail[trail.length - 1] !== path) trail.push(path);
  if (trail.length > 60) trail = trail.slice(-60);
}
function toastExit() {
  const el = document.createElement('div'); el.textContent = 'Press back again to exit';
  el.style.cssText = 'position:fixed;left:50%;bottom:90px;transform:translateX(-50%);z-index:2147483000;background:rgba(20,20,20,.92);color:#fff;font:500 13px system-ui,sans-serif;padding:9px 16px;border-radius:999px';
  document.body.appendChild(el); window.setTimeout(() => el.remove(), 1800);
}
let guardOn = false;
export function installRootGuard(isApp: boolean) {
  if (guardOn || typeof window === 'undefined' || !isApp) return; guardOn = true;
  if (!st()?.soRoot) { window.history.replaceState({ ...(st() ?? {}), soRoot: true }, ''); window.history.pushState({ ...(st() ?? {}), soRoot: false }, ''); }
  window.addEventListener('popstate', () => {
    if (ignore > 0 || !st()?.soRoot) return;
    if (overlays.length || tabHandlers.length && typeof st()?.soTab === 'string') return;
    // Landed on the hidden first step: decide what back means here.
    if (trail.length > 1 && navFn) { trail.pop(); const prev = trail[trail.length - 1]; navFn(prev); return; }
    if (Date.now() - armedAt < 1800) { armedAt = 0; window.history.back(); return; } // second press: leave
    armedAt = Date.now(); toastExit();
    window.history.pushState({ ...(st() ?? {}), soRoot: false }, '');
  });
}
