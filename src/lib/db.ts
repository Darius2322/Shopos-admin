import Dexie, { Table } from 'dexie';
import type {
  PaymentSource, PaymentTransaction,
  Business, Branch, Profile, Product, Customer, Sale, SaleItem,
  Debt, Payment, Expense, AuditEntry, Supplier, Purchase, Refund,
  RefundItem, EmployeePayment, CorrectionRequest, ProfilePermission, ProfileBranch,
  Quotation, QuotationItem, Invoice, InvoiceItem, InvoicePaymentRecord,
  AppNotification, SupportTicket, LoyaltySettingsRecord, SupportTicketReply, SaleCancellation,
  Notice, NoticeAcknowledgement, PrinterDevice, Category, FeatureRequest, DeviceSession, InventoryMovement
} from './types';

export interface SyncQueueItem {
  id: string;
  entity: string;       // table name, e.g. 'debts'
  entityId: string;
  op: 'create' | 'update' | 'delete';
  attempts: number;
  lastError?: string;
  createdAt: string;
}

// Local-only session/context — which business/branch/user is active.
/** Successful barcode lookups, kept so a re-scan is instant and works offline. */
export interface BarcodeCacheRow {
  barcode: string; name: string; brand?: string; unit?: string; size?: string;
  category?: string; packaging?: string; imageUrl?: string; provider?: string; cachedAt: string;
}

/** Original text of an M-Pesa payment message that WAS recognised as a payment. Kept locally only
 * (never uploaded), separate from the normalised transaction. Unrecognised messages are never stored. */
export interface MpesaRawMessageRow { transactionCode: string; body: string; receivedAt: string }

export interface AppContextRow {
  key: string; // 'current' = active business/branch, 'session' = login timing
  businessId?: string;
  branchId?: string;
  allBranches?: boolean; // true when the owner/manager explicitly chose "All Branches"
  userId?: string;
  sessionStartedAt?: string;
}

class ShopOSDB extends Dexie {
  businesses!: Table<Business, string>;
  branches!: Table<Branch, string>;
  profiles!: Table<Profile, string>;
  products!: Table<Product, string>;
  inventoryMovements!: Table<InventoryMovement, string>;
  customers!: Table<Customer, string>;
  sales!: Table<Sale, string>;
  saleItems!: Table<SaleItem, string>;
  debts!: Table<Debt, string>;
  payments!: Table<Payment, string>;
  expenses!: Table<Expense, string>;
  auditLog!: Table<AuditEntry, string>;
  suppliers!: Table<Supplier, string>;
  purchases!: Table<Purchase, string>;
  refunds!: Table<Refund, string>;
  refundItems!: Table<RefundItem, string>;
  employeePayments!: Table<EmployeePayment, string>;
  correctionRequests!: Table<CorrectionRequest, string>;
  profilePermissions!: Table<ProfilePermission, string>;
  profileBranches!: Table<ProfileBranch, string>;
  quotations!: Table<Quotation, string>;
  quotationItems!: Table<QuotationItem, string>;
  invoices!: Table<Invoice, string>;
  invoiceItems!: Table<InvoiceItem, string>;
  invoicePayments!: Table<InvoicePaymentRecord, string>;
  notifications!: Table<AppNotification, string>;
  supportTickets!: Table<SupportTicket, string>;
  supportTicketReplies!: Table<SupportTicketReply, string>;
  loyaltySettings!: Table<LoyaltySettingsRecord, string>;
  saleCancellations!: Table<SaleCancellation, string>;
  notices!: Table<Notice, string>;
  noticeAcknowledgements!: Table<NoticeAcknowledgement, string>;
  printers!: Table<PrinterDevice, string>;
  categories!: Table<Category, string>;
  featureRequests!: Table<FeatureRequest, string>;
  deviceSessions!: Table<DeviceSession, string>;
  syncQueue!: Table<SyncQueueItem, string>;
  paymentSources!: Table<PaymentSource, string>;
  paymentTransactions!: Table<PaymentTransaction, string>;
  barcodeCache!: Table<BarcodeCacheRow, string>;
  mpesaRawMessages!: Table<MpesaRawMessageRow, string>;
  appContext!: Table<AppContextRow, string>;

