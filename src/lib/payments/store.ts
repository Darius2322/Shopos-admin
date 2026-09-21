import { db } from '../db';
import { supabase, backendConfigured } from '../supabase';
import { MPESA_CODE_PATTERN, normaliseCode } from './parser';
import type { PaymentSource, PaymentTransaction, PaymentSourceMode } from '../types';

/**
 * Payment ingestion is deliberately abstract. A "channel" is anything that can hand the POS a
 * payment that a permitted mechanism has produced. Today: `manual` (a person types or pastes
 * it) and `test` (mock data). An approved automatic channel can be added later by implementing
 * this interface — it must NOT read SMS or notifications unless Google Play policy allows it
 * for ShopOS and the Privacy Policy is updated first.
 */
export interface IncomingPayment {
  transactionCode: string;
  amount: number;
  senderName?: string;
  senderPhone?: string;
  receivedAt?: string;
  /** Till reported by the channel, when it reports one. Checked against the source's till. */
  reportedTill?: string;
}
export interface PaymentIngestionChannel {
  readonly kind: PaymentSourceMode;
  /** Called by the channel whenever it has a payment. Idempotent on transactionCode. */
  onPayment: (p: IncomingPayment) => Promise<IngestOutcome>;
}

export type IngestOutcome =
  | { ok: true; transaction: PaymentTransaction }
  | { ok: false; reason: 'duplicate' | 'wrong_till' | 'invalid'; message: string };

export const deviceId = (): string => {
  const key = 'shopos.deviceId';
  try {
    let id = localStorage.getItem(key);
    if (!id) { id = crypto.randomUUID(); localStorage.setItem(key, id); }
    return id;
  } catch { return 'unknown-device'; }
};

/** The one place a payment enters the app. Validates, isolates by source/till, de-duplicates
 * against the local store, saves locally (works offline) and leaves it queued for sync. */
export async function ingestPayment(source: PaymentSource, branchId: string, input: IncomingPayment): Promise<IngestOutcome> {
  if (source.status !== 'active') return { ok: false, reason: 'invalid', message: 'This payment source is disabled' };
  const code = normaliseCode(input.transactionCode);
  if (!MPESA_CODE_PATTERN.test(code)) return { ok: false, reason: 'invalid', message: 'That does not look like an M-Pesa transaction code' };
  const amount = Math.round(input.amount * 100) / 100;
  if (!(amount > 0)) return { ok: false, reason: 'invalid', message: 'Amount must be greater than zero' };

  if (input.reportedTill && input.reportedTill !== source.tillNumber) {
    return { ok: false, reason: 'wrong_till', message: `This payment was for till ${input.reportedTill}, not this business's till` };
  }
  const existing = await db.paymentTransactions.where('transactionCode').equals(code).first();
  if (existing) return { ok: false, reason: 'duplicate', message: 'This M-Pesa code has already been recorded' };

  const now = new Date().toISOString();
  const tx: PaymentTransaction = {
    id: crypto.randomUUID(),
    businessId: source.businessId,
    branchId,
    paymentSourceId: source.id,
    tillNumber: source.tillNumber,
    transactionCode: code,
    amount,
    senderName: input.senderName?.trim() || null,
    senderPhone: input.senderPhone?.trim() || null,
    receivedAt: input.receivedAt ?? now,
    deviceId: deviceId(),
    sourceType: source.mode,
    status: 'received',
    createdAt: now, updatedAt: now,
    syncStatus: 'pending'
  };
  await db.paymentTransactions.add(tx);
  void syncPayments();
  return { ok: true, transaction: tx };
}

/** Links a received payment to a sale. Optimistic and offline-safe: a payment already
 * used (or pending a link) can never be used for a second sale. */
export async function linkPaymentToSale(transactionId: string, saleId: string): Promise<void> {
  await db.transaction('rw', db.paymentTransactions, async () => {
    const tx = await db.paymentTransactions.get(transactionId);
    if (!tx) throw new Error('Payment not found');
    if (tx.status === 'used' || tx.pendingMatchSaleId) throw new Error('This M-Pesa payment has already been used for another sale');
    await db.paymentTransactions.update(transactionId, {
      status: 'used', matchedSaleId: saleId, matchedAt: new Date().toISOString(),
      pendingMatchSaleId: saleId, updatedAt: new Date().toISOString()
    });
  });
  void syncPayments();
}

export async function saveSource(input: { businessId: string; branchId?: string | null; label: string; tillNumber: string; mode: PaymentSourceMode; id?: string; status?: 'active' | 'disabled'; deviceId?: string | null }): Promise<PaymentSource> {
  if (!supabase || !backendConfigured() || !navigator.onLine) throw new Error('Connect to the internet to change payment sources');
  const row = {
    ...(input.id ? { id: input.id } : {}),
    business_id: input.businessId, branch_id: input.branchId ?? null, kind: 'mpesa_till',
    label: input.label.trim(), till_number: input.tillNumber.trim(), mode: input.mode, status: input.status ?? 'active',
    device_id: input.deviceId ?? null
  };
  const { data, error } = await supabase.from('payment_sources').upsert(row).select().single();
  if (error) {
    if (error.code === '23505') throw new Error('That till number is already registered to a business');
    if (error.code === '23514') throw new Error('Enter a valid till number (5–10 digits) and a name');
    throw new Error(error.message);
  }
  const src = mapSource(data);
  await db.paymentSources.put(src);
  return src;
}

