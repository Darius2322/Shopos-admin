import { touchActivity } from './activity';
import { db, newRecordBase, enqueueSync } from './db';
import type { CartLine, PaymentMethod, Sale, Debt, Payment } from './types';
import { getLoyaltySettings, calculatePoints, awardLoyaltyPoints } from './loyalty';
import { supabase } from './supabase';

export interface CompleteSaleInput {
  businessId: string;
  branchId: string;
  userId: string;
  customerId?: string | null;
  lines: CartLine[];
  taxRate: number;
  paymentMethod: PaymentMethod;
  amountPaid: number; // exact amount the customer handed over; 0 for full credit
  note?: string;
}

export interface CompleteSaleResult {
  sale: Sale;
  debt: Debt | null;
  payment: Payment | null;
  pointsEarned: number;
}

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

/**
 * Receipt numbers must never collide, even if two branches complete a sale
 * at the same instant. The server-side next_document_number() function
 * (schema_part4.sql) allocates the number atomically via an UPSERT, so this
 * is race-free when online. Offline, there's no way to consult the server,
 * so a clearly-marked provisional number is used and the real one is
 * assigned when this sale next syncs successfully — see syncFinalizeSale
 * below, called from the sync engine after a successful push.
 */
async function nextReceiptNumber(businessId: string): Promise<string> {
  if (supabase && navigator.onLine) {
    const { data, error } = await supabase.rpc('next_document_number', { p_business_id: businessId, p_doc_type: 'receipt' });
    if (!error && data) return data as string;
  }
  const stamp = Date.now().toString(36).toUpperCase();
  return `PENDING-${stamp}`;
}

/**
 * Completes a sale and, if the customer didn't pay the full total, creates
 * a linked debt for exactly the shortfall.
 *
 * THE RULE THIS FILE EXISTS TO PROTECT:
 *   balanceDue = total - amountPaid
 *   a debt is created iff balanceDue > 0, for exactly balanceDue.
 * Never initialise a debt to 0, never clamp amountPaid up to total, and
 * never skip creating the debt for a credit sale. The Postgres schema
 * additionally enforces `remaining_amount = original_amount - paid_amount`
 * as a CHECK constraint, so a regression here fails loudly instead of
 * silently corrupting a customer's balance.
 */
export async function completeSale(input: CompleteSaleInput): Promise<CompleteSaleResult> {
  const result = await completeSaleInner(input);
  touchActivity('sale');
  return result;
}

