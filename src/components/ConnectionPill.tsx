import { useEffect, useRef, useState } from 'react';
import { WifiOff, CloudUpload, CheckCircle2, AlertTriangle } from 'lucide-react';
import { flushQueue, pendingCount } from '../lib/offlineQueue';

/** A small status pill in the header (like the POS): green Online, amber Offline with how many changes are waiting, blue while sending,
 * red if saved changes could not be sent for a while. Tap it for what it means. The page refreshes by itself when the connection is back. */
export function ConnectionPill() {
  const [off, setOff] = useState(typeof navigator !== 'undefined' && navigator.onLine === false);
  const [pend, setPend] = useState(pendingCount());
  const [stuck, setStuck] = useState(false);
  const [open, setOpen] = useState(false);
  const since = useRef<number | null>(null);
  useEffect(() => { const f = () => setPend(pendingCount()); window.addEventListener('shopos:queue', f); return () => window.removeEventListener('shopos:queue', f); }, []);
  useEffect(() => {
    const down = () => setOff(true); const up = () => { setOff(false); window.dispatchEvent(new Event('shopos:back-online')); void flushQueue(); };
    window.addEventListener('offline', down); window.addEventListener('online', up);
    return () => { window.removeEventListener('offline', down); window.removeEventListener('online', up); };
  }, []);
  useEffect(() => {
    const t = window.setInterval(() => { if (!off && pend > 0) { since.current ??= Date.now(); setStuck(Date.now() - since.current > 120_000); } else { since.current = null; setStuck(false); } }, 5000);
    return () => window.clearInterval(t);
  }, [off, pend]);

  const kind = off ? 'offline' : stuck ? 'failed' : pend > 0 ? 'sending' : 'online';
  const cls = { online: 'bg-field-600/20 text-field-600', offline: 'bg-amber-500/20 text-amber-500', sending: 'bg-sky-500/20 text-sky-500', failed: 'bg-rust-500/20 text-rust-500' }[kind];
  const dot = { online: 'bg-field-600', offline: 'bg-amber-500', sending: 'bg-sky-500', failed: 'bg-rust-500' }[kind];
  const label = { online: 'Online', offline: pend > 0 ? `Offline · ${pend} waiting` : 'Offline', sending: `Sending ${pend}…`, failed: `${pend} not sent` }[kind];
  const text = {
    online: 'You are connected. Everything is saved on the server.',
    offline: `You have no internet. What is already loaded still works, and changes you make are saved on this phone${pend > 0 ? ` (${pend} waiting)` : ''} and sent when you are back online.`,
    sending: `Sending ${pend} saved change${pend === 1 ? '' : 's'} to the server…`,
    failed: `${pend} saved change${pend === 1 ? '' : 's'} could not be sent yet. They are safe on this phone. Check your connection and tap Try now.`,
  }[kind];
  return (
    <div className="relative shrink-0">
      <button onClick={() => setOpen((o) => !o)} aria-label={`Connection: ${label}`} className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${cls}`}>
        <span className={`w-2 h-2 rounded-full ${dot} ${kind === 'sending' ? 'animate-pulse' : ''}`} />
        <span className={kind === 'online' ? 'hidden sm:inline' : ''}>{label}</span>
      </button>
      {open && <>
        <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
        <div role="status" className="absolute left-0 top-full mt-2 z-50 w-64 rounded-xl border border-slate-700 bg-paper-raised p-3 shadow-xl text-xs space-y-2">
          <div className="flex items-center gap-2 font-medium text-sm">{kind === 'online' ? <CheckCircle2 className="w-4 h-4 text-field-500" /> : kind === 'offline' ? <WifiOff className="w-4 h-4 text-amber-500" /> : kind === 'sending' ? <CloudUpload className="w-4 h-4 text-sky-500" /> : <AlertTriangle className="w-4 h-4 text-rust-500" />}{label}</div>
          <p className="text-slate-400">{text}</p>
          {pend > 0 && !off && <button onClick={() => void flushQueue()} className="btn-secondary text-xs w-full">Try now</button>}
        </div></>}
    </div>
  );
}
