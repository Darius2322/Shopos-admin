/**
 * Builders for the downloadable PDFs: receipt, invoice, quotation, debt statement.
 * All layout is computed here from the same data the screens use; nothing is sent anywhere.
 */
import QRCode from 'qrcode';
import { PdfDoc, wrapToWidth, textWidth } from './pdf';
import { fmtMoney, type ReceiptLine } from './receiptFormat';

type RGB = [number, number, number];
const NAVY: RGB = [0.027, 0.094, 0.271];
const GREY: RGB = [0.45, 0.47, 0.52];
const LIGHT: RGB = [0.94, 0.95, 0.97];
const RULE: RGB = [0.82, 0.84, 0.88];

function safeName(s: string) { return s.replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'document'; }
export const pdfFilename = (prefix: string, number: string) => `${safeName(prefix)}-${safeName(number)}.pdf`;

/** Vector QR (crisp at any size, no image embedding). */
function drawQr(doc: PdfDoc, content: string, x: number, y: number, size: number) {
  const qr = QRCode.create(content, { errorCorrectionLevel: 'M' });
  const n = qr.modules.size; const cell = size / n;
  doc.rect(x - 2, y - 2, size + 4, size + 4, { fill: [1, 1, 1] });
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) {
    if (qr.modules.get(r, c)) doc.rect(x + c * cell, y + r * cell, cell + 0.15, cell + 0.15, { fill: [0, 0, 0] });
  }
}

/** The receipt exactly as previewed/printed (same lines), on an 80 mm page. */
export function buildReceiptPdf(lines: ReceiptLine[], qrContent?: string | null): PdfDoc {
  const W = 226.8, M = 10, size = 10.4, lh = 13;
  const qrSize = qrContent ? 84 : 0;
  const H = M * 2 + lines.length * lh + (qrContent ? qrSize + 22 : 6);
  const doc = new PdfDoc(W, H);
  const left = (W - 32 * 0.6 * size) / 2;             // 32 columns, centred on the page
  lines.forEach((l, i) => doc.text(l.text, left, M + (i + 1) * lh - 3, { size, font: l.bold ? 'courb' : 'cour' }));
  if (qrContent) drawQr(doc, qrContent, (W - qrSize) / 2, M + lines.length * lh + 8, qrSize);
  return doc;
}

export interface BizInfo { name: string; address?: string | null; phone?: string | null; email?: string | null; taxPin?: string | null }
export interface DocLine { description: string; quantity: number; unitPrice: number; discount: number; lineTotal: number }
export interface BusinessDocInput {
  title: 'INVOICE' | 'QUOTATION' | 'STATEMENT';
  number: string;
  business: BizInfo;
  customer?: { name: string; phone?: string | null } | null;
  date: string;                    // ISO
  status: string;
  extraMeta?: [string, string][];  // e.g. Due date / Valid until
  items: DocLine[];
  subtotal: number; discount: number; tax: number; total: number;
  paid?: number; balance?: number;
  payments?: { date: string; method: string; amount: number }[];
  notes?: string | null; terms?: string | null;
  currency: string;
}

const dateStr = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

