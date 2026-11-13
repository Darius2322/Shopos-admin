import { useEffect, useState } from 'react';
import { WifiOff } from 'lucide-react';

/** A slim bar while the phone has no internet. What was already loaded stays usable; the page refreshes by itself when the connection is back.
 * `only` limits it to some addresses (the POS has its own, richer banner). */
export function OfflineBar({ only }: { only?: RegExp }) {
  const [off, setOff] = useState(typeof navigator !== 'undefined' && navigator.onLine === false);
  const [path, setPath] = useState(typeof location !== 'undefined' ? location.pathname : '');
  useEffect(() => {
    const down = () => setOff(true); const up = () => { setOff(false); window.dispatchEvent(new Event('shopos:back-online')); };
    const nav = () => setPath(location.pathname);
    window.addEventListener('offline', down); window.addEventListener('online', up); window.addEventListener('popstate', nav);
    const t = window.setInterval(nav, 2000);
    return () => { window.removeEventListener('offline', down); window.removeEventListener('online', up); window.removeEventListener('popstate', nav); window.clearInterval(t); };
  }, []);
  if (!off || (only && !only.test(path))) return null;
  return (
    <div className="fixed top-0 inset-x-0 z-[80] bg-amber-600 text-white text-xs px-3 py-1.5 flex items-center justify-center gap-2 pt-[calc(0.375rem+env(safe-area-inset-top,0px))]" role="status">
      <WifiOff className="w-3.5 h-3.5 shrink-0" />You are offline. Saved pages still open. Actions that need the internet will work again when you reconnect.
    </div>
  );
}
