import { useEffect, useState } from 'react';
import { Sparkles, Download } from 'lucide-react';
import { useBackClose } from '../lib/backStack';
import { notifyNewApk, openApk } from '../lib/updateNotice';

const SNOOZE = 'shopos-admin:update-snooze';
const LATER_MS = 3 * 60 * 60 * 1000;
const snoozedUntil = () => { try { return Number(localStorage.getItem(SNOOZE) ?? 0); } catch { return 0; } };
const cmp = (a: string, b: string) => { const pa = a.split(/[.+-]/).map((x) => parseInt(x, 10) || 0), pb = b.split(/[.+-]/).map((x) => parseInt(x, 10) || 0); for (let i = 0; i < Math.max(pa.length, pb.length); i++) { const d = (pa[i] ?? 0) - (pb[i] ?? 0); if (d) return d; } return 0; };

/** "Update now" / "Remind me later" pop-up for the admin app. Later is a pause: it asks again after 3 hours. */
export function UpdatePrompt() {
  const [webNew, setWebNew] = useState(false);
  const [apk, setApk] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now());
  const mine = typeof navigator !== 'undefined' ? /ShopOSAdmin\/([0-9A-Za-z.+-]+)/.exec(navigator.userAgent)?.[1] : undefined;
  useEffect(() => { const t = window.setInterval(() => setNow(Date.now()), 60_000); return () => window.clearInterval(t); }, []);
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    const had = !!navigator.serviceWorker.controller;
    const on = () => { if (had) { setWebNew(true); (window as unknown as { __updateFound?: boolean }).__updateFound = true; } };
    navigator.serviceWorker.addEventListener('controllerchange', on);
    const poll = window.setInterval(() => { void navigator.serviceWorker.getRegistration().then((r) => r?.update()).catch(() => undefined); }, 30 * 60_000);
    return () => { navigator.serviceWorker.removeEventListener('controllerchange', on); window.clearInterval(poll); };
  }, []);
  useEffect(() => {
    if (!mine) return; let live = true;
    const check = () => { void fetch('https://www.shopos.co.ke/downloads/android/latest-admin.json', { cache: 'no-store' }).then((r) => (r.ok ? r.json() : null))
      .then((j) => { if (live && j?.version && cmp(String(j.version), mine) > 0) { setApk(String(j.version)); (window as unknown as { __updateFound?: boolean }).__updateFound = true; void notifyNewApk(String(j.version), 'ShopOS-Admin.apk', 'ShopOS Admin'); } }).catch(() => undefined); };
    check(); const t = window.setInterval(check, 15 * 60_000);
    const on = () => { try { localStorage.removeItem(SNOOZE); } catch { /* ignore */ } setNow(Date.now()); check(); };
    window.addEventListener('shopos:check-update', on);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) check(); });
    return () => { live = false; window.clearInterval(t); window.removeEventListener('shopos:check-update', on); };
  }, [mine]);
  const show = (webNew || !!apk) && now >= snoozedUntil();
  const later = () => { try { localStorage.setItem(SNOOZE, String(Date.now() + LATER_MS)); } catch { /* ignore */ } setNow(Date.now()); };
  useBackClose(show, later);
  if (!show) return null;
  return (
    <div className="fixed inset-0 z-[95] flex items-center justify-center p-4" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/60" />
      <div className="relative card w-full max-w-sm p-5 space-y-3 text-center">
        <div className="mx-auto w-12 h-12 rounded-full bg-field-50 text-field-700 flex items-center justify-center">{apk ? <Download className="w-6 h-6" /> : <Sparkles className="w-6 h-6" />}</div>
        <h3 className="font-display font-semibold text-lg">{apk ? 'New app version ready' : 'Update available'}</h3>
        <p className="text-sm text-slate-500">{apk ? `Version ${apk} is ready. Tap Update now, then open the downloaded file and tap Install. It installs over this app: do not uninstall.` : 'A newer version is ready. It takes a few seconds.'}</p>
        <button onClick={() => { if (apk) { openApk('ShopOS-Admin.apk'); later(); } else window.location.reload(); }} className="btn-primary w-full min-h-[48px]">Update now</button>
        <button onClick={later} className="btn-secondary w-full">Remind me later</button>
      </div>
    </div>
  );
}
