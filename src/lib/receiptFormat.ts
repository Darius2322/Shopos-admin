/**
 * ONE receipt layout used by both the on-screen preview and the thermal printer, so what
 * the cashier sees is exactly what prints. Everything is laid out in fixed-width columns
 * (32 characters = 58mm paper at the default font) and padded here, so alignment never
 * depends on CSS or on the printer's own centring.
 */
import type { Business, Branch, Sale, SaleItem, Customer } from './types';

export const RECEIPT_COLS = 32;
export interface ReceiptLine { text: string; bold?: boolean }

/** Locale-independent money: 1,234.50 — the same on every device and on paper. */
export function fmtMoney(n: number): string {
  const v = Math.round((Number(n) + Number.EPSILON) * 100) / 100;
  const [i, d] = Math.abs(v).toFixed(2).split('.');
  return `${v < 0 ? '-' : ''}${i.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}.${d}`;
}

const cut = (s: string, w: number) => (s.length > w ? s.slice(0, w) : s);
const center = (s: string, w = RECEIPT_COLS) => {
  const t = cut(s, w);
  const left = Math.floor((w - t.length) / 2);
  return ' '.repeat(left) + t;
};
const twoCol = (l: string, r: string, w = RECEIPT_COLS) => {
  const room = w - r.length - 1;
  const left = cut(l, Math.max(0, room));
  return left + ' '.repeat(Math.max(1, w - left.length - r.length)) + r;
};
const rule = (ch = '-') => ch.repeat(RECEIPT_COLS);

/** Word-wraps to width, hard-breaking words longer than the width. */
export function wrap(text: string, width: number): string[] {
  const out: string[] = [];
  let cur = '';
  for (const raw of text.trim().split(/\s+/)) {
    let word = raw;
    while (word.length > width) {
      if (cur) { out.push(cur); cur = ''; }
      out.push(word.slice(0, width));
      word = word.slice(width);
    }
    if (!cur) cur = word;
    else if (cur.length + 1 + word.length <= width) cur += ' ' + word;
    else { out.push(cur); cur = word; }
  }
  if (cur) out.push(cur);
  return out.length ? out : [''];
}

export function mpesaRefFrom(sale: Pick<Sale, 'note'>, linked?: { transactionCode: string } | null): string | null {
  if (linked?.transactionCode) return linked.transactionCode;
  const m = sale.note?.match(/M-Pesa\s+([A-Z0-9]{8,12})/i);
  return m ? m[1].toUpperCase() : null;
}

export interface ReceiptInput {
  business: Pick<Business, 'name' | 'address' | 'phone' | 'email' | 'taxPin' | 'receiptFooter' | 'tillNumber' | 'paybillNumber' | 'paybillAccount' | 'sendTillNumber' | 'mpesaConfirmationName'>;
  branch?: Pick<Branch, 'name' | 'location'> | null;
  sale: Pick<Sale, 'receiptNumber' | 'createdAt' | 'subtotal' | 'discount' | 'tax' | 'total' | 'amountPaid' | 'balanceDue' | 'paymentMethod' | 'note'>;
  items: Pick<SaleItem, 'productName' | 'quantity' | 'unitPrice' | 'lineTotal' | 'discount'>[];
  customer?: Pick<Customer, 'name' | 'phone'> | null;
  servedBy?: string | null;
  mpesaRef?: string | null;
}

const NAME_W = 16, QTY_W = 5, AMT_W = RECEIPT_COLS - NAME_W - QTY_W; // 16 + 5 + 11 = 32
const PAYMENT_LABEL: Record<string, string> = { cash: 'Cash', mpesa: 'M-Pesa', card: 'Card', bank: 'Bank', credit: 'Credit', other: 'Other' };

