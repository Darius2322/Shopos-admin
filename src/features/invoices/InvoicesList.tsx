import { useEffect, useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { downloadInvoicePdf } from '../../lib/downloads';
import { Plus, X, Search, RotateCcw as ResetIcon, Eye, Printer, Download, Loader2 } from 'lucide-react';
import { db, enqueueSync } from '../../lib/db';
import { useAuth } from '../../lib/auth';
import { createInvoice, recordInvoicePayment, refreshDocumentStatuses } from '../../lib/documents';
import type { DocumentLineInput, Invoice } from '../../lib/types';

function money(n: number, currency: string) {
  return `${currency} ${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

const STATUS_STYLES: Record<Invoice['status'], string> = {
  draft: 'bg-slate-200 text-slate-600',
  sent: 'bg-field-50 text-field-700',
  partially_paid: 'bg-amber-100 text-amber-600',
  paid: 'bg-field-50 text-field-700',
  overdue: 'bg-rust-50 text-rust-600',
  cancelled: 'bg-slate-200 text-slate-500'
};

export function InvoicesList() {
  const { business, activeBranchId, userId } = useAuth();
  const currency = business?.currency ?? 'KES';
  const invoices = useLiveQuery(
    () => (business ? db.invoices.where('businessId').equals(business.id).toArray() : []),
    [business?.id]
  ) ?? [];
  const customers = useLiveQuery(() => (business ? db.customers.where('businessId').equals(business.id).toArray() : []), [business?.id]) ?? [];
  const customerName = (id: string | null | undefined) => customers.find((c) => c.id === id)?.name ?? 'Walk-in';

  useEffect(() => { if (business) refreshDocumentStatuses(business.id); }, [business?.id]);

  const [creating, setCreating] = useState(false);
  const [paying, setPaying] = useState<Invoice | null>(null);
  const [viewing, setViewing] = useState<Invoice | null>(null);
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | Invoice['status']>('all');

  const filtered = useMemo(() => {
    let list = invoices;
    if (statusFilter !== 'all') list = list.filter((i) => i.status === statusFilter);
    const q = query.trim().toLowerCase();
    if (q) list = list.filter((inv) => inv.invoiceNumber.toLowerCase().includes(q) || customerName(inv.customerId).toLowerCase().includes(q));
    return list.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }, [invoices, statusFilter, query, customers]);

  const isFiltered = statusFilter !== 'all' || query;

  async function markSent(inv: Invoice) {
    await db.invoices.update(inv.id, { status: 'sent', updatedAt: new Date().toISOString(), syncStatus: 'pending' as const });
    await enqueueSync('invoices', inv.id, 'update');
  }

  return (
    <div className="p-4 md:p-8 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-4">
        <h1 className="font-display text-2xl font-semibold">Invoices</h1>
        <button onClick={() => setCreating(true)} className="btn-primary flex items-center gap-1.5 text-sm">
          <Plus className="w-4 h-4" /> New invoice
        </button>
      </div>

      <div className="space-y-2 mb-3">
        <div className="relative">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input className="input pl-9 text-sm" placeholder="Search invoice no. or customer…" value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
        <div className="flex gap-1.5 flex-wrap items-center">
          <select className="input py-1.5 text-xs w-auto" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as any)}>
            <option value="all">All statuses</option>
            <option value="draft">Draft</option>
            <option value="sent">Sent</option>
            <option value="partially_paid">Partially paid</option>
            <option value="paid">Paid</option>
            <option value="overdue">Overdue</option>
            <option value="cancelled">Cancelled</option>
          </select>
          {isFiltered && (
            <button onClick={() => { setStatusFilter('all'); setQuery(''); }} className="text-xs font-medium text-slate-500 hover:text-ink flex items-center gap-1">
              <ResetIcon className="w-3.5 h-3.5" /> Reset
            </button>
          )}
        </div>
      </div>

      <div className="card divide-y divide-slate-100">
        {filtered.length === 0 && <p className="text-sm text-slate-500 py-8 text-center">No invoices match.</p>}
        {filtered.map((inv) => (
          <div key={inv.id} className="flex items-center justify-between gap-3 p-4">
            <div className="min-w-0">
              <div className="text-sm font-medium">{inv.invoiceNumber}</div>
              <div className="text-xs text-slate-500">{new Date(inv.createdAt).toLocaleDateString()} · {customerName(inv.customerId)}{inv.dueDate ? ` · due ${inv.dueDate}` : ''}</div>
            </div>
            <div className="flex items-center gap-2 shrink-0 flex-wrap justify-end">
              <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${STATUS_STYLES[inv.status]}`}>{inv.status.replace('_', ' ')}</span>
              <span className="tnum text-sm font-medium">{money(inv.balance, currency)}</span>
              <button onClick={() => setViewing(inv)} title="View" className="p-1 text-slate-400 hover:text-ink"><Eye className="w-4 h-4" /></button>
              {inv.status === 'draft' && (
                <button onClick={() => markSent(inv)} className="text-xs font-medium text-field-600">Mark sent</button>
              )}
              {inv.balance > 0 && inv.status !== 'cancelled' && (
                <button onClick={() => setPaying(inv)} className="text-xs font-medium text-field-600">Record payment</button>
              )}
            </div>
          </div>
        ))}
      </div>

      {creating && business && activeBranchId && userId && (
        <CreateInvoiceModal businessId={business.id} branchId={activeBranchId} userId={userId} taxRate={business.taxRate} onClose={() => setCreating(false)} />
      )}
      {paying && userId && (
        <RecordInvoicePaymentModal invoice={paying} currency={currency} userId={userId} onClose={() => setPaying(null)} />
      )}
      {viewing && <InvoiceDetailModal invoice={viewing} currency={currency} customerName={customerName(viewing.customerId)} businessName={business?.name ?? 'ShopOS'} onClose={() => setViewing(null)} />}
    </div>
  );
}