async function completeSaleInner(input: CompleteSaleInput): Promise<CompleteSaleResult> {
  if (input.lines.length === 0) throw new Error('Cannot complete a sale with no items');

  for (const line of input.lines) {
    const product = await db.products.get(line.product.id);
    if (!product) throw new Error(`Product ${line.product.name} no longer exists`);
    if (product.quantity < line.quantity) {
      throw new Error(`Not enough stock for ${product.name}: only ${product.quantity} left`);
    }
  }

  const subtotal = round2(
    input.lines.reduce((sum, l) => sum + l.product.sellingPrice * l.quantity - l.discount, 0)
  );
  const discount = round2(input.lines.reduce((sum, l) => sum + l.discount, 0));
  const tax = input.taxRate ? round2(subtotal * (input.taxRate / 100)) : 0;
  const total = round2(subtotal + tax);

  // Explicitly NOT clamped up to total when paymentMethod is credit — a
  // credit sale with amountPaid=0 must produce amountPaid=0, not total.
  const amountPaid = round2(Math.max(0, Math.min(input.amountPaid, total)));
  const balanceDue = round2(total - amountPaid);

  if (balanceDue > 0 && !input.customerId) {
    throw new Error('A customer must be selected for a credit sale');
  }

  const receiptNumber = await nextReceiptNumber(input.businessId);

  const sale: Sale = {
    ...newRecordBase(),
    businessId: input.businessId,
    branchId: input.branchId,
    customerId: input.customerId ?? null,
    userId: input.userId,
    receiptNumber,
    status: 'completed',
    subtotal,
    discount,
    tax,
    total,
    amountPaid,
    balanceDue,
    paymentMethod: input.paymentMethod,
    note: input.note ?? null
  };

  await db.transaction('rw', [db.sales, db.saleItems, db.products, db.debts, db.payments, db.syncQueue], async () => {
    await db.sales.add(sale);
    await enqueueSync('sales', sale.id, 'create');

    for (const line of input.lines) {
      const product = await db.products.get(line.product.id);
      if (!product) continue;
      const lineTotal = round2(line.product.sellingPrice * line.quantity - line.discount);
      const saleItem = {
        ...newRecordBase(),
        saleId: sale.id,
        productId: line.product.id,
        productName: line.product.name,
        quantity: line.quantity,
        unitPrice: line.product.sellingPrice,
        unitCost: line.product.buyingPrice,
        discount: line.discount,
        lineTotal
      };
      await db.saleItems.add(saleItem);
      // BUG FIX: this used to queue `sale.id`, so the sync engine looked up a sale item
      // that did not exist, silently treated it as "already deleted" and never uploaded it.
      await enqueueSync('saleItems', saleItem.id, 'create');

      const newQty = round2(product.quantity - line.quantity);
      await db.products.put({ ...product, quantity: newQty, updatedAt: new Date().toISOString(), syncStatus: 'pending' });
      await enqueueSync('products', product.id, 'update');
    }

    let payment: Payment | null = null;
    if (amountPaid > 0) {
      payment = {
        ...newRecordBase(),
        businessId: input.businessId,
        branchId: input.branchId,
        customerId: input.customerId ?? null,
        saleId: sale.id,
        debtId: null,
        direction: 'in',
        amount: amountPaid,
        method: input.paymentMethod,
        note: null,
        userId: input.userId
      };
      await db.payments.add(payment);
      await enqueueSync('payments', payment.id, 'create');
    }

    let debt: Debt | null = null;
    if (balanceDue > 0) {
      debt = {
        ...newRecordBase(),
        businessId: input.businessId,
        branchId: input.branchId,
        customerId: input.customerId!,
        saleId: sale.id,
        receiptId: sale.id,
        userId: input.userId,
        originalAmount: total,
        paidAmount: amountPaid,
        remainingAmount: balanceDue,
        status: amountPaid > 0 ? 'partial' : 'outstanding',
        dueDate: null
      };
      await db.debts.add(debt);
      await enqueueSync('debts', debt.id, 'create');
    }

    (sale as any).__result = { debt, payment };
  });

  const debt = balanceDue > 0
    ? await db.debts.where('saleId').equals(sale.id).first() ?? null
    : null;
  const payment = amountPaid > 0
    ? await db.payments.where('saleId').equals(sale.id).first() ?? null
    : null;

  // Loyalty is intentionally awarded after the core financial transaction
  // commits: it must never block or roll back a sale, and unregistered
  // customers simply earn nothing (never a display error).
  let pointsEarned = 0;
  if (input.customerId) {
    const customer = await db.customers.get(input.customerId);
    if (customer?.loyaltyRegistered) {
      const settings = await getLoyaltySettings(input.businessId);
      pointsEarned = calculatePoints(sale, settings, true);
      if (pointsEarned > 0) await awardLoyaltyPoints(input.customerId, sale, pointsEarned, input.userId);
    }
  }

  return { sale, debt, payment, pointsEarned };
}

export interface RecordDebtPaymentInput {
  businessId: string;
  branchId: string;
  debt: Debt;
  amount: number;
  method: PaymentMethod;
  userId: string;
  note?: string;
}

/** Applies a partial or full payment against an existing debt. Never
 * resets an unrelated balance and never overshoots the remaining amount. */
export async function recordDebtPayment(input: RecordDebtPaymentInput): Promise<{ debt: Debt; payment: Payment }> {
  if (input.amount <= 0) throw new Error('Payment amount must be positive');
  if (input.amount > input.debt.remainingAmount) {
    throw new Error(`Payment exceeds remaining balance of ${input.debt.remainingAmount}`);
  }

  const paidAmount = round2(input.debt.paidAmount + input.amount);
  const remainingAmount = round2(input.debt.originalAmount - paidAmount);
  const status = remainingAmount <= 0 ? 'paid' : 'partial';

  const updatedDebt: Debt = {
    ...input.debt,
    paidAmount,
    remainingAmount,
    status,
    updatedAt: new Date().toISOString(),
    version: (input.debt.version ?? 1) + 1,
    syncStatus: 'pending'
  };

  const payment: Payment = {
    ...newRecordBase(),
    businessId: input.businessId,
    branchId: input.branchId,
    customerId: input.debt.customerId,
    saleId: input.debt.saleId ?? null,
    debtId: input.debt.id,
    direction: 'in',
    amount: input.amount,
    method: input.method,
    note: input.note ?? null,
    userId: input.userId
  };

  await db.transaction('rw', [db.debts, db.payments, db.syncQueue], async () => {
    await db.debts.put(updatedDebt);
    await enqueueSync('debts', updatedDebt.id, 'update');
    await db.payments.add(payment);
    await enqueueSync('payments', payment.id, 'create');
  });

  return { debt: updatedDebt, payment };
}

/** Sum of outstanding balances for a customer — always derived from the
 * debts table, never from a cached field that could drift. */
export async function customerOutstandingDebt(customerId: string): Promise<number> {
  const debts = await db.debts.where('customerId').equals(customerId).toArray();
  return round2(debts.filter((d) => !d.deletedAt && d.status !== 'paid')
    .reduce((sum, d) => sum + d.remainingAmount, 0));
}
