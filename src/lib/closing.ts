import { db } from './db';
import { supabase } from './supabase';

export interface DailyTotals {
  totalSales: number;
  cashSales: number;
  mpesaSales: number;
  cardSales: number;
  bankSales: number;
  creditSales: number;
  otherSales: number;
  refundsTotal: number;
  expensesTotal: number;
  cancellationsCount: number;
  transactionCount: number;
  expectedCash: number;
}

function todayRange(): { start: string; end: string } {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).toISOString();
  return { start, end };
}

/** Computes today's totals for a branch from local data — works offline,
 * since a branch closing out at end of day may not have connectivity. */
export async function computeDailyTotals(businessId: string, branchId: string): Promise<DailyTotals> {
  const { start, end } = todayRange();

  const sales = (await db.sales.where('businessId').equals(businessId).toArray())
    .filter((s) => s.branchId === branchId && s.createdAt >= start && s.createdAt < end && s.status === 'completed');

  const byMethod: Record<string, number> = { cash: 0, mpesa: 0, card: 0, bank: 0, credit: 0, other: 0 };
  let totalSales = 0;
  for (const s of sales) {
    totalSales += s.total;
    byMethod[s.paymentMethod] = (byMethod[s.paymentMethod] ?? 0) + s.amountPaid;
    if (s.paymentMethod === 'credit') byMethod.credit += s.balanceDue;
  }

  const refunds = (await db.refunds.where('businessId').equals(businessId).toArray())
    .filter((r) => r.branchId === branchId && r.processedAt && r.processedAt >= start && r.processedAt < end);
  const refundsTotal = refunds.reduce((sum, r) => sum + r.totalAmount, 0);

  const expenses = (await db.expenses.where('businessId').equals(businessId).toArray())
    .filter((e) => e.branchId === branchId && e.createdAt >= start && e.createdAt < end);
  const expensesTotal = expenses.reduce((sum, e) => sum + e.amount, 0);

  const cancellationsCount = (await db.saleCancellations.where('businessId').equals(businessId).toArray())
    .filter((c) => c.branchId === branchId && c.status === 'approved' && c.decidedAt && c.decidedAt >= start && c.decidedAt < end).length;

  // Expected cash in the drawer: cash sales minus cash refunds/expenses paid
  // out of the till. This is a reasonable default, not a guarantee — a
  // business paying expenses from a separate account would need to adjust.
  const expectedCash = byMethod.cash - expensesTotal;

  return {
    totalSales,
    cashSales: byMethod.cash,
    mpesaSales: byMethod.mpesa,
    cardSales: byMethod.card,
    bankSales: byMethod.bank,
    creditSales: byMethod.credit,
    otherSales: byMethod.other,
    refundsTotal,
    expensesTotal,
    cancellationsCount,
    transactionCount: sales.length,
    expectedCash
  };
}

export interface CloseDayInput {
  businessId: string;
  branchId: string;
  closedBy: string;
  totals: DailyTotals;
  actualCash: number;
  discrepancyReason?: string | null;
  notes?: string | null;
}

/** Records the closing — written directly online (not offline-queued),
 * since a closing is inherently a point-in-time event best done once
 * connectivity is available; the totals themselves were computed from
 * local data so the branch can still review them offline first. */
export async function closeDay(input: CloseDayInput) {
  if (!supabase) throw new Error('No backend configured');
  const businessDate = new Date().toISOString().slice(0, 10);
  const cashDifference = input.actualCash - input.totals.expectedCash;

  const { error } = await supabase.from('daily_closings').upsert({
    business_id: input.businessId,
    branch_id: input.branchId,
    closed_by: input.closedBy,
    business_date: businessDate,
    total_sales: input.totals.totalSales,
    cash_sales: input.totals.cashSales,
    mpesa_sales: input.totals.mpesaSales,
    card_sales: input.totals.cardSales,
    bank_sales: input.totals.bankSales,
    credit_sales: input.totals.creditSales,
    other_sales: input.totals.otherSales,
    refunds_total: input.totals.refundsTotal,
    expenses_total: input.totals.expensesTotal,
    expected_cash: input.totals.expectedCash,
    actual_cash: input.actualCash,
    cash_difference: cashDifference,
    discrepancy_reason: input.discrepancyReason ?? null,
    notes: input.notes ?? null,
    // Re-closing after a reopen should read as freshly closed, not still
    // flagged reopened — the history table (schema_part13.sql) is what
    // preserves the fact a reopen happened, not this live row.
    reopened_at: null,
    reopened_by: null,
    reopen_reason: null
  }, { onConflict: 'branch_id,business_date' });

  if (error) throw error;
  return { cashDifference };
}

export interface ExistingClosing {
  id: string;
  totalSales: number;
  cashSales: number;
  mpesaSales: number;
  cardSales: number;
  bankSales: number;
  creditSales: number;
  otherSales: number;
  refundsTotal: number;
  expensesTotal: number;
  expectedCash: number;
  actualCash: number | null;
  cashDifference: number | null;
  discrepancyReason: string | null;
  notes: string | null;
  closedBy: string | null;
  createdAt: string;
  reopenedAt: string | null;
  reopenedBy: string | null;
  reopenReason: string | null;
}

/** Whether today has already been closed for this branch — checked online
 * only; if offline, we can't know for sure, so the UI treats "unknown" as
 * "let them proceed" rather than blocking a legitimate offline closing. */
export async function getTodaysClosing(businessId: string, branchId: string): Promise<ExistingClosing | null> {
  if (!supabase) return null;
  const businessDate = new Date().toISOString().slice(0, 10);
  const { data, error } = await supabase.from('daily_closings').select('*')
    .eq('business_id', businessId).eq('branch_id', branchId).eq('business_date', businessDate)
    .maybeSingle();
  if (error || !data) return null;
  return {
    id: data.id, totalSales: data.total_sales, cashSales: data.cash_sales, mpesaSales: data.mpesa_sales,
    cardSales: data.card_sales, bankSales: data.bank_sales, creditSales: data.credit_sales, otherSales: data.other_sales,
    refundsTotal: data.refunds_total, expensesTotal: data.expenses_total, expectedCash: data.expected_cash,
    actualCash: data.actual_cash, cashDifference: data.cash_difference, discrepancyReason: data.discrepancy_reason,
    notes: data.notes, closedBy: data.closed_by, createdAt: data.created_at,
    reopenedAt: data.reopened_at, reopenedBy: data.reopened_by, reopenReason: data.reopen_reason
  };
}

/** Owner/manager only, enforced server-side by reopen_daily_closing() —
 * requires a reason, and snapshots the current row into
 * daily_closing_history before marking it reopened. */
export async function reopenClosing(closingId: string, reason: string) {
  if (!supabase) throw new Error('No backend configured');
  const { error } = await supabase.rpc('reopen_daily_closing', { p_closing_id: closingId, p_reason: reason });
  if (error) throw error;
}