function InvoiceDetailModal({ invoice, currency, customerName, businessName, onClose }: {
  invoice: Invoice; currency: string; customerName: string; businessName: string; onClose: () => void;
}) {
  const items = useLiveQuery(() => db.invoiceItems.where('invoiceId').equals(invoice.id).toArray(), [invoice.id]) ?? [];
  const payments = useLiveQuery(() => db.invoicePayments.where('invoiceId').equals(invoice.id).toArray(), [invoice.id]) ?? [];
  const bizFull = useAuth((st) => st.business);
  const [downloading, setDownloading] = useState(false);
  async function download() {
    if (!bizFull) return;
    setDownloading(true);
    try { await downloadInvoicePdf({ business: bizFull, invoice, items, payments, customerName, currency }); } finally { setDownloading(false); }
  }
  return (
    <div className="fixed inset-0 z-[55] flex items-end md:items-center md:justify-center print:static print:block">
      <div className="absolute inset-0 bg-ink/40 print:hidden" onClick={onClose} />
      <div className="relative w-full md:max-w-md bg-paper-raised rounded-t-2xl md:rounded-2xl p-5 space-y-3 max-h-[85vh] overflow-y-auto print:max-h-none print:overflow-visible print:rounded-none">
        <div className="flex items-center justify-between print:hidden">
          <h3 className="font-display font-semibold text-lg">{invoice.invoiceNumber}</h3>
          <button onClick={onClose}><X className="w-5 h-5" /></button>
        </div>
        <div className="text-sm">
          <div className="font-display font-semibold text-base">{businessName}</div>
          <div className="text-xs text-slate-500 mt-1">Invoice {invoice.invoiceNumber} · {new Date(invoice.createdAt).toLocaleDateString()}</div>
          <div className="text-xs text-slate-500">Bill to: {customerName}</div>
          {invoice.dueDate && <div className="text-xs text-slate-500">Due: {invoice.dueDate}</div>}
        </div>
        <div className="border border-slate-200 rounded-card divide-y divide-slate-100">
          {items.map((i) => (
            <div key={i.id} className="flex justify-between px-3 py-2 text-sm">
              <span>{i.description} × {i.quantity}</span>
              <span className="tnum">{money(i.lineTotal, currency)}</span>
            </div>
          ))}
        </div>
        <div className="text-sm space-y-1">
          <div className="flex justify-between"><span className="text-slate-500">Subtotal</span><span className="tnum">{money(invoice.subtotal, currency)}</span></div>
          <div className="flex justify-between"><span className="text-slate-500">Tax</span><span className="tnum">{money(invoice.tax, currency)}</span></div>
          <div className="flex justify-between font-semibold"><span>Total</span><span className="tnum">{money(invoice.total, currency)}</span></div>
          <div className="flex justify-between"><span className="text-slate-500">Paid</span><span className="tnum">{money(invoice.amountPaid, currency)}</span></div>
          {invoice.balance > 0 && <div className="flex justify-between text-rust-600"><span>Balance</span><span className="tnum">{money(invoice.balance, currency)}</span></div>}
        </div>
        {payments.length > 0 && (
          <div className="border-t border-slate-100 pt-2">
            <p className="text-xs font-medium text-slate-500 mb-1">Payments</p>
            {payments.map((p) => (
              <div key={p.id} className="flex justify-between text-xs text-slate-600">
                <span>{new Date(p.createdAt).toLocaleDateString()} · {p.method}</span>
                <span className="tnum">{money(p.amount, currency)}</span>
              </div>
            ))}
          </div>
        )}
        {invoice.notes && <p className="text-xs text-slate-500">{invoice.notes}</p>}
        {invoice.terms && <p className="text-xs text-slate-400">{invoice.terms}</p>}
        <div className="grid grid-cols-2 gap-2 print:hidden">
          <button onClick={download} disabled={downloading} className="btn-primary flex items-center justify-center gap-1.5 text-sm min-h-[44px]">
            {downloading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />} Download PDF
          </button>
          <button onClick={() => window.print()} className="btn-secondary flex items-center justify-center gap-1.5 text-sm min-h-[44px]">
            <Printer className="w-4 h-4" /> Print
          </button>
        </div>
      </div>
    </div>
  );
}

