/**
 * Automatic M-Pesa payment detection — the Android-app channel.
 *
 * This module only talks to a NATIVE plugin ("ShopOsMpesa", source in /android-plugin). In the
 * website / installable web app (PWA) there is no plugin, browsers cannot read SMS, and this
 * channel reports itself as unavailable — nothing here ever tries to work around that.
 *
 * Privacy contract (mirrors the Privacy Policy):
 *  - the native side asks only for RECEIVE_SMS (never READ_SMS) and hands over ONLY messages whose
 *    sender is M-Pesa; every other message is dropped inside the receiver, before reaching JS;
 *  - here each handed-over message is parsed again; anything that is not an incoming-payment
 *    confirmation is discarded with no trace;
 *  - for recognised payments only the extracted fields are synced. The original text is kept in a
 *    local-only table (mpesaRawMessages) for the cashier's reference and is never uploaded.
 *
 * Google Play: RECEIVE_SMS is a restricted permission. The Android build must not request it until
 * the Play Console declaration/approval described in /android-plugin/README.md is granted.
 */
import { db } from '../db';
import { ingestPayment, deviceId } from './store';
import { parseMpesaPaymentSms } from './mpesaSms';
import type { PaymentSource } from '../types';

export type SmsPermission = 'granted' | 'denied' | 'prompt';
interface NativeMessage { address: string; body: string; receivedAt: number }
interface NativeMpesaPlugin {
  checkPermissions(): Promise<{ receiveSms: SmsPermission }>;
  requestPermissions(): Promise<{ receiveSms: SmsPermission }>;
  start(): Promise<void>;
  stop(): Promise<void>;
  drainQueue(): Promise<{ messages: NativeMessage[] }>;
  addListener(event: 'mpesaMessage', cb: (m: NativeMessage) => void): Promise<{ remove: () => Promise<void> }>;
}

function plugin(): NativeMpesaPlugin | null {
  const cap = (window as unknown as { Capacitor?: { isNativePlatform?: () => boolean; Plugins?: Record<string, unknown> } }).Capacitor;
  if (!cap?.isNativePlatform?.()) return null;
  return (cap.Plugins?.ShopOsMpesa as NativeMpesaPlugin | undefined) ?? null;
}

export const PERMISSION_RATIONALE =
  'ShopOS needs access to relevant M-Pesa transaction messages so it can automatically detect payments and populate them in your POS.';

export function smsChannelAvailable(): boolean { return plugin() !== null; }

export async function getSmsPermission(): Promise<SmsPermission | 'unavailable'> {
  const p = plugin(); if (!p) return 'unavailable';
  try { return (await p.checkPermissions()).receiveSms; } catch { return 'denied'; }
}
export async function requestSmsPermission(): Promise<SmsPermission | 'unavailable'> {
  const p = plugin(); if (!p) return 'unavailable';
  try { return (await p.requestPermissions()).receiveSms; } catch { return 'denied'; }
}

/** Picks which configured source an incoming message belongs to: this device's automatic source. */
export async function pickAutomaticSource(businessId: string): Promise<PaymentSource | null> {
  const all = (await db.paymentSources.where('businessId').equals(businessId).toArray()).filter((s) => s.mode === 'api' && s.status === 'active');
  return all.find((s) => s.deviceId === deviceId()) ?? (all.length === 1 ? all[0] : null);
}

async function handle(msg: NativeMessage, source: PaymentSource, branchId: string): Promise<void> {
  const parsed = parseMpesaPaymentSms(msg.address, msg.body);
  if (!parsed) return;                                    // not an incoming M-Pesa payment: drop, no trace
  const out = await ingestPayment(source, branchId, {
    transactionCode: parsed.transactionCode, amount: parsed.amount,
    senderName: parsed.senderName, senderPhone: parsed.senderPhone,
    receivedAt: parsed.receivedAt ?? new Date(msg.receivedAt).toISOString(),
    reportedTill: parsed.tillNumber                       // checked against the source's till when the text states one
  });
  if (out.ok) await db.mpesaRawMessages.put({ transactionCode: parsed.transactionCode, body: msg.body, receivedAt: new Date(msg.receivedAt).toISOString() });
  // duplicates / wrong-till are already handled (and audited) by ingestPayment + the server
}

let listener: { remove: () => Promise<void> } | null = null;

/** Starts monitoring. Safe to call repeatedly. Messages that arrived while the app was closed
 * (queued natively — recognised M-Pesa senders only) are drained first. */
export async function startSmsMonitoring(businessId: string, branchId: string): Promise<'monitoring' | 'no_permission' | 'no_source' | 'unavailable'> {
  const p = plugin(); if (!p) return 'unavailable';
  if ((await getSmsPermission()) !== 'granted') return 'no_permission';
  const source = await pickAutomaticSource(businessId);
  if (!source) return 'no_source';
  if (listener) await listener.remove().catch(() => undefined);
  await p.start();
  listener = await p.addListener('mpesaMessage', (m) => { void handle(m, source, branchId); });
  const { messages } = await p.drainQueue();
  for (const m of messages) await handle(m, source, branchId);
  return 'monitoring';
}

export async function stopSmsMonitoring(): Promise<void> {
  const p = plugin();
  if (listener) { await listener.remove().catch(() => undefined); listener = null; }
  if (p) await p.stop().catch(() => undefined);
}
