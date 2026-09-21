import { useEffect, useState } from 'react';
import { useAuth } from '../../lib/auth';

export const CUSTOMER_DISPLAY_CHANNEL = 'shopos-customer-display';

export interface CustomerDisplayLine {
  name: string;
  quantity: number;
  unit: string;
  sellingPrice: number;
  discount: number;
}

export interface CustomerDisplayMessage {
  lines: CustomerDisplayLine[];
  total: number;
  currency: string;
}

/**
 * Meant to be opened as a second tab/window on the same device (e.g. a
 * dual-monitor till, or a tablet propped facing the customer) — it reads
 * the same signed-in session as the cashier's tab (Supabase's session
 * persists across tabs on one origin), but has NO navigation, NO product
 * browsing, and NO way to reach any other screen. It only ever shows
 * what's already in the cart, mirrored live from the POS tab via
 * BroadcastChannel — someone standing at this screen cannot browse
 * inventory, prices, or anything else in the business.
 *
 * Limitation worth knowing: BroadcastChannel only reaches other tabs/
 * windows in the same browser on the same device — it cannot push to a
 * separate physical device over the network. For a true two-device setup
 * (cashier tablet + customer tablet), this would need a server-relayed
 * channel instead (e.g. a Supabase Realtime channel) — a bigger change,
 * worth doing only if the dual-monitor-one-device setup turns out not to
 * fit how these shops actually operate.
 */
export function CustomerDisplay() {
  const { business } = useAuth();
  const currency = business?.currency ?? 'KES';
  const [message, setMessage] = useState<CustomerDisplayMessage | null>(null);

  useEffect(() => {
    if (!('BroadcastChannel' in window)) return;
    const channel = new BroadcastChannel(CUSTOMER_DISPLAY_CHANNEL);
    channel.onmessage = (e: MessageEvent<CustomerDisplayMessage>) => setMessage(e.data);
    return () => channel.close();
  }, []);

  const lines = message?.lines ?? [];
  const total = message?.total ?? 0;

  return (
    <div className="min-h-screen bg-ink text-white flex flex-col">
      <div className="p-6 flex items-center justify-between border-b border-white/10">
        <span className="font-display font-semibold text-xl">{business?.name ?? 'ShopOS'}</span>
        <span className="text-sm text-white/50">Welcome!</span>
      </div>

      {lines.length === 0 ? (
        <div className="flex-1 flex items-center justify-center">
          <p className="text-2xl text-white/40 font-display">Ready to help you</p>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto p-6 space-y-3">
          {lines.map((l, i) => (
            <div key={i} className="flex items-center justify-between text-lg">
              <div className="min-w-0">
                <div className="font-medium truncate">{l.name}</div>
                <div className="text-sm text-white/50 tnum">{l.quantity} {l.unit} × {currency} {l.sellingPrice.toLocaleString()}</div>
              </div>
              <div className="font-semibold tnum shrink-0 pl-4">
                {currency} {((l.sellingPrice * l.quantity) - l.discount).toLocaleString()}
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="p-6 border-t border-white/10 flex items-center justify-between">
        <span className="text-lg text-white/70">Total</span>
        <span className="text-4xl font-display font-semibold tnum">{currency} {total.toLocaleString()}</span>
      </div>
    </div>
  );
}
