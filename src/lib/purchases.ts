import { db, newRecordBase, enqueueSync } from './db';
import type { Purchase, PurchaseItemInput } from './types';

export interface RecordPurchaseInput {
  businessId: string;
  branchId: string;
  supplierId: string;
  userId?: string;
  invoiceNumber?: string;
  items: PurchaseItemInput[];
  amountPaid: number;
  paymentMethod: string;
  notes?: string;
}

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

/** Records a supply/purchase, updates stock upward for each item, and
 * tracks the supplier balance the same way sales.ts tracks debts:
 * amountOwed = total - amountPaid, never clamped, never silently zeroed. */
export async function recordPurchase(input: RecordPurchaseInput): Promise<Purchase> {
  if (input.items.length === 0) throw new Error('A purchase needs at least one item');

  const total = round2(input.items.reduce((s, i) => s + i.buyingPrice * i.quantity, 0));
  const amountPaid = round2(Math.max(0, Math.min(input.amountPaid, total)));
  const amountOwed = round2(total - amountPaid);
  const status = amountOwed <= 0 ? 'paid' : amountPaid > 0 ? 'partial' : 'credit';

  const purchase: Purchase = {
    ...newRecordBase(),
    businessId: input.businessId,
    branchId: input.branchId,
    supplierId: input.supplierId,
    userId: input.userId ?? null,
    invoiceNumber: input.invoiceNumber ?? null,
    total,
    amountPaid,
    amountOwed,
    paymentMethod: input.paymentMethod,
    status,
    notes: input.notes ?? null
  } as Purchase;

  await db.transaction('rw', [db.purchases, db.products, db.syncQueue], async () => {
    await db.purchases.add(purchase);
    await enqueueSync('purchases', purchase.id, 'create');

    for (const item of input.items) {
      const product = await db.products.get(item.productId);
      if (!product) {
        // Silently skipping this used to mean the purchase record and its
        // line item existed with no matching stock movement — invisible
        // data corruption. A missing product here means a caller bug
        // (e.g. passing an id before creation actually landed), not a
        // recoverable state, so it must abort the whole transaction
        // rather than record half of it.
        throw new Error(`Product ${item.productId} was not found — stock was not updated for "${item.productName}"`);
      }
      const newQty = round2(product.quantity + item.quantity);
      await db.products.put({
        ...product,
        quantity: newQty,
        buyingPrice: item.buyingPrice, // keep cost price current
        updatedAt: new Date().toISOString(),
        syncStatus: 'pending'
      });
      await enqueueSync('products', product.id, 'update');
    }
  });

  return purchase;
}

/** Total outstanding balance owed to a supplier, always derived live. */
export async function supplierOutstandingBalance(supplierId: string): Promise<number> {
  const purchases = await db.purchases.where('supplierId').equals(supplierId).toArray();
  return round2(purchases.reduce((s, p) => s + p.amountOwed, 0));
}
