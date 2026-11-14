const compareVersions = (a: string, b: string) => { const pa = a.split(/[.+-]/).map((x) => parseInt(x, 10) || 0), pb = b.split(/[.+-]/).map((x) => parseInt(x, 10) || 0); for (let i = 0; i < Math.max(pa.length, pb.length); i++) { const d = (pa[i] ?? 0) - (pb[i] ?? 0); if (d !== 0) return d; } return 0; };

export interface UpdateResult { found: boolean; mine?: string; latest?: string; screens: boolean }

/** A small message at the top of the screen that goes away by itself. */
export function flash(msg: string) {
  if (typeof document === 'undefined') return;
  const el = document.createElement('div');
  el.textContent = msg;
  el.style.cssText = 'position:fixed;top:14px;left:50%;transform:translateX(-50%);z-index:2147483000;background:#0f172a;color:#fff;padding:10px 16px;border-radius:999px;font:600 13px system-ui,sans-serif;box-shadow:0 4px 16px rgba(0,0,0,.3);max-width:90vw;text-align:center';
  document.body.appendChild(el);
  window.setTimeout(() => el.remove(), 2200);
}

/** Asks, for real, whether a newer version exists: the app file (Android app only) and the app screens (service worker).
 * Only returns found=true when the server's version is higher than the one running. */
export async function checkForNewVersion(): Promise<UpdateResult> {
  const m = /ShopOSAdmin\/([0-9A-Za-z.+-]+)/.exec(typeof navigator !== 'undefined' ? navigator.userAgent : '');
  const res: UpdateResult = { found: false, screens: false };
  if (m) {
    res.mine = m[1];
    try {
      const r = await fetch('https://www.shopos.co.ke/downloads/android/latest-admin.json', { cache: 'no-store' });
      if (r.ok && (r.headers.get('content-type') ?? '').includes('json')) {
        const j = await r.json();
        if (j?.version) { res.latest = String(j.version); if (compareVersions(res.latest, m[1]) > 0) res.found = true; }
      }
    } catch { /* offline */ }
  }
  try {
    const reg = await navigator.serviceWorker?.getRegistration();
    if (reg) { await reg.update(); if (reg.waiting) { res.screens = true; res.found = true; } }
  } catch { /* offline */ }
  return res;
}
