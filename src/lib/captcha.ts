/** Cloudflare Turnstile, switched on only when VITE_TURNSTILE_SITE_KEY is set (and the same widget's secret is saved in
 * Supabase -> Authentication -> Attack Protection). Without a key nothing changes. The login page shows the check in the form;
 * other screens show it as a centred prompt. It cannot be skipped. */
const SITE_KEY = (import.meta.env.VITE_TURNSTILE_SITE_KEY as string | undefined)?.trim();
const SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';

interface TurnstileApi { render: (el: HTMLElement, o: Record<string, unknown>) => string; remove: (id: string) => void }
let loading: Promise<TurnstileApi | null> | null = null;

function load(): Promise<TurnstileApi | null> {
  if (loading) return loading;
  loading = new Promise((res) => {
    const w = window as unknown as { turnstile?: TurnstileApi };
    if (w.turnstile) return res(w.turnstile);
    const s = document.createElement('script');
    s.src = SRC; s.async = true; s.defer = true;
    s.onload = () => res(w.turnstile ?? null);
    s.onerror = () => { loading = null; res(null); };
    document.head.appendChild(s);
  });
  return loading;
}

export const captchaEnabled = !!SITE_KEY;

let preToken: string | undefined;
/** The login page solves the check inline and hands the token over here; the next sign-in consumes it. */
export function provideCaptchaToken(t?: string) { preToken = t; }

/** Renders a visible Turnstile widget into `el` (used by the inline login box). Returns a cleanup function. */
export function mountCaptcha(el: HTMLElement, cb: { onToken: (t: string) => void; onReset: () => void; onError: () => void }): () => void {
  let id: string | null = null; let dead = false; let apiRef: TurnstileApi | null = null;
  void load().then((api) => {
    if (dead) return;
    if (!api) return cb.onError();
    apiRef = api;
    try {
      id = api.render(el, { sitekey: SITE_KEY, appearance: 'always', theme: 'auto',
        callback: (t: string) => cb.onToken(t),
        'expired-callback': () => cb.onReset(),
        'timeout-callback': () => cb.onReset(),
        'error-callback': () => cb.onError() });
    } catch { cb.onError(); }
  });
  return () => { dead = true; try { if (id && apiRef) apiRef.remove(id); } catch { /* ignore */ } };
}

/** Returns a one-time token for Supabase sign-in, or undefined when CAPTCHA is not switched on.
 * When on, the check can never be skipped: without a valid token this throws. Callers without an inline box get a
 * centred prompt in the middle of the screen. */
export async function getCaptchaToken(): Promise<string | undefined> {
  if (!SITE_KEY || typeof document === 'undefined') return undefined;
  if (preToken) { const t = preToken; preToken = undefined; return t; }
  const api = await load();
  if (!api) throw new Error('Could not load the human check. Check your internet connection and try again.');
  return new Promise<string>((resolve, reject) => {
    const wrap = document.createElement('div');
    wrap.style.cssText = 'position:fixed;inset:0;z-index:2147483000;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.45);padding:16px';
    const card = document.createElement('div');
    card.style.cssText = 'background:#fff;color:#111;border-radius:14px;padding:18px;text-align:center;font:600 14px system-ui,sans-serif;max-width:340px';
    const msg = document.createElement('div'); msg.textContent = 'Verify you are human to continue'; msg.style.marginBottom = '12px';
    const box = document.createElement('div');
    const cancel = document.createElement('button'); cancel.textContent = 'Cancel'; cancel.style.cssText = 'margin-top:12px;font:500 13px system-ui;color:#555;background:none;border:0;cursor:pointer';
    card.append(msg, box, cancel); wrap.appendChild(card); document.body.appendChild(wrap);
    let id: string | null = null;
    const end = () => { try { if (id) api.remove(id); } catch { /* ignore */ } wrap.remove(); };
    cancel.onclick = () => { end(); reject(new Error('Verification cancelled.')); };
    try {
      id = api.render(box, { sitekey: SITE_KEY, appearance: 'always', theme: 'light',
        callback: (t: string) => { end(); resolve(t); },
        'error-callback': () => { end(); reject(new Error('Human check failed. Please try again.')); } });
    } catch { end(); reject(new Error('Human check failed. Please try again.')); }
  });
}