  constructor() {
    super('shopos');
    this.version(1).stores({
      businesses: 'id, ownerId',
      branches: 'id, businessId',
      profiles: 'id, businessId',
      products: 'id, businessId, branchId, barcode, sku, [businessId+branchId]',
      customers: 'id, businessId, branchId, phone',
      sales: 'id, businessId, branchId, customerId, receiptNumber, createdAt',
      saleItems: 'id, saleId, productId',
      debts: 'id, businessId, branchId, customerId, saleId, status',
      payments: 'id, businessId, branchId, customerId, saleId, debtId',
      expenses: 'id, businessId, branchId, createdAt',
      auditLog: 'id, businessId, branchId, createdAt',
      syncQueue: 'id, entity, attempts, createdAt',
      appContext: 'key'
    });
    this.version(2).stores({
      suppliers: 'id, businessId, status',
      purchases: 'id, businessId, branchId, supplierId, createdAt',
      refunds: 'id, businessId, branchId, saleId, status',
      refundItems: 'id, refundId, productId',
      employeePayments: 'id, businessId, branchId, employeeId, createdAt'
    });
    this.version(3).stores({
      correctionRequests: 'id, businessId, branchId, saleId, status',
      profilePermissions: 'id, profileId'
    });
    this.version(4).stores({
      quotations: 'id, businessId, branchId, customerId, status, quotationNumber',
      quotationItems: 'id, quotationId',
      invoices: 'id, businessId, branchId, customerId, status, invoiceNumber',
      invoiceItems: 'id, invoiceId',
      invoicePayments: 'id, invoiceId',
      notifications: 'id, businessId, userId, read, createdAt',
      supportTickets: 'id, businessId, userId, status, createdAt'
    });
    this.version(5).stores({
      loyaltySettings: 'businessId'
    });
    this.version(6).stores({
      supportTicketReplies: 'id, ticketId, createdAt'
    });
    this.version(7).stores({
      saleCancellations: 'id, businessId, branchId, saleId, status'
    });
    this.version(8).stores({
      notices: 'id, businessId, branchId, publishedAt, pinned',
      noticeAcknowledgements: 'id, noticeId, userId'
    });
    this.version(9).stores({
      profileBranches: 'id, profileId, branchId'
    });
    // Local-only — never touched by lib/sync.ts. A Bluetooth pairing
    // belongs to this device/browser, not the business record.
    this.version(10).stores({
      printers: 'id, isDefault'
    });
    this.version(11).stores({
      categories: 'id, businessId, archived'
    });
    this.version(12).stores({
      featureRequests: 'id, businessId, feature, status'
    });
    this.version(13).stores({
      deviceSessions: 'id, businessId, profileId, branchId'
    });
    // A user can now hold multiple profile rows (one per business — see the
    // phase1 business_memberships migration). Add userId as an indexed
    // field, plus a compound index for "my row in this specific business",
    // without touching the existing `id, businessId` indexes anything else
    // still relies on. Existing local rows just get userId backfilled the
    // next time they sync down from Postgres.
    this.version(14).stores({
      profiles: 'id, businessId, userId, [userId+businessId]'
    });
    // entityId/userId weren't indexed before, so any `.where('entityId')`
    // or `.where('userId')` on auditLog would throw at runtime rather than
    // silently full-scan — needed for the staff activity feed and
    // "created by" lookup in UsersList.tsx.
    this.version(15).stores({
      auditLog: 'id, businessId, branchId, createdAt, userId, entityId'
    });
    // New local table for inventory_movements — existed in Postgres since
    // the beginning but was never synced anywhere in the app (spec section
    // 11's stock history had nothing to read).
    this.version(16).stores({
      inventoryMovements: 'id, businessId, branchId, productId, createdAt'
    });
    // Two real bugs, found via the KeyPath error the new ErrorBoundary
    // finally surfaced:
    //  - refunds never had createdAt indexed, but AnalyticsPage.tsx has
    //    always queried it by date range — pre-existing bug, not from
    //    this session's changes.
    //  - sales never had userId indexed, but UsersList.tsx's staff detail
    //    views (added this session, for the per-employee sales count)
    //    query exactly that — this one's on me.
    this.version(17).stores({
      refunds: 'id, businessId, branchId, saleId, status, createdAt',
      sales: 'id, businessId, branchId, customerId, receiptNumber, createdAt, userId'
    });

    // v18: M-Pesa payment sources + transactions. transactionCode is indexed so the
    // local duplicate check is a lookup, not a scan.
    this.version(18).stores({
      paymentSources: 'id, businessId, status',
      paymentTransactions: 'id, businessId, branchId, transactionCode, status, receivedAt, syncStatus'
    });

    // v19: barcode -> product-details cache (offline-capable lookups)
    this.version(19).stores({
      barcodeCache: 'barcode'
    });

    // v20: original text of recognised M-Pesa payment messages (local only)
    this.version(20).stores({
      mpesaRawMessages: 'transactionCode'
    });
  }
}

