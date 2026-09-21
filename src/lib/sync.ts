import { syncPayments } from './payments/store';
import { db, enqueueSync, SyncQueueItem } from './db';
import { supabase, backendConfigured } from './supabase';
import { create } from 'zustand';

/**
 * WHY THIS FILE EXISTS
 * --------------------
 * The previous version of this app pushed local (camelCase) objects
 * straight into Supabase with `.upsert(payload)` and no field mapping.
 * Local IndexedDB showed correct debt values, but anything read back
 * from Supabase — a second device, the owner's dashboard after a
 * refresh, a report — could see zeroed-out or missing amounts, because
 * the camelCase keys didn't match the database's snake_case columns.
 *
 * The fix: every entity has an explicit `toRow` / `fromRow` mapper here.
 * Nothing is ever upserted or merged without going through one of these.
 * Add a new synced entity by adding one entry to `mappers` below — never
 * by pushing a raw object.
 */

type Mapper = {
  toRow: (local: any) => Record<string, any>;
  fromRow: (row: any) => any;
};

const passthroughDates = (row: any, local: any) => {
  local.createdAt = row.created_at;
  local.updatedAt = row.updated_at;
};

const mappers: Record<string, Mapper> = {
  businesses: {
    toRow: (l) => ({
      id: l.id, owner_id: l.ownerId, name: l.name, slug: l.slug, logo_url: l.logoUrl,
      phone: l.phone, email: l.email, address: l.address, currency: l.currency,
      tax_rate: l.taxRate, tax_pin: l.taxPin, payment_instructions: l.paymentInstructions,
      receipt_footer: l.receiptFooter,
      paybill_number: l.paybillNumber, paybill_account: l.paybillAccount,
      till_number: l.tillNumber, send_till_number: l.sendTillNumber,
      mpesa_confirmation_name: l.mpesaConfirmationName, receipt_print_mode: l.receiptPrintMode,
      branches_enabled: l.branchesEnabled,
      status: l.status,
      onboarding_step: l.onboardingStep, onboarding_completed: l.onboardingCompleted
    }),
    fromRow: (r) => ({
      id: r.id, ownerId: r.owner_id, name: r.name, slug: r.slug, logoUrl: r.logo_url,
      phone: r.phone, email: r.email, address: r.address, currency: r.currency,
      taxRate: Number(r.tax_rate), taxPin: r.tax_pin, paymentInstructions: r.payment_instructions,
      receiptFooter: r.receipt_footer,
      paybillNumber: r.paybill_number, paybillAccount: r.paybill_account,
      tillNumber: r.till_number, sendTillNumber: r.send_till_number,
      mpesaConfirmationName: r.mpesa_confirmation_name, receiptPrintMode: r.receipt_print_mode ?? 'manual',
      branchesEnabled: r.branches_enabled ?? false,
      status: r.status,
      onboardingStep: r.onboarding_step ?? 0, onboardingCompleted: r.onboarding_completed ?? false,
      createdAt: r.created_at, updatedAt: r.updated_at
    })
  },
  branches: {
    toRow: (l) => ({
      id: l.id, business_id: l.businessId, name: l.name, code: l.code,
      location: l.location, phone: l.phone, manager_id: l.managerId, status: l.status
    }),
    fromRow: (r) => ({
      id: r.id, businessId: r.business_id, name: r.name, code: r.code,
      location: r.location, phone: r.phone, managerId: r.manager_id, status: r.status,
      createdAt: r.created_at, updatedAt: r.updated_at
    })
  },
  profiles: {
    toRow: (l) => ({
      id: l.id, user_id: l.userId, business_id: l.businessId, full_name: l.fullName, phone: l.phone,
      role: l.role, status: l.status, last_login_at: l.lastLoginAt,
      force_logout_at: l.forceLogoutAt
    }),
    fromRow: (r) => ({
      id: r.id, userId: r.user_id, businessId: r.business_id, fullName: r.full_name, phone: r.phone,
      role: r.role, status: r.status, lastLoginAt: r.last_login_at,
      forceLogoutAt: r.force_logout_at,
      createdAt: r.created_at, updatedAt: r.updated_at
    })
  },
  categories: {
    toRow: (l) => ({ id: l.id, business_id: l.businessId, name: l.name, archived: l.archived }),
    fromRow: (r) => ({
      id: r.id, businessId: r.business_id, name: r.name, archived: r.archived,
      createdAt: r.created_at, updatedAt: r.updated_at
    })
  },
  featureRequests: {
    toRow: (l) => ({
      id: l.id, business_id: l.businessId, feature: l.feature, status: l.status,
      requested_by: l.requestedBy, reason: l.reason
      // admin_reason/decided_by/decided_at are intentionally never sent from
      // the client — only admin_decide_feature_request() (security definer,
      // platform-admin-only) can set those.
    }),
    fromRow: (r) => ({
      id: r.id, businessId: r.business_id, feature: r.feature, status: r.status,
      requestedBy: r.requested_by, reason: r.reason, adminReason: r.admin_reason,
      decidedBy: r.decided_by, decidedAt: r.decided_at,
      createdAt: r.created_at, updatedAt: r.updated_at
    })
  },
  deviceSessions: {
    toRow: (l) => ({
      id: l.id, business_id: l.businessId, profile_id: l.profileId, branch_id: l.branchId,
      device_name: l.deviceName, device_type: l.deviceType, user_agent: l.userAgent,
      last_active_at: l.lastActiveAt
    }),
    fromRow: (r) => ({
      id: r.id, businessId: r.business_id, profileId: r.profile_id, branchId: r.branch_id,
      deviceName: r.device_name, deviceType: r.device_type, userAgent: r.user_agent,
      lastActiveAt: r.last_active_at, createdAt: r.created_at
    })
  },
  products: {
    toRow: (l) => ({
      id: l.id, business_id: l.businessId, branch_id: l.branchId,
      category_id: l.categoryId, supplier_id: l.supplierId, name: l.name,
      sku: l.sku, barcode: l.barcode, brand: l.brand, description: l.description,
      unit: l.unit, image_url: l.imageUrl, buying_price: l.buyingPrice,
      selling_price: l.sellingPrice, wholesale_price: l.wholesalePrice,
      quantity: l.quantity, min_stock: l.minStock, reorder_level: l.reorderLevel,
      expiry_date: l.expiryDate, active: l.active
    }),
    fromRow: (r) => ({
      id: r.id, businessId: r.business_id, branchId: r.branch_id,
      categoryId: r.category_id, supplierId: r.supplier_id, name: r.name,
      sku: r.sku, barcode: r.barcode, brand: r.brand, description: r.description,
      unit: r.unit, imageUrl: r.image_url, buyingPrice: Number(r.buying_price),
      sellingPrice: Number(r.selling_price),
      wholesalePrice: r.wholesale_price == null ? null : Number(r.wholesale_price),
      quantity: Number(r.quantity), minStock: Number(r.min_stock),
      reorderLevel: Number(r.reorder_level), expiryDate: r.expiry_date, active: r.active,
      createdAt: r.created_at, updatedAt: r.updated_at, syncStatus: 'synced'
    })
  },
  customers: {
    toRow: (l) => ({
      id: l.id, business_id: l.businessId, branch_id: l.branchId, name: l.name,
      phone: l.phone, email: l.email, address: l.address, credit_limit: l.creditLimit,
      loyalty_registered: l.loyaltyRegistered, loyalty_points: l.loyaltyPoints, active: l.active
    }),
    fromRow: (r) => ({
      id: r.id, businessId: r.business_id, branchId: r.branch_id, name: r.name,
      phone: r.phone, email: r.email, address: r.address,
      creditLimit: Number(r.credit_limit), loyaltyRegistered: r.loyalty_registered,
      loyaltyPoints: Number(r.loyalty_points), active: r.active,
      createdAt: r.created_at, updatedAt: r.updated_at, syncStatus: 'synced'
    })
  },
  sales: {
    toRow: (l) => ({
      id: l.id, business_id: l.businessId, branch_id: l.branchId,
      customer_id: l.customerId, user_id: l.userId, receipt_number: l.receiptNumber,
      status: l.status, subtotal: l.subtotal, discount: l.discount, tax: l.tax,
      total: l.total, amount_paid: l.amountPaid, balance_due: l.balanceDue,
      payment_method: l.paymentMethod, note: l.note
    }),
    fromRow: (r) => ({
      id: r.id, businessId: r.business_id, branchId: r.branch_id,
      customerId: r.customer_id, userId: r.user_id, receiptNumber: r.receipt_number,
      status: r.status, subtotal: Number(r.subtotal), discount: Number(r.discount),
      tax: Number(r.tax), total: Number(r.total), amountPaid: Number(r.amount_paid),
      balanceDue: Number(r.balance_due), paymentMethod: r.payment_method, note: r.note,
      createdAt: r.created_at, updatedAt: r.updated_at, syncStatus: 'synced'
    })
  },
  saleItems: {
    toRow: (l) => ({
      id: l.id, sale_id: l.saleId, product_id: l.productId, product_name: l.productName,
      quantity: l.quantity, unit_price: l.unitPrice, unit_cost: l.unitCost,
      discount: l.discount, line_total: l.lineTotal
    }),
    fromRow: (r) => ({
      id: r.id, saleId: r.sale_id, productId: r.product_id, productName: r.product_name,
      quantity: Number(r.quantity), unitPrice: Number(r.unit_price),
      unitCost: Number(r.unit_cost), discount: Number(r.discount),
      lineTotal: Number(r.line_total), syncStatus: 'synced'
    })
  },
  // The critical one. remaining_amount is always derived server-side by the
  // debt_math_check constraint too, so a mapping bug here would fail loudly
  // (constraint violation) instead of silently storing a wrong number.
  debts: {
    toRow: (l) => ({
      id: l.id, business_id: l.businessId, branch_id: l.branchId,
      customer_id: l.customerId, sale_id: l.saleId, receipt_id: l.receiptId,
      user_id: l.userId, original_amount: l.originalAmount, paid_amount: l.paidAmount,
      remaining_amount: l.remainingAmount, status: l.status, due_date: l.dueDate,
      debtor_name: l.debtorName ?? null, debtor_phone: l.debtorPhone ?? null,
      reason: l.reason ?? null, notes: l.notes ?? null,
      debt_date: l.debtDate ?? undefined, source: l.source ?? 'sale'
    }),
    fromRow: (r) => ({
      id: r.id, businessId: r.business_id, branchId: r.branch_id,
      customerId: r.customer_id, saleId: r.sale_id, receiptId: r.receipt_id,
      userId: r.user_id, originalAmount: Number(r.original_amount),
      paidAmount: Number(r.paid_amount), remainingAmount: Number(r.remaining_amount),
      status: r.status, dueDate: r.due_date,
      debtorName: r.debtor_name, debtorPhone: r.debtor_phone, reason: r.reason,
      notes: r.notes, debtDate: r.debt_date, source: r.source ?? 'sale',
      createdAt: r.created_at, updatedAt: r.updated_at, syncStatus: 'synced'
    })
  },
  payments: {
    toRow: (l) => ({
      id: l.id, business_id: l.businessId, branch_id: l.branchId,
      customer_id: l.customerId, sale_id: l.saleId, debt_id: l.debtId,
      direction: l.direction, amount: l.amount, method: l.method, note: l.note,
      user_id: l.userId
    }),
    fromRow: (r) => ({
      id: r.id, businessId: r.business_id, branchId: r.branch_id,
      customerId: r.customer_id, saleId: r.sale_id, debtId: r.debt_id,
      direction: r.direction, amount: Number(r.amount), method: r.method,
      note: r.note, userId: r.user_id, createdAt: r.created_at, syncStatus: 'synced'
    })
  },
  expenses: {
    toRow: (l) => ({
      id: l.id, business_id: l.businessId, branch_id: l.branchId,
      category: l.category, amount: l.amount, payment_method: l.paymentMethod,
      description: l.description, user_id: l.userId
    }),
    fromRow: (r) => ({
      id: r.id, businessId: r.business_id, branchId: r.branch_id,
      category: r.category, amount: Number(r.amount), paymentMethod: r.payment_method,
      description: r.description, userId: r.user_id, createdAt: r.created_at,
      syncStatus: 'synced'
    })
  },
  auditLog: {
    toRow: (l) => ({
      id: l.id, business_id: l.businessId, branch_id: l.branchId, user_id: l.userId,
      action: l.action, entity_type: l.entityType, entity_id: l.entityId,
      previous_value: l.previousValue, new_value: l.newValue
    }),
    fromRow: (r) => ({
      id: r.id, businessId: r.business_id, branchId: r.branch_id, userId: r.user_id,
      action: r.action, entityType: r.entity_type, entityId: r.entity_id,
      previousValue: r.previous_value, newValue: r.new_value,
      createdAt: r.created_at, syncStatus: 'synced'
    })
  },
  // Read-only from the app's perspective — every row is written by the
  // database itself (product update triggers / sale / purchase / refund
  // flows), never created client-side, so there's no toRow: nothing ever
  // pushes a local inventoryMovements row up. This just pulls the ledger
  // down for display (spec section 11's stock history).
  inventoryMovements: {
    toRow: () => ({}),
    fromRow: (r) => ({
      id: r.id, businessId: r.business_id, branchId: r.branch_id, productId: r.product_id,
      reason: r.reason, quantityChange: Number(r.quantity_change), resultingQuantity: Number(r.resulting_quantity),
      referenceId: r.reference_id, userId: r.user_id, createdAt: r.created_at
    })
  },
  suppliers: {
    toRow: (l) => ({
      id: l.id, business_id: l.businessId, name: l.name, phone: l.phone,
      email: l.email, address: l.address, status: l.status
    }),
    fromRow: (r) => ({
      id: r.id, businessId: r.business_id, name: r.name, phone: r.phone,
      email: r.email, address: r.address, status: r.status,
      createdAt: r.created_at, updatedAt: r.updated_at, syncStatus: 'synced'
    })
  },
  purchases: {
    toRow: (l) => ({
      id: l.id, business_id: l.businessId, branch_id: l.branchId,
      supplier_id: l.supplierId, user_id: l.userId, invoice_number: l.invoiceNumber,
      total: l.total, amount_paid: l.amountPaid, amount_owed: l.amountOwed,
      payment_method: l.paymentMethod, status: l.status, notes: l.notes
    }),
    fromRow: (r) => ({
      id: r.id, businessId: r.business_id, branchId: r.branch_id,
      supplierId: r.supplier_id, userId: r.user_id, invoiceNumber: r.invoice_number,
      total: Number(r.total), amountPaid: Number(r.amount_paid),
      amountOwed: Number(r.amount_owed), paymentMethod: r.payment_method,
      status: r.status, notes: r.notes, createdAt: r.created_at, syncStatus: 'synced'
    })
  },
  refunds: {
    toRow: (l) => ({
      id: l.id, business_id: l.businessId, branch_id: l.branchId, sale_id: l.saleId,
      customer_id: l.customerId, requested_by: l.requestedBy, approved_by: l.approvedBy,
      reason: l.reason, status: l.status, total_amount: l.totalAmount,
      refund_method: l.refundMethod, requested_at: l.requestedAt,
      decided_at: l.decidedAt, processed_at: l.processedAt, notes: l.notes
    }),
    fromRow: (r) => ({
      id: r.id, businessId: r.business_id, branchId: r.branch_id, saleId: r.sale_id,
      customerId: r.customer_id, requestedBy: r.requested_by, approvedBy: r.approved_by,
      reason: r.reason, status: r.status, totalAmount: Number(r.total_amount),
      refundMethod: r.refund_method, requestedAt: r.requested_at,
      decidedAt: r.decided_at, processedAt: r.processed_at, notes: r.notes,
      syncStatus: 'synced'
    })
  },
  employeePayments: {
    toRow: (l) => ({
      id: l.id, business_id: l.businessId, branch_id: l.branchId,
      employee_id: l.employeeId, paid_by: l.paidBy, period_start: l.periodStart,
      period_end: l.periodEnd, base_amount: l.baseAmount, additions: l.additions,
      deductions: l.deductions, advance: l.advance, net_amount: l.netAmount,
      payment_method: l.paymentMethod, reference: l.reference, notes: l.notes,
      status: l.status
    }),
    fromRow: (r) => ({
      id: r.id, businessId: r.business_id, branchId: r.branch_id,
      employeeId: r.employee_id, paidBy: r.paid_by, periodStart: r.period_start,
      periodEnd: r.period_end, baseAmount: Number(r.base_amount),
      additions: Number(r.additions), deductions: Number(r.deductions),
      advance: Number(r.advance), netAmount: Number(r.net_amount),
      paymentMethod: r.payment_method, reference: r.reference, notes: r.notes,
      status: r.status, createdAt: r.created_at, syncStatus: 'synced'
    })
  },
  correctionRequests: {
    toRow: (l) => ({
      id: l.id, business_id: l.businessId, branch_id: l.branchId, sale_id: l.saleId,
      requested_by: l.requestedBy, decided_by: l.decidedBy, problem: l.problem,
      requested_correction: l.requestedCorrection, status: l.status,
      requested_at: l.requestedAt, decided_at: l.decidedAt, resolution_notes: l.resolutionNotes
    }),
    fromRow: (r) => ({
      id: r.id, businessId: r.business_id, branchId: r.branch_id, saleId: r.sale_id,
      requestedBy: r.requested_by, decidedBy: r.decided_by, problem: r.problem,
      requestedCorrection: r.requested_correction, status: r.status,
      requestedAt: r.requested_at, decidedAt: r.decided_at, resolutionNotes: r.resolution_notes,
      syncStatus: 'synced'
    })
  },
  quotations: {
    toRow: (l) => ({
      id: l.id, business_id: l.businessId, branch_id: l.branchId, customer_id: l.customerId,
      user_id: l.userId, quotation_number: l.quotationNumber, status: l.status,
      subtotal: l.subtotal, discount: l.discount, tax: l.tax, total: l.total,
      valid_until: l.validUntil, notes: l.notes, terms: l.terms,
      converted_sale_id: l.convertedSaleId
    }),
    fromRow: (r) => ({
      id: r.id, businessId: r.business_id, branchId: r.branch_id, customerId: r.customer_id,
      userId: r.user_id, quotationNumber: r.quotation_number, status: r.status,
      subtotal: Number(r.subtotal), discount: Number(r.discount), tax: Number(r.tax),
      total: Number(r.total), validUntil: r.valid_until, notes: r.notes, terms: r.terms,
      convertedSaleId: r.converted_sale_id, createdAt: r.created_at, updatedAt: r.updated_at,
      syncStatus: 'synced'
    })
  },
  quotationItems: {
    toRow: (l) => ({
      id: l.id, quotation_id: l.quotationId, product_id: l.productId, description: l.description,
      quantity: l.quantity, unit_price: l.unitPrice, discount: l.discount, line_total: l.lineTotal
    }),
    fromRow: (r) => ({
      id: r.id, quotationId: r.quotation_id, productId: r.product_id, description: r.description,
      quantity: Number(r.quantity), unitPrice: Number(r.unit_price), discount: Number(r.discount),
      lineTotal: Number(r.line_total)
    })
  },
  invoices: {
    toRow: (l) => ({
      id: l.id, business_id: l.businessId, branch_id: l.branchId, customer_id: l.customerId,
      user_id: l.userId, quotation_id: l.quotationId, invoice_number: l.invoiceNumber,
      status: l.status, subtotal: l.subtotal, discount: l.discount, tax: l.tax, total: l.total,
      amount_paid: l.amountPaid, balance: l.balance, due_date: l.dueDate,
      notes: l.notes, terms: l.terms
    }),
    fromRow: (r) => ({
      id: r.id, businessId: r.business_id, branchId: r.branch_id, customerId: r.customer_id,
      userId: r.user_id, quotationId: r.quotation_id, invoiceNumber: r.invoice_number,
      status: r.status, subtotal: Number(r.subtotal), discount: Number(r.discount),
      tax: Number(r.tax), total: Number(r.total), amountPaid: Number(r.amount_paid),
      balance: Number(r.balance), dueDate: r.due_date, notes: r.notes, terms: r.terms,
      createdAt: r.created_at, updatedAt: r.updated_at, syncStatus: 'synced'
    })
  },
  invoiceItems: {
    toRow: (l) => ({
      id: l.id, invoice_id: l.invoiceId, product_id: l.productId, description: l.description,
      quantity: l.quantity, unit_price: l.unitPrice, discount: l.discount, line_total: l.lineTotal
    }),
    fromRow: (r) => ({
      id: r.id, invoiceId: r.invoice_id, productId: r.product_id, description: r.description,
      quantity: Number(r.quantity), unitPrice: Number(r.unit_price), discount: Number(r.discount),
      lineTotal: Number(r.line_total)
    })
  },
  invoicePayments: {
    toRow: (l) => ({
      id: l.id, invoice_id: l.invoiceId, amount: l.amount, method: l.method, user_id: l.userId
    }),
    fromRow: (r) => ({
      id: r.id, invoiceId: r.invoice_id, amount: Number(r.amount), method: r.method,
      userId: r.user_id, createdAt: r.created_at, syncStatus: 'synced'
    })
  },
  notifications: {
    toRow: (l) => ({
      id: l.id, business_id: l.businessId, branch_id: l.branchId, user_id: l.userId,
      type: l.type, title: l.title, body: l.body, read: l.read,
      entity_type: l.entityType, entity_id: l.entityId
    }),
    fromRow: (r) => ({
      id: r.id, businessId: r.business_id, branchId: r.branch_id, userId: r.user_id,
      type: r.type, title: r.title, body: r.body, read: r.read,
      entityType: r.entity_type, entityId: r.entity_id, createdAt: r.created_at,
      syncStatus: 'synced'
    })
  },
  supportTickets: {
    toRow: (l) => ({
      id: l.id, business_id: l.businessId, branch_id: l.branchId, user_id: l.userId,
      subject: l.subject, category: l.category, description: l.description, status: l.status,
      app_version: l.appVersion, device_info: l.deviceInfo
    }),
    fromRow: (r) => ({
      id: r.id, businessId: r.business_id, branchId: r.branch_id, userId: r.user_id,
      subject: r.subject, category: r.category, description: r.description, status: r.status,
      appVersion: r.app_version, deviceInfo: r.device_info,
      createdAt: r.created_at, updatedAt: r.updated_at, syncStatus: 'synced'
    })
  },
  loyaltySettings: {
    toRow: (l) => ({
      business_id: l.businessId, enabled: l.enabled, points_per_amount: l.pointsPerAmount,
      amount_per_point: l.amountPerPoint, min_purchase: l.minPurchase,
      count_discount: l.countDiscount, count_tax: l.countTax
    }),
    fromRow: (r) => ({
      businessId: r.business_id, enabled: r.enabled, pointsPerAmount: Number(r.points_per_amount),
      amountPerPoint: Number(r.amount_per_point), minPurchase: Number(r.min_purchase),
      countDiscount: r.count_discount, countTax: r.count_tax, syncStatus: 'synced'
    })
  },
  profilePermissions: {
    toRow: (l) => ({
      id: l.id, profile_id: l.profileId, permission: l.permission, allowed: l.allowed,
      granted_by: l.grantedBy
    }),
    fromRow: (r) => ({
      id: r.id, profileId: r.profile_id, permission: r.permission, allowed: r.allowed,
      grantedBy: r.granted_by, updatedAt: r.updated_at, syncStatus: 'synced'
    })
  },
  profileBranches: {
    toRow: (l) => ({
      id: l.id, profile_id: l.profileId, branch_id: l.branchId
    }),
    fromRow: (r) => ({
      id: r.id, profileId: r.profile_id, branchId: r.branch_id,
      updatedAt: r.updated_at, syncStatus: 'synced'
    })
  },
  supportTicketReplies: {
    toRow: (l) => ({
      id: l.id, ticket_id: l.ticketId, author_id: l.authorId, is_admin: l.isAdmin, message: l.message
    }),
    fromRow: (r) => ({
      id: r.id, ticketId: r.ticket_id, authorId: r.author_id, isAdmin: r.is_admin,
      message: r.message, createdAt: r.created_at, syncStatus: 'synced'
    })
  },
  saleCancellations: {
    toRow: (l) => ({
      id: l.id, business_id: l.businessId, branch_id: l.branchId, sale_id: l.saleId,
      requested_by: l.requestedBy, approved_by: l.approvedBy, reason: l.reason,
      status: l.status, requested_at: l.requestedAt, decided_at: l.decidedAt
    }),
    fromRow: (r) => ({
      id: r.id, businessId: r.business_id, branchId: r.branch_id, saleId: r.sale_id,
      requestedBy: r.requested_by, approvedBy: r.approved_by, reason: r.reason,
      status: r.status, requestedAt: r.requested_at, decidedAt: r.decided_at,
      syncStatus: 'synced'
    })
  },
  notices: {
    toRow: (l) => ({
      id: l.id, business_id: l.businessId, branch_id: l.branchId,
      target_role: l.targetRole, target_user_id: l.targetUserId, created_by: l.createdBy,
      title: l.title, body: l.body, category: l.category, pinned: l.pinned,
      published_at: l.publishedAt, scheduled_for: l.scheduledFor,
      expires_at: l.expiresAt, archived_at: l.archivedAt
    }),
    fromRow: (r) => ({
      id: r.id, businessId: r.business_id, branchId: r.branch_id,
      targetRole: r.target_role, targetUserId: r.target_user_id, createdBy: r.created_by,
      title: r.title, body: r.body, category: r.category, pinned: r.pinned,
      publishedAt: r.published_at, scheduledFor: r.scheduled_for,
      expiresAt: r.expires_at, archivedAt: r.archived_at,
      createdAt: r.created_at, updatedAt: r.updated_at, syncStatus: 'synced'
    })
  },
  noticeAcknowledgements: {
    toRow: (l) => ({
      id: l.id, notice_id: l.noticeId, user_id: l.userId, acknowledged_at: l.acknowledgedAt
    }),
    fromRow: (r) => ({
      id: r.id, noticeId: r.notice_id, userId: r.user_id, acknowledgedAt: r.acknowledged_at,
      syncStatus: 'synced'
    })
  }
};

