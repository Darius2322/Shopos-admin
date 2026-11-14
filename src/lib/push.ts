import { capPlugin } from './capPlugin';
import { supabase } from './supabase';

/** Phone push notifications (Android app only). The phone gets a token from Google (FCM) and gives it to ShopOS, so the server can
 * ring the phone the moment something happens, even when the app is closed. In a normal browser this does nothing. */
type Plug = Record<string, (...a: any[]) => any>;
const P = (n: string): Plug | null => capPlugin<Plug>(n);
let started = false;

/** Tells the platform admin's Go live → Notifications page how far this phone got, so a silent failure can be seen. */
function report(app: string, stage: string, detail?: string) { try { if (app) void supabase?.rpc('push_report', { p_app: app, p_stage: stage, p_detail: detail ?? null }); } catch { /* diagnostics only */ } }

async function start(onToken: (t: string) => void, app = '') {
  const push = P('PushNotifications'); if (!push) { report(app, 'no-plugin', 'PushNotifications is not in this app build'); return false; }
  try {
    const perm = await push.requestPermissions(); if (perm?.receive !== 'granted') { report(app, 'permission', String(perm?.receive ?? 'none')); return false; }
    try { await push.createChannel?.({ id: 'shopos-alerts', name: 'ShopOS alerts', description: 'New requests, bookings and messages', importance: 5, visibility: 1, vibration: true, sound: 'default' }); } catch { /* older Android */ }
    await push.addListener('registration', (t: { value: string }) => { report(app, 'got-token'); onToken(t.value); });
    await push.addListener('registrationError', (e: { error?: string }) => { report(app, 'registration-error', String(e?.error ?? '')); });
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
    report(app, 'asked-google');
    return true;
  } catch (e) { report(app, 'exception', String((e as Error)?.message ?? e)); return false; }
}

/** Call once after sign-in. `app` is who is signed in on this phone. */
export async function registerPush(app: 'admin' | 'owner'): Promise<void> {
  if (started || !supabase) return; started = true;
  const ok = await start((token) => { void supabase!.rpc('push_register', { p_token: token, p_app: app }).then(({ error }) => { report(app, error ? 'save-failed' : 'saved', error?.message); }); }, app);
  if (!ok) started = false;
}

/** Customers have no account: their phone number is the link. Call after a booking is made or looked up. */
export async function registerBookerPush(phone: string): Promise<void> {
  if (!supabase || !phone || phone.replace(/\D/g, '').length < 9) return;
  await start((token) => { void supabase!.rpc('push_register_booker', { p_token: token, p_phone: phone }); });
}