function CreateInvoiceModal({ businessId, branchId, userId, taxRate, onClose }: { businessId: string; branchId: string; userId: string; taxRate: number; onClose: () => void }) {
  const products = useLiveQuery(() => db.products.where({ businessId, branchId }).toArray(), [businessId, branchId]) ?? [];
  const customers = useLiveQuery(() => db.customers.where('businessId').equals(businessId).toArray(), [businessId]) ?? [];
  const [customerId, setCustomerId] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [lines, setLines] = useState<DocumentLineInput[]>([]);
  const [productId, setProductId] = useState('');
  const [qty, setQty] = useState('1');
  const [saving, setSaving] = useState(false);

  function addLine() {
    const product = products.find((p) => p.id === productId);
    if (!product) return;
    setLines((prev) => [...prev, { productId: product.id, description: product.name, quantity: parseFloat(qty) || 1, unitPrice: product.sellingPrice, discount: 0 }]);
    setProductId(''); setQty('1');
  }

  async function submit() {
    if (lines.length === 0 || !customerId) return;
    setSaving(true);
    try {
      await createInvoice({ businessId, branchId, userId, customerId, lines, taxRate, dueDate: dueDate || null });
      onClose();
    } finally { setSaving(false); }
  }

  return (
    <div className="fixed inset-0 z-[55] flex items-end md:items-center md:justify-center">
      <div className="absolute inset-0 bg-ink/40" onClick={onClose} />
      <div className="relative w-full md:max-w-md bg-paper-raised rounded-t-2xl md:rounded-2xl p-5 space-y-3 max-h-[85vh] overflow-y-auto">
        <div className="flex items-center justify-between">
          <h3 className="font-display font-semibold text-lg">New invoice</h3>
          <button onClick={onClose}><X className="w-5 h-5" /></button>
        </div>
        <label className="block"><span className="block text-sm font-medium text-slate-600 mb-1.5">Customer</span>
          <select className="input" value={customerId} onChange={(e) => setCustomerId(e.target.value)}>
            <option value="">Select customer…</option>
            {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </label>
        <label className="block"><span className="block text-sm font-medium text-slate-600 mb-1.5">Due date</span>
          <input className="input" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
        </label>
        <div className="grid grid-cols-4 gap-2">
          <select className="input col-span-3" value={productId} onChange={(e) => setProductId(e.target.value)}>
            <option value="">Select product…</option>
            {products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <input className="input tnum" type="number" value={qty} onChange={(e) => setQty(e.target.value)} />
        </div>
        <button onClick={addLine} className="btn-secondary text-sm w-full">Add line</button>
        {lines.length > 0 && (
          <div className="border border-slate-200 rounded-card divide-y divide-slate-100">
            {lines.map((l, i) => (
              <div key={i} className="flex justify-between px-3 py-2 text-sm">
                <span>{l.description} × {l.quantity}</span>
                <span className="tnum">{(l.unitPrice * l.quantity).toLocaleString()}</span>
              </div>
            ))}
          </div>
        )}
        <button onClick={submit} disabled={saving || lines.length === 0 || !customerId} className="btn-primary w-full">{saving ? 'Saving…' : 'Create invoice'}</button>
      </div>
    </div>
  );
}

function RecordInvoicePaymentModal({ invoice, currency, userId, onClose }: { invoice: Invoice; currency: string; userId: string; onClose: () => void }) {
  const [amount, setAmount] = useState(String(invoice.balance));
  const [method, setMethod] = useState('cash');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function submit() {
    setError(null);
    const n = parseFloat(amount);
    if (!n || n <= 0) { setError('Enter a valid amount'); return; }
    setSaving(true);
    try {
      await recordInvoicePayment(invoice, n, method, userId);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not record payment');
    } finally { setSaving(false); }
  }

  return (
    <div className="fixed inset-0 z-[55] flex items-end md:items-center md:justify-center">
      <div className="absolute inset-0 bg-ink/40" onClick={onClose} />
      <div className="relative w-full md:max-w-sm bg-paper-raised rounded-t-2xl md:rounded-2xl p-5 space-y-3.5">
        <div className="flex items-center justify-between">
          <h3 className="font-display font-semibold text-lg">Record payment</h3>
          <button onClick={onClose}><X className="w-5 h-5" /></button>
        </div>
        <p className="text-sm text-slate-500">Outstanding: <span className="tnum font-medium text-ink">{money(invoice.balance, currency)}</span></p>
        <label className="block"><span className="block text-sm font-medium text-slate-600 mb-1.5">Amount</span><input className="input tnum" type="number" value={amount} onChange={(e) => setAmount(e.target.value)} /></label>
        <label className="block">
          <span className="block text-sm font-medium text-slate-600 mb-1.5">Method</span>
          <select className="input" value={method} onChange={(e) => setMethod(e.target.value)}>
            <option value="cash">Cash</option><option value="mpesa">M-Pesa</option><option value="card">Card</option><option value="bank">Bank</option>
          </select>
        </label>
        {error && <p className="text-sm text-rust-600">{error}</p>}
        <button onClick={submit} disabled={saving} className="btn-primary w-full">{saving ? 'Saving…' : 'Record payment'}</button>
      </div>
    </div>
  );
}
