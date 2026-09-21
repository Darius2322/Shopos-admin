import { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { X, Eye, Printer, Search, RotateCcw as ResetIcon } from 'lucide-react';
import { db, newRecordBase, enqueueSync } from '../../lib/db';
import { useAuth } from '../../lib/auth';
import { requestRefund } from '../../lib/refunds';
import { requestSaleCancellation } from '../../lib/cancellations';
import { recordAuditEvent } from '../../lib/audit';
import { ReceiptModal } from '../pos/ReceiptModal';
import type { Sale } from '../../lib/types';

function money(n: number, currency: string) {
  return `${currency} ${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

const STATUS_STYLES: Record<Sale['status'], string> = {
  completed: 'bg-field-600/10 text-field-700',
  cancelled: 'bg-slate-200 text-slate-500',
  refunded: 'bg-rust-600/10 text-rust-600',
  partially_refunded: 'bg-amber-500/10 text-amber-600'
};

type DateRange = 'today' | 'yesterday' | 'week' | 'month' | 'custom' | 'all';

function rangeToDates(range: DateRange, customFrom: string, customTo: string): { from: string | null; to: string | null } {
  const now = new Date();
  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).toISOString();
  const endOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999).toISOString();
  switch (range) {
    case 'today': return { from: startOfDay(now), to: endOfDay(now) };
    case 'yesterday': { const y = new Date(now); y.setDate(y.getDate() - 1); return { from: startOfDay(y), to: endOfDay(y) }; }
    case 'week': { const w = new Date(now); w.setDate(w.getDate() - 7); return { from: startOfDay(w), to: endOfDay(now) }; }
    case 'month': { const m = new Date(now); m.setDate(m.getDate() - 30); return { from: startOfDay(m), to: endOfDay(now) }; }
    case 'custom': return { from: customFrom ? new Date(customFrom).toISOString() : null, to: customTo ? endOfDay(new Date(customTo)) : null };
    default: return { from: null, to: null };
  }
}

export function SalesList() {
  const { business, activeBranchId, branches, profile, userId } = useAuth();
  const currency = business?.currency ?? 'KES';

  const [dateRange, setDateRange] = useState<DateRange>('all');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | Sale['status']>('all');
  const [methodFilter, setMethodFilter] = useState<'all' | string>('all');
  const [cashierFilter, setCashierFilter] = useState<'all' | string>('all');
  const [branchFilter, setBranchFilter] = useState<'all' | string>(activeBranchId ?? 'all');

  const { from, to } = useMemo(() => rangeToDates(dateRange, customFrom, customTo), [dateRange, customFrom, customTo]);

  // The date range is pushed down into the Dexie query itself (an indexed
  // range scan) rather than loading every sale this business has ever
  // made and filtering in memory — for a shop with years of history that
  // difference is the whole app hanging for a moment vs. not.
  const sales = useLiveQuery(() => {
    if (!business) return [];
    let collection = from && to
      ? db.sales.where('createdAt').between(from, to, true, true)
      : db.sales.where('businessId').equals(business.id);
    return collection.toArray().then((rows) => (from && to ? rows.filter((r) => r.businessId === business.id) : rows));
  }, [business?.id, from, to]) ?? [];

  const profiles = useLiveQuery(() => (business ? db.profiles.where('businessId').equals(business.id).toArray() : []), [business?.id]) ?? [];
  const customers = useLiveQuery(() => (business ? db.customers.where('businessId').equals(business.id).toArray() : []), [business?.id]) ?? [];
  const cashierName = (id: string) => profiles.find((p) => p.id === id)?.fullName ?? 'Unknown';

  const filtered = useMemo(() => {
    let list = sales;
    if (branchFilter !== 'all') list = list.filter((s) => s.branchId === branchFilter);
    if (statusFilter !== 'all') list = list.filter((s) => s.status === statusFilter);
    if (methodFilter !== 'all') list = list.filter((s) => s.paymentMethod === methodFilter);
    if (cashierFilter !== 'all') list = list.filter((s) => s.userId === cashierFilter);
    const q = query.trim().toLowerCase();
    if (q) {
      list = list.filter((s) => {
        const customer = s.customerId ? customers.find((c) => c.id === s.customerId) : null;
        return s.receiptNumber.toLowerCase().includes(q) || (customer && customer.name.toLowerCase().includes(q));
      });
    }
    return list.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }, [sales, branchFilter, statusFilter, methodFilter, cashierFilter, query, customers]);

  const isFiltered = dateRange !== 'all' || statusFilter !== 'all' || methodFilter !== 'all' || cashierFilter !== 'all' || query || branchFilter !== (activeBranchId ?? 'all');
  function resetFilters() {
    setDateRange('all'); setCustomFrom(''); setCustomTo(''); setQuery('');
    setStatusFilter('all'); setMethodFilter('all'); setCashierFilter('all'); setBranchFilter(activeBranchId ?? 'all');
  }

  const [refunding, setRefunding] = useState<Sale | null>(null);
  const [correcting, setCorrecting] = useState<Sale | null>(null);
  const [cancelling, setCancelling] = useState<Sale | null>(null);
  const [viewing, setViewing] = useState<Sale | null>(null);
  const [receiptSaleId, setReceiptSaleId] = useState<string | null>(null);

  function openReceipt(sale: Sale) {
    setReceiptSaleId(sale.id);
    if (userId && business) {
      recordAuditEvent({ businessId: business.id, branchId: sale.branchId, userId, action: 'receipt_regenerated', entityType: 'sale', entityId: sale.id });
    }
  }

  return (
    <div className="p-4 md:p-8 max-w-4xl mx-auto">
      <h1 className="font-display text-2xl font-semibold mb-4">Sales</h1>

      <div className="space-y-2 mb-4">
        <div className="flex gap-1.5 flex-wrap">
          {(['all', 'today', 'yesterday', 'week', 'month', 'custom'] as DateRange[]).map((r) => (
            <button key={r} onClick={() => setDateRange(r)} className={`text-xs font-medium px-3 py-1.5 rounded-full ${dateRange === r ? 'bg-field-600 text-white' : 'bg-slate-100 text-slate-600'}`}>
              {r === 'all' ? 'All time' : r === 'week' ? 'This week' : r === 'month' ? 'This month' : r === 'custom' ? 'Custom range' : r[0].toUpperCase() + r.slice(1)}
            </button>
          ))}
        </div>
        {dateRange === 'custom' && (
          <div className="flex gap-2">
            <input type="date" className="input text-sm" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} />
            <input type="date" className="input text-sm" value={customTo} onChange={(e) => setCustomTo(e.target.value)} />
          </div>
        )}
        <div className="relative">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input className="input pl-9 text-sm" placeholder="Search receipt no. or customer…" value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          {branches.length > 1 && (
            <select className="input text-sm" value={branchFilter} onChange={(e) => setBranchFilter(e.target.value)}>
              <option value="all">All branches</option>
              {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          )}
          <select className="input text-sm" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as any)}>
            <option value="all">All statuses</option>
            <option value="completed">Completed</option>
            <option value="cancelled">Cancelled</option>
            <option value="refunded">Refunded</option>
            <option value="partially_refunded">Partially refunded</option>
          </select>
          <select className="input text-sm" value={methodFilter} onChange={(e) => setMethodFilter(e.target.value)}>
            <option value="all">All payment methods</option>
            <option value="cash">Cash</option>
            <option value="mpesa">M-Pesa</option>
            <option value="card">Card</option>
            <option value="bank">Bank</option>
            <option value="credit">Credit</option>
            <option value="other">Other</option>
          </select>
          <select className="input text-sm" value={cashierFilter} onChange={(e) => setCashierFilter(e.target.value)}>
            <option value="all">All cashiers</option>
            {profiles.map((p) => <option key={p.id} value={p.id}>{p.fullName}</option>)}
          </select>
        </div>
        {isFiltered && (
          <button onClick={resetFilters} className="text-xs font-medium text-slate-500 hover:text-ink flex items-center gap-1">
            <ResetIcon className="w-3.5 h-3.5" /> Reset filters
          </button>
        )}
      </div>

      <div className="card divide-y divide-slate-100">
        {filtered.length === 0 && <p className="text-sm text-slate-500 py-8 text-center">No sales match these filters.</p>}
        {filtered.map((s) => (
          <div key={s.id} className="flex items-center justify-between gap-3 p-4">
            <div className="min-w-0">
              <div className="text-sm font-medium flex items-center gap-1.5">
                {s.receiptNumber}
                <span className={`text-[11px] font-medium px-1.5 py-0.5 rounded-full ${STATUS_STYLES[s.status]}`}>{s.status.replace('_', ' ')}</span>
              </div>
              <div className="text-xs text-slate-500">{new Date(s.createdAt).toLocaleString()} · {s.paymentMethod} · {cashierName(s.userId)}</div>
            </div>
            <div className="text-right shrink-0 flex items-center gap-3">
              <div className="tnum font-medium">{money(s.total, currency)}</div>
              <div className="flex items-center gap-2">
                <button onClick={() => setViewing(s)} title="View details" className="p-1.5 text-slate-400 hover:text-ink"><Eye className="w-4 h-4" /></button>
                <button onClick={() => openReceipt(s)} title="View / regenerate receipt" className="p-1.5 text-slate-400 hover:text-ink"><Printer className="w-4 h-4" /></button>
                {s.status === 'completed' && (
                  <div className="hidden sm:flex gap-2">
                    <button onClick={() => setCorrecting(s)} className="text-xs font-medium text-amber-600">Correction</button>
                    <button onClick={() => setRefunding(s)} className="text-xs font-medium text-rust-600">Refund</button>
                    <button onClick={() => setCancelling(s)} className="text-xs font-medium text-slate-500">Cancel</button>
                  </div>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      {viewing && <SaleDetailModal sale={viewing} currency={currency} cashierName={cashierName} onOpenReceipt={() => { openReceipt(viewing); }} onClose={() => setViewing(null)} />}
      {receiptSaleId && <ReceiptModal saleId={receiptSaleId} onClose={() => setReceiptSaleId(null)} />}

      {refunding && business && (
        <RequestRefundModal sale={refunding} businessId={business.id} currency={currency} onClose={() => setRefunding(null)} />
      )}
      {correcting && business && (
        <RequestCorrectionModal sale={correcting} businessId={business.id} onClose={() => setCorrecting(null)} />
      )}
      {cancelling && business && (
        <RequestCancellationModal sale={cancelling} businessId={business.id} onClose={() => setCancelling(null)} />
      )}
    </div>
  );
}

function SaleDetailModal({ sale, currency, cashierName, onOpenReceipt, onClose }: {
  sale: Sale; currency: string; cashierName: (id: string) => string; onOpenReceipt: () => void; onClose: () => void;
}) {
  const items = useLiveQuery(() => db.saleItems.where('saleId').equals(sale.id).toArray(), [sale.id]) ?? [];
  const customer = useLiveQuery(() => (sale.customerId ? db.customers.get(sale.customerId) : undefined), [sale.customerId]);
  const branch = useLiveQuery(() => db.branches.get(sale.branchId), [sale.branchId]);
  const refunds = useLiveQuery(() => db.refunds.where('saleId').equals(sale.id).toArray(), [sale.id]) ?? [];
  const cancellation = useLiveQuery(() => db.saleCancellations.where('saleId').equals(sale.id).first(), [sale.id]);
  const corrections = useLiveQuery(() => db.correctionRequests.where('saleId').equals(sale.id).toArray(), [sale.id]) ?? [];

  return (
    <div className="fixed inset-0 z-[55] flex items-end md:items-center md:justify-center">
      <div className="absolute inset-0 bg-ink/40" onClick={onClose} />
      <div className="relative w-full md:max-w-md bg-paper-raised rounded-t-2xl md:rounded-2xl p-5 space-y-3 max-h-[85vh] overflow-y-auto">
        <div className="flex items-center justify-between">
          <h3 className="font-display font-semibold text-lg">{sale.receiptNumber}</h3>
          <button onClick={onClose}><X className="w-5 h-5" /></button>
        </div>
        <div className="text-xs text-slate-500 space-y-0.5">
          <div>{new Date(sale.createdAt).toLocaleString()}</div>
          <div>Branch: {branch?.name ?? '—'}</div>
          <div>Cashier: {cashierName(sale.userId)}</div>
          {customer && <div>Customer: {customer.name}{customer.phone ? ` (${customer.phone})` : ''}</div>}
          <div>Status: <span className={`font-medium ${STATUS_STYLES[sale.status]} px-1.5 py-0.5 rounded-full`}>{sale.status.replace('_', ' ')}</span></div>
        </div>

        <div className="border border-slate-200 rounded-card divide-y divide-slate-100">
          {items.map((i) => (
            <div key={i.id} className="flex justify-between px-3 py-2 text-sm">
              <span>{i.productName} × {i.quantity} @ {money(i.unitPrice, currency)}</span>
              <span className="tnum">{money(i.lineTotal, currency)}</span>
            </div>
          ))}
        </div>

        <div className="text-sm space-y-1">
          <div className="flex justify-between"><span className="text-slate-500">Subtotal</span><span className="tnum">{money(sale.subtotal, currency)}</span></div>
          {sale.discount > 0 && <div className="flex justify-between"><span className="text-slate-500">Discount</span><span className="tnum">-{money(sale.discount, currency)}</span></div>}
          <div className="flex justify-between"><span className="text-slate-500">Tax</span><span className="tnum">{money(sale.tax, currency)}</span></div>
          <div className="flex justify-between font-semibold"><span>Total</span><span className="tnum">{money(sale.total, currency)}</span></div>
          <div className="flex justify-between"><span className="text-slate-500">Paid ({sale.paymentMethod})</span><span className="tnum">{money(sale.amountPaid, currency)}</span></div>
          {sale.balanceDue > 0 && <div className="flex justify-between text-rust-600"><span>Balance due</span><span className="tnum">{money(sale.balanceDue, currency)}</span></div>}
        </div>

        {(refunds.length > 0 || cancellation || corrections.length > 0) && (
          <div className="border-t border-slate-100 pt-3 space-y-1.5">
            <p className="text-xs font-medium text-slate-500">Related adjustments</p>
            {refunds.map((r) => (
              <div key={r.id} className="text-xs text-slate-600">Refund · {r.status} · {money(r.totalAmount, currency)} · {r.reason}</div>
            ))}
            {cancellation && <div className="text-xs text-slate-600">Cancellation · {cancellation.status} · {cancellation.reason}</div>}
            {corrections.map((c) => (
              <div key={c.id} className="text-xs text-slate-600">Correction · {c.status} · {c.problem}</div>
            ))}
          </div>
        )}

        <button onClick={onOpenReceipt} className="btn-secondary w-full flex items-center justify-center gap-1.5 text-sm">
          <Printer className="w-4 h-4" /> View / regenerate receipt
        </button>
      </div>
    </div>
  );
}

const CANCEL_REASONS = [
  'Wrong customer', 'Duplicate sale', 'Wrong payment method', 'Customer changed mind', 'Other'
];

function RequestCancellationModal({ sale, businessId, onClose }: { sale: Sale; businessId: string; onClose: () => void }) {
  const { userId } = useAuth();
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (!userId || !reason) return;
    setError(null); setSaving(true);
    try {
      await requestSaleCancellation({ businessId, branchId: sale.branchId, sale, requestedBy: userId, reason });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not submit cancellation request');
    } finally { setSaving(false); }
  }

  return (
    <div className="fixed inset-0 z-[55] flex items-end md:items-center md:justify-center">
      <div className="absolute inset-0 bg-ink/40" onClick={onClose} />
      <div className="relative w-full md:max-w-sm bg-paper-raised rounded-t-2xl md:rounded-2xl p-5 space-y-3.5">
        <div className="flex items-center justify-between">
          <h3 className="font-display font-semibold text-lg">Cancel sale — {sale.receiptNumber}</h3>
          <button onClick={onClose}><X className="w-5 h-5" /></button>
        </div>
        <p className="text-xs text-slate-500">
          For a sale that shouldn't have happened at all — use Refund instead if only some items need reversing.
          A manager or owner must approve before anything changes.
        </p>
        <label className="block">
          <span className="block text-sm font-medium text-slate-600 mb-1.5">Reason</span>
          <select className="input" value={reason} onChange={(e) => setReason(e.target.value)}>
            <option value="">Select…</option>
            {CANCEL_REASONS.map((r) => <option key={r}>{r}</option>)}
          </select>
        </label>
        {error && <p className="text-sm text-rust-600">{error}</p>}
        <button onClick={submit} disabled={saving || !reason} className="btn-primary w-full">
          {saving ? 'Submitting…' : 'Submit cancellation request'}
        </button>
      </div>
    </div>
  );
}

const CORRECTION_PROBLEMS = [
  'Wrong product', 'Wrong quantity', 'Wrong price', 'Wrong customer',
  'Wrong payment method', 'Wrong discount', 'Wrong debt', 'Duplicate sale', 'Other'
];

function RequestCorrectionModal({ sale, businessId, onClose }: { sale: Sale; businessId: string; onClose: () => void }) {
  const { userId } = useAuth();
  const [problem, setProblem] = useState('');
  const [correction, setCorrection] = useState('');
  const [saving, setSaving] = useState(false);

  async function submit() {
    if (!userId || !problem || !correction.trim()) return;
    setSaving(true);
    try {
      const record = {
        ...newRecordBase(),
        businessId, branchId: sale.branchId, saleId: sale.id,
        requestedBy: userId, decidedBy: null,
        problem, requestedCorrection: correction.trim(),
        status: 'requested' as const,
        requestedAt: new Date().toISOString(), decidedAt: null, resolutionNotes: null
      };
      await db.correctionRequests.add(record as any);
      await enqueueSync('correctionRequests', record.id, 'create');
      await recordAuditEvent({ businessId, branchId: sale.branchId, userId, action: 'correction_requested', entityType: 'sale', entityId: sale.id, newValue: JSON.stringify({ problem, requestedCorrection: correction.trim() }) });
      onClose();
    } finally { setSaving(false); }
  }

  return (
    <div className="fixed inset-0 z-[55] flex items-end md:items-center md:justify-center">
      <div className="absolute inset-0 bg-ink/40" onClick={onClose} />
      <div className="relative w-full md:max-w-sm bg-paper-raised rounded-t-2xl md:rounded-2xl p-5 space-y-3.5">
        <div className="flex items-center justify-between">
          <h3 className="font-display font-semibold text-lg">Request correction — {sale.receiptNumber}</h3>
          <button onClick={onClose}><X className="w-5 h-5" /></button>
        </div>
        <p className="text-xs text-slate-500">This never edits the sale directly — a manager or owner reviews and applies the fix.</p>
        <label className="block">
          <span className="block text-sm font-medium text-slate-600 mb-1.5">What went wrong</span>
          <select className="input" value={problem} onChange={(e) => setProblem(e.target.value)}>
            <option value="">Select…</option>
            {CORRECTION_PROBLEMS.map((p) => <option key={p}>{p}</option>)}
          </select>
        </label>
        <label className="block">
          <span className="block text-sm font-medium text-slate-600 mb-1.5">What should it be instead?</span>
          <textarea className="input min-h-20" value={correction} onChange={(e) => setCorrection(e.target.value)} />
        </label>
        <button onClick={submit} disabled={saving || !problem || !correction.trim()} className="btn-primary w-full">
          {saving ? 'Submitting…' : 'Submit request'}
        </button>
      </div>
    </div>
  );
}

function RequestRefundModal({ sale, businessId, currency, onClose }: { sale: Sale; businessId: string; currency: string; onClose: () => void }) {
  const { userId } = useAuth();
  const items = useLiveQuery(() => db.saleItems.where('saleId').equals(sale.id).toArray(), [sale.id]) ?? [];
  const [selected, setSelected] = useState<Record<string, { quantity: number; condition: 'resalable' | 'damaged' | 'expired' }>>({});
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function toggle(id: string, maxQty: number) {
    setSelected((prev) => {
      const next = { ...prev };
      if (next[id]) delete next[id];
      else next[id] = { quantity: maxQty, condition: 'resalable' };
      return next;
    });
  }

  async function submit() {
    if (!userId || !reason.trim() || Object.keys(selected).length === 0) return;
    setError(null); setSaving(true);
    try {
      await requestRefund({
        businessId,
        branchId: sale.branchId,
        sale,
        requestedBy: userId,
        reason: reason.trim(),
        items: items
          .filter((i) => selected[i.id])
          .map((i) => ({
            saleItemId: i.id,
            productId: i.productId,
            quantity: selected[i.id].quantity,
            unitPrice: i.unitPrice,
            condition: selected[i.id].condition
          }))
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not submit refund request');
    } finally { setSaving(false); }
  }

  return (
    <div className="fixed inset-0 z-[55] flex items-end md:items-center md:justify-center">
      <div className="absolute inset-0 bg-ink/40" onClick={onClose} />
      <div className="relative w-full md:max-w-sm bg-paper-raised rounded-t-2xl md:rounded-2xl p-5 space-y-3 max-h-[85vh] overflow-y-auto">
        <div className="flex items-center justify-between">
          <h3 className="font-display font-semibold text-lg">Request refund — {sale.receiptNumber}</h3>
          <button onClick={onClose}><X className="w-5 h-5" /></button>
        </div>
        <p className="text-xs text-slate-500">Select items to refund. This creates a request for manager/owner approval — nothing changes until then.</p>

        <div className="space-y-2">
          {items.map((i) => (
            <label key={i.id} className="flex items-center justify-between p-2.5 border border-slate-200 rounded-card">
              <span className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={!!selected[i.id]} onChange={() => toggle(i.id, i.quantity)} />
                {i.productName} × {i.quantity}
              </span>
              <span className="tnum text-sm text-slate-500">{money(i.lineTotal, currency)}</span>
            </label>
          ))}
        </div>

        <label className="block">
          <span className="block text-sm font-medium text-slate-600 mb-1.5">Reason</span>
          <select className="input" value={reason} onChange={(e) => setReason(e.target.value)}>
            <option value="">Select a reason…</option>
            <option>Defective product</option>
            <option>Wrong product</option>
            <option>Wrong quantity</option>
            <option>Duplicate transaction</option>
            <option>Customer return</option>
            <option>Damaged product</option>
            <option>Incorrect price</option>
            <option>Other authorized reason</option>
          </select>
        </label>

        {error && <p className="text-sm text-rust-600">{error}</p>}
        <button onClick={submit} disabled={saving || !reason || Object.keys(selected).length === 0} className="btn-primary w-full">
          {saving ? 'Submitting…' : 'Submit refund request'}
        </button>
      </div>
    </div>
  );
}