const TABLE_NAME: Record<string, string> = {
  businesses: 'businesses', branches: 'branches', products: 'products',
  customers: 'customers', sales: 'sales', saleItems: 'sale_items',
  debts: 'debts', payments: 'payments', expenses: 'expenses', auditLog: 'audit_log',
  suppliers: 'suppliers', purchases: 'purchases', refunds: 'refunds',
  employeePayments: 'employee_payments', profiles: 'profiles',
  correctionRequests: 'correction_requests',
  quotations: 'quotations', quotationItems: 'quotation_items',
  invoices: 'invoices', invoiceItems: 'invoice_items', invoicePayments: 'invoice_payments',
  notifications: 'notifications', supportTickets: 'support_tickets',
  loyaltySettings: 'loyalty_settings', profilePermissions: 'profile_permissions',
  profileBranches: 'profile_branches',
  supportTicketReplies: 'support_ticket_replies', saleCancellations: 'sale_cancellations',
  notices: 'notices', noticeAcknowledgements: 'notice_acknowledgements',
  categories: 'categories', featureRequests: 'feature_requests', deviceSessions: 'device_sessions',
  inventoryMovements: 'inventory_movements'
};

// append-only tables have no updated_at column — filter by created_at instead
const TIMESTAMP_COLUMN: Record<string, string> = {
  businesses: 'updated_at', branches: 'updated_at', products: 'updated_at',
  customers: 'updated_at', sales: 'updated_at', debts: 'updated_at',
  saleItems: 'created_at', payments: 'created_at', expenses: 'created_at',
  auditLog: 'created_at', suppliers: 'updated_at', purchases: 'created_at',
  refunds: 'requested_at', employeePayments: 'created_at', profiles: 'updated_at',
  correctionRequests: 'requested_at',
  quotations: 'updated_at', invoices: 'updated_at',
  invoiceItems: 'created_at', quotationItems: 'created_at',
  invoicePayments: 'created_at', notifications: 'created_at', supportTickets: 'updated_at',
  loyaltySettings: 'updated_at', profilePermissions: 'updated_at',
  profileBranches: 'updated_at',
  supportTicketReplies: 'created_at', saleCancellations: 'requested_at',
  notices: 'updated_at', noticeAcknowledgements: 'acknowledged_at',
  deviceSessions: 'last_active_at', inventoryMovements: 'created_at'
};