export const db = new ShopOSDB();

/** Every locally-created record shares this base: stable client-generated
 * uuid (safe for idempotent sync), version counter, and sync bookkeeping. */
export function newRecordBase() {
  return {
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    version: 1,
    syncStatus: 'pending' as const
  };
}

export async function enqueueSync(entity: string, entityId: string, op: 'create' | 'update' | 'delete') {
  await db.syncQueue.add({
    id: crypto.randomUUID(),
    entity,
    entityId,
    op,
    attempts: 0,
    createdAt: new Date().toISOString()
  });
  // Lets the sync engine start shortly after any local change (see initSync).
  if (typeof window !== 'undefined') window.dispatchEvent(new Event('shopos:queued'));
}

/** Every business-scoped table, deliberately excluding `printers` (a
 * Bluetooth pairing belongs to the physical hardware, not to whichever
 * shop happens to be logged in) and `syncQueue`/`appContext` (session
 * bookkeeping, cleared separately by the caller). Used only when it's
 * confirmed safe — see clearLocalBusinessDataIfSynced() below. */
const BUSINESS_SCOPED_TABLES = [
  'businesses', 'branches', 'profiles', 'products', 'customers', 'sales', 'saleItems',
  'debts', 'payments', 'expenses', 'auditLog', 'suppliers', 'purchases', 'refunds',
  'refundItems', 'employeePayments', 'correctionRequests', 'profilePermissions',
  'profileBranches', 'quotations', 'quotationItems', 'invoices', 'invoiceItems',
  'invoicePayments', 'notifications', 'supportTickets', 'supportTicketReplies',
  'loyaltySettings', 'saleCancellations', 'notices', 'noticeAcknowledgements',
  'categories', 'featureRequests', 'deviceSessions', 'inventoryMovements'
] as const;

/** On a shared device (a shop's till/tablet — see deviceSessions.ts),
 * signing out used to leave every table above fully intact in IndexedDB.
 * The app always scopes its OWN queries by businessId, so a different
 * business logging in next never actually sees this data on screen — but
 * it still sits there, readable via browser devtools by anyone with
 * physical access to that device, indefinitely.
 *
 * This only wipes it when the sync queue is confirmed empty — i.e.
 * nothing from the departing business is waiting to reach the server.
 * Wiping unconditionally would risk silently discarding a cashier's own
 * unsynced sales if they sign out while offline, which is a strictly
 * worse outcome than leaving stale data cached a little longer. Returns
 * whether it actually ran, so the caller can tell the user when it
 * didn't. */
export async function clearLocalBusinessDataIfSynced(): Promise<boolean> {
  const pending = await db.syncQueue.count();
  if (pending > 0) return false;
  await db.transaction('rw', BUSINESS_SCOPED_TABLES.map((name) => (db as any)[name]), async () => {
    for (const name of BUSINESS_SCOPED_TABLES) {
      await (db as any)[name].clear();
    }
  });
  return true;
}
