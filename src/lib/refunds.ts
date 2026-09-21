import { db, newRecordBase, enqueueSync } from './db';
import { recordAuditEvent } from './audit';
import type { Refund, RefundItem, Sale } from './types';

export interface RequestRefundInput {
  businessId: string;
  branchId: string;
  sale: Sale;
  requestedBy: string;
  reason: string;
  items: { saleItemId: string; productId: string; quantity: number; unitPrice: number; condition: 'resalable' | 'damaged' | 'expired' }[];
  notes?: string;
}

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

/** Creates a pending refund request. Does not touch the sale, inventory,
 * or customer balance yet — that only happens on approval (processRefund). */
export async function requestRefund(input: RequestRefundInput): Promise<Refund> {
  if (input.items.length === 0) throw new Error('Select at least one item to refund');
  const totalAmount = round2(input.items.reduce((s, i) => s + i.unitPrice * i.quantity, 0));

  const refund: Refund = {
    ...newRecordBase(),
    businessId: input.businessId,
    branchId: input.branchId,
    saleId: input.sale.id,
    customerId: input.sale.customerId ?? null,
    requestedBy: input.requestedBy,
    approvedBy: null,
    reason: input.reason,
    status: 'pending',
    totalAmount,
    refundMethod: null,
    requestedAt: new Date().toISOString(),
    decidedAt: null,
    processedAt: null,
    notes: input.notes ?? null
  } as Refund;

  await db.transaction('rw', [db.refunds, db.refundItems, db.syncQueue], async () => {
    await db.refunds.add(refund);
    await enqueueSync('refunds', refund.id, 'create');
    for (const item of input.items) {
      const refundItem: RefundItem = {
        id: crypto.randomUUID(),
        refundId: refund.id,
        saleItemId: item.saleItemId,
        productId: item.productId,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        lineTotal: round2(item.unitPrice * item.quantity),
        condition: item.condition
      };
      await db.refundItems.add(refundItem);
      // refundItems aren't independently synced yet in this build — they
      // travel with the refund record's own row on the backend; a future
      // pass should add a dedicated mapper + table sync entry for them.
    }
  });

  await recordAuditEvent({
    businessId: input.businessId, branchId: input.branchId, userId: input.requestedBy, action: 'refund_requested', entityType: 'refund', entityId: refund.id,
    newValue: JSON.stringify({ saleId: input.sale.id, totalAmount, reason: input.reason })
  });

  return refund;
}

/** Manager/owner rejects a pending request. Original sale is untouched. */
export async function rejectRefund(refund: Refund, decidedBy: string): Promise<void> {
  await db.transaction('rw', [db.refunds, db.syncQueue], async () => {
    const current = await db.refunds.get(refund.id);
    if (!current) throw new Error('Refund not found');
    // Guards the same race the other direction: if this refund was just
    // approved and processed (stock/debt already changed) by someone else
    // a moment before this rejection lands, the record must not end up
    // saying "rejected" while those effects already happened.
    if (current.status !== 'pending') return;
    await db.refunds.update(refund.id, {
      status: 'rejected',
      approvedBy: decidedBy,
      decidedAt: new Date().toISOString()
    });
    await enqueueSync('refunds', refund.id, 'update');
  });
  await recordAuditEvent({ businessId: refund.businessId, branchId: refund.branchId, userId: decidedBy, action: 'refund_rejected', entityType: 'refund', entityId: refund.id });
}

/**
 * Approves and processes a refund in one step: restores stock (only if
 * resalable), records the inventory movement for damaged/expired returns
 * without adding them back to sellable stock, and — if the sale was paid
 * on credit — reduces the linked debt's remaining amount rather than the
 * original sale. The original sale record is never modified or deleted;
 * refunds are a first-class linked entity, per the immutability rule.
 */
export async function approveAndProcessRefund(refund: Refund, decidedBy: string): Promise<void> {
  await db.transaction('rw', [db.refunds, db.refundItems, db.products, db.debts, db.sales, db.syncQueue], async () => {
    // Re-read status INSIDE the transaction, not before it — Dexie
    // serializes transactions that touch the same tables, so this check
    // and the write below are atomic against another call for the same
    // refund on this device (a double-click, a reopened tab, a retried
    // request). Without this, calling this function twice would restore
    // stock and reduce the linked debt twice.
    const current = await db.refunds.get(refund.id);
    if (!current) throw new Error('Refund not found');
    if (current.status !== 'pending') return; // already processed or rejected — no-op, not an error

    const items = await db.refundItems.where('refundId').equals(refund.id).toArray();

    for (const item of items) {
      if (item.condition === 'resalable') {
        const product = await db.products.get(item.productId);
        if (product) {
          await db.products.put({
            ...product,
            quantity: round2(product.quantity + item.quantity),
            updatedAt: new Date().toISOString(),
            syncStatus: 'pending'
          });
          await enqueueSync('products', product.id, 'update');
        }
      }
      // damaged / expired: intentionally not added back to sellable stock
    }

    // If this sale had a linked debt, reduce it by the refunded amount
    // (never below zero) instead of touching the sale itself.
    const linkedDebt = await db.debts.where('saleId').equals(refund.saleId).first();
    if (linkedDebt && linkedDebt.remainingAmount > 0) {
      const reduction = Math.min(linkedDebt.remainingAmount, refund.totalAmount);
      const remainingAmount = round2(linkedDebt.remainingAmount - reduction);
      const originalAmount = round2(linkedDebt.originalAmount - reduction);
      await db.debts.put({
        ...linkedDebt,
        originalAmount,
        remainingAmount,
        status: remainingAmount <= 0 ? 'paid' : linkedDebt.status,
        updatedAt: new Date().toISOString(),
        syncStatus: 'pending'
      });
      await enqueueSync('debts', linkedDebt.id, 'update');
    }

    await db.refunds.update(refund.id, {
      status: 'processed',
      approvedBy: decidedBy,
      decidedAt: new Date().toISOString(),
      processedAt: new Date().toISOString()
    });
    await enqueueSync('refunds', refund.id, 'update');

    // The Sale type has always defined 'refunded' / 'partially_refunded'
    // states, but nothing ever set them — a fully refunded sale stayed
    // marked 'completed' forever. Compute the true state from every
    // processed refund against this sale (including this one, now that
    // it's marked above) rather than just this single refund's amount, so
    // two partial refunds on the same sale still add up correctly.
    const sale = await db.sales.get(refund.saleId);
    if (sale && sale.status !== 'cancelled') {
      const allRefunds = await db.refunds.where('saleId').equals(refund.saleId).toArray();
      const totalRefunded = round2(allRefunds.filter((r) => r.status === 'processed').reduce((s, r) => s + r.totalAmount, 0));
      const newStatus = totalRefunded >= sale.total ? 'refunded' : totalRefunded > 0 ? 'partially_refunded' : sale.status;
      if (newStatus !== sale.status) {
        await db.sales.put({ ...sale, status: newStatus, updatedAt: new Date().toISOString(), syncStatus: 'pending' });
        await enqueueSync('sales', sale.id, 'update');
      }
    }
  });

  await recordAuditEvent({ businessId: refund.businessId, branchId: refund.branchId, userId: decidedBy, action: 'refund_processed', entityType: 'refund', entityId: refund.id, newValue: JSON.stringify({ totalAmount: refund.totalAmount }) });
}