export const MAX_ATTEMPTS = 6;
const BASE_BACKOFF_MS = 2000;
let syncing = false;

export interface SyncState {
  connection: 'online' | 'offline' | 'syncing';
  pendingCount: number;
  failedCount: number;
  lastSyncAt: string | null;
  lastError: string | null;
  /** The sign-in has expired: pushes would all be rejected, so we pause instead of burning retry attempts. */
  authRequired: boolean;
  setAuthRequired: (v: boolean) => void;
  setConnection: (c: SyncState['connection']) => void;
  setCounts: (pending: number, failed: number) => void;
  setLastSync: (t: string) => void;
  setLastError: (e: string | null) => void;
}

export const useSyncStore = create<SyncState>((set) => ({
  connection: navigator.onLine ? 'online' : 'offline',
  pendingCount: 0,
  failedCount: 0,
  lastSyncAt: null,
  lastError: null,
  authRequired: false,
  setAuthRequired: (v) => set({ authRequired: v }),
  setConnection: (c) => set({ connection: c }),
  setCounts: (pending, failed) => set({ pendingCount: pending, failedCount: failed }),
  setLastSync: (t) => set({ lastSyncAt: t }),
  setLastError: (e) => set({ lastError: e })
}));

export type SyncHealth = 'offline' | 'signin' | 'action' | 'syncing' | 'ok';
/** One headline state for every sync indicator, in the order the person needs to act on it. */
export function syncHealth(state: Pick<SyncState, 'connection' | 'authRequired' | 'failedCount'>): SyncHealth {
  if (state.connection === 'offline') return 'offline';
  if (state.authRequired) return 'signin';
  if (state.failedCount > 0) return 'action';
  if (state.connection === 'syncing') return 'syncing';
  return 'ok';
}

