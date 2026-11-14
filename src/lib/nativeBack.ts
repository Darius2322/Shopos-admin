/** The phone's own back button (Android app). The app handles it itself, so it always goes back one step inside ShopOS (closing a sheet,
 * going to the previous page or tab) and only leaves from the first screen, after a second press. Needs the "App" plugin in the build. */
import { capPlugin } from './capPlugin';
import { hardwareBack } from './backStack';

type Plug = { addListener: (e: string, cb: () => void) => unknown; exitApp?: () => void };
let started = false;
export function startNativeBack() {
  if (started || typeof window === 'undefined') return;
  if (!/ShopOS(App|Admin|Booker)\//.test(navigator.userAgent)) return;
  const app = capPlugin<Plug>('App'); if (!app) return; started = true;
  void app.addListener('backButton', () => { if (!hardwareBack()) { try { app.exitApp?.(); } catch { /* ignore */ } } });
}
