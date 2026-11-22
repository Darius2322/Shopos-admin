import { useState } from 'react';

export type ChannelKey = 'mpesa' | 'payhero';
const META: Record<ChannelKey, { name: string; initials: string; tile: string }> = {
  mpesa: { name: 'M-Pesa', initials: 'M', tile: 'bg-emerald-600' },
  payhero: { name: 'PayHero', initials: 'PH', tile: 'bg-indigo-600' },
};

/** A payment channel's mark. Shows the logo file at /payment-logos/<channel>.png when it exists; until then, a neat coloured tile with the channel's initials. */
export function ChannelBadge({ channel, size = 36, showName = false }: { channel: ChannelKey; size?: number; showName?: boolean }) {
  const [broken, setBroken] = useState(false);
  const m = META[channel];
  return (
    <span className="inline-flex items-center gap-2 min-w-0">
      {broken ? (
        <span aria-hidden className={`inline-flex items-center justify-center rounded-lg font-bold text-white shrink-0 ${m.tile}`} style={{ width: size, height: size, fontSize: size * 0.38 }}>{m.initials}</span>
      ) : (
        <img src={`/payment-logos/${channel}.png`} alt={showName ? '' : m.name} width={size} height={size} onError={() => setBroken(true)} className="rounded-lg object-contain bg-white shrink-0" style={{ width: size, height: size }} />
      )}
      {showName && <span className="font-medium truncate">{m.name}</span>}
    </span>
  );
}