/** Plain-language "is sync healthy?" for every indicator. */
export function syncHealthReport(state: Pick<SyncState, 'connection' | 'authRequired' | 'failedCount' | 'pendingCount' | 'lastError'>): { healthy: boolean; title: string; detail: string } {
  const h = syncHealth(state);
  if (h === 'signin') return { healthy: false, title: 'Not healthy', detail: 'Your sign-in expired. Sign in again to sync.' };
  if (h === 'action') return { healthy: false, title: 'Not healthy', detail: `${state.failedCount} change${state.failedCount === 1 ? '' : 's'} could not be sent${state.lastError ? `: ${state.lastError}` : '. Open Sync Center to retry.'}` };
  if (h === 'offline') return { healthy: false, title: 'Offline', detail: 'No connection. Everything is saved on this device and will sync automatically.' };
  if (state.lastError) return { healthy: false, title: 'Not healthy', detail: state.lastError };
  return { healthy: true, title: 'Healthy', detail: state.pendingCount > 0 ? `${state.pendingCount} change${state.pendingCount === 1 ? '' : 's'} sending…` : 'Everything is synced.' };
}

function isAuthError(e: unknown): boolean {
  const err = e as { status?: number; code?: string; message?: string } | null;
  if (!err) return false;
  if (err.status === 401 || err.code === 'PGRST301' || err.code === 'PGRST303') return true;
  return /jwt|not authenticated|invalid token|token.*expired|refresh token/i.test(err.message ?? '');
}

