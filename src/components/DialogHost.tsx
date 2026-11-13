import { useEffect, useState } from 'react';
import { onDialog, type DialogRequest } from '../lib/dialog';
import { useBackClose } from '../lib/backStack';

/** Shows the app's own dialog instead of the browser's alert / confirm / prompt. Mount once, near the root. */
export function DialogHost() {
  const [queue, setQueue] = useState<DialogRequest[]>([]);
  const [text, setText] = useState('');
  useEffect(() => { onDialog((d) => setQueue((q) => [...q, d])); return () => onDialog(null); }, []);
  const cur = queue[0];
  const close = (fn: () => void) => { fn(); setText(''); setQueue((q) => q.slice(1)); };
  // Phone back = Cancel (or OK on a plain message).
  useBackClose(!!cur, () => { if (cur) close(() => (cur.kind === 'confirm' ? cur.resolve(false) : cur.kind === 'prompt' ? cur.resolve(null) : cur.resolve())); });
  if (!cur) return null;
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4" role="dialog" aria-modal="true">
      <div className="w-full max-w-sm rounded-2xl bg-paper-raised border border-slate-200 p-5 shadow-xl">
        <p className="text-base font-medium text-ink whitespace-pre-line">{cur.message}</p>
        {cur.kind === 'prompt' && (
          <input autoFocus value={text} onChange={(e) => setText(e.target.value)} maxLength={300} className="input mt-3 w-full" />
        )}
        <div className="mt-4 flex justify-end gap-2">
          {cur.kind !== 'alert' && (
            <button type="button" className="btn-secondary text-sm px-4 min-h-[44px]"
              onClick={() => close(() => (cur.kind === 'confirm' ? cur.resolve(false) : cur.resolve(null)))}>Cancel</button>
          )}
          <button type="button" autoFocus={cur.kind !== 'prompt'} className="btn-primary text-sm px-4 min-h-[44px]"
            onClick={() => close(() => (cur.kind === 'confirm' ? cur.resolve(true) : cur.kind === 'prompt' ? cur.resolve(text) : cur.resolve()))}>
            {cur.kind === 'alert' ? 'OK' : cur.kind === 'confirm' ? 'Yes' : 'Done'}
          </button>
        </div>
      </div>
    </div>
  );
}
