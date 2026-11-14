import { useEffect, useState } from 'react';
import { useBackClose } from '../lib/backStack';
import { Download, Smartphone, X } from 'lucide-react';

/** "Download app": the Android APK with step-by-step install instructions. The web app (PWA) install stays below it as the second choice.
 * Hidden inside the phone app itself. */
export type AppKind = 'owner' | 'booker' | 'admin';
const APPS: Record<AppKind, { label: string; file: string; meta: string }> = {
  owner: { label: 'ShopOS', file: 'ShopOS.apk', meta: 'latest.json' },
  booker: { label: 'ShopOS Book', file: 'ShopOS-Booker.apk', meta: 'latest-booker.json' },
  admin: { label: 'ShopOS Admin', file: 'ShopOS-Admin.apk', meta: 'latest-admin.json' }
};
/** Where the APK files live. The admin site is on another address, so it points at the main site. */
const BASE = (import.meta as unknown as { env?: Record<string, string> }).env?.VITE_APK_BASE || (typeof location !== 'undefined' && location.hostname.startsWith('admin.') ? 'https://www.shopos.co.ke' : '');

type BIP = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };
let deferred: BIP | null = null;
if (typeof window !== 'undefined') window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferred = e as BIP; });

export function DownloadApp({ app, className = '' }: { app: AppKind; className?: string }) {
  const a = APPS[app];
  const [open, setOpen] = useState(false);
  const [info, setInfo] = useState<{ version: string; size: number | null } | null | undefined>(undefined);
  const [canPwa, setCanPwa] = useState(!!deferred);
  useBackClose(open, () => setOpen(false));
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';
  const native = /ShopOS(App|Admin|Booker)\//.test(ua);
  const ios = /iPhone|iPad|iPod/i.test(ua);
  const standalone = typeof window !== 'undefined' && window.matchMedia?.('(display-mode: standalone)').matches;
  useEffect(() => {
    if (!open) return;
    let live = true;
    void fetch(`${BASE}/downloads/android/${a.meta}`, { cache: 'no-store' })
      .then((r) => (r.ok && (r.headers.get('content-type') ?? '').includes('json') ? r.json() : null))
      .then((j) => { if (live) setInfo(j && typeof j.version === 'string' ? { version: j.version, size: Number(j.size) || null } : null); })
      .catch(() => { if (live) setInfo(null); });
    const t = window.setInterval(() => setCanPwa(!!deferred), 800);
    return () => { live = false; window.clearInterval(t); };
  }, [open, a.meta]);
  // Already installed (the Android app, or the web app on the home screen): nothing to download or explain.
  if (native || standalone || (typeof navigator !== 'undefined' && (navigator as unknown as { standalone?: boolean }).standalone)) return null;
  const href = `${BASE}/downloads/android/${a.file}`;
  const mb = info?.size ? `${(info.size / 1048576).toFixed(1)} MB` : '';
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={`btn-primary w-full min-h-[48px] inline-flex items-center justify-center gap-2 ${className}`}><Smartphone className="w-4 h-4" />Download app</button>
      {open && (
        <div className="fixed inset-0 z-[90] flex items-end sm:items-center justify-center p-0 sm:p-4" role="dialog" aria-modal="true">
          <div className="absolute inset-0 bg-black/60" onClick={() => setOpen(false)} />
          <div className="relative card w-full max-w-md max-h-[92vh] overflow-y-auto p-5 space-y-4 rounded-b-none sm:rounded-b-card">
            <div className="flex items-start justify-between gap-3">
              <div><h3 className="font-display font-semibold text-lg">Get the {a.label} Android app</h3><p className="text-xs text-slate-500">The real app: notifications, a ShopOS folder on your phone, and updates that install by themselves.</p></div>
              <button onClick={() => setOpen(false)} aria-label="Close" className="p-1 text-slate-400"><X className="w-5 h-5" /></button>
            </div>
            {ios ? <p className="text-sm text-slate-600">The Android app is for Android phones. On iPhone, tap the Share button in Safari, then “Add to Home Screen”.</p> : <>
              <a href={href} download onClick={() => { window.dispatchEvent(new CustomEvent('shopos:apk-started', { detail: a.file })); }} className="btn-primary w-full min-h-[48px] inline-flex items-center justify-center gap-2"><Download className="w-4 h-4" />Download APK{info ? ` (v${info.version}${mb ? `, ${mb}` : ''})` : ''}</a>
              {info === null && <p className="text-xs text-amber-600">The app file is not published yet. If the download fails, use the web app below for now.</p>}
              <ol className="space-y-2.5">{[
                'Tap “Download APK”. If Chrome warns that this type of file can be harmful, tap Download anyway. It is our own app.',
                'When it finishes, tap Open on the download message, or open the Files app → Downloads → tap the .apk file.',
                'If Android says it cannot install from this source, tap Settings, switch on “Allow from this source”, go back and tap Install.',
                `Tap Open, sign in, and allow notifications when asked. Later versions install over this one: never uninstall the app, just open the new file.`
              ].map((t, i) => <li key={i} className="flex gap-3 text-sm"><span className="w-6 h-6 rounded-full bg-field-50 text-field-700 text-xs font-semibold flex items-center justify-center shrink-0 mt-0.5">{i + 1}</span><span>{t}</span></li>)}</ol>
            </>}
            <div className="border-t border-slate-300/40 pt-3 space-y-2">
              <p className="text-sm font-medium">Or use the web app (PWA)</p>
              {canPwa ? <button onClick={async () => { if (!deferred) return; await deferred.prompt(); await deferred.userChoice; deferred = null; setCanPwa(false); }} className="btn-secondary w-full text-sm">Install web app</button>
                : <p className="text-xs text-slate-500">Open your browser menu (three dots) and tap “Install app” or “Add to Home screen”.</p>}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
