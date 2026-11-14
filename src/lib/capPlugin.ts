/** Finds a native phone feature (App, Browser, Filesystem, notifications…) from the website running inside the Android app.
 * The page is loaded from the internet, so the plugins are not always listed on window.Capacitor.Plugins; registerPlugin reaches them anyway. */
export function capPlugin<T = any>(name: string): T | null {
  try {
    const cap = (window as any).Capacitor;
    if (!cap) return null;
    if (cap.isNativePlatform && !cap.isNativePlatform()) return cap.Plugins?.[name] ?? null;
    return (cap.Plugins?.[name] ?? cap.registerPlugin?.(name) ?? null) as T | null;
  } catch { return null; }
}
