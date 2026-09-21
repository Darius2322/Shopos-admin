import { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Plus, X, ChevronRight, ScanLine, PackagePlus } from 'lucide-react';
import { db, newRecordBase, enqueueSync } from '../../lib/db';
import { useAuth } from '../../lib/auth';
import { recordPurchase, supplierOutstandingBalance } from '../../lib/purchases';
import { createProduct } from '../../lib/products';
import { lookupBarcode } from '../../lib/barcodeLookup';
import { BarcodeScannerModal } from '../../components/scanner/BarcodeScannerModal';
import { recordAuditEvent } from '../../lib/audit';
import type { PurchaseItemInput } from '../../lib/types';

function money(n: number, currency: string) {
  return `${currency} ${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function SuppliersList() {
  const { business } = useAuth();
  const currency = business?.currency ?? 'KES';
  const suppliers = useLiveQuery(
    () => (business ? db.suppliers.where('businessId').equals(business.id).toArray() : []),
    [business?.id]
  ) ?? [];

  const [adding, setAdding] = useState(false);
  const [supplying, setSupplying] = useState<string | null>(null);
  const [viewingDetail, setViewingDetail] = useState<string | null>(null);

  return (
    <div className="p-4 md:p-8 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-4">
        <h1 className="font-display text-2xl font-semibold">Suppliers</h1>
        <button onClick={() => setAdding(true)} className="btn-primary flex items-center gap-1.5 text-sm">
          <Plus className="w-4 h-4" /> Add supplier
        </button>
      </div>
      <div className="card divide-y divide-slate-100">
        {suppliers.length === 0 && <p className="text-sm text-slate-500 py-8 text-center">No suppliers yet.</p>}
        {suppliers.map((s) => (
          <SupplierRow key={s.id} supplier={s} currency={currency} onSupply={() => setSupplying(s.id)} onOpenDetail={() => setViewingDetail(s.id)} />
        ))}
      </div>
      {adding && business && <AddSupplierModal businessId={business.id} onClose={() => setAdding(false)} />}
      {supplying && business && (
        <RecordPurchaseModal supplierId={supplying} businessId={business.id} onClose={() => setSupplying(null)} />
      )}
      {viewingDetail && (() => {
        const s = suppliers.find((x) => x.id === viewingDetail);
        return s ? <SupplierDetailDrawer supplier={s} currency={currency} onClose={() => setViewingDetail(null)} /> : null;
      })()}
    </div>
  );
}

function SupplierRow({ supplier, currency, onSupply, onOpenDetail }: { supplier: any; currency: string; onSupply: () => void; onOpenDetail: () => void }) {
  const balance = useLiveQuery(() => supplierOutstandingBalance(supplier.id), [supplier.id]) ?? 0;
  return (
    <div className="flex items-center justify-between gap-3 p-4">
      <button className="min-w-0 text-left flex-1" onClick={onOpenDetail}>
        <div className="text-sm font-medium truncate">{supplier.name}</div>
        <div className="text-xs text-slate-500">{supplier.phone ?? 'No phone'}</div>
        {balance > 0 && <div className="text-xs tnum text-rust-600 mt-0.5">Owed: {money(balance, currency)}</div>}
      </button>
      <button onClick={onSupply} className="btn-secondary text-xs flex items-center gap-1 shrink-0">
        Record supply <ChevronRight className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}

function SupplierDetailDrawer({ supplier, currency, onClose }: { supplier: any; currency: string; onClose: () => void }) {
  const balance = useLiveQuery(() => supplierOutstandingBalance(supplier.id), [supplier.id]) ?? 0;
  const purchases = useLiveQuery(
    async () => {
      const rows = await db.purchases.where('supplierId').equals(supplier.id).toArray();
      return rows.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    },
    [supplier.id]
  ) ?? [];
  const totalPurchased = purchases.reduce((s, p) => s + p.total, 0);

  return (
    <div className="fixed inset-0 z-[55] flex items-end md:items-center md:justify-center">
      <div className="absolute inset-0 bg-ink/40" onClick={onClose} />
      <div className="relative w-full md:max-w-md bg-paper-raised rounded-t-2xl md:rounded-2xl p-5 space-y-3 max-h-[85vh] overflow-y-auto">
        <div className="flex items-center justify-between">
          <h3 className="font-display font-semibold text-lg">{supplier.name}</h3>
          <button onClick={onClose}><X className="w-5 h-5" /></button>
        </div>

        <div className="text-sm text-slate-600 space-y-0.5">
          <div>{supplier.phone ?? 'No phone'}</div>
          {supplier.email && <div>{supplier.email}</div>}
          {supplier.address && <div>{supplier.address}</div>}
          <div className="text-xs text-slate-400 capitalize">{supplier.status} · added {new Date(supplier.createdAt).toLocaleDateString()}</div>
        </div>

        <div className="grid grid-cols-2 gap-3 text-sm">
          <div className="card p-3"><div className="text-xs text-slate-500">Total purchased</div><div className="tnum font-semibold">{money(totalPurchased, currency)}</div></div>
          <div className="card p-3"><div className="text-xs text-slate-500">Outstanding</div><div className={`tnum font-semibold ${balance > 0 ? 'text-rust-600' : ''}`}>{money(balance, currency)}</div></div>
        </div>

        <div>
          <h4 className="text-sm font-medium mb-2">Purchase history</h4>
          {purchases.length === 0 ? (
            <p className="text-xs text-slate-400">No purchases recorded yet.</p>
          ) : (
            <div className="divide-y divide-slate-100 border border-slate-100 rounded-card">
              {purchases.map((p) => (
                <div key={p.id} className="flex items-center justify-between p-3 text-sm">
                  <div>
                    <div className="capitalize">{p.status}{p.invoiceNumber ? ` · #${p.invoiceNumber}` : ''}</div>
                    <div className="text-xs text-slate-400">{new Date(p.createdAt).toLocaleString()}</div>
                  </div>
                  <div className="text-right">
                    <div className="tnum font-medium">{money(p.total, currency)}</div>
                    {p.amountOwed > 0 && <div className="text-xs tnum text-rust-600">Owed {money(p.amountOwed, currency)}</div>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function AddSupplierModal({ businessId, onClose }: { businessId: string; onClose: () => void }) {
  const { userId } = useAuth();
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [saving, setSaving] = useState(false);

  async function submit() {
    if (!name.trim()) return;
    setSaving(true);
    try {
      const record = { ...newRecordBase(), businessId, name: name.trim(), phone: phone || null, email: null, address: null, status: 'active' as const };
      await db.suppliers.add(record as any);
      await enqueueSync('suppliers', record.id, 'create');
      await recordAuditEvent({ businessId, userId, action: 'supplier_created', entityType: 'supplier', entityId: record.id, newValue: JSON.stringify({ name: record.name, phone: record.phone }) });
      onClose();
    } finally { setSaving(false); }
  }

  return (
    <div className="fixed inset-0 z-[55] flex items-end md:items-center md:justify-center">
      <div className="absolute inset-0 bg-ink/40" onClick={onClose} />
      <div className="relative w-full md:max-w-sm bg-paper-raised rounded-t-2xl md:rounded-2xl p-5 space-y-3.5">
        <div className="flex items-center justify-between">
          <h3 className="font-display font-semibold text-lg">Add supplier</h3>
          <button onClick={onClose}><X className="w-5 h-5" /></button>
        </div>
        <label className="block"><span className="block text-sm font-medium text-slate-600 mb-1.5">Name</span><input className="input" value={name} onChange={(e) => setName(e.target.value)} autoFocus /></label>
        <label className="block"><span className="block text-sm font-medium text-slate-600 mb-1.5">Phone</span><input className="input" value={phone} onChange={(e) => setPhone(e.target.value)} /></label>
        <button onClick={submit} disabled={saving || !name.trim()} className="btn-primary w-full">{saving ? 'Saving…' : 'Add supplier'}</button>
      </div>
    </div>
  );
}

function RecordPurchaseModal({ supplierId, businessId, onClose }: { supplierId: string; businessId: string; onClose: () => void }) {
  const { activeBranchId, userId } = useAuth();
  const products = useLiveQuery(
    () => (activeBranchId ? db.products.where({ businessId, branchId: activeBranchId }).toArray() : []),
    [businessId, activeBranchId]
  ) ?? [];
  const categories = useLiveQuery(
    () => db.categories.where({ businessId, archived: false as any }).toArray(),
    [businessId]
  ) ?? [];

  const [lines, setLines] = useState<PurchaseItemInput[]>([]);
  const [mode, setMode] = useState<'existing' | 'new'>('existing');
  const [productId, setProductId] = useState('');
  const [qty, setQty] = useState('');
  const [price, setPrice] = useState('');
  const [amountPaid, setAmountPaid] = useState('');
  const [method, setMethod] = useState('cash');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // "New product" fields — this is the same barcode-scan-and-lookup path
  // as Inventory's Add Product, exposed here too so a supplier delivering
  // something not yet stocked doesn't require a separate trip to
  // Inventory first (and risk creating it twice under two different
  // spellings).
  const [newName, setNewName] = useState('');
  const [newBarcode, setNewBarcode] = useState('');
  const [newCategoryId, setNewCategoryId] = useState('');
  const [newSellingPrice, setNewSellingPrice] = useState('');
  const [newUnit, setNewUnit] = useState('piece');
  const [showScanner, setShowScanner] = useState(false);
  const [lookupBusy, setLookupBusy] = useState(false);
  const [lookupNote, setLookupNote] = useState<string | null>(null);

  const total = useMemo(() => lines.reduce((s, l) => s + l.buyingPrice * l.quantity, 0), [lines]);

  if (!activeBranchId) {
    return (
      <div className="fixed inset-0 z-[55] flex items-end md:items-center md:justify-center">
        <div className="absolute inset-0 bg-ink/40" onClick={onClose} />
        <div className="relative w-full md:max-w-sm bg-paper-raised rounded-t-2xl md:rounded-2xl p-5 text-center">
          <p className="text-sm font-medium mb-1">Pick a branch first</p>
          <p className="text-sm text-slate-500 mb-4">A supply/purchase is recorded against one branch's stock — select a specific branch from the header, not "All Branches".</p>
          <button onClick={onClose} className="btn-secondary w-full">Close</button>
        </div>
      </div>
    );
  }
  const branchId = activeBranchId; // narrowed, stable reference for the closures below

  function addExistingLine() {
    const product = products.find((p) => p.id === productId);
    if (!product || !qty || !price) return;
    setLines((prev) => [...prev, { productId: product.id, productName: product.name, quantity: parseFloat(qty), buyingPrice: parseFloat(price) }]);
    setProductId(''); setQty(''); setPrice('');
  }

  async function handleScannedCode(code: string) {
    setShowScanner(false);
    const trimmed = code.trim();
    const existing = products.find((p) => p.barcode === trimmed);
    if (existing) {
      // Already in this branch's inventory — switch straight to the
      // "existing product" line instead of risking a duplicate.
      setMode('existing');
      setProductId(existing.id);
      setLookupNote(`Matched existing product: ${existing.name}`);
      return;
    }
    setNewBarcode(trimmed);
    setLookupBusy(true);
    const result = await lookupBarcode(trimmed);
    setLookupBusy(false);
    if (result) {
      setNewName(result.name);
      if (result.unit) setNewUnit(result.unit);
      setLookupNote(`Auto-filled from barcode${result.brand ? ` · ${result.brand}` : ''} — check before adding.`);
    } else {
      setLookupNote('Barcode not recognized — enter the details manually.');
    }
  }

  async function addNewProductLine() {
    if (!newName.trim() || !qty || !price) return;
    setSaving(true); setError(null);
    try {
      // If someone typed/scanned a barcode that already exists (e.g. two
      // people adding it around the same time), use the real product
      // instead of creating a second one for the same item.
      const dupe = newBarcode.trim() ? products.find((p) => p.barcode === newBarcode.trim()) : undefined;
      const product = dupe ?? await createProduct({
        businessId, branchId,
        categoryId: newCategoryId || null,
        name: newName.trim(),
        barcode: newBarcode.trim() || null,
        unit: newUnit,
        buyingPrice: parseFloat(price) || 0,
        sellingPrice: parseFloat(newSellingPrice) || parseFloat(price) * 1.3 || 0,
        quantity: 0, // the purchase below is what actually adds the stock
        minStock: 5
      });
      setLines((prev) => [...prev, { productId: product.id, productName: product.name, quantity: parseFloat(qty), buyingPrice: parseFloat(price) }]);
      setQty(''); setPrice(''); setNewName(''); setNewBarcode(''); setNewCategoryId(''); setNewSellingPrice(''); setLookupNote(null);
      setMode('existing');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create the product');
    } finally {
      setSaving(false);
    }
  }

  async function submit() {
    if (lines.length === 0) return;
    setError(null); setSaving(true);
    try {
      await recordPurchase({
        businessId, branchId, supplierId, userId: userId ?? undefined,
        items: lines, amountPaid: amountPaid === '' ? 0 : parseFloat(amountPaid), paymentMethod: method,
        notes: notes.trim() || undefined
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not record supply');
    } finally { setSaving(false); }
  }

  return (
    <div className="fixed inset-0 z-[55] flex items-end md:items-center md:justify-center">
      <div className="absolute inset-0 bg-ink/40" onClick={onClose} />
      <div className="relative w-full md:max-w-md bg-paper-raised rounded-t-2xl md:rounded-2xl p-5 space-y-3 max-h-[85vh] overflow-y-auto">
        <div className="flex items-center justify-between">
          <h3 className="font-display font-semibold text-lg">Record supply</h3>
          <button onClick={onClose}><X className="w-5 h-5" /></button>
        </div>

        <div className="flex gap-2">
          <button onClick={() => setMode('existing')} className={`flex-1 text-sm font-medium py-1.5 rounded-card border ${mode === 'existing' ? 'bg-field-600 text-white border-field-600' : 'border-slate-200 text-slate-600'}`}>Existing product</button>
          <button onClick={() => setMode('new')} className={`flex-1 text-sm font-medium py-1.5 rounded-card border flex items-center justify-center gap-1.5 ${mode === 'new' ? 'bg-field-600 text-white border-field-600' : 'border-slate-200 text-slate-600'}`}>
            <PackagePlus className="w-3.5 h-3.5" /> New product
          </button>
        </div>

        {mode === 'existing' && (
          <div className="grid grid-cols-3 gap-2">
            <select className="input col-span-3" value={productId} onChange={(e) => setProductId(e.target.value)}>
              <option value="">Select product…</option>
              {products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            <input className="input tnum" placeholder="Qty" type="number" value={qty} onChange={(e) => setQty(e.target.value)} />
            <input className="input tnum" placeholder="Buying price" type="number" value={price} onChange={(e) => setPrice(e.target.value)} />
            <button onClick={addExistingLine} className="btn-secondary text-sm">Add</button>
          </div>
        )}

        {mode === 'new' && (
          <div className="space-y-2 border border-slate-200 rounded-card p-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-slate-500">Not in inventory yet</span>
              <button onClick={() => setShowScanner(true)} className="btn-secondary text-xs flex items-center gap-1 py-1">
                <ScanLine className="w-3.5 h-3.5" /> Scan barcode
              </button>
            </div>
            {lookupBusy && <p className="text-xs text-slate-400">Looking up product…</p>}
            {lookupNote && !lookupBusy && <p className="text-xs text-field-600">{lookupNote}</p>}
            <input className="input" placeholder="Product name" value={newName} onChange={(e) => setNewName(e.target.value)} />
            <div className="grid grid-cols-2 gap-2">
              <input className="input tnum" placeholder="Barcode (optional)" value={newBarcode} onChange={(e) => setNewBarcode(e.target.value)} />
              <select className="input" value={newCategoryId} onChange={(e) => setNewCategoryId(e.target.value)}>
                <option value="">No category</option>
                {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <select className="input" value={newUnit} onChange={(e) => setNewUnit(e.target.value)}>
                {['piece', 'box', 'carton', 'pack', 'dozen', 'bottle', 'kg', 'g', 'litre', 'ml', 'metre', 'set'].map((u) => <option key={u} value={u}>{u}</option>)}
              </select>
              <input className="input tnum" placeholder="Qty received" type="number" value={qty} onChange={(e) => setQty(e.target.value)} />
              <input className="input tnum" placeholder="Buying price" type="number" value={price} onChange={(e) => setPrice(e.target.value)} />
            </div>
            <input className="input tnum" placeholder="Selling price (optional — defaults to a 30% markup)" type="number" value={newSellingPrice} onChange={(e) => setNewSellingPrice(e.target.value)} />
            <button onClick={addNewProductLine} disabled={saving || !newName.trim() || !qty || !price} className="btn-primary w-full text-sm">
              {saving ? 'Creating…' : 'Create product & add line'}
            </button>
          </div>
        )}

        {lines.length > 0 && (
          <div className="border border-slate-200 rounded-card divide-y divide-slate-100">
            {lines.map((l, i) => (
              <div key={i} className="flex justify-between px-3 py-2 text-sm">
                <span>{l.productName} × {l.quantity}</span>
                <span className="tnum">{(l.buyingPrice * l.quantity).toLocaleString()}</span>
              </div>
            ))}
            <div className="flex justify-between px-3 py-2 text-sm font-semibold"><span>Total</span><span className="tnum">{total.toLocaleString()}</span></div>
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <label className="block"><span className="block text-sm font-medium text-slate-600 mb-1.5">Amount paid</span><input className="input tnum" type="number" value={amountPaid} onChange={(e) => setAmountPaid(e.target.value)} placeholder="0 (full credit)" /></label>
          <label className="block">
            <span className="block text-sm font-medium text-slate-600 mb-1.5">Method</span>
            <select className="input" value={method} onChange={(e) => setMethod(e.target.value)}>
              <option value="cash">Cash</option><option value="mpesa">M-Pesa</option><option value="bank">Bank</option><option value="credit">Credit</option>
            </select>
          </label>
        </div>
        <label className="block"><span className="block text-sm font-medium text-slate-600 mb-1.5">Notes (optional)</span>
          <textarea className="input min-h-16" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Delivery note number, condition on arrival, etc." />
        </label>

        {error && <p className="text-sm text-rust-600">{error}</p>}
        <button onClick={submit} disabled={saving || lines.length === 0} className="btn-primary w-full">{saving ? 'Saving…' : 'Record supply'}</button>
      </div>

      {showScanner && (
        <BarcodeScannerModal title="Scan supplied product" onDetected={handleScannedCode} onClose={() => setShowScanner(false)} />
      )}
    </div>
  );
}
