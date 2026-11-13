import { useState } from 'react';
import { RefreshCw } from 'lucide-react';

/** One tap: look for a new version of the app and refresh what is on screen. If a new version is found the update pop-up shows;
 * otherwise the page reloads with the latest information. */
export function RefreshButton({ className = '' }: { className?: string }) {
  const [busy, setBusy] = useState(false);
  async function go() {
    if (busy) return; setBusy(true);
    (window as unknown as { __updateFound?: boolean }).__updateFound = false;
    window.dispatchEvent(new Event('shopos:check-update'));
    window.dispatchEvent(new Event('shopos:back-online'));
    try { const reg = await navigator.serviceWorker?.getRegistration(); await reg?.update(); } catch { /* offline */ }
    window.setTimeout(() => { if ((window as unknown as { __updateFound?: boolean }).__updateFound) { setBusy(false); return; } window.location.reload(); }, 1500);
  }
  return <button type="button" onClick={() => void go()} aria-label="Refresh" title="Refresh and check for updates" className={`p-2 text-slate-500 hover:text-ink min-w-[40px] min-h-[40px] inline-flex items-center justify-center ${className}`}><RefreshCw className={`w-5 h-5 ${busy ? 'animate-spin' : ''}`} /></button>;
}
