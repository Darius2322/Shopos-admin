import { useEffect, useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { downloadQuotationPdf } from '../../lib/downloads';
import { Plus, X, ArrowRightCircle, Search, RotateCcw as ResetIcon, Eye, Printer, Check, Download, Loader2 } from 'lucide-react';
import { db } from '../../lib/db';
import { useAuth } from '../../lib/auth';
import { createQuotation, setQuotationStatus, convertQuotationToSale, refreshDocumentStatuses } from '../../lib/documents';
import type { DocumentLineInput, Quotation, PaymentMethod } from '../../lib/types';

function money(n: number, currency: string) {
  return `${currency} ${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

const STATUS_STYLES: Record<Quotation['status'], string> = {
  draft: 'bg-slate-200 text-slate-600',
  sent: 'bg-field-50 text-field-700',
  accepted: 'bg-field-50 text-field-700',
  rejected: 'bg-rust-50 text-rust-600',
  expired: 'bg-amber-100 text-amber-600',
  converted: 'bg-field-50 text-field-700'
};

export function QuotationsList() {
  const { business, activeBranchId, userId } = useAuth();
  const currency = business?.currency ?? 'KES';
  const quotations = useLiveQuery(
    () => (business ? db.quotations.where('businessId').equals(business.id).toArray() : []),
    [business?.id]
  ) ?? [];
  const customers = useLiveQuery(() => (business ? db.customers.where('businessId').equals(business.id).toArray() : []), [business?.id]) ?? [];
  const customerName = (id: string | null | undefined) => customers.find((c) => c.id === id)?.name ?? 'Walk-in';

  useEffect(() => { if (business) refreshDocumentStatuses(business.id); }, [business?.id]);

  const [creating, setCreating] = useState(false);
  const [converting, setConverting] = useState<Quotation | null>(null);
  const [viewing, setViewing] = useState<Quotation | null>(null);
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | Quotation['status']>('all');

  const filtered = useMemo(() => {
    let list = quotations;
    if (statusFilter !== 'all') list = list.filter((q) => q.status === statusFilter);
    const q = query.trim().toLowerCase();
    if (q) list = list.filter((quo) => quo.quotationNumber.toLowerCase().includes(q) || customerName(quo.customerId).toLowerCase().includes(q));
    return list.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }, [quotations, statusFilter, query, customers]);

  const isFiltered = statusFilter !== 'all' || query;

  return (
    <div className="p-4 md:p-8 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-4">
        <h1 className="font-display text-2xl font-semibold">Quotations</h1>
        <button onClick={() => setCreating(true)} className="btn-primary flex items-center gap-1.5 text-sm">
          <Plus className="w-4 h-4" /> New quotation
        </button>
      </div>

      <div className="space-y-2 mb-3">
        <div className="relative">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input className="input pl-9 text-sm" placeholder="Search quotation no. or customer…" value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
        <div className="flex gap-1.5 flex-wrap items-center">
          <select className="input py-1.5 text-xs w-auto" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as any)}>
            <option value="all">All statuses</option>
            <option value="draft">Draft</option>
            <option value="sent">Sent</option>
            <option value="accepted">Accepted</option>
            <option value="rejected">Rejected</option>
            <option value="expired">Expired</option>
            <option value="converted">Converted</option>
          </select>
          {isFiltered && (
            <button onClick={() => { setStatusFilter('all'); setQuery(''); }} className="text-xs font-medium text-slate-500 hover:text-ink flex items-center gap-1">
              <ResetIcon className="w-3.5 h-3.5" /> Reset
            </button>
          )}
        </div>
      </div>

      <div className="card divide-y divide-slate-100">
        {filtered.length === 0 && <p className="text-sm text-slate-500 py-8 text-center">No quotations match.</p>}
        {filtered.map((q) => (
          <div key={q.id} className="flex items-center justify-between gap-3 p-4">
            <div className="min-w-0">
              <div className="text-sm font-medium">{q.quotationNumber}</div>
              <div className="text-xs text-slate-500">{new Date(q.createdAt).toLocaleDateString()} · {customerName(q.customerId)}</div>
            </div>
            <div className="flex items-center gap-2 shrink-0 flex-wrap justify-end">
              <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${STATUS_STYLES[q.status]}`}>{q.status}</span>
              <span className="tnum text-sm font-medium">{money(q.total, currency)}</span>
              <button onClick={() => setViewing(q)} title="View" className="p-1 text-slate-400 hover:text-ink"><Eye className="w-4 h-4" /></button>
              {q.status === 'draft' && (
                <button onClick={() => setQuotationStatus(q, 'sent')} className="text-xs font-medium text-field-600">Mark sent</button>
              )}
              {q.status === 'sent' && (
                <>
                  <button onClick={() => setQuotationStatus(q, 'accepted')} className="text-xs font-medium text-field-600">Accept</button>
                  <button onClick={() => setQuotationStatus(q, 'rejected')} className="text-xs font-medium text-rust-600">Reject</button>
                </>
              )}
              {(q.status === 'sent' || q.status === 'accepted') && (
                <button onClick={() => setConverting(q)} className="text-xs font-medium text-field-600 flex items-center gap-1">
                  Convert <ArrowRightCircle className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      {creating && business && activeBranchId && userId && (
        <CreateQuotationModal businessId={business.id} branchId={activeBranchId} userId={userId} taxRate={business.taxRate} onClose={() => setCreating(false)} />
      )}
      {converting && userId && (
        <ConvertModal quotation={converting} currency={currency} userId={userId} onClose={() => setConverting(null)} />
      )}
      {viewing && <QuotationDetailModal quotation={viewing} currency={currency} customerName={customerName(viewing.customerId)} businessName={business?.name ?? 'ShopOS'} onClose={() => setViewing(null)} />}
    </div>
  );
}

function QuotationDetailModal({ quotation, currency, customerName, businessName, onClose }: {
  quotation: Quotation; currency: string; customerName: string; businessName: string; onClose: () => void;
}) {
  const items = useLiveQuery(() => db.quotationItems.where('quotationId').equals(quotation.id).toArray(), [quotation.id]) ?? [];
  const bizFull = useAuth((st) => st.business);
  const [downloading, setDownloading] = useState(false);
  async function download() {
    if (!bizFull) return;
    setDownloading(true);
    try { await downloadQuotationPdf({ business: bizFull, quotation, items, customerName, currency }); } finally { setDownloading(false); }
  }
  return (
    <div className="fixed inset-0 z-[55] flex items-end md:items-center md:justify-center print:static print:block">
      <div className="absolute inset-0 bg-ink/40 print:hidden" onClick={onClose} />
      <div className="relative w-full md:max-w-md bg-paper-raised rounded-t-2xl md:rounded-2xl p-5 space-y-3 max-h-[85vh] overflow-y-auto print:max-h-none print:overflow-visible print:rounded-none">
        <div className="flex items-center justify-between print:hidden">
          <h3 className="font-display font-semibold text-lg">{quotation.quotationNumber}</h3>
          <button onClick={onClose}><X className="w-5 h-5" /></button>
        </div>
        <div className="text-sm">
          <div className="font-display font-semibold text-base">{businessName}</div>
          <div className="text-xs text-slate-500 mt-1">Quotation {quotation.quotationNumber} · {new Date(quotation.createdAt).toLocaleDateString()}</div>
          <div className="text-xs text-slate-500">To: {customerName}</div>
          {quotation.validUntil && <div className="text-xs text-slate-500">Valid until: {quotation.validUntil}</div>}
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
          <div className="flex justify-between"><span className="text-slate-500">Subtotal</span><span className="tnum">{money(quotation.subtotal, currency)}</span></div>
          <div className="flex justify-between"><span className="text-slate-500">Tax</span><span className="tnum">{money(quotation.tax, currency)}</span></div>
          <div className="flex justify-between font-semibold"><span>Total</span><span className="tnum">{money(quotation.total, currency)}</span></div>
        </div>
        {quotation.notes && <p className="text-xs text-slate-500">{quotation.notes}</p>}
        {quotation.terms && <p className="text-xs text-slate-400">{quotation.terms}</p>}
        {quotation.convertedSaleId && <p className="text-xs text-field-600">Converted to sale.</p>}
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

function CreateQuotationModal({ businessId, branchId, userId, taxRate, onClose }: { businessId: string; branchId: string; userId: string; taxRate: number; onClose: () => void }) {
  const products = useLiveQuery(() => db.products.where({ businessId, branchId }).toArray(), [businessId, branchId]) ?? [];
  const customers = useLiveQuery(() => db.customers.where('businessId').equals(businessId).toArray(), [businessId]) ?? [];
  const [customerId, setCustomerId] = useState('');
  const [validUntil, setValidUntil] = useState('');
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
    if (lines.length === 0) return;
    setSaving(true);
    try {
      await createQuotation({ businessId, branchId, userId, customerId: customerId || null, lines, taxRate, validUntil: validUntil || null });
      onClose();
    } finally { setSaving(false); }
  }

  return (
    <div className="fixed inset-0 z-[55] flex items-end md:items-center md:justify-center">
      <div className="absolute inset-0 bg-ink/40" onClick={onClose} />
      <div className="relative w-full md:max-w-md bg-paper-raised rounded-t-2xl md:rounded-2xl p-5 space-y-3 max-h-[85vh] overflow-y-auto">
        <div className="flex items-center justify-between">
          <h3 className="font-display font-semibold text-lg">New quotation</h3>
          <button onClick={onClose}><X className="w-5 h-5" /></button>
        </div>
        <select className="input" value={customerId} onChange={(e) => setCustomerId(e.target.value)}>
          <option value="">Walk-in / no customer</option>
          {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <label className="block"><span className="block text-sm font-medium text-slate-600 mb-1.5">Valid until (optional)</span>
          <input className="input" type="date" value={validUntil} onChange={(e) => setValidUntil(e.target.value)} />
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
        <button onClick={submit} disabled={saving || lines.length === 0} className="btn-primary w-full">{saving ? 'Saving…' : 'Create quotation'}</button>
      </div>
    </div>
  );
}

function ConvertModal({ quotation, currency, userId, onClose }: { quotation: Quotation; currency: string; userId: string; onClose: () => void }) {
  const [method, setMethod] = useState<PaymentMethod>('cash');
  const [amountPaid, setAmountPaid] = useState(String(quotation.total));
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function submit() {
    setError(null); setSaving(true);
    try {
      await convertQuotationToSale({ quotation, userId, paymentMethod: method, amountPaid: parseFloat(amountPaid) || 0 });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not convert quotation');
    } finally { setSaving(false); }
  }

  return (
    <div className="fixed inset-0 z-[55] flex items-end md:items-center md:justify-center">
      <div className="absolute inset-0 bg-ink/40" onClick={onClose} />
      <div className="relative w-full md:max-w-sm bg-paper-raised rounded-t-2xl md:rounded-2xl p-5 space-y-3.5">
        <div className="flex items-center justify-between">
          <h3 className="font-display font-semibold text-lg">Convert to sale</h3>
          <button onClick={onClose}><X className="w-5 h-5" /></button>
        </div>
        <p className="text-sm text-slate-500">Total: <span className="tnum font-medium text-ink">{money(quotation.total, currency)}</span></p>
        <label className="block">
          <span className="block text-sm font-medium text-slate-600 mb-1.5">Payment method</span>
          <select className="input" value={method} onChange={(e) => setMethod(e.target.value as PaymentMethod)}>
            <option value="cash">Cash</option><option value="mpesa">M-Pesa</option><option value="card">Card</option>
            <option value="bank">Bank</option><option value="credit">Credit</option>
          </select>
        </label>
        <label className="block">
          <span className="block text-sm font-medium text-slate-600 mb-1.5">Amount paid</span>
          <input className="input tnum" type="number" value={amountPaid} onChange={(e) => setAmountPaid(e.target.value)} />
        </label>
        {error && <p className="text-sm text-rust-600">{error}</p>}
        <button onClick={submit} disabled={saving} className="btn-primary w-full">{saving ? 'Converting…' : 'Convert to sale'}</button>
      </div>
    </div>
  );
}
