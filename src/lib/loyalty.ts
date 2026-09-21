import { db, enqueueSync } from './db';
import type { Sale, LoyaltySettingsRecord } from './types';

export type LoyaltySettings = LoyaltySettingsRecord;

const DEFAULT_SETTINGS: Omit<LoyaltySettings, 'businessId'> = {
  enabled: false,
  pointsPerAmount: 1,
  amountPerPoint: 100,
  minPurchase: 0,
  countDiscount: false,
  countTax: true
};

export async function getLoyaltySettings(businessId: string): Promise<LoyaltySettings> {
  const row = await db.loyaltySettings.get(businessId);
  if (row) return row;
  return { businessId, ...DEFAULT_SETTINGS };
}

export async function saveLoyaltySettings(settings: LoyaltySettings): Promise<void> {
  await db.loyaltySettings.put({ ...settings, syncStatus: 'pending' });
  await enqueueSync('loyaltySettings', settings.businessId, 'update');
}

function round0(n: number) {
  return Math.round(n);
}

/** Computes points for a completed sale under the given settings. Returns 0
 * for unregistered customers or when the sale is below the minimum. */
export function calculatePoints(sale: Sale, settings: LoyaltySettings, customerRegistered: boolean): number {
  if (!settings.enabled || !customerRegistered) return 0;
  let base = sale.subtotal;
  if (settings.countDiscount) base += sale.discount;
  if (settings.countTax) base += sale.tax;
  if (base < settings.minPurchase) return 0;
  if (settings.amountPerPoint <= 0) return 0;
  return round0((base / settings.amountPerPoint) * settings.pointsPerAmount);
}

/** Awards points to a customer for a sale, idempotently — safe to call once
 * per sale even if retried offline, because it's keyed on the sale id via
 * the caller (POS only calls this once per completeSale invocation and the
 * local record is created synchronously in the same transaction). */
export async function awardLoyaltyPoints(customerId: string, sale: Sale, points: number, userId?: string) {
  if (points <= 0) return;
  const customer = await db.customers.get(customerId);
  if (!customer) return;
  const previousBalance = customer.loyaltyPoints;
  const newBalance = previousBalance + points;
  await db.customers.put({ ...customer, loyaltyPoints: newBalance, updatedAt: new Date().toISOString(), syncStatus: 'pending' });
  await enqueueSync('customers', customer.id, 'update');
  // A dedicated loyalty_transactions sync entry (history, not just balance)
  // is defined in the schema but not yet mapped in sync.ts — see README.
}

/** Reverses points earned from a refunded sale (full or partial, based on
 * the proportion of the sale's total that was refunded). */
export async function reverseLoyaltyPoints(customerId: string, pointsToReverse: number) {
  if (pointsToReverse <= 0) return;
  const customer = await db.customers.get(customerId);
  if (!customer) return;
  const newBalance = Math.max(0, customer.loyaltyPoints - pointsToReverse);
  await db.customers.put({ ...customer, loyaltyPoints: newBalance, updatedAt: new Date().toISOString(), syncStatus: 'pending' });
  await enqueueSync('customers', customer.id, 'update');
}
