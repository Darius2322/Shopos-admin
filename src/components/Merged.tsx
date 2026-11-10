import { useState, type ReactNode } from 'react';

export interface BookingPart { id: string; label: string; node: ReactNode }

/** One menu for both products: a ShopOS | Booking switch at the top, and when Booking has several views, small tabs under it. */
export function Merged({ id, shop, booking }: { id: string; shop: ReactNode; booking: BookingPart[] }) {
  const [side, setSide] = useState<'shop' | 'booking'>(() => { try { return localStorage.getItem(`shopos-admin-side-${id}`) === 'booking' ? 'booking' : 'shop'; } catch { return 'shop'; } });
  const [part, setPart] = useState(booking[0].id);
  const pick = (v: 'shop' | 'booking') => { setSide(v); try { localStorage.setItem(`shopos-admin-side-${id}`, v); } catch { /* ignore */ } };
  const cur = booking.find((b) => b.id === part) ?? booking[0];
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-1 p-1 rounded-card bg-slate-800/60 max-w-xs" role="tablist">
        {([['shop', 'ShopOS'], ['booking', 'Booking']] as const).map(([v, t]) => (
          <button key={v} role="tab" aria-selected={side === v} onClick={() => pick(v)} className={`py-1.5 rounded-card text-xs font-semibold ${side === v ? 'bg-field-600 text-paper' : 'text-slate-400 hover:text-ink'}`}>{t}</button>))}
      </div>
      {side === 'shop' ? shop : (
        <>
          {booking.length > 1 && <div className="flex flex-wrap gap-2">{booking.map((b) => <button key={b.id} onClick={() => setPart(b.id)} className={`px-3 py-1.5 rounded-full text-xs border ${cur.id === b.id ? 'bg-field-600 text-white border-field-600' : 'border-slate-600 text-slate-400'}`}>{b.label}</button>)}</div>}
          <div key={cur.id}>{cur.node}</div>
        </>
      )}
    </div>
  );
}
