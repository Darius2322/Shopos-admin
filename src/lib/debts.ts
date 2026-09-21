import { db, enqueueSync, newRecordBase } from './db';
import type { Debt } from './types';

const round2 = (n: number) => Math.round(n * 100) / 100;

/** 'overdue' is derived, never trusted from storage: a debt is overdue when it
 * still has a balance and its due date (a plain date, local) has passed. */
export function effectiveStatus(d: Debt, today: Date = new Date()): Debt['status'] {
  if (d.remainingAmount <= 0 || d.status === 'paid') return 'paid';
  if (d.dueDate) {
    const t = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
    const due = new Date(`${d.dueDate}T00:00:00`).getTime();
    if (!Number.isNaN(due) && due < t) return 'overdue';
  }
  return d.paidAmount > 0 ? 'partial' : 'outstanding';
}

export function debtorLabel(d: Debt, customerName?: string | null): string {
  return d.customerId ? (customerName ?? 'Unknown customer') : (d.debtorName?.trim() || 'Unnamed');
}

export interface CreateManualDebtInput {
  businessId: string;
  branchId: string;
  userId: string;
  /** Existing registered customer. Leave undefined for a non-customer debt. */
  customerId?: string | null;
  debtorName?: string;
  debtorPhone?: string;
  amount: number;
  reason?: string;
  notes?: string;
  debtDate?: string;   // yyyy-mm-dd
  dueDate?: string | null;
}

/** Records a debt that did not come from a POS sale. Does NOT create a customer
 * account for a non-customer debtor. Offline-safe: written locally, then synced. */
export async function createManualDebt(input: CreateManualDebtInput): Promise<Debt> {
  const amount = round2(input.amount);
  if (!(amount > 0)) throw new Error('Enter an amount greater than zero');
  const name = input.debtorName?.trim() ?? '';
  if (!input.customerId && !name) throw new Error("Enter the person's name");
  if (input.dueDate && input.debtDate && input.dueDate < input.debtDate) {
    throw new Error('Due date cannot be before the debt date');
  }
  const debt: Debt = {
    ...newRecordBase(),
    businessId: input.businessId,
    branchId: input.branchId,
    customerId: input.customerId ?? null,
    debtorName: input.customerId ? null : name,
    debtorPhone: input.customerId ? null : (input.debtorPhone?.trim() || null),
    reason: input.reason?.trim() || null,
    notes: input.notes?.trim() || null,
    debtDate: input.debtDate || new Date().toISOString().slice(0, 10),
    source: 'manual',
    saleId: null,
    receiptId: null,
    userId: input.userId,
    originalAmount: amount,
    paidAmount: 0,
    remainingAmount: amount,
    status: 'outstanding',
    dueDate: input.dueDate || null
  };
  await db.transaction('rw', [db.debts, db.syncQueue], async () => {
    await db.debts.add(debt);
    await enqueueSync('debts', debt.id, 'create');
  });
  return debt;
}

export interface UpdateDebtInput {
  debtorName?: string; debtorPhone?: string; reason?: string; notes?: string;
  dueDate?: string | null; amount?: number;
}

/** Edits a debt. The amount can never drop below what has already been paid. */
export async function updateDebt(debt: Debt, patch: UpdateDebtInput): Promise<Debt> {
  const originalAmount = patch.amount !== undefined ? round2(patch.amount) : debt.originalAmount;
  if (!(originalAmount > 0)) throw new Error('Amount must be greater than zero');
  if (originalAmount < debt.paidAmount) {
    throw new Error(`Amount cannot be less than what has already been paid (${debt.paidAmount})`);
  }
  if (!debt.customerId && patch.debtorName !== undefined && !patch.debtorName.trim()) {
    throw new Error("Name can't be empty");
  }
  const remainingAmount = round2(originalAmount - debt.paidAmount);
  const updated: Debt = {
    ...debt,
    debtorName: debt.customerId ? debt.debtorName : (patch.debtorName?.trim() ?? debt.debtorName),
    debtorPhone: debt.customerId ? debt.debtorPhone : (patch.debtorPhone !== undefined ? (patch.debtorPhone.trim() || null) : debt.debtorPhone),
    reason: patch.reason !== undefined ? (patch.reason.trim() || null) : debt.reason,
    notes: patch.notes !== undefined ? (patch.notes.trim() || null) : debt.notes,
    dueDate: patch.dueDate !== undefined ? patch.dueDate : debt.dueDate,
    originalAmount,
    remainingAmount,
    status: remainingAmount <= 0 ? 'paid' : (debt.paidAmount > 0 ? 'partial' : 'outstanding'),
    updatedAt: new Date().toISOString(),
    version: (debt.version ?? 1) + 1,
    syncStatus: 'pending'
  };
  await db.transaction('rw', [db.debts, db.syncQueue], async () => {
    await db.debts.put(updated);
    await enqueueSync('debts', updated.id, 'update');
  });
  return updated;
}

/** Plain-text summary used for share / print. Contains no more than the owner already entered. */
export function debtSummaryText(d: Debt, businessName: string, currency: string, label: string): string {
  const fmt = (n: number) => `${currency} ${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const lines = [
    `${businessName} — debt statement`,
    `Name: ${label}`,
    d.reason ? `Reason: ${d.reason}` : null,
    `Date: ${d.debtDate ?? d.createdAt.slice(0, 10)}`,
    d.dueDate ? `Due: ${d.dueDate}` : null,
    `Amount: ${fmt(d.originalAmount)}`,
    `Paid: ${fmt(d.paidAmount)}`,
    `Balance: ${fmt(d.remainingAmount)}`
  ];
  return lines.filter(Boolean).join('\n');
}
