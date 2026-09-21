/** One-call PDF downloads for the screens. The PDF code is loaded only when a button is pressed,
 * so it adds nothing to the initial bundle. */
import type { Business, Branch, Customer, Debt, Invoice, InvoiceItem, Quotation, QuotationItem, Sale, SaleItem } from './types';
import { buildReceiptLines } from './receiptFormat';

async function libs() {
  const [docs, pdf] = await Promise.all([import('./documents'), import('./pdf')]);
  return { ...docs, ...pdf };
}
const biz = (b: Business) => ({ name: b.name, address: b.address, phone: b.phone, email: b.email, taxPin: b.taxPin });

export async function downloadReceiptPdf(args: { business: Business; branch?: Branch | null; sale: Sale; items: SaleItem[]; customer?: Customer | null; servedBy?: string | null; mpesaRef?: string | null; qrContent?: string | null }) {
  const L = await libs();
  const lines = buildReceiptLines({ business: args.business, branch: args.branch, sale: args.sale, items: args.items, customer: args.customer, servedBy: args.servedBy, mpesaRef: args.mpesaRef });
  const doc = L.buildReceiptPdf(lines, args.qrContent ?? `${args.business.name} | Receipt ${args.sale.receiptNumber}`);
  await L.savePdf(doc, L.pdfFilename('Receipt', args.sale.receiptNumber));
}

export async function downloadInvoicePdf(args: { business: Business; invoice: Invoice; items: InvoiceItem[]; payments: { createdAt: string; method: string; amount: number }[]; customerName?: string | null; currency: string }) {
  const L = await libs(); const { invoice: v } = args;
  const doc = L.buildBusinessDocPdf({
    title: 'INVOICE', number: v.invoiceNumber, business: biz(args.business), customer: args.customerName ? { name: args.customerName } : null,
    date: v.createdAt, status: v.status, extraMeta: v.dueDate ? [['Due date', new Date(`${v.dueDate}T00:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })]] : [],
    items: args.items.map((i) => ({ description: i.description, quantity: i.quantity, unitPrice: i.unitPrice, discount: i.discount, lineTotal: i.lineTotal })),
    subtotal: v.subtotal, discount: v.discount, tax: v.tax, total: v.total, paid: v.amountPaid, balance: v.balance,
    payments: args.payments.map((p) => ({ date: p.createdAt, method: p.method, amount: p.amount })), notes: v.notes, terms: v.terms, currency: args.currency
  });
  await L.savePdf(doc, L.pdfFilename('Invoice', v.invoiceNumber));
}

export async function downloadQuotationPdf(args: { business: Business; quotation: Quotation; items: QuotationItem[]; customerName?: string | null; currency: string }) {
  const L = await libs(); const { quotation: q } = args;
  const doc = L.buildBusinessDocPdf({
    title: 'QUOTATION', number: q.quotationNumber, business: biz(args.business), customer: args.customerName ? { name: args.customerName } : null,
    date: q.createdAt, status: q.status, extraMeta: q.validUntil ? [['Valid until', new Date(`${q.validUntil}T00:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })]] : [],
    items: args.items.map((i) => ({ description: i.description, quantity: i.quantity, unitPrice: i.unitPrice, discount: i.discount, lineTotal: i.lineTotal })),
    subtotal: q.subtotal, discount: q.discount, tax: q.tax, total: q.total, notes: q.notes, terms: q.terms, currency: args.currency
  });
  await L.savePdf(doc, L.pdfFilename('Quotation', q.quotationNumber));
}

export async function downloadDebtStatementPdf(args: { business: Business; debt: Debt; debtor: string; status: string; payments: { createdAt: string; method: string; amount: number }[]; currency: string }) {
  const L = await libs(); const { debt: d } = args;
  const doc = L.buildDebtStatementPdf({
    business: biz(args.business), currency: args.currency, debtor: args.debtor, phone: d.debtorPhone, reason: d.reason,
    debtDate: d.debtDate ?? d.createdAt, dueDate: d.dueDate, amount: d.originalAmount, paid: d.paidAmount, balance: d.remainingAmount,
    status: args.status, payments: args.payments.map((p) => ({ date: p.createdAt, method: p.method, amount: p.amount })), notes: d.notes
  });
  await L.savePdf(doc, L.pdfFilename('Debt-Statement', args.debtor));
}