export function initSync() {
  // A fresh sign-in (or a refreshed token) clears the "sign in to sync" state and retries at once.
  supabase?.auth.onAuthStateChange((event) => {
    if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
      useSyncStore.getState().setAuthRequired(false);
      void runSync();
    }
  });
  window.addEventListener('online', () => {
    useSyncStore.getState().setConnection('online');
    runSync();
  });
  window.addEventListener('offline', () => useSyncStore.getState().setConnection('offline'));
  refreshCounts();
  if (navigator.onLine) runSync();
  window.setInterval(() => { if (navigator.onLine) runSync(); }, 30000);
  // Automatic sync, beyond the 30s timer: shortly after any local change (a sale, an edit), and
  // whenever the app comes back to the foreground.
  let debounce: number | undefined;
  window.addEventListener('shopos:queued', () => {
    window.clearTimeout(debounce);
    debounce = window.setTimeout(() => { if (navigator.onLine) void runSync(); }, 1500);
  });
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && navigator.onLine) void runSync(); });
}

async function refreshCounts() {
  const items = await db.syncQueue.toArray();
  const failed = items.filter((i) => i.attempts >= MAX_ATTEMPTS).length;
  useSyncStore.getState().setCounts(items.length - failed, failed);
}

/** "Sync now": try EVERYTHING again, including items that used up their automatic retries. */
export async function syncNow() {
  for (const q of await db.syncQueue.toArray()) {
    if (q.attempts >= MAX_ATTEMPTS) await db.syncQueue.update(q.id, { attempts: 0, lastError: undefined });
  }
  await runSync();
  await syncPayments();
}

