/** A new Android app file is out: ring the phone once per version with a notification that opens the download. */
type Plug = Record<string, (...a: any[]) => any>;
const P = (n: string): Plug | null => { try { return (window as any).Capacitor?.Plugins?.[n] ?? null; } catch { return null; } };
const KEY = 'shopos:update-notified';
let wired = false;

export function apkUrl(file: string) { return `https://www.shopos.co.ke/downloads/android/${file}`; }
/** Opens the file in the phone's browser, which downloads it (the app's own window cannot save files). */
export function openApk(file: string) { try { window.open(apkUrl(file), '_blank', 'noopener'); } catch { window.location.href = apkUrl(file); } }

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