export function buildReceiptLines(r: ReceiptInput): ReceiptLine[] {
  const { business: b, branch, sale, items, customer } = r;
  const L: ReceiptLine[] = [];
  const add = (text = '', bold = false) => L.push({ text: cut(text, RECEIPT_COLS), bold });

  for (const l of wrap(b.name.toUpperCase(), RECEIPT_COLS)) add(center(l), true);
  if (branch?.name) for (const l of wrap(branch.name, RECEIPT_COLS)) add(center(l));
  if (branch?.location) for (const l of wrap(branch.location, RECEIPT_COLS)) add(center(l));
  if (b.address) for (const l of wrap(b.address, RECEIPT_COLS)) add(center(l));
  if (b.phone) add(center(`Tel: ${b.phone}`));
  if (b.email) add(center(b.email));
  if (b.taxPin) add(center(`PIN: ${b.taxPin}`));
  add(rule());
  add(center('SALES RECEIPT'), true);
  add(rule());

  const when = new Date(sale.createdAt);
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const date = `${when.getDate()} ${MONTHS[when.getMonth()]} ${when.getFullYear()}`;  // same on every device
  const time = when.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  add(`No: ${sale.receiptNumber}`);
  add(`${date}  ${time}`);
  if (customer?.name) add(cut(`Customer: ${customer.name}`, RECEIPT_COLS));
  if (customer?.phone) add(cut(`Phone: ${customer.phone}`, RECEIPT_COLS));
  add(rule());

  add('Item'.padEnd(NAME_W) + 'Qty'.padStart(QTY_W) + 'Amount'.padStart(AMT_W), true);
  add(rule());
  for (const it of items) {
    const nameLines = wrap(it.productName, NAME_W);
    const qty = `x${Number.isInteger(it.quantity) ? it.quantity : Number(it.quantity.toFixed(3))}`;
    add(nameLines[0].padEnd(NAME_W) + qty.padStart(QTY_W) + fmtMoney(it.lineTotal).padStart(AMT_W));
    for (const extra of nameLines.slice(1)) add(extra);
    if (it.quantity !== 1) add(`  @ ${fmtMoney(it.unitPrice)} each`);
    if (it.discount > 0) add(`  Discount -${fmtMoney(it.discount)}`);
  }
  add(rule());

  add(twoCol('Subtotal', fmtMoney(sale.subtotal)));
  add(twoCol('Discount', fmtMoney(sale.discount)));
  if (sale.tax > 0) add(twoCol('Tax', fmtMoney(sale.tax)));
  add(rule());
  add(twoCol('TOTAL', fmtMoney(sale.total)), true);
  add(rule());

  const method = PAYMENT_LABEL[sale.paymentMethod] ?? sale.paymentMethod;
  add(`Payment: ${method}`);
  if (r.mpesaRef) add(`Ref: ${r.mpesaRef}`);
  add(twoCol(sale.paymentMethod === 'cash' ? 'Cash' : 'Paid', fmtMoney(sale.amountPaid)));
  if (sale.paymentMethod === 'cash' && sale.amountPaid > sale.total) add(twoCol('Change', fmtMoney(sale.amountPaid - sale.total)));
  if (sale.balanceDue > 0) add(twoCol('BALANCE DUE', fmtMoney(sale.balanceDue)), true);
  add(rule());

  add(center('Thank you'));
  if (b.receiptFooter) for (const l of wrap(b.receiptFooter, RECEIPT_COLS)) add(center(l));
  if (b.tillNumber) add(center(`M-Pesa Till: ${b.tillNumber}`));
  if (b.paybillNumber) add(center(`Paybill: ${b.paybillNumber}${b.paybillAccount ? ` Acc: ${b.paybillAccount}` : ''}`));
  if (b.sendTillNumber) add(center(`Pochi/Send: ${b.sendTillNumber}`));
  if (b.mpesaConfirmationName) add(center(`Name: ${b.mpesaConfirmationName}`));
  if (r.servedBy && r.servedBy !== '—') add(center(`Served by ${r.servedBy}`));
  return L;
}