export async function runSync() {
  if (syncing || !navigator.onLine) return;
  if (!backendConfigured()) { await refreshCounts(); return; }
  // No valid session: every push would be rejected and burn its retry attempts. Pause and say so.
  const { data: sess } = await supabase!.auth.getSession();
  if (!sess.session) {
    useSyncStore.getState().setAuthRequired(true);
    useSyncStore.getState().setLastError('Your sign-in has expired. Sign in again to sync. Nothing has been lost; changes are saved on this device.');
    await refreshCounts();
    return;
  }
  syncing = true;
  useSyncStore.getState().setConnection('syncing');
  useSyncStore.getState().setLastError(null);
  try {
    await pushQueue();
    await syncPayments();
    const serverNow = await pullChanges();
    useSyncStore.getState().setAuthRequired(false);
    useSyncStore.getState().setLastSync(serverNow ?? new Date().toISOString());
  } catch (e) {
    useSyncStore.getState().setLastError(e instanceof Error ? e.message : 'Sync failed');
  } finally {
    syncing = false;
    useSyncStore.getState().setConnection(navigator.onLine ? 'online' : 'offline');
    await refreshCounts();
  }
}

/** One-time and ongoing self-repair for data written by the old buggy code:
 *  - sale lines that were saved locally but never queued (they were queued under the SALE's id);
 *  - retry counters exhausted by errors that are now fixed (audit log / feature requests / sale lines). */
async function repairQueue() {
  const queued = new Set((await db.syncQueue.where('entity').equals('saleItems').toArray()).map((q) => q.entityId));
  const orphans = await db.saleItems.filter((i) => i.syncStatus !== 'synced' && !queued.has(i.id)).toArray();
  for (const it of orphans) {
    const parent = await db.sales.get(it.saleId);
    if (parent && !(await isMyBusiness(parent.businessId))) continue; // not this account's data: leave it alone
    await enqueueSync('saleItems', it.id, 'create');
  }

  const FLAG = 'shopos.syncRepair.v2';
  try {
    if (!localStorage.getItem(FLAG)) {
      for (const q of await db.syncQueue.toArray()) {
        if (['saleItems', 'auditLog', 'featureRequests'].includes(q.entity) && q.attempts > 0) {
          await db.syncQueue.update(q.id, { attempts: 0, lastError: undefined });
        }
      }
      localStorage.setItem(FLAG, '1');
    }
  } catch { /* storage unavailable: harmless, repair simply runs again next time */ }
}

