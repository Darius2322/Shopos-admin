import { useState, type ReactNode } from 'react';

/** Last seen and Inactive businesses in one menu. */
export default function ActivityTabs({ inactive, lastSeen }: { inactive: ReactNode; lastSeen: ReactNode }) {
  const [v, setV] = useState<'inactive' | 'seen'>('inactive');
  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        {([['inactive', 'Inactive businesses'], ['seen', 'Last seen']] as const).map(([k, l]) => <button key={k} onClick={() => setV(k)} className={`rounded-full border px-3 py-1.5 text-xs ${v === k ? 'bg-emerald-600 border-emerald-600 text-white' : 'border-slate-600 text-slate-300'}`}>{l}</button>)}
      </div>
      {v === 'inactive' ? inactive : lastSeen}
    </div>
  );
}