export function buildBusinessDocPdf(d: BusinessDocInput): PdfDoc {
  const W = 595, H = 842, M = 42, R = W - M;
  const doc = new PdfDoc(W, H);
  const money = (n: number) => fmtMoney(n);
  const colQty = R - 200, colPrice = R - 100, colAmt = R;        // right edges
  const descX = M + 22, descW = colQty - 58 - descX;

  // ── header band ──
  doc.rect(0, 0, W, 78, { fill: NAVY });
  doc.text(d.business.name, M, 40, { size: 17, font: 'helvb', color: [1, 1, 1] });
  doc.text(d.title, R, 38, { size: 18, font: 'helvb', align: 'right', color: [1, 1, 1] });
  doc.text(d.number, R, 56, { size: 10.5, align: 'right', color: [0.8, 0.86, 1] });

  // ── from / meta / bill-to ──
  let y = 104;
  const from = [d.business.address, d.business.phone && `Tel: ${d.business.phone}`, d.business.email, d.business.taxPin && `PIN: ${d.business.taxPin}`].filter(Boolean) as string[];
  from.forEach((l, i) => doc.text(l, M, y + i * 12.5, { size: 9.5, color: GREY }));
  const meta: [string, string][] = [['Date', dateStr(d.date)], ['Status', d.status.replace(/_/g, ' ')], ...(d.extraMeta ?? [])];
  meta.forEach(([k, v], i) => { doc.text(k, R - 120, y + i * 13, { size: 9.5, color: GREY }); doc.text(v, R, y + i * 13, { size: 9.5, font: 'helvb', align: 'right' }); });
  y += Math.max(from.length * 12.5, meta.length * 13) + 16;

  if (d.customer?.name) {
    doc.text('BILL TO', M, y, { size: 8, font: 'helvb', color: GREY });
    doc.text(d.customer.name, M, y + 14, { size: 11, font: 'helvb' });
    if (d.customer.phone) doc.text(d.customer.phone, M, y + 27, { size: 9.5, color: GREY });
    y += d.customer.phone ? 46 : 34;
  }

  // ── table ──
  const header = () => {
    doc.rect(M, y, R - M, 22, { fill: LIGHT });
    doc.text('#', M + 6, y + 15, { size: 9, font: 'helvb', color: GREY });
    doc.text('DESCRIPTION', descX, y + 15, { size: 8.5, font: 'helvb', color: GREY });
    doc.text('QTY', colQty, y + 15, { size: 8.5, font: 'helvb', align: 'right', color: GREY });
    doc.text('UNIT PRICE', colPrice, y + 15, { size: 8.5, font: 'helvb', align: 'right', color: GREY });
    doc.text('AMOUNT', colAmt - 6, y + 15, { size: 8.5, font: 'helvb', align: 'right', color: GREY });
    y += 26;
  };
  header();
  d.items.forEach((it, idx) => {
    const lines = wrapToWidth(it.description, descW, 10);
    const extra = it.discount > 0 ? 1 : 0;
    const rowH = (lines.length + extra) * 12.5 + 8;
    if (y + rowH > H - 90) { doc.addPage(); y = 50; header(); }
    doc.text(String(idx + 1), M + 6, y + 10, { size: 9, color: GREY });
    lines.forEach((l, i) => doc.text(l, descX, y + 10 + i * 12.5, { size: 10 }));
    if (it.discount > 0) doc.text(`Discount −${money(it.discount)}`.replace('−', '-'), descX, y + 10 + lines.length * 12.5, { size: 8.5, color: GREY });
    const q = Number.isInteger(it.quantity) ? String(it.quantity) : String(Number(it.quantity.toFixed(3)));
    doc.text(q, colQty, y + 10, { size: 10, align: 'right' });
    doc.text(money(it.unitPrice), colPrice, y + 10, { size: 10, align: 'right' });
    doc.text(money(it.lineTotal), colAmt - 6, y + 10, { size: 10, align: 'right', font: 'helvb' });
    y += rowH;
    doc.line(M, y - 3, R, y - 3, { color: RULE, width: 0.5 });
  });

  // ── totals ──
  const totals: [string, string, boolean?][] = [
    ['Subtotal', money(d.subtotal)], ['Discount', money(d.discount)],
    ...(d.tax > 0 ? [['Tax', money(d.tax)] as [string, string]] : []),
    ['TOTAL', `${d.currency} ${money(d.total)}`, true],
    ...(d.paid !== undefined ? [['Paid', money(d.paid)] as [string, string]] : []),
    ...(d.balance !== undefined ? [['BALANCE DUE', `${d.currency} ${money(d.balance)}`, true] as [string, string, boolean]] : []),
  ];
  if (y + totals.length * 20 + 30 > H - 60) { doc.addPage(); y = 50; }
  y += 8;
  for (const [k, v, strong] of totals) {
    if (strong) doc.rect(R - 230, y - 4, 230, 22, { fill: LIGHT });
    doc.text(k, R - 222, y + 11, { size: strong ? 11 : 10, font: strong ? 'helvb' : 'helv', color: strong ? [0, 0, 0] : GREY });
    doc.text(v, R - 8, y + 11, { size: strong ? 11.5 : 10, font: strong ? 'helvb' : 'helv', align: 'right' });
    y += strong ? 26 : 19;
  }

  // ── payments, notes, terms ──
  const block = (title: string, body: string[]) => {
    const h = 16 + body.length * 12.5 + 10;
    if (y + h > H - 50) { doc.addPage(); y = 50; }
    y += 10;
    doc.text(title, M, y + 8, { size: 8.5, font: 'helvb', color: GREY });
    body.forEach((l, i) => doc.text(l, M, y + 22 + i * 12.5, { size: 9.5 }));
    y += h - 10;
  };
  if (d.payments?.length) block('PAYMENTS RECEIVED', d.payments.map((p) => `${dateStr(p.date)}  ·  ${p.method}  ·  ${d.currency} ${money(p.amount)}`));
  if (d.notes?.trim()) block('NOTES', wrapToWidth(d.notes, R - M, 9.5));
  if (d.terms?.trim()) block('TERMS', wrapToWidth(d.terms, R - M, 9.5));

  // ── footer on every page ──
  const total = doc.pageCount;
  for (let p = 0; p < total; p++) {
    doc.setPage(p);
    doc.line(M, H - 34, R, H - 34, { color: RULE, width: 0.5 });
    doc.text('Generated by ShopOS', M, H - 20, { size: 8, color: GREY });
    doc.text(`Page ${p + 1} of ${total}`, R, H - 20, { size: 8, color: GREY, align: 'right' });
  }
  return doc;
}

export interface StatementInput {
  business: BizInfo; currency: string;
  debtor: string; phone?: string | null; reason?: string | null;
  debtDate: string; dueDate?: string | null;
  amount: number; paid: number; balance: number; status: string;
  payments: { date: string; method: string; amount: number }[];
  notes?: string | null;
}

export function buildDebtStatementPdf(s: StatementInput): PdfDoc {
  const items: DocLine[] = [{ description: s.reason?.trim() || 'Goods / services on credit', quantity: 1, unitPrice: s.amount, discount: 0, lineTotal: s.amount }];
  const doc = buildBusinessDocPdf({
    title: 'STATEMENT', number: 'DEBT STATEMENT', business: s.business, customer: { name: s.debtor, phone: s.phone },
    date: s.debtDate, status: s.status, extraMeta: s.dueDate ? [['Due date', dateStr(s.dueDate)]] : [],
    items, subtotal: s.amount, discount: 0, tax: 0, total: s.amount, paid: s.paid, balance: s.balance,
    payments: s.payments, notes: s.notes, currency: s.currency
  });
  return doc;
}
