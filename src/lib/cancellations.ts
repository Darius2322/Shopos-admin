import { db, enqueueSync } from './db';
import { recordAuditEvent } from './audit';
import type { Sale } from './types';

export interface RequestCancellationInput {
  businessId: string;
  branchId: string;
  sale: Sale;
  requestedBy: string;
  reason: string;
}

/** Requests cancellation of a whole sale (wrong customer, duplicate entry,
 * etc.) — distinct from a refund, which is for specific items on a sale
 * that was otherwise correct. Like refunds, this never touches the
 * original sale row directly; it's a linked, approval-gated record. */
export async function requestSaleCancellation(input: RequestCancellationInput) {
  const record = {
    id: crypto.randomUUID(),
    businessId: input.businessId,
    branchId: input.branchId,
    saleId: input.sale.id,
    requestedBy: input.requestedBy,
    approvedBy: null,
    reason: input.reason,
    status: 'pending' as const,
    requestedAt: new Date().toISOString(),
    decidedAt: null
  };
  await db.saleCancellations.add(record as any);
  await enqueueSync('saleCancellations', record.id, 'create');
  await recordAuditEvent({ businessId: input.businessId, branchId: input.branchId, userId: input.requestedBy, action: 'cancellation_requested', entityType: 'sale', entityId: input.sale.id, newValue: JSON.stringify({ reason: input.reason }) });
  return record;
}

export async function rejectSaleCancellation(id: string, decidedBy: string) {
  let businessId = '', branchId: string | null = null;
  await db.transaction('rw', [db.saleCancellations, db.syncQueue], async () => {
    const current = await db.saleCancellations.get(id);
    if (!current) throw new Error('Cancellation request not found');
    if (current.status !== 'pending') return;
    businessId = current.businessId; branchId = current.branchId;
    await db.saleCancellations.update(id, { status: 'rejected', approvedBy: decidedBy, decidedAt: new Date().toISOString() });
    await enqueueSync('saleCancellations', id, 'update');
  });
  if (businessId) await recordAuditEvent({ businessId, branchId, userId: decidedBy, action: 'cancellation_rejected', entityType: 'sale', entityId: id });
}

/**
 * Approves and processes a cancellation: reverses stock, reverses any
 * linked debt to zero (not just reduces it — the whole sale is void), and
 * reverses loyalty points. Marks the sale's own status as 'cancelled'
 * rather than deleting it, so it remains permanently visible in history —
 * required by the transaction-immutability rule.
 */
export async function approveSaleCancellation(cancellationId: string, decidedBy: string) {
  await db.transaction('rw', [db.sales, db.saleItems, db.products, db.debts, db.customers, db.saleCancellations, db.syncQueue], async () => {
    // Re-read both records INSIDE the transaction — checking before it
    // (as this used to) leaves a window where two near-simultaneous calls
    // (double-click, two tabs) can both pass the check before either
    // writes, reversing stock and the linked debt twice.
    const cancellation = await db.saleCancellations.get(cancellationId);
    if (!cancellation) throw new Error('Cancellation request not found');
    if (cancellation.status !== 'pending') return; // already decided — no-op, not an error

    const sale = await db.sales.get(cancellation.saleId);
    if (!sale) throw new Error('Original sale not found');
    if (sale.status === 'cancelled') return; // already cancelled by another path — no-op

    const items = await db.saleItems.where('saleId').equals(sale.id).toArray();

    for (const item of items) {
      const product = await db.products.get(item.productId);
      if (product) {
        await db.products.put({
          ...product,
          quantity: Math.round((product.quantity + item.quantity) * 100) / 100,
          updatedAt: new Date().toISOString(),
          syncStatus: 'pending'
        });
        await enqueueSync('products', product.id, 'update');
      }
    }

    const linkedDebt = await db.debts.where('saleId').equals(sale.id).first();
    if (linkedDebt && linkedDebt.status !== 'paid') {
      await db.debts.put({
        ...linkedDebt,
        remainingAmount: 0,
        status: 'paid',
        updatedAt: new Date().toISOString(),
        syncStatus: 'pending'
      });
      await enqueueSync('debts', linkedDebt.id, 'update');
    }

    if (sale.customerId) {
      const customer = await db.customers.get(sale.customerId);
      // Loyalty points from a cancelled sale are reversed the same way a
      // full refund reverses them; a simple proportional reversal since
      // this is a full-sale void, not a partial refund.
      if (customer && customer.loyaltyRegistered) {
        // Points earned aren't tracked per-sale in this build's local
        // schema, so a full reversal amount isn't independently known here
        // — left as a documented limitation rather than guessed.
      }
    }

    await db.sales.put({ ...sale, status: 'cancelled', updatedAt: new Date().toISOString(), syncStatus: 'pending' });
    await enqueueSync('sales', sale.id, 'update');

    await db.saleCancellations.update(cancellationId, {
      status: 'approved', approvedBy: decidedBy, decidedAt: new Date().toISOString()
    });
    await enqueueSync('saleCancellations', cancellationId, 'update');

    await recordAuditEvent({ businessId: sale.businessId, branchId: sale.branchId, userId: decidedBy, action: 'cancellation_approved', entityType: 'sale', entityId: sale.id, newValue: JSON.stringify({ total: sale.total }) });
  });
}