async function pushQueue() {
  await repairQueue();
  // Oldest first, but a parent (sale) always goes before its children (lines, payments, debts).
  const items = (await db.syncQueue.toArray()).sort((a, b) =>
    a.createdAt.localeCompare(b.createdAt) || Number(CHILD_ENTITIES.has(a.entity)) - Number(CHILD_ENTITIES.has(b.entity)));
  for (const item of items) {
    if (item.attempts >= MAX_ATTEMPTS) continue;
    try {
      await pushOne(item);
      await db.syncQueue.delete(item.id);
      await markSynced(item.entity, item.entityId);
    } catch (e) {
      if (e instanceof DeferredError) {
        // Not a failure: just not its turn yet. Keep it queued without using up an attempt.
        await db.syncQueue.update(item.id, { lastError: e.message });
        continue;
      }
      if (isAuthError(e)) {
        useSyncStore.getState().setAuthRequired(true);
        useSyncStore.getState().setLastError('Your sign-in has expired. Sign in again to sync. Nothing has been lost; changes are saved on this device.');
        await db.syncQueue.update(item.id, { lastError: 'Waiting for sign-in' });
        return; // stop this pass; the queue is untouched and retries after sign-in
      }
      // Permanent failures: the business this row belongs to no longer exists, or belongs to a
      // different account. Retrying can never work, so remove it instead of showing "failed" forever.
      if (isBusinessGone(e)) { await quarantine(item, 'Its business no longer exists'); continue; }
      if (isRlsError(e) && item.attempts >= 1) {
        const tbl = (db as any)[item.entity];
        const row = tbl?.get ? await tbl.get(item.entityId) : null;
        const parent = row?.saleId ? await db.sales.get(row.saleId) : null;
        if (!(await isMyBusiness(row?.businessId ?? parent?.businessId))) { await quarantine(item, 'It belongs to a different business or account'); continue; }
      }
      const attempts = item.attempts + 1;
      await db.syncQueue.update(item.id, {
        attempts,
        lastError: describeSyncError(e)
      });
      if (attempts < MAX_ATTEMPTS) {
        const delay = BASE_BACKOFF_MS * 2 ** attempts;
        setTimeout(() => { if (navigator.onLine) runSync(); }, delay);
      } else {
        await markFailed(item.entity, item.entityId);
      }
    }
  }
}

// Most tables use `id` as their Postgres primary key; a few (business-scoped
// singletons like loyalty_settings) use a different column. Kept explicit
// here rather than assumed, since a wrong onConflict target fails silently
// in a way that's easy to miss until someone edits settings twice.
const CONFLICT_COLUMN: Record<string, string> = {
  loyaltySettings: 'business_id'
};

// Postgrest/Supabase errors are plain objects ({message, details, hint,
// code}), not Error instances — `String(plainObject)` yields the useless
// "[object Object]" that was showing up in Sync Center for every failed
// item, hiding the actual reason. This pulls a real message out of
// whatever shape the thrown value has.
function describeSyncError(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (e && typeof e === 'object' && 'message' in e && typeof (e as any).message === 'string') {
    return (e as any).message;
  }
  try { return JSON.stringify(e); } catch { return String(e); }
}

class DeferredError extends Error {}

/** Server said the row's business does not exist (deleted) — e.g. "Business is not active (status: <NULL>)". */
function isBusinessGone(e: unknown): boolean {
  const m = (e as { message?: string } | null)?.message ?? '';
  return /not active \(status: <NULL>\)/i.test(m) || /violates foreign key constraint.*business/i.test(m);
}

async function isMyBusiness(businessId: string | undefined | null): Promise<boolean> {
  if (!businessId) return true;
  const { useAuth } = await import('./auth');           // lazy: auth.ts imports this module
  const list = useAuth.getState().memberships;
  return list.length === 0 || list.some((m) => m.businessId === businessId);
}

/** Removes a queue item that can NEVER succeed, plus the local leftovers, and remembers why so the
 * Sync Center can say so instead of failing forever. */
async function quarantine(item: SyncQueueItem, reason: string) {
  const table = (db as any)[item.entity];
  const local = table?.get ? await table.get(item.entityId) : null;
  if (item.entity === 'saleItems' && local?.saleId) {
    const siblings = await db.saleItems.where('saleId').equals(local.saleId).toArray();
    for (const sib of siblings) { await db.syncQueue.filter((q) => q.entityId === sib.id).delete(); await db.saleItems.delete(sib.id); }
    await db.syncQueue.filter((q) => q.entityId === local.saleId).delete();
    await db.sales.delete(local.saleId);
  } else if (local) {
    await table.delete(item.entityId);
  }
  await db.syncQueue.delete(item.id);
  try {
    const key = 'shopos.sync.quarantined';
    const list = JSON.parse(localStorage.getItem(key) ?? '[]') as { at: string; entity: string; reason: string }[];
    list.unshift({ at: new Date().toISOString(), entity: item.entity, reason });
    localStorage.setItem(key, JSON.stringify(list.slice(0, 20)));
  } catch { /* storage unavailable */ }
}

export function quarantinedItems(): { at: string; entity: string; reason: string }[] {
  try { return JSON.parse(localStorage.getItem('shopos.sync.quarantined') ?? '[]'); } catch { return []; }
}

