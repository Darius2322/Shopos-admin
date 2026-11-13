/** The phone's own back button (Android app). The app handles it itself, so it always goes back one step inside ShopOS (closing a sheet,
 * going to the previous page or tab) and only leaves from the first screen, after a second press. Needs the "App" plugin in the build;
 * without it the phone falls back to its normal behaviour. */
type Plug = { addListener: (e: string, cb: (d: { canGoBack?: boolean }) => void) => unknown; exitApp?: () => void };
let started = false;
export function startNativeBack() {
  if (started || typeof window === 'undefined') return;
  if (!/ShopOS(App|Admin|Booker)\//.test(navigator.userAgent)) return;
  const app = (window as unknown as { Capacitor?: { Plugins?: { App?: Plug } } }).Capacitor?.Plugins?.App;
  if (!app) return; started = true;
  let armed = 0;
  const toast = () => {
    const el = document.createElement('div');
    el.textContent = 'Press back again to exit';
    el.style.cssText = 'position:fixed;left:50%;bottom:90px;transform:translateX(-50%);z-index:2147483000;background:rgba(20,20,20,.92);color:#fff;font:500 13px system-ui,sans-serif;padding:9px 16px;border-radius:999px';
    document.body.appendChild(el); window.setTimeout(() => el.remove(), 1800);
  };
  void app.addListener('backButton', (d) => {
    const deeper = d?.canGoBack ?? window.history.length > 1;
    if (deeper) { window.history.back(); return; }
    if (Date.now() - armed < 1800) { try { app.exitApp?.(); } catch { /* ignore */ } return; }
    armed = Date.now(); toast();
  });
}
