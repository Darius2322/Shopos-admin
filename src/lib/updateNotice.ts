import { capPlugin } from './capPlugin';
/** A new Android app file is out: ring the phone once per version with a notification that opens the download. */
type Plug = Record<string, (...a: any[]) => any>;
const P = (n: string): Plug | null => capPlugin<Plug>(n);
const KEY = 'shopos:update-notified';
let wired = false;

export function apkUrl(file: string) { return `https://www.shopos.co.ke/downloads/android/${file}`; }
/** Opens the file in the phone's browser, which downloads it (the app's own window cannot save files). */
export function openApk(file: string) {
  const url = apkUrl(file);
  window.dispatchEvent(new CustomEvent('shopos:apk-started', { detail: file }));
  const br = P('Browser');
  if (br?.open) { void Promise.resolve(br.open({ url })).catch(() => { try { window.open(url, '_blank', 'noopener'); } catch { /* ignore */ } }); return; }
  try { window.open(url, '_blank', 'noopener'); } catch { window.location.href = url; }
}

export async function notifyNewApk(version: string, file: string, appName: string) {
  let seen = ''; try { seen = localStorage.getItem(KEY) ?? ''; } catch { /* ignore */ }
  if (seen === version) return;
  const ln = P('LocalNotifications'); if (!ln) return;
  try {
    const perm = await ln.requestPermissions?.(); if (perm && perm.display && perm.display !== 'granted') return;
    if (!wired) { wired = true; void ln.addListener?.('localNotificationActionPerformed', (e: { notification?: { extra?: { apk?: string } } }) => { const f = e?.notification?.extra?.apk; if (f) openApk(f); }); }
    await ln.schedule({ notifications: [{ id: 7001, title: `${appName} update ready`, body: `Version ${version} is ready. Tap to download and install. It installs over your current app.`, channelId: 'shopos-alerts', smallIcon: 'ic_stat_shopos', extra: { apk: file } }] });
    try { localStorage.setItem(KEY, version); } catch { /* ignore */ }
  } catch { /* notifications are optional */ }
}
