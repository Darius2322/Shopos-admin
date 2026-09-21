import { useEffect, useMemo, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Plus, X, Search, ScanLine, PackageX, Loader2, ChevronRight, Sparkles } from 'lucide-react';
import { db, newRecordBase, enqueueSync } from '../../lib/db';
import { useAuth } from '../../lib/auth';
import { BarcodeScannerModal } from '../../components/scanner/BarcodeScannerModal';
import { lookupBarcodeDetailed, BarcodeLookupResult } from '../../lib/barcodeLookup';
import { createProduct } from '../../lib/products';
import { seedStarterProducts } from '../../lib/seedProducts';
import { recordAuditEvent } from '../../lib/audit';
import type { Product } from '../../lib/types';
import { ProductDetailModal } from './ProductDetailModal';

const FILTERS = ['all', 'low', 'out'] as const;

export function InventoryList() {
  const { business, branches, activeBranchId, canViewAllBranches, refresh, syncingInitialData } = useAuth();
  const currency = business?.currency ?? 'KES';
  const viewingAll = activeBranchId === null && canViewAllBranches;
  const products = useLiveQuery(() => {
    if (!business) return [];
    if (viewingAll) return db.products.where('businessId').equals(business.id).toArray();
    if (!activeBranchId) return [];
    return db.products.where({ businessId: business.id, branchId: activeBranchId }).toArray();
  }, [business?.id, activeBranchId, viewingAll]) ?? [];
  const branchName = (branchId: string) => branches.find((b) => b.id === branchId)?.name ?? 'Unknown branch';

  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<typeof FILTERS[number]>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);
  const [viewingId, setViewingId] = useState<string | null>(null);
  const viewingDetail = products.find((p) => p.id === viewingId) ?? null;
  const [showScanner, setShowScanner] = useState(false);
  const [lookupNote, setLookupNote] = useState<string | null>(null);
  const [notFoundBarcode, setNotFoundBarcode] = useState<string | null>(null);
  const [lookupBusy, setLookupBusy] = useState(false);
  const [lookupResult, setLookupResult] = useState<BarcodeLookupResult | null>(null);
  const [seeding, setSeeding] = useState(false);

  async function handleSeed() {
    if (!business || !activeBranchId) return;
    setSeeding(true);
    try {
      const added = await seedStarterProducts(business.id, activeBranchId);
      alert(added > 0 ? `Added ${added} starter products.` : 'Starter products are already in your inventory.');
    } finally { setSeeding(false); }
  }

  async function handleScannedCode(code: string) {
    setShowScanner(false);
    const trimmed = code.trim();
    const match = products.find((p) => p.barcode && p.barcode === trimmed);
    if (match) {
      setViewingId(match.id);
      return;
    }
    setLookupBusy(true);
    const outcome = await lookupBarcodeDetailed(trimmed, business?.id);
    setLookupBusy(false);
    setLookupNote(outcome.status === 'offline' ? 'Product information unavailable offline. The barcode is kept — enter the details manually.'
      : outcome.status === 'unavailable' ? 'Could not reach the product database. The barcode is kept — enter the details manually.' : null);
    if (outcome.status === 'found') {
      // A real match (cache or provider) — go straight to a pre-filled Add product form.
      setLookupResult(outcome.result);
      setNotFoundBarcode(trimmed);
      setAdding(true);
    } else {
      setLookupResult(null);
      setNotFoundBarcode(trimmed);
    }
  }

  const categories = useLiveQuery(
    () => (business ? db.categories.where({ businessId: business.id, archived: false as any }).toArray() : []),
    [business?.id]
  ) ?? [];

  const filtered = useMemo(() => {
    let list = products;
    if (filter === 'low') list = list.filter((p) => p.quantity > 0 && p.quantity <= p.minStock);
    if (filter === 'out') list = list.filter((p) => p.quantity <= 0);
    if (categoryFilter !== 'all') list = list.filter((p) => (categoryFilter === 'none' ? !p.categoryId : p.categoryId === categoryFilter));
    const q = query.trim().toLowerCase();
    if (q) list = list.filter((p) => p.name.toLowerCase().includes(q) || p.sku?.toLowerCase().includes(q));
    return list;
  }, [products, filter, categoryFilter, query]);

  if (!activeBranchId && !viewingAll) {
    return (
      <div className="p-6 max-w-md mx-auto text-center">
        {branches.length === 0 ? (
          <>
            <p className="text-sm font-medium mb-1">No branch found yet</p>
            <p className="text-sm text-slate-500 mb-4">
              {syncingInitialData ? 'Syncing your business data…' : "This can happen if your account hasn't finished syncing."}
            </p>
            <button onClick={() => refresh()} className="btn-secondary text-sm">Refresh</button>
          </>
        ) : (
          <>
            <p className="text-sm font-medium mb-1">No branch selected</p>
            <p className="text-sm text-slate-500">Tap the branch name in the header to choose one.</p>
          </>
        )}
      </div>
    );
  }

  return (
    <div className="p-4 md:p-8 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-4">
        <div className="min-w-0">
          <h1 className="font-display text-2xl font-semibold">Inventory</h1>
          <p className="text-sm text-slate-500" aria-live="polite">
            <span className="font-medium text-ink tnum">{products.length}</span> product{products.length === 1 ? '' : 's'}
            {filtered.length !== products.length && <> · <span className="tnum">{filtered.length}</span> shown</>}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {!viewingAll && (
            <>
              {products.length === 0 && (
                <button onClick={handleSeed} disabled={seeding} className="btn-secondary flex items-center gap-1.5 text-sm" aria-label="Seed starter products">
                  <Sparkles className="w-4 h-4" /> <span className="hidden sm:inline">{seeding ? 'Adding…' : 'Seed starter products'}</span>
                </button>
              )}
              <button onClick={() => setShowScanner(true)} className="btn-secondary flex items-center gap-1.5 text-sm" aria-label="Scan barcode">
                <ScanLine className="w-4 h-4" /> <span className="hidden sm:inline">Scan</span>
              </button>
              <button onClick={() => setAdding(true)} className="btn-primary flex items-center gap-1.5 text-sm">
                <Plus className="w-4 h-4" /> Add product
              </button>
            </>
          )}
        </div>
      </div>

      {products.length > 0 && (
        <div className="grid grid-cols-3 gap-2 mb-4 text-center">
          <div className="card p-2.5"><div className="tnum font-semibold text-lg">{products.length}</div><div className="text-[11px] text-slate-500">Products</div></div>
          <div className="card p-2.5"><div className="tnum font-semibold text-lg text-amber-600">{products.filter((p) => p.quantity > 0 && p.quantity <= p.minStock).length}</div><div className="text-[11px] text-slate-500">Low stock</div></div>
          <div className="card p-2.5"><div className="tnum font-semibold text-lg text-rust-600">{products.filter((p) => p.quantity <= 0).length}</div><div className="text-[11px] text-slate-500">Out of stock</div></div>
        </div>
      )}

      {viewingAll && (
        <p className="text-xs text-slate-500 -mt-2 mb-3">Viewing all branches · select a specific branch to add or scan products.</p>
      )}

      <div className="relative mb-3">
        <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
        <input className="input pl-9" placeholder="Search products…" value={query} onChange={(e) => setQuery(e.target.value)} />
      </div>
      <div className="flex gap-1.5 mb-3 flex-wrap items-center">
        {FILTERS.map((f) => (
          <button key={f} onClick={() => setFilter(f)} className={`text-xs font-medium px-3 py-1.5 rounded-full ${filter === f ? 'bg-field-600 text-white' : 'bg-slate-100 text-slate-600'}`}>
            {f === 'all' ? 'All' : f === 'low' ? 'Low stock' : 'Out of stock'}
          </button>
        ))}
        {categories.length > 0 && (
          <select className="input py-1.5 text-xs w-auto" value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)}>
            <option value="all">All categories</option>
            <option value="none">No category</option>
            {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        )}
        {(filter !== 'all' || categoryFilter !== 'all' || query) && (
          <button
            onClick={() => { setFilter('all'); setCategoryFilter('all'); setQuery(''); }}
            className="text-xs font-medium px-3 py-1.5 rounded-full text-slate-500 hover:bg-slate-100"
          >
            Reset
          </button>
        )}
      </div>

      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-500 text-xs">
            <tr>
              <th className="text-left font-medium px-4 py-2.5">Product</th>
              <th className="text-right font-medium px-4 py-2.5">Stock</th>
              <th className="text-right font-medium px-4 py-2.5 hidden sm:table-cell">Price</th>
              <th className="px-2 py-2.5"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filtered.map((p) => (
              <tr key={p.id} onClick={() => setViewingId(p.id)} className="cursor-pointer hover:bg-slate-50 active:bg-slate-100">
                <td className="px-4 py-3.5 min-w-0">
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); setViewingId(p.id); }}
                    className="block w-full text-left rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-field-600"
                    aria-label={`View details for ${p.name}`}
                  >
                    <span className="block font-medium truncate max-w-[200px] sm:max-w-[320px]">{p.name}</span>
                    <span className="block text-xs text-slate-500 truncate max-w-[200px] sm:max-w-[320px]">
                      {p.sku ?? '—'}{p.barcode ? ` · ${p.barcode}` : ''}{viewingAll ? ` · ${branchName(p.branchId)}` : ''}
                    </span>
                  </button>
                </td>
                <td className={`px-4 py-3.5 text-right tnum whitespace-nowrap ${p.quantity <= 0 ? 'text-rust-600' : p.quantity <= p.minStock ? 'text-amber-600' : ''}`}>
                  {p.quantity} {p.unit}
                </td>
                <td className="px-4 py-3.5 text-right tnum hidden sm:table-cell whitespace-nowrap">{currency} {p.sellingPrice.toLocaleString()}</td>
                <td className="pr-3 py-3.5 text-right text-slate-300" aria-hidden="true">
                  <ChevronRight className="w-4 h-4 inline" />
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr><td colSpan={4} className="text-center text-sm text-slate-500 py-10">
                {products.length === 0
                  ? (viewingAll
                      ? 'No products yet.'
                      : <>No products yet.<br /><button onClick={() => setAdding(true)} className="text-field-600 font-medium mt-1">Add your first product</button></>)
                  : 'No products match this search or filter.'}
              </td></tr>
            )}
          </tbody>
        </table>
      </div>

      {adding && business && activeBranchId && (
        <AddProductModal
          businessId={business.id}
          branchId={activeBranchId}
          initialBarcode={notFoundBarcode ?? undefined}
          initialLookup={lookupResult ?? undefined}
          onClose={() => { setAdding(false); setNotFoundBarcode(null); setLookupResult(null); }}
        />
      )}

      {editing && (
        <EditProductModal product={editing} onClose={() => setEditing(null)} />
      )}
      {viewingDetail && !editing && (
        <ProductDetailModal
          product={viewingDetail}
          onClose={() => setViewingId(null)}
          onEdit={(p) => { setEditing(p); }}
        />
      )}

      {showScanner && (
        <BarcodeScannerModal title="Scan product barcode" onDetected={handleScannedCode} onClose={() => setShowScanner(false)} />
      )}

      {lookupBusy && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center">
          <div className="absolute inset-0 bg-ink/40" />
          <div className="relative bg-paper-raised rounded-2xl p-6 flex flex-col items-center gap-2">
            <Loader2 className="w-6 h-6 animate-spin text-field-600" />
            <p className="text-sm text-slate-500">Looking up product…</p>
          </div>
        </div>
      )}

      {notFoundBarcode && !adding && !lookupBusy && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-3">
          <div className="absolute inset-0 bg-ink/40" onClick={() => setNotFoundBarcode(null)} />
          <div className="relative w-full max-w-sm bg-paper-raised rounded-2xl p-5 text-center shadow-xl">
            <PackageX className="w-9 h-9 text-slate-400 mx-auto mb-2" />
            <p className="font-medium mb-1">{lookupNote ? 'Product information unavailable' : 'Product not found'}</p>
            <p className="text-sm text-slate-500 mb-1 tnum">Barcode {notFoundBarcode}</p>
            <p className="text-xs text-slate-400 mb-4">{lookupNote ?? "Not in this shop's inventory or the product database — you can still add it manually."}</p>
            <div className="flex gap-2">
              <button onClick={() => setNotFoundBarcode(null)} className="btn-secondary flex-1">Cancel</button>
              <button onClick={() => setAdding(true)} className="btn-primary flex-1">Create product</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function AddProductModal({ businessId, branchId, initialBarcode, initialLookup, onClose }: { businessId: string; branchId: string; initialBarcode?: string; initialLookup?: BarcodeLookupResult; onClose: () => void }) {
  const { userId } = useAuth();
  const categories = useLiveQuery(
    () => db.categories.where({ businessId, archived: false as any }).toArray(),
    [businessId]
  ) ?? [];
  const [name, setName] = useState(initialLookup?.name ?? '');
  const [brand, setBrand] = useState(initialLookup?.brand ?? '');
  const [sku, setSku] = useState('');
  const [barcode, setBarcode] = useState(initialBarcode ?? '');
  const [categoryId, setCategoryId] = useState('');
  const [sellingPrice, setSellingPrice] = useState('');
  const [buyingPrice, setBuyingPrice] = useState('');
  const [quantity, setQuantity] = useState('');
  const [minStock, setMinStock] = useState('5');
  const [unit, setUnit] = useState(initialLookup?.unit ?? 'piece');
  const [saving, setSaving] = useState(false);
  const [showScan, setShowScan] = useState(false);
  const [lookupState, setLookupState] = useState<string | null>(null);
  const [filledFrom, setFilledFrom] = useState<BarcodeLookupResult | null>(initialLookup ?? null);
  // Fields the person has typed into themselves: a later lookup must never overwrite these.
  const dirty = useRef<Set<string>>(new Set());
  const lastLooked = useRef<string | null>(initialLookup ? (initialBarcode ?? null) : null);
  const touch = (field: string) => dirty.current.add(field);

  // Matches a looked-up category name against this business's own categories (never creates one).
  function matchCategory(cat?: string): string {
    if (!cat) return '';
    const c = cat.toLowerCase();
    return categories.find((k) => c.includes(k.name.toLowerCase()) || k.name.toLowerCase().includes(c))?.id ?? '';
  }

  function applyLookup(r: BarcodeLookupResult) {
    if (!dirty.current.has('name')) setName(r.name);
    if (!dirty.current.has('brand') && r.brand) setBrand(r.brand);
    if (!dirty.current.has('unit') && r.unit) setUnit(r.unit);
    if (!dirty.current.has('category')) { const id = matchCategory(r.category); if (id) setCategoryId(id); }
    setFilledFrom(r);
  }

  // Scan/type a barcode inside the form -> local check, cache, then provider. Offline-safe.
  useEffect(() => {
    const code = barcode.trim();
    if (code.length < 8 || code === lastLooked.current) return;
    const t = setTimeout(async () => {
      lastLooked.current = code;
      setLookupState('Looking up product…');
      const out = await lookupBarcodeDetailed(code, businessId);
      if (out.status === 'found') { applyLookup(out.result); setLookupState(null); }
      else if (out.status === 'exists') setLookupState(`This barcode is already in your inventory as “${out.productName}”.`);
      else if (out.status === 'offline') setLookupState('Product information unavailable offline. The barcode is kept — enter the details below.');
      else if (out.status === 'unavailable') setLookupState('Could not reach the product database. Enter the details below.');
      else setLookupState('No product information found for this barcode. Enter the details below.');
    }, 500);
    return () => clearTimeout(t);
  }, [barcode]);

  async function submit() {
    if (!name.trim() || !sellingPrice) return;
    setSaving(true);
    try {
      await createProduct({
        businessId, branchId,
        categoryId: categoryId || null,
        name: name.trim(), sku: sku || null, barcode: barcode.trim() || null, brand: brand.trim() || null,
        unit,
        buyingPrice: parseFloat(buyingPrice) || 0,
        sellingPrice: parseFloat(sellingPrice) || 0,
        quantity: parseFloat(quantity) || 0,
        minStock: parseFloat(minStock) || 0
      });
      await recordAuditEvent({ businessId, branchId, userId, action: 'product_created', entityType: 'product', newValue: JSON.stringify({ name: name.trim(), sellingPrice: parseFloat(sellingPrice) || 0 }) });
      onClose();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[55] flex items-center justify-center p-3">
      <div className="absolute inset-0 bg-ink/40" onClick={onClose} />
      <div className="relative w-full max-w-sm bg-paper-raised rounded-2xl p-5 space-y-3 max-h-[90vh] overflow-y-auto shadow-xl">
        <div className="flex items-center justify-between">
          <h3 className="font-display font-semibold text-lg">Add product</h3>
          <button onClick={onClose}><X className="w-5 h-5" /></button>
        </div>
        {filledFrom && (
          <p className="text-xs text-field-600 bg-field-600/10 rounded-card px-3 py-2">
            Auto-filled from barcode{filledFrom.brand ? ` · ${filledFrom.brand}` : ''}{filledFrom.size ? ` · ${filledFrom.size}` : ''}{filledFrom.source === 'cache' ? ' (saved on this device)' : ''} — check the details before saving.
          </p>
        )}
        {lookupState && <p className="text-xs text-slate-500 bg-slate-100 rounded-card px-3 py-2">{lookupState}</p>}
        <label className="block"><span className="block text-sm font-medium text-slate-600 mb-1.5">Name</span><input className="input" value={name} onChange={(e) => { touch('name'); setName(e.target.value); }} autoFocus /></label>
        <label className="block"><span className="block text-sm font-medium text-slate-600 mb-1.5">Brand</span><input className="input" value={brand} onChange={(e) => { touch('brand'); setBrand(e.target.value); }} /></label>
        <div className="grid grid-cols-2 gap-3">
          <label className="block"><span className="block text-sm font-medium text-slate-600 mb-1.5">SKU</span><input className="input" value={sku} onChange={(e) => setSku(e.target.value)} /></label>
          <div className="block">
            <span className="block text-sm font-medium text-slate-600 mb-1.5">Barcode</span>
            <div className="flex gap-1.5">
              <input className="input tnum min-w-0" inputMode="numeric" value={barcode} onChange={(e) => setBarcode(e.target.value)} />
              <button type="button" onClick={() => setShowScan(true)} aria-label="Scan barcode" className="btn-secondary !px-3 shrink-0"><ScanLine className="w-4 h-4" /></button>
            </div>
          </div>
        </div>
        <label className="block">
          <span className="block text-sm font-medium text-slate-600 mb-1.5">Category</span>
          <select className="input" value={categoryId} onChange={(e) => { touch('category'); setCategoryId(e.target.value); }}>
            <option value="">No category</option>
            {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="block"><span className="block text-sm font-medium text-slate-600 mb-1.5">Selling price</span><input className="input tnum" type="number" value={sellingPrice} onChange={(e) => setSellingPrice(e.target.value)} /></label>
          <label className="block"><span className="block text-sm font-medium text-slate-600 mb-1.5">Buying price</span><input className="input tnum" type="number" value={buyingPrice} onChange={(e) => setBuyingPrice(e.target.value)} /></label>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <label className="block"><span className="block text-sm font-medium text-slate-600 mb-1.5">Quantity</span><input className="input tnum" type="number" value={quantity} onChange={(e) => setQuantity(e.target.value)} /></label>
          <label className="block"><span className="block text-sm font-medium text-slate-600 mb-1.5">Min stock</span><input className="input tnum" type="number" value={minStock} onChange={(e) => setMinStock(e.target.value)} /></label>
        </div>
        <label className="block">
          <span className="block text-sm font-medium text-slate-600 mb-1.5">Unit</span>
          <select className="input" value={unit} onChange={(e) => { touch('unit'); setUnit(e.target.value); }}>
            {['piece', 'box', 'carton', 'pack', 'dozen', 'bottle', 'kg', 'g', 'litre', 'ml', 'metre', 'set'].map((u) => <option key={u} value={u}>{u}</option>)}
          </select>
        </label>
        <button onClick={submit} disabled={saving || !name.trim() || !sellingPrice} className="btn-primary w-full">{saving ? 'Saving…' : 'Add product'}</button>
      </div>
      {showScan && <BarcodeScannerModal title="Scan product barcode" onDetected={(c) => { setShowScan(false); setBarcode(c.trim()); }} onClose={() => setShowScan(false)} />}
    </div>
  );
}

function EditProductModal({ product, onClose }: { product: Product; onClose: () => void }) {
  const { userId } = useAuth();
  const categories = useLiveQuery(
    () => db.categories.where({ businessId: product.businessId, archived: false as any }).toArray(),
    [product.businessId]
  ) ?? [];
  const [name, setName] = useState(product.name);
  const [sku, setSku] = useState(product.sku ?? '');
  const [barcode, setBarcode] = useState(product.barcode ?? '');
  const [categoryId, setCategoryId] = useState(product.categoryId ?? '');
  const [sellingPrice, setSellingPrice] = useState(String(product.sellingPrice));
  const [buyingPrice, setBuyingPrice] = useState(String(product.buyingPrice));
  const [quantity, setQuantity] = useState(String(product.quantity));
  const [minStock, setMinStock] = useState(String(product.minStock));
  const [unit, setUnit] = useState(product.unit);
  const [active, setActive] = useState(product.active);
  const [saving, setSaving] = useState(false);

  async function submit() {
    if (!name.trim() || !sellingPrice) return;
    setSaving(true);
    try {
      const updates = {
        name: name.trim(), sku: sku || null, barcode: barcode.trim() || null,
        categoryId: categoryId || null,
        sellingPrice: parseFloat(sellingPrice) || 0,
        buyingPrice: parseFloat(buyingPrice) || 0,
        quantity: parseFloat(quantity) || 0,
        minStock: parseFloat(minStock) || 0,
        reorderLevel: parseFloat(minStock) || 0,
        unit, active,
        updatedAt: new Date().toISOString()
      };
      await db.products.update(product.id, updates);
      await enqueueSync('products', product.id, 'update');
      await recordAuditEvent({
        businessId: product.businessId, branchId: product.branchId, userId, action: 'product_updated', entityType: 'product', entityId: product.id,
        previousValue: JSON.stringify({ name: product.name, sellingPrice: product.sellingPrice, quantity: product.quantity, active: product.active }),
        newValue: JSON.stringify({ name: updates.name, sellingPrice: updates.sellingPrice, quantity: updates.quantity, active: updates.active })
      });
      onClose();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[55] flex items-center justify-center p-3">
      <div className="absolute inset-0 bg-ink/40" onClick={onClose} />
      <div className="relative w-full max-w-sm bg-paper-raised rounded-2xl p-5 space-y-3 max-h-[90vh] overflow-y-auto shadow-xl">
        <div className="flex items-center justify-between">
          <h3 className="font-display font-semibold text-lg">Edit product</h3>
          <button onClick={onClose}><X className="w-5 h-5" /></button>
        </div>
        <label className="block"><span className="block text-sm font-medium text-slate-600 mb-1.5">Name</span><input className="input" value={name} onChange={(e) => setName(e.target.value)} autoFocus /></label>
        <div className="grid grid-cols-2 gap-3">
          <label className="block"><span className="block text-sm font-medium text-slate-600 mb-1.5">SKU</span><input className="input" value={sku} onChange={(e) => setSku(e.target.value)} /></label>
          <label className="block"><span className="block text-sm font-medium text-slate-600 mb-1.5">Barcode</span><input className="input tnum" value={barcode} onChange={(e) => setBarcode(e.target.value)} /></label>
        </div>
        <label className="block">
          <span className="block text-sm font-medium text-slate-600 mb-1.5">Category</span>
          <select className="input" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
            <option value="">No category</option>
            {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="block"><span className="block text-sm font-medium text-slate-600 mb-1.5">Selling price</span><input className="input tnum" type="number" value={sellingPrice} onChange={(e) => setSellingPrice(e.target.value)} /></label>
          <label className="block"><span className="block text-sm font-medium text-slate-600 mb-1.5">Buying price</span><input className="input tnum" type="number" value={buyingPrice} onChange={(e) => setBuyingPrice(e.target.value)} /></label>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <label className="block"><span className="block text-sm font-medium text-slate-600 mb-1.5">Quantity</span><input className="input tnum" type="number" value={quantity} onChange={(e) => setQuantity(e.target.value)} /></label>
          <label className="block"><span className="block text-sm font-medium text-slate-600 mb-1.5">Min stock</span><input className="input tnum" type="number" value={minStock} onChange={(e) => setMinStock(e.target.value)} /></label>
        </div>
        <label className="block">
          <span className="block text-sm font-medium text-slate-600 mb-1.5">Unit</span>
          <select className="input" value={unit} onChange={(e) => setUnit(e.target.value)}>
            {['piece', 'box', 'carton', 'pack', 'dozen', 'bottle', 'kg', 'g', 'litre', 'ml', 'metre', 'set'].map((u) => <option key={u} value={u}>{u}</option>)}
          </select>
        </label>
        <label className="flex items-center gap-2 text-sm text-slate-600">
          <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} /> Active (visible in POS)
        </label>

        <button onClick={submit} disabled={saving || !name.trim() || !sellingPrice} className="btn-primary w-full">{saving ? 'Saving…' : 'Save changes'}</button>
      </div>
    </div>
  );
}
