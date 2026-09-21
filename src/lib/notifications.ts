import { db } from './db';

export interface DerivedNotification {
  id: string;
  type: string;
  title: string;
  body: string;
  severity: 'info' | 'warning' | 'critical';
  href: string;
}

/**
 * Notifications here are computed live from current data rather than a
 * stored feed the user has to mark read one-by-one — for a small business
 * app, "what needs my attention right now" is more useful than a history
 * log, and it can never drift out of sync with reality. The `notifications`
 * table in the schema is still there for anything that genuinely needs a
 * persistent, dismissible record (e.g. a push-notification backend later).
 */
export async function getDerivedNotifications(businessId: string, branchId: string | null): Promise<DerivedNotification[]> {
  const notifications: DerivedNotification[] = [];

  const products = await db.products.where('businessId').equals(businessId).toArray();
  const scopedProducts = branchId ? products.filter((p) => p.branchId === branchId) : products;
  const outOfStock = scopedProducts.filter((p) => p.active && p.quantity <= 0);
  const lowStock = scopedProducts.filter((p) => p.active && p.quantity > 0 && p.quantity <= p.minStock);

  if (outOfStock.length > 0) {
    notifications.push({
      id: 'out-of-stock', type: 'out_of_stock', severity: 'critical',
      title: `${outOfStock.length} product${outOfStock.length > 1 ? 's' : ''} out of stock`,
      body: outOfStock.slice(0, 3).map((p) => p.name).join(', '),
      href: '/inventory'
    });
  }
  if (lowStock.length > 0) {
    notifications.push({
      id: 'low-stock', type: 'low_stock', severity: 'warning',
      title: `${lowStock.length} product${lowStock.length > 1 ? 's' : ''} low on stock`,
      body: lowStock.slice(0, 3).map((p) => p.name).join(', '),
      href: '/inventory'
    });
  }

  const debts = await db.debts.where('businessId').equals(businessId).toArray();
  const overdue = debts.filter((d) => d.status === 'overdue');
  if (overdue.length > 0) {
    notifications.push({
      id: 'overdue-debts', type: 'invoice_overdue', severity: 'critical',
      title: `${overdue.length} overdue debt${overdue.length > 1 ? 's' : ''}`,
      body: 'Customers with overdue balances need follow-up.',
      href: '/debts'
    });
  }

  const pendingRefunds = (await db.refunds.where('businessId').equals(businessId).toArray()).filter((r) => r.status === 'pending');
  if (pendingRefunds.length > 0) {
    notifications.push({
      id: 'pending-refunds', type: 'refund_request', severity: 'warning',
      title: `${pendingRefunds.length} refund request${pendingRefunds.length > 1 ? 's' : ''} awaiting approval`,
      body: 'Review and approve or reject.',
      href: '/refunds'
    });
  }

  const pendingCorrections = (await db.correctionRequests.where('businessId').equals(businessId).toArray()).filter((c) => c.status === 'requested');
  if (pendingCorrections.length > 0) {
    notifications.push({
      id: 'pending-corrections', type: 'correction_request', severity: 'warning',
      title: `${pendingCorrections.length} correction request${pendingCorrections.length > 1 ? 's' : ''} awaiting review`,
      body: 'A cashier flagged a mistake that needs your decision.',
      href: '/corrections'
    });
  }

  const failedSync = await db.syncQueue.where('attempts').aboveOrEqual(6).count();
  if (failedSync > 0) {
    notifications.push({
      id: 'sync-failed', type: 'sync_failed', severity: 'critical',
      title: `${failedSync} change${failedSync > 1 ? 's' : ''} failed to sync`,
      body: 'Open Sync Center to retry.',
      href: '/sync'
    });
  }

  return notifications;
}
