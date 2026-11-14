import { capPlugin } from './capPlugin';
import { supabase } from './supabase';

/** Phone push notifications (Android app only). The phone gets a token from Google (FCM) and gives it to ShopOS, so the server can
 * ring the phone the moment something happens, even when the app is closed. In a normal browser this does nothing. */
type Plug = Record<string, (...a: any[]) => any>;
const P = (n: string): Plug | null => capPlugin<Plug>(n);
let started = false;

async function start(onToken: (t: string) => void) {
  const push = P('PushNotifications'); if (!push) return false;
  try {
    const perm = await push.requestPermissions(); if (perm?.receive !== 'granted') return false;
    try { await push.createChannel?.({ id: 'shopos-alerts', name: 'ShopOS alerts', description: 'New requests, bookings and messages', importance: 5, visibility: 1, vibration: true, sound: 'default' }); } catch { /* older Android */ }
    await push.addListener('registration', (t: { value: string }) => onToken(t.value));
    await push.addListener('registrationError', () => { /* no Google services in this build */ });
    // While the app is open Android does not show a banner by itself, so show one.
    await push.addListener('pushNotificationReceived', (n: { title?: string; body?: string }) => {
      void P('LocalNotifications')?.schedule?.({ notifications: [{ id: Math.floor(Math.random() * 2e9), title: n.title ?? 'ShopOS', body: n.body ?? '', channelId: 'shopos-alerts', smallIcon: 'ic_stat_shopos' }] });
    });
    // Tapping a notification opens what it is about (a page inside the app, or the new app file).
    await push.addListener('pushNotificationActionPerformed', (e: { notification?: { data?: { url?: string } } }) => {
      const u = e?.notification?.data?.url; if (!u) return;
      if (/\.apk(\?|$)/i.test(u)) { try { window.open(u.startsWith('http') ? u : 'https://www.shopos.co.ke' + u, '_blank', 'noopener'); } catch { /* ignore */ } }
      else if (u.startsWith('/')) window.location.href = u;
    });
    await push.register();
    return true;
  } catch { return false; }
}

/** Call once after sign-in. `app` is who is signed in on this phone. */
export async function registerPush(app: 'admin' | 'owner'): Promise<void> {
  if (started || !supabase) return; started = true;
  const ok = await start((token) => { void supabase!.rpc('push_register', { p_token: token, p_app: app }); });
  if (!ok) started = false;
}

/** Customers have no account: their phone number is the link. Call after a booking is made or looked up. */
export async function registerBookerPush(phone: string): Promise<void> {
  if (!supabase || !phone || phone.replace(/\D/g, '').length < 9) return;
  await start((token) => { void supabase!.rpc('push_register_booker', { p_token: token, p_phone: phone }); });
}
