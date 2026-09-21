import { ReactNode, useEffect, useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { X, Pencil, PackagePlus, EyeOff, Eye, Trash2 } from 'lucide-react';
import { db, enqueueSync } from '../../lib/db';
import { useAuth } from '../../lib/auth';
import { profileHasPermission } from '../../lib/permissions';
import { recordAuditEvent } from '../../lib/audit';
import { touchActivity } from '../../lib/activity';
import type { Product } from '../../lib/types';

const DAY = 24 * 60 * 60 * 1000;

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex justify-between gap-4 py-1.5 text-sm">
      <dt className="text-slate-500 shrink-0">{label}</dt>
      <dd className="text-right break-words min-w-0">{children}</dd>
    </div>
  );
}

/**
 * Centered product details dialog (replaces the old bottom drawer).
 * Actions are gated by the same permission model the rest of the app uses;
 * the database RLS remains the real enforcement layer.
 */
export function ProductDetailModal({ product, onClose, onEdit }: { product: Product; onClose: () => void; onEdit: (p: Product) => void }) {
  const { profile, userId, branches, business } = useAuth();
  const currency = business?.currency ?? 'KES';
  const canEdit = profileHasPermission(profile, 'inventory.update');
  const canAdjust = profileHasPermission(profile, 'inventory.adjust');
  const canDelete = profileHasPermission(profile, 'inventory.delete');
  const canSeeCost = canEdit || profileHasPermission(profile, 'reports.financial');

  const [mode, setMode] = useState<'view' | 'adjust' | 'confirmDelete'>('view');
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const supplier = useLiveQuery(() => (product.supplierId ? db.suppliers.get(product.supplierId) : undefined), [product.supplierId]);
  const category = useLiveQuery(() => (product.categoryId ? db.categories.get(product.categoryId) : undefined), [product.categoryId]);
  const movements = useLiveQuery(async () => {
    const rows = await db.inventoryMovements.where('productId').equals(product.id).toArray();
    return rows.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }, [product.id]) ?? [];

  const summary = useMemo(() => {
    const since = Date.now() - 30 * DAY;
    let inQty = 0, outQty = 0, sold = 0;
    for (const m of movements) {
      if (new Date(m.createdAt).getTime() < since) continue;
      if (m.quantityChange > 0) inQty += m.quantityChange; else outQty += -m.quantityChange;
      if (m.reason === 'sale') sold += -m.quantityChange;
    }
    return { inQty, outQty, sold };
  }, [movements]);
  const adjustments = movements.filter((m) => m.reason !== 'sale').slice(0, 5);
  const recentSales = movements.filter((m) => m.reason === 'sale').slice(0, 5);

  const branchName = branches.find((b) => b.id === product.branchId)?.name;
  const stockState = product.quantity <= 0 ? 'Out of stock' : product.quantity <= product.minStock ? 'Low stock' : 'In stock';
  const stockColor = product.quantity <= 0 ? 'text-rust-600' : product.quantity <= product.minStock ? 'text-amber-600' : 'text-field-700';

  async function toggleActive() {
    const next = !product.active;
    await db.products.update(product.id, { active: next, updatedAt: new Date().toISOString() });
    await enqueueSync('products', product.id, 'update');
    await recordAuditEvent({
      businessId: product.businessId, branchId: product.branchId, userId, action: next ? 'product_enabled' : 'product_disabled',
      entityType: 'product', entityId: product.id,
      previousValue: JSON.stringify({ active: product.active }), newValue: JSON.stringify({ active: next })
    });
    touchActivity('inventory');
  }

  async function doDelete() {
    const sales = await db.saleItems.where('productId').equals(product.id).count();
    if (sales > 0) {
      setMode('view');
      setMessage('This product has sales history, so it can\'t be deleted. Hide it instead — it stays in your reports but disappears from the POS.');
      return;
    }
    await db.products.delete(product.id);
    await enqueueSync('products', product.id, 'delete');
    await recordAuditEvent({
      businessId: product.businessId, branchId: product.branchId, userId, action: 'product_deleted',
      entityType: 'product', entityId: product.id, previousValue: JSON.stringify({ name: product.name })
    });
    touchActivity('inventory');
    onClose();
  }

  return (
    <div className="fixed inset-0 z-[55] flex items-center justify-center p-3">
      <div className="absolute inset-0 bg-ink/40" onClick={onClose} aria-hidden="true" />
      <div role="dialog" aria-modal="true" aria-label={`${product.name} details`}
        className="relative w-full max-w-lg max-h-[90vh] overflow-y-auto bg-paper-raised rounded-2xl shadow-xl">
        <div className="sticky top-0 z-10 flex items-start justify-between gap-3 bg-paper-raised px-5 pt-5 pb-3 border-b border-slate-100">
          <div className="min-w-0">
            <h3 className="font-display font-semibold text-lg break-words">{product.name}</h3>
            <div className="flex items-center gap-2 text-xs mt-0.5 flex-wrap">
              <span className={`font-medium ${stockColor}`}>{stockState}</span>
              {!product.active && <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-500 font-medium">Hidden from POS</span>}
            </div>
          </div>
          <button onClick={onClose} aria-label="Close" className="p-2 -m-2 shrink-0"><X className="w-5 h-5" /></button>
        </div>

        <div className="p-5 space-y-5">
          {message && <p className="text-sm bg-amber-100 text-amber-600 rounded-lg p-3">{message}</p>}

          {product.imageUrl && (
            <img src={product.imageUrl} alt="" loading="lazy" className="w-full max-h-48 object-contain rounded-lg bg-slate-50" />
          )}

          <div className="grid grid-cols-3 gap-2 text-sm">
            <div className="card p-3"><div className="text-xs text-slate-500">Stock</div><div className="tnum font-semibold">{product.quantity} {product.unit}</div></div>
            <div className="card p-3"><div className="text-xs text-slate-500">Selling</div><div className="tnum font-semibold">{currency} {product.sellingPrice.toLocaleString()}</div></div>
            {canSeeCost
              ? <div className="card p-3"><div className="text-xs text-slate-500">Cost</div><div className="tnum font-semibold">{currency} {product.buyingPrice.toLocaleString()}</div></div>
              : <div className="card p-3"><div className="text-xs text-slate-500">Low-stock at</div><div className="tnum font-semibold">{product.minStock}</div></div>}
          </div>

          <dl className="divide-y divide-slate-100">
            <Row label="SKU">{product.sku ?? '—'}</Row>
            {product.barcode && <Row label="Barcode"><span className="tnum">{product.barcode}</span></Row>}
            <Row label="Category">{category?.name ?? '—'}</Row>
            {product.brand && <Row label="Brand">{product.brand}</Row>}
            <Row label="Unit">{product.unit}</Row>
            {canSeeCost && <Row label="Low-stock threshold"><span className="tnum">{product.minStock}</span></Row>}
            <Row label="Supplier">{supplier?.name ?? '—'}</Row>
            {branchName && <Row label="Branch">{branchName}</Row>}
            <Row label="Status">{product.active ? 'Active' : 'Hidden'}</Row>
            <Row label="Created">{new Date(product.createdAt).toLocaleString()}</Row>
            <Row label="Last updated">{new Date(product.updatedAt).toLocaleString()}</Row>
          </dl>

          <section>
            <h4 className="text-sm font-medium mb-2">Last 30 days</h4>
            <div className="grid grid-cols-3 gap-2 text-center text-sm">
              <div className="card p-2.5"><div className="tnum font-semibold text-field-700">+{summary.inQty}</div><div className="text-xs text-slate-500">In</div></div>
              <div className="card p-2.5"><div className="tnum font-semibold text-rust-600">−{summary.outQty}</div><div className="text-xs text-slate-500">Out</div></div>
              <div className="card p-2.5"><div className="tnum font-semibold">{summary.sold}</div><div className="text-xs text-slate-500">Sold</div></div>
            </div>
          </section>

          <MovementList title="Recent stock adjustments" rows={adjustments} empty="No adjustments recorded." />
          <MovementList title="Recent sales" rows={recentSales} empty="No sales recorded." />

          {mode === 'adjust' && (
            <AdjustForm product={product} userId={userId} onDone={() => setMode('view')} />
          )}
          {mode === 'confirmDelete' && (
            <div className="rounded-xl border border-rust-600/30 bg-rust-50 p-4 space-y-3">
              <p className="text-sm">Delete <strong>{product.name}</strong>? This can't be undone.</p>
              <div className="flex gap-2">
                <button onClick={() => setMode('view')} className="btn-secondary flex-1">Cancel</button>
                <button onClick={doDelete} className="btn-primary flex-1 !bg-rust-600">Delete</button>
              </div>
            </div>
          )}

          {mode === 'view' && (canEdit || canAdjust || canDelete) && (
            <div className="grid grid-cols-2 gap-2 pt-1">
              {canEdit && <button onClick={() => onEdit(product)} className="btn-primary inline-flex items-center justify-center gap-1.5"><Pencil className="w-4 h-4" /> Edit</button>}
              {canAdjust && <button onClick={() => { setMessage(null); setMode('adjust'); }} className="btn-secondary inline-flex items-center justify-center gap-1.5"><PackagePlus className="w-4 h-4" /> Adjust stock</button>}
              {canEdit && (
                <button onClick={toggleActive} className="btn-secondary inline-flex items-center justify-center gap-1.5">
                  {product.active ? <><EyeOff className="w-4 h-4" /> Hide</> : <><Eye className="w-4 h-4" /> Show</>}
                </button>
              )}
              {canDelete && <button onClick={() => { setMessage(null); setMode('confirmDelete'); }} className="btn-secondary inline-flex items-center justify-center gap-1.5 text-rust-600"><Trash2 className="w-4 h-4" /> Delete</button>}
            </div>
          )}
          <button onClick={onClose} className="btn-secondary w-full">Close</button>
        </div>
      </div>
    </div>
  );
}

function MovementList({ title, rows, empty }: { title: string; rows: { id: string; reason: string; quantityChange: number; resultingQuantity: number; createdAt: string }[]; empty: string }) {
  return (
    <section>
      <h4 className="text-sm font-medium mb-1.5">{title}</h4>
      {rows.length === 0 ? <p className="text-xs text-slate-400">{empty}</p> : (
        <ul className="divide-y divide-slate-100">
          {rows.map((m) => (
            <li key={m.id} className="flex items-center justify-between gap-3 py-2 text-xs">
              <div>
                <div className="capitalize text-sm">{m.reason}</div>
                <div className="text-slate-400 tnum">{new Date(m.createdAt).toLocaleString()}</div>
              </div>
              <div className={`tnum text-sm ${m.quantityChange >= 0 ? 'text-field-600' : 'text-rust-600'}`}>
                {m.quantityChange >= 0 ? '+' : ''}{m.quantityChange} → {m.resultingQuantity}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function AdjustForm({ product, userId, onDone }: { product: Product; userId: string | null; onDone: () => void }) {
  const [type, setType] = useState<'add' | 'remove' | 'set'>('add');
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('adjustment');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function submit() {
    setError(null);
    const n = parseFloat(amount);
    if (Number.isNaN(n) || n < 0) { setError('Enter a valid quantity'); return; }
    const next = type === 'add' ? product.quantity + n : type === 'remove' ? product.quantity - n : n;
    if (next < 0) { setError(`Can't remove more than the ${product.quantity} in stock`); return; }
    if (next === product.quantity) { setError('That doesn\'t change the stock level'); return; }
    setSaving(true);
    try {
      await db.products.update(product.id, { quantity: next, updatedAt: new Date().toISOString() });
      await enqueueSync('products', product.id, 'update');
      await recordAuditEvent({
        businessId: product.businessId, branchId: product.branchId, userId, action: 'stock_adjusted',
        entityType: 'product', entityId: product.id,
        previousValue: JSON.stringify({ quantity: product.quantity }),
        newValue: JSON.stringify({ quantity: next, reason })
      });
      touchActivity('inventory');
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not adjust stock');
    } finally { setSaving(false); }
  }

  return (
    <div className="rounded-xl border border-slate-200 p-4 space-y-3">
      <h4 className="text-sm font-medium">Adjust stock <span className="text-slate-400 font-normal">(now {product.quantity} {product.unit})</span></h4>
      <div className="grid grid-cols-3 gap-1 p-1 bg-slate-100 rounded-xl">
        {([['add', 'Add'], ['remove', 'Remove'], ['set', 'Set to']] as const).map(([k, l]) => (
          <button key={k} onClick={() => setType(k)} className={`text-sm font-medium py-2 rounded-lg ${type === k ? 'bg-paper-raised shadow-sm' : 'text-slate-500'}`}>{l}</button>
        ))}
      </div>
      <input className="input tnum" type="number" inputMode="decimal" min="0" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="Quantity" autoFocus />
      <select className="input" value={reason} onChange={(e) => setReason(e.target.value)}>
        <option value="adjustment">Stock count adjustment</option>
        <option value="supply">New supply received</option>
        <option value="damage">Damaged</option>
        <option value="expiry">Expired</option>
        <option value="return">Customer return</option>
        <option value="correction">Correction</option>
      </select>
      {error && <p className="text-sm text-rust-600">{error}</p>}
      <div className="flex gap-2">
        <button onClick={onDone} className="btn-secondary flex-1">Cancel</button>
        <button onClick={submit} disabled={saving || !amount} className="btn-primary flex-1">{saving ? 'Saving…' : 'Save'}</button>
      </div>
    </div>
  );
}
