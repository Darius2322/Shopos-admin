import { SupabaseClient } from '@supabase/supabase-js';
import { friendlyError } from './friendlyError';

export const n = (v: unknown) => Number(v ?? 0);
export const fmt = (v: unknown) => n(v).toLocaleString();
export const dur = (s: number | null | undefined) => { if (s == null) return '–'; const m = Math.floor(s / 60); return m ? `${m}m ${Math.round(s % 60)}s` : `${Math.round(s)}s`; };
export const flag = (cc: string) => (/^[A-Z]{2}$/.test(cc) ? String.fromCodePoint(...[...cc].map((c) => 127397 + c.charCodeAt(0))) : '');
let names: Intl.DisplayNames | null = null;
export const country = (cc: string | null | undefined) => { if (!cc) return 'Unknown'; try { names ??= new Intl.DisplayNames(['en'], { type: 'region' }); return /^[A-Z]{2}$/.test(cc) ? `${flag(cc)} ${names.of(cc) ?? cc}` : cc; } catch { return cc; } };
export const ago = (iso: string | null | undefined) => { if (!iso) return '–'; const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000); return s < 60 ? `${Math.floor(s)}s ago` : s < 3600 ? `${Math.floor(s / 60)}m ago` : s < 86400 ? `${Math.floor(s / 3600)}h ago` : `${Math.floor(s / 86400)}d ago`; };
export const when = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleString('en-KE', { timeZone: 'Africa/Nairobi', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false }) : '–');
export const where = (city?: string | null, cc?: string | null) => [city, cc ? country(cc) : null].filter(Boolean).join(', ') || 'Unknown';
export const EVENT_LABEL: Record<string, string> = { demo_start: 'Started the demo', app_installed: 'Installed the app', login_view: 'Opened sign-in', signup_start: 'Started sign-up', download_click: 'Clicked a download', guide_view: 'Read a guide', install_prompt: 'Saw the install prompt', pageview: 'Page view', engage: 'Time on page', bot_hit: 'Bot request' };
export const DAYS_LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
export const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** Calls an admin-only database function and returns plain data or a friendly error, never throwing. */
export async function call<T>(supabase: SupabaseClient, fn: string, args: Record<string, unknown> = {}): Promise<{ data: T | null; error: string | null }> {
  try {
    const { data, error } = await supabase.rpc(fn, args);
    if (error) return { data: null, error: friendlyError(error, "Couldn't load this.") };
    return { data: data as T, error: null };
  } catch (e) { return { data: null, error: friendlyError(e, "Couldn't load this.") }; }
}
export function download(name: string, rows: (string | number | null | undefined)[][]) {
  const esc = (v: unknown) => { const s = String(v ?? ''); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([rows.map((r) => r.map(esc).join(',')).join('\n')], { type: 'text/csv' }));
  a.download = name; a.click(); URL.revokeObjectURL(a.href);
}