async function pushOne(item: SyncQueueItem) {
  if (!supabase) throw new Error('No backend configured');
  const table = TABLE_NAME[item.entity];
  const mapper = mappers[item.entity];
  if (!table || !mapper) throw new Error(`No sync mapping registered for "${item.entity}"`);
  const remote = supabase.from(table);
  const conflictColumn = CONFLICT_COLUMN[item.entity] ?? 'id';

  if (item.op === 'delete') {
    const { error } = await remote.delete().eq(conflictColumn, item.entityId);
    if (error) throw error;
    return;
  }

  const local = await (db as any)[item.entity].get(item.entityId);
  if (!local) return; // record was deleted locally before it ever synced

  // A sale line whose sale no longer exists anywhere can never be uploaded: drop it rather than
  // retrying forever with "row-level security" errors.
  if (item.entity === 'saleItems') {
    const parent = await db.sales.get(local.saleId);
    if (!parent) {
      const { data: remoteParent } = await supabase.from('sales').select('id').eq('id', local.saleId).maybeSingle();
      if (!remoteParent) { await db.saleItems.delete(local.id); return; }
    } else if (parent.syncStatus !== 'synced') {
      throw new DeferredError('Waiting for its sale to sync first');
    }
  }

  // A sale created while offline gets a provisional PENDING-xxxx receipt
  // number (see nextReceiptNumber in sales.ts) because the atomic,
  // collision-free number can only be issued by the server. Now that we're
  // online and about to push it for real, swap in the real number first.
  if (item.entity === 'sales' && local.receiptNumber?.startsWith('PENDING-')) {
    const { data: realNumber, error: numError } = await supabase
      .rpc('next_document_number', { p_business_id: local.businessId, p_doc_type: 'receipt' });
    if (!numError && realNumber) {
      local.receiptNumber = realNumber;
      await db.sales.update(local.id, { receiptNumber: realNumber });
    }
  }
  if (item.entity === 'quotations' && local.quotationNumber?.startsWith('PENDING-')) {
    const { data: realNumber, error: numError } = await supabase
      .rpc('next_document_number', { p_business_id: local.businessId, p_doc_type: 'quotation' });
    if (!numError && realNumber) {
      local.quotationNumber = realNumber;
      await db.quotations.update(local.id, { quotationNumber: realNumber });
    }
  }
  if (item.entity === 'invoices' && local.invoiceNumber?.startsWith('PENDING-')) {
    const { data: realNumber, error: numError } = await supabase
      .rpc('next_document_number', { p_business_id: local.businessId, p_doc_type: 'invoice' });
    if (!numError && realNumber) {
      local.invoiceNumber = realNumber;
      await db.invoices.update(local.id, { invoiceNumber: realNumber });
    }
  }

  const row = mapper.toRow(local);

  // Profiles are created by the server (activation / invites), never by the client, and there is no
  // INSERT policy for them. An upsert is an INSERT first, so it was rejected with "row-level security"
  // even for a plain update of your own profile. Update-only is the correct verb.
  if (item.entity === 'profiles') {
    const { error } = await remote.update(row).eq('id', local.id);
    if (error) throw error;
    return;
  }

  // Append-only tables: the client may INSERT but never UPDATE (audit_log has no UPDATE grant;
  // feature_requests has no client UPDATE policy). A plain upsert turns a harmless re-send of a row
  // that already exists into "permission denied" / "row-level security" forever, so use
  // ON CONFLICT DO NOTHING for them.
  const { error } = INSERT_ONLY.has(item.entity)
    ? await remote.upsert(row, { onConflict: conflictColumn, ignoreDuplicates: true })
    : await remote.upsert(row, { onConflict: conflictColumn });
  if (error) {
    // A sale line is only allowed if its sale is visible to you on the server. A "row-level security"
    // rejection here almost always means the parent sale never arrived: send it first, then retry once.
    if (item.entity === 'saleItems' && isRlsError(error)) {
      const parentLocal = await db.sales.get(local.saleId);
      const { data: remoteParent } = await supabase.from('sales').select('id').eq('id', local.saleId).maybeSingle();
      if (!remoteParent) {
        if (!parentLocal) { await db.saleItems.delete(local.id); return; } // its sale is gone everywhere: nothing to upload
        const up = await supabase.from('sales').upsert(mappers.sales.toRow(parentLocal), { onConflict: 'id' });
        if (up.error) throw up.error; // (a "business is gone" error is handled by the caller's quarantine)
        await db.sales.update(parentLocal.id, { syncStatus: 'synced' });
        const retry = await remote.upsert(row, { onConflict: conflictColumn });
        if (retry.error) throw retry.error;
        return;
      }
      throw new Error('This sale line belongs to a sale you do not have access to (another branch or business).');
    }
    throw error;
  }
}

function isRlsError(e: unknown): boolean {
  const err = e as { code?: string; message?: string } | null;
  return !!err && (err.code === '42501' || /row-level security/i.test(err.message ?? ''));
}

const INSERT_ONLY = new Set(['auditLog', 'featureRequests']);

/** Parents must reach the server before their children (RLS on child rows checks the parent). */
const CHILD_ENTITIES = new Set(['saleItems', 'quotationItems', 'invoiceItems', 'payments', 'debts']);

async function markSynced(entity: string, id: string) {
  const table = (db as any)[entity];
  if (table?.get && (await table.get(id))) await table.update(id, { syncStatus: 'synced' });
}
async function markFailed(entity: string, id: string) {
  const table = (db as any)[entity];
  if (table?.get && (await table.get(id))) await table.update(id, { syncStatus: 'failed' });
}

const SYNCED_ENTITIES = Object.keys(mappers);

// Dexie primary key field per entity, for local .get() lookups during pull.
// Everything defaults to 'id'; only business-scoped singletons differ.
const LOCAL_PK: Record<string, string> = {
  loyaltySettings: 'businessId'
};

async function pullChanges(): Promise<string | null> {
  if (!supabase) return null;
  const lastSync = useSyncStore.getState().lastSyncAt ?? '1970-01-01T00:00:00.000Z';

  // Captured from Postgres's own clock, BEFORE any of the per-table pull
  // queries below run — see schema_part17.sql. This becomes the next
  // watermark, so it doesn't matter how long the round-trip below takes or
  // whether this device's own clock is wrong: nothing written at or before
  // this exact server instant can be missed next time.
  const { data: serverNow, error: clockError } = await supabase.rpc('current_db_time');
  if (clockError || !serverNow) return null; // fall back to client clock in runSync

  for (const entity of SYNCED_ENTITIES) {
    const table = TABLE_NAME[entity];
    const mapper = mappers[entity];
    const tsColumn = TIMESTAMP_COLUMN[entity] ?? 'updated_at';
    const pk = LOCAL_PK[entity] ?? 'id';
    const { data, error } = await supabase.from(table).select('*').gt(tsColumn, lastSync);
    if (error) throw error;
    if (!data || data.length === 0) continue;
    const localTable = (db as any)[entity];
    await db.transaction('rw', localTable, async () => {
      for (const row of data) {
        const incoming = mapper.fromRow(row);
        const existing = await localTable.get(incoming[pk]);
        if (!existing) {
          await localTable.put(incoming);
          continue;
        }
        // pending/syncing local edits with a newer version win; otherwise
        // the newer updatedAt (or higher version) from either side wins.
        if ((existing.syncStatus === 'pending' || existing.syncStatus === 'syncing')
            && (existing.version ?? 0) >= (incoming.version ?? 0)) {
          continue;
        }
        await localTable.put({ ...existing, ...incoming });
      }
    });
  }
  return serverNow as string;
}

export async function retryFailed() {
  const failed = await db.syncQueue.where('attempts').aboveOrEqual(MAX_ATTEMPTS).toArray();
  for (const item of failed) await db.syncQueue.update(item.id, { attempts: 0, lastError: undefined });
  await runSync();
}

/** Retry a single failed queue item (clears its attempt count so backoff starts fresh). */
export async function retryItem(id: string) {
  await db.syncQueue.update(id, { attempts: 0, lastError: undefined });
  await runSync();
}
