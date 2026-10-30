import { supabase } from './supabase';

/** Talks to the pay-admin function. Keys travel one way (to the server) and are never read back. */
export interface Reply { ok: boolean; error?: string; detail?: string; [k: string]: unknown }
/** Plain message plus Safaricom's own words (already scrubbed by the server), so the admin can see what to fix. */
export const why = (r: Reply) => (r.error ?? 'Something went wrong.') + (r.detail ? ` (${r.detail})` : '');
async function call(body: Record<string, unknown>): Promise<Reply> {
  if (!supabase) return { ok: false, error: 'Not connected.' };
  const { data, error } = await supabase.functions.invoke('pay-admin', { body });
  if (error) {
    try {
      const ctx = (error as { context?: Response }).context;
      if (ctx && typeof ctx.json === 'function') { const j = (await ctx.json()) as Reply; if (j && typeof j.error === 'string') return j; }
    } catch { /* fall through */ }
    return { ok: false, error: 'Something went wrong. Please try again.' };
  }
  return data as Reply;
}
export interface SourceStatus { connected: boolean; env: 'sandbox' | 'production' | null; hasPasskey: boolean; headOfficeNumber: string | null; c2bRegistered: boolean; payoutReady: boolean }
export async function sourceStatus(sourceId: string): Promise<SourceStatus | { error: string }> {
  const r = await call({ action: 'source_status', sourceId });
  if (!r.ok) return { error: r.error ?? 'Could not load.' };
  return { connected: !!r.connected, env: (r.env as SourceStatus['env']) ?? null, hasPasskey: !!r.hasPasskey, headOfficeNumber: (r.headOfficeNumber as string) ?? null, c2bRegistered: !!r.c2bRegistered, payoutReady: !!r.payoutReady };
}
export const saveKeys = (i: { sourceId: string; env: 'sandbox' | 'production'; consumerKey: string; consumerSecret: string; passkey?: string; headOfficeNumber?: string }) => call({ action: 'save', ...i });
export const savePayout = (sourceId: string, initiator: string, credential: string) => call({ action: 'payout_creds', sourceId, initiator, credential });
export const registerIncoming = (sourceId: string) => call({ action: 'register_c2b', sourceId });
export const approveSource = (sourceId: string) => call({ action: 'approve', sourceId });
export const defaultsStatus = () => call({ action: 'defaults_status' });
export const defaultsSave = (i: { env: 'sandbox' | 'production'; consumerKey: string; consumerSecret: string; passkey?: string; headOfficeNumber?: string }) => call({ action: 'defaults_save', ...i });
export const disconnect = (sourceId: string) => call({ action: 'disconnect', sourceId });
export interface PlatformPay { enabled: boolean; kind: 'mpesa_till' | 'mpesa_paybill' | null; number: string | null; displayName: string | null; env: 'sandbox' | 'production' | null; hasKeys: boolean; hasPasskey: boolean; headOfficeNumber: string | null }
export async function platformStatus(): Promise<PlatformPay | { error: string }> {
  const r = await call({ action: 'platform_status' });
  if (!r.ok) return { error: r.error ?? 'Could not load.' };
  return r as unknown as PlatformPay;
}
export const platformSave = (i: { enabled: boolean; kind: string; number: string; displayName?: string; env?: string; consumerKey?: string; consumerSecret?: string; passkey?: string; headOfficeNumber?: string }) => call({ action: 'platform_save', ...i });

export async function askAssistant(question: string, history: { role: 'me' | 'ai'; text: string }[]): Promise<{ text?: string; error?: string }> {
  if (!supabase) return { error: 'Not connected.' };
  const { data, error } = await supabase.functions.invoke('admin-assistant', { body: { question, history } });
  if (error) {
    try {
      const ctx = (error as { context?: Response }).context;
      const st = ctx?.status;
      if (st === 429) return { error: 'Too many questions. Wait a moment.' };
      if (st === 503) return { error: 'The assistant is not switched on yet (no AI key on the server).' };
    } catch { /* fall through */ }
    return { error: 'The assistant could not answer. Please try again.' };
  }
  return { text: String((data as { text?: string })?.text ?? '') };
}
