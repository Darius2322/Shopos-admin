import { useState, type ReactNode } from 'react';

/** Last seen, Inactive businesses and Auto-pause in one menu. */
export default function ActivityTabs({ inactive, lastSeen, autoPause }: { inactive: ReactNode; lastSeen: ReactNode; autoPause: ReactNode }) {
  const [v, setV] = useState<'inactive' | 'seen' | 'pause'>(() => { const w = (window as unknown as { __adminPill?: string }).__adminPill; (window as unknown as { __adminPill?: string }).__adminPill = undefined; return w === 'pause' ? 'pause' : 'inactive'; });
  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        {([['inactive', 'Inactive businesses'], ['seen', 'Last seen'], ['pause', 'Auto-pause']] as const).map(([k, l]) => <button key={k} onClick={() => setV(k)} className={`rounded-full border px-3 py-1.5 text-xs ${v === k ? 'bg-emerald-600 border-emerald-600 text-white' : 'border-slate-600 text-slate-300'}`}>{l}</button>)}
      </div>
      {v === 'inactive' ? inactive : v === 'seen' ? lastSeen : autoPause}
    </div>
  );
}
