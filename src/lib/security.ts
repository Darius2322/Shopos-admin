import { supabase, backendConfigured } from './supabase';

export type SecurityEventType =
  | 'login_success' | 'login_failed' | 'otp_success' | 'otp_failed'
  | 'permission_change' | 'force_logout' | 'admin_action' | 'account_activated';

/**
 * Security events are written directly to Supabase (not queued through the
 * offline sync engine) — they're only meaningful with a real, immediate
 * timestamp, and a login/security event that only shows up after the next
 * sync would defeat the point. If the device is offline, the event is
 * simply not recorded rather than queued and backdated.
 */
export async function logSecurityEvent(params: {
  businessId?: string | null;
  userId?: string | null;
  type: SecurityEventType;
  detail?: string;
}) {
  if (!backendConfigured() || !navigator.onLine) return;
  try {
    await supabase!.from('security_events').insert({
      business_id: params.businessId ?? null,
      user_id: params.userId ?? null,
      event_type: params.type,
      detail: params.detail ?? null,
      device_info: navigator.userAgent
    });
  } catch {
    // best-effort only — never block the action that triggered this
  }
}