function mapSource(r: any): PaymentSource {
  return { id: r.id, businessId: r.business_id, branchId: r.branch_id, kind: r.kind, label: r.label, tillNumber: r.till_number,
    deviceId: r.device_id, mode: r.mode, status: r.status, createdAt: r.created_at, updatedAt: r.updated_at };
}
function mapTx(r: any): PaymentTransaction {
  return { id: r.id, businessId: r.business_id, branchId: r.branch_id, paymentSourceId: r.payment_source_id, tillNumber: r.till_number,
    transactionCode: r.transaction_code, amount: Number(r.amount), senderName: r.sender_name, senderPhone: r.sender_phone,
    receivedAt: r.received_at, deviceId: r.device_id, sourceType: r.source_type, status: r.status,
    matchedSaleId: r.matched_sale_id, matchedAt: r.matched_at, createdAt: r.created_at, updatedAt: r.updated_at, syncStatus: 'synced' };
}

let syncing = false;
/** Push pending payments/links, then pull the server's view. Safe to call any time. */
export async function syncPayments(): Promise<void> {
  if (syncing || !supabase || !backendConfigured() || !navigator.onLine) return;
  syncing = true;
  try {
    // 1. Push new payments through the server-side validator (idempotent on id AND code).
    const pending = await db.paymentTransactions.where('syncStatus').anyOf('pending', 'failed').toArray();
    for (const tx of pending) {
      if (tx.localFlag) continue;
      const { data, error } = await supabase.rpc('ingest_payment_transaction', {
        p_id: tx.id, p_source_id: tx.paymentSourceId, p_branch_id: tx.branchId, p_code: tx.transactionCode,
        p_amount: tx.amount, p_sender_name: tx.senderName ?? null, p_sender_phone: tx.senderPhone ?? null,
        p_received_at: tx.receivedAt, p_source_type: tx.sourceType, p_device_id: tx.deviceId ?? null, p_till_number: null
      });
      if (error) { await db.paymentTransactions.update(tx.id, { syncStatus: 'failed', syncError: error.message }); continue; }
      const result = (data as { result: string }).result;
      if (result === 'created' || result === 'exists') await db.paymentTransactions.update(tx.id, { syncStatus: 'synced', syncError: null });
      else if (result === 'duplicate') await db.paymentTransactions.update(tx.id, { syncStatus: 'failed', localFlag: 'duplicate', syncError: 'This M-Pesa code was already recorded' });
      else if (result === 'wrong_till') await db.paymentTransactions.update(tx.id, { syncStatus: 'failed', localFlag: 'wrong_till', syncError: 'Payment is for a different till' });
    }

    // 2. Push sale links — only once the sale itself exists on the server.
    const links = (await db.paymentTransactions.toArray()).filter((t) => t.pendingMatchSaleId && t.syncStatus === 'synced');
    for (const tx of links) {
      const sale = await db.sales.get(tx.pendingMatchSaleId!);
      if (!sale || sale.syncStatus !== 'synced') continue;
      const { error } = await supabase.rpc('match_payment_transaction', { p_transaction_id: tx.id, p_sale_id: tx.pendingMatchSaleId });
      if (!error) await db.paymentTransactions.update(tx.id, { pendingMatchSaleId: null, syncError: null });
      else await db.paymentTransactions.update(tx.id, { syncError: error.message });
    }

    // 3. Pull. RLS + the RPCs guarantee this only ever returns this business's own rows.
    const [{ data: srcs }, { data: txs }] = await Promise.all([
      supabase.from('payment_sources').select('*'),
      supabase.from('payment_transactions').select('*').order('received_at', { ascending: false }).limit(500)
    ]);
    if (srcs) await db.paymentSources.bulkPut(srcs.map(mapSource));
    if (txs) {
      for (const r of txs) {
        const local = await db.paymentTransactions.get(r.id);
        if (local && (local.syncStatus !== 'synced' || local.pendingMatchSaleId)) continue; // never clobber unsent local work
        await db.paymentTransactions.put(mapTx(r));
      }
    }
  } catch { /* offline / transient: retried by the next sync tick */ } finally { syncing = false; }
}

/** Removes a local payment the server rejected (duplicate / wrong till). Only ever affects
 * rows that never reached the server. */
export async function discardRejectedPayment(id: string): Promise<void> {
  const tx = await db.paymentTransactions.get(id);
  if (tx && tx.localFlag && tx.syncStatus !== 'synced') await db.paymentTransactions.delete(id);
}
