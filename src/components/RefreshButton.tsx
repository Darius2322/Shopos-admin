import { useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { checkForNewVersion, flash } from '../lib/checkUpdate';

/** One tap: look for a new version and refresh what is on screen. The pop-up only appears when a newer version really exists;
 * otherwise the screen says you are up to date and reloads with the latest information. */
export function RefreshButton({ className = '' }: { className?: string }) {
  const [busy, setBusy] = useState(false);
  async function go() {
    if (busy) return; setBusy(true);
    window.dispatchEvent(new Event('shopos:back-online'));
    const r = await checkForNewVersion();
    if (r.found) { window.dispatchEvent(new Event('shopos:check-update')); flash('New version found'); setBusy(false); return; }
    flash(navigator.onLine ? 'Up to date. Refreshing…' : 'You are offline');
    window.setTimeout(() => { if (navigator.onLine) window.location.reload(); else setBusy(false); }, 900);
  }
  return <button type="button" onClick={() => void go()} aria-label="Refresh" title="Refresh and check for updates" className={`p-2 text-slate-500 hover:text-ink min-w-[40px] min-h-[40px] inline-flex items-center justify-center ${className}`}><RefreshCw className={`w-5 h-5 ${busy ? 'animate-spin' : ''}`} /></button>;
}
