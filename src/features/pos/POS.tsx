import { useEffect, useMemo, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Search, Plus, Minus, Trash2, UserPlus, Calculator as CalculatorIcon, PlayCircle, PauseCircle, ScanLine } from 'lucide-react';
import { db } from '../../lib/db';
import { useAuth } from '../../lib/auth';
import { completeSale, customerOutstandingDebt } from '../../lib/sales';
import { linkPaymentToSale } from '../../lib/payments/store';
import { ReceiptModal } from './ReceiptModal';
import { CalculatorModal } from './CalculatorModal';
import { PosActionsMenu } from './PosActionsMenu';
import { BarcodeScannerModal } from '../../components/scanner/BarcodeScannerModal';
import { CUSTOMER_DISPLAY_CHANNEL, CustomerDisplayMessage } from './CustomerDisplay';
import type { CartLine, PaymentMethod } from '../../lib/types';

interface HeldSale {
  id: string;
  label: string;
  cart: CartLine[];
  customerId: string | null;
  method: PaymentMethod;
}

const METHODS: { key: PaymentMethod; label: string }[] = [
  { key: 'cash', label: 'Cash' },
  { key: 'mpesa', label: 'M-Pesa' },
  { key: 'card', label: 'Card' },
  { key: 'bank', label: 'Bank' },
  { key: 'credit', label: 'Credit / Debt' },
  { key: 'other', label: 'Other' }
];

function money(n: number, currency: string) {
  return `${currency} ${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function POS() {
  const { business, branches, activeBranchId, canViewAllBranches, profile, userId, refresh, syncingInitialData, setActiveBranch } = useAuth();
  // Deliberately does NOT fall back to branches[0] when activeBranchId is
  // null — that would silently ring up sales against a branch the owner
  // didn't actually pick while viewing "All Branches". POS always needs
  // one concrete branch; the guard below prompts for it instead.
  const branch = branches.find((b) => b.id === activeBranchId);
  const viewingAll = activeBranchId === null && canViewAllBranches;
  const currency = business?.currency ?? 'KES';

  const products = useLiveQuery(
    () => (branch ? db.products.where({ businessId: business!.id, branchId: branch.id }).toArray() : []),
    [branch?.id]
  ) ?? [];
  const [mpesaTxId, setMpesaTxId] = useState<string | null>(null);
  // Received, not-yet-used M-Pesa payments for THIS business (local store; works offline).
  const mpesaTxs = useLiveQuery(async () => {
    if (!business?.id) return [];
    const rows = await db.paymentTransactions.where('businessId').equals(business.id).toArray();
    return rows.filter((t) => t.status === 'received' && !t.localFlag && !t.pendingMatchSaleId)
      .sort((a, b) => b.receivedAt.localeCompare(a.receivedAt)).slice(0, 15);
  }, [business?.id]) ?? [];
  const mpesaTx = mpesaTxs.find((t) => t.id === mpesaTxId) ?? null;
  const customers = useLiveQuery(
    () => (business ? db.customers.where('businessId').equals(business.id).toArray() : []),
    [business?.id]
  ) ?? [];

  const [query, setQuery] = useState('');
  const [showCalculator, setShowCalculator] = useState(false);
  const [showScanner, setShowScanner] = useState(false);
  const [cart, setCart] = useState<CartLine[]>([]);
  const [customerId, setCustomerId] = useState<string | null>(null);
  const [method, setMethod] = useState<PaymentMethod>('cash');
  const [amountText, setAmountText] = useState('');
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [receiptSaleId, setReceiptSaleId] = useState<string | null>(null);
  const [receiptPoints, setReceiptPoints] = useState(0);
  const [debtWarning, setDebtWarning] = useState<{ overBy: number } | null>(null);
  const [heldSales, setHeldSales] = useState<HeldSale[]>([]);
  const [showHeldList, setShowHeldList] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const customerSelectRef = useRef<HTMLSelectElement>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return products.slice(0, 30);
    return products.filter(
      (p) => p.name.toLowerCase().includes(q) || p.sku?.toLowerCase().includes(q) || p.barcode?.toLowerCase().includes(q)
    ).slice(0, 30);
  }, [products, query]);

  const subtotal = cart.reduce((s, l) => s + l.product.sellingPrice * l.quantity - l.discount, 0);
  const tax = business?.taxRate ? +(subtotal * (business.taxRate / 100)).toFixed(2) : 0;
  const total = +(subtotal + tax).toFixed(2);
  const amountPaid = method === 'credit' ? (amountText === '' ? 0 : parseFloat(amountText) || 0) : (amountText === '' ? total : parseFloat(amountText) || 0);
  const balanceDue = +(total - amountPaid).toFixed(2);

  // Broadcasts to any open Customer Display tab (see CustomerDisplay.tsx).
  // Deliberately sends only what's already in the cart — never the
  // product catalogue, cost prices, or anything else about the business.
  useEffect(() => {
    if (!('BroadcastChannel' in window)) return;
    const channel = new BroadcastChannel(CUSTOMER_DISPLAY_CHANNEL);
    const message: CustomerDisplayMessage = {
      lines: cart.map((l) => ({ name: l.product.name, quantity: l.quantity, unit: l.product.unit, sellingPrice: l.product.sellingPrice, discount: l.discount })),
      total,
      currency: business?.currency ?? 'KES'
    };
    channel.postMessage(message);
    channel.close();
  }, [cart, total, business?.currency]);

  function addProduct(p: typeof products[number]) {
    setCart((prev) => {
      const existing = prev.find((l) => l.product.id === p.id);
      if (existing) {
        if (existing.quantity + 1 > p.quantity) return prev;
        return prev.map((l) => (l.product.id === p.id ? { ...l, quantity: l.quantity + 1 } : l));
      }
      if (p.quantity < 1) return prev;
      return [...prev, { product: p, quantity: 1, discount: 0 }];
    });
  }

  /**
   * USB/Bluetooth barcode scanners behave like a keyboard: they type the
   * barcode digits into whatever input has focus, then send Enter. This
   * handler recognizes that pattern — an exact barcode match on Enter —
   * and adds the product immediately instead of making the cashier click
   * it from the filtered list, closing the desktop-scanner gap without
   * needing any special hardware API.
   */
  function handleSearchKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key !== 'Enter') return;
    const match = products.find((p) => p.barcode && p.barcode === query.trim());
    if (match) {
      addProduct(match);
      setQuery('');
    } else if (filtered.length === 1) {
      addProduct(filtered[0]);
      setQuery('');
    }
  }

  /**
   * Shared by both the camera scanner and the USB-scanner keydown handler
   * above: exact barcode match wins first, so a barcode that happens to
   * also match part of a product name doesn't add the wrong item.
   */
  function handleScannedCode(code: string) {
    setShowScanner(false);
    const match = products.find((p) => p.barcode && p.barcode === code.trim());
    if (match) {
      addProduct(match);
      setError(null);
    } else {
      setError(`No product found with barcode ${code}.`);
    }
  }

  function holdCurrentSale() {
    if (cart.length === 0) return;
    const label = `Sale ${heldSales.length + 1} · ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
    setHeldSales((prev) => [...prev, { id: crypto.randomUUID(), label, cart, customerId, method }]);
    setCart([]); setCustomerId(null); setMethod('cash'); setAmountText('');
  }

  function resumeHeldSale(id: string) {
    const held = heldSales.find((h) => h.id === id);
    if (!held) return;
    setCart(held.cart); setCustomerId(held.customerId); setMethod(held.method);
    setHeldSales((prev) => prev.filter((h) => h.id !== id));
    setShowHeldList(false);
  }

  function changeQty(id: string, delta: number) {
    setCart((prev) => prev.map((l) => (l.product.id === id ? { ...l, quantity: Math.max(0, l.quantity + delta) } : l)).filter((l) => l.quantity > 0));
  }
  function removeLine(id: string) {
    setCart((prev) => prev.filter((l) => l.product.id !== id));
  }

  async function checkCreditLimit(): Promise<{ overBy: number } | null> {
    setDebtWarning(null);
    if (method !== 'credit' || !customerId || balanceDue <= 0) return null;
    const customer = customers.find((c) => c.id === customerId);
    if (!customer || customer.creditLimit <= 0) return null;
    const outstanding = await customerOutstandingDebt(customerId);
    const projected = outstanding + balanceDue;
    if (projected > customer.creditLimit) {
      const warning = { overBy: +(projected - customer.creditLimit).toFixed(2) };
      setDebtWarning(warning);
      return warning;
    }
    return null;
  }

  async function handleCompleteSale() {
    if (!business || !branch || !userId || cart.length === 0) return;
    // Guards and sets `submitting` synchronously, before ANY await — the
    // credit-limit check below is async, and it used to run before
    // submitting was set, leaving a window where a fast double-tap (or a
    // flaky touchscreen sending a duplicate touch event) could start two
    // independent completeSale() calls before the checkout button's
    // disabled state ever took effect, creating two sales for one
    // checkout.
    if (submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      // The debt-warning banner has always told the cashier "an owner or
      // manager must confirm to proceed" — but nothing anywhere actually
      // enforced that; the warning was purely cosmetic and the sale
      // completed regardless of who was logged in. This makes that
      // promise real using the one thing we can actually verify: who is
      // currently authenticated. A cashier over the customer's credit
      // limit is blocked outright; an owner/manager's own login on this
      // till is treated as the confirmation the message asks for.
      const warning = await checkCreditLimit();
      if (warning && profile?.role !== 'owner' && profile?.role !== 'manager') {
        setError('This sale exceeds the customer\u2019s credit limit \u2014 ask an owner or manager to complete it.');
        return;
      }
      const result = await completeSale({
        businessId: business.id,
        branchId: branch.id,
        userId,
        customerId,
        lines: cart,
        taxRate: business.taxRate,
        paymentMethod: method,
        amountPaid,
        note: [note, mpesaTx ? `M-Pesa ${mpesaTx.transactionCode}` : ''].filter(Boolean).join(' · ') || undefined
      });
      if (mpesaTx) await linkPaymentToSale(mpesaTx.id, result.sale.id);
      setReceiptSaleId(result.sale.id);
      setReceiptPoints(result.pointsEarned);
      setCart([]);
      setCustomerId(null);
      setAmountText('');
      setNote('');
      setMpesaTxId(null);
      setMethod('cash');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not complete sale');
    } finally {
      setSubmitting(false);
    }
  }

  if (!branch) {
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
        ) : viewingAll ? (
          <>
            <p className="text-sm font-medium mb-1">Pick a branch to start selling</p>
            <p className="text-sm text-slate-500 mb-4">POS needs one specific branch — "All Branches" is a reporting view, not a place to ring up sales.</p>
            <div className="space-y-1.5 text-left">
              {branches.map((b) => (
                <button
                  key={b.id}
                  onClick={() => setActiveBranch(b.id)}
                  className="w-full btn-secondary text-sm justify-start"
                >
                  {b.name}
                </button>
              ))}
            </div>
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
    <div className="flex flex-col md:flex-row h-[calc(100vh-49px)]">
      {/* Product picker */}
      <div className="flex-1 flex flex-col p-4 md:p-6 min-h-0">
        <div className="flex gap-2 mb-4">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              ref={searchRef}
              className="input pl-9"
              placeholder="Search product name, SKU, or scan barcode…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={handleSearchKeyDown}
            />
          </div>
          <button onClick={() => setShowScanner(true)} className="btn-secondary px-3 shrink-0" aria-label="Scan barcode">
            <ScanLine className="w-4 h-4" />
          </button>
          <button onClick={() => setShowCalculator(true)} className="btn-secondary px-3 shrink-0" aria-label="Calculator">
            <CalculatorIcon className="w-4 h-4" />
          </button>
          {/* Always visible, not tucked into the actions menu — this is
              exactly the kind of frequent, time-pressured action (a
              customer walks off mid-sale) that shouldn't cost an extra tap
              through a menu, especially in Focus Mode where the full
              sidebar is hidden. */}
          <button onClick={holdCurrentSale} disabled={cart.length === 0} className="btn-secondary px-3 shrink-0 disabled:opacity-40" aria-label="Hold sale">
            <PauseCircle className="w-4 h-4" />
          </button>
          {heldSales.length > 0 && (
            <button onClick={() => setShowHeldList(true)} className="btn-secondary px-3 shrink-0 relative" aria-label="Held sales">
              <PlayCircle className="w-4 h-4" />
              <span className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-field-600 text-white text-[10px] flex items-center justify-center">{heldSales.length}</span>
            </button>
          )}
          <PosActionsMenu
            onSearch={() => searchRef.current?.focus()}
            onScan={() => setShowScanner(true)}
            onCalculator={() => setShowCalculator(true)}
            onCustomer={() => customerSelectRef.current?.focus()}
            onDiscount={() => setError('Set a per-item discount by editing the line — a dedicated cart-level discount control is on the roadmap.')}
            onHold={holdCurrentSale}
            heldCount={heldSales.length}
          />
        </div>
        {showHeldList && (
          <div className="fixed inset-0 z-[60] flex items-end md:items-center md:justify-center">
            <div className="absolute inset-0 bg-ink/40" onClick={() => setShowHeldList(false)} />
            <div className="relative w-full md:max-w-sm bg-paper-raised rounded-t-2xl md:rounded-2xl p-5 space-y-2">
              <h3 className="font-display font-semibold mb-2">Held sales</h3>
              {heldSales.map((h) => (
                <button key={h.id} onClick={() => resumeHeldSale(h.id)} className="w-full flex items-center justify-between p-3 rounded-card border border-slate-200 text-left hover:bg-paper">
                  <span className="text-sm font-medium">{h.label}</span>
                  <span className="text-xs text-slate-500">{h.cart.length} item{h.cart.length !== 1 ? 's' : ''}</span>
                </button>
              ))}
            </div>
          </div>
        )}
        <div className="flex-1 overflow-y-auto grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 content-start">
          {filtered.map((p) => (
            <button
              key={p.id}
              onClick={() => addProduct(p)}
              disabled={p.quantity <= 0}
              className="card p-3 text-left hover:border-field-500 transition-colors disabled:opacity-40"
            >
              <div className="text-sm font-medium truncate">{p.name}</div>
              <div className="text-xs text-slate-500 mt-0.5">{p.quantity} {p.unit} left</div>
              <div className="tnum text-sm font-semibold mt-1.5">{money(p.sellingPrice, currency)}</div>
            </button>
          ))}
          {filtered.length === 0 && <p className="text-sm text-slate-500 col-span-full text-center py-10">No products match.</p>}
        </div>
      </div>

      {/* Cart / checkout */}
      <div className="w-full md:w-96 shrink-0 border-t md:border-t-0 md:border-l border-slate-200 bg-paper-raised flex flex-col p-4 md:p-5">
        <h2 className="font-display font-semibold mb-3">Current sale</h2>
        <div className="flex-1 overflow-y-auto space-y-2 mb-3 min-h-[120px]">
          {cart.length === 0 && <p className="text-sm text-slate-500 py-6 text-center">Cart is empty.</p>}
          {cart.map((line) => (
            <div key={line.product.id} className="flex items-center justify-between gap-2 py-2 border-b border-slate-100 last:border-0">
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium truncate">{line.product.name}</div>
                <div className="text-xs text-slate-500 tnum">{money(line.product.sellingPrice, currency)} × {line.quantity}</div>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <button onClick={() => changeQty(line.product.id, -1)} className="w-6 h-6 rounded-full bg-slate-100 flex items-center justify-center"><Minus className="w-3 h-3" /></button>
                <span className="w-5 text-center text-sm tnum">{line.quantity}</span>
                <button onClick={() => changeQty(line.product.id, 1)} className="w-6 h-6 rounded-full bg-slate-100 flex items-center justify-center"><Plus className="w-3 h-3" /></button>
                <button onClick={() => removeLine(line.product.id)} className="w-6 h-6 rounded-full bg-rust-50 text-rust-600 flex items-center justify-center ml-1"><Trash2 className="w-3 h-3" /></button>
              </div>
            </div>
          ))}
        </div>

        <label className="block mb-2">
          <span className="block text-xs font-medium text-slate-600 mb-1">Customer {method === 'credit' && <span className="text-rust-600">(required for credit)</span>}</span>
          <select ref={customerSelectRef} className="input" value={customerId ?? ''} onChange={(e) => setCustomerId(e.target.value || null)}>
            <option value="">Walk-in customer</option>
            {customers.map((c) => <option key={c.id} value={c.id}>{c.name}{c.phone ? ` · ${c.phone}` : ''}</option>)}
          </select>
        </label>

        <div className="grid grid-cols-3 gap-1.5 mb-2">
          {METHODS.map((m) => (
            <button
              key={m.key}
              onClick={() => { setMethod(m.key); setAmountText(''); setMpesaTxId(null); }}
              className={`text-xs font-medium py-2 rounded-card border ${method === m.key ? 'bg-field-50 border-field-500 text-field-700' : 'border-slate-200 text-slate-600'}`}
            >
              {m.label}
            </button>
          ))}
        </div>

        {method === 'mpesa' && (
          <div className="mb-3">
            <div className="text-xs font-medium text-slate-600 mb-1">Received M-Pesa payment</div>
            {mpesaTxs.length === 0 ? (
              <p className="text-xs text-slate-400">No unused payments recorded yet. Add one from the M-Pesa page.</p>
            ) : (
              <div className="space-y-1 max-h-36 overflow-y-auto">
                {mpesaTxs.map((t) => (
                  <button key={t.id} type="button"
                    onClick={() => { setMpesaTxId(mpesaTxId === t.id ? null : t.id); setAmountText(mpesaTxId === t.id ? '' : String(t.amount)); }}
                    className={`w-full flex items-center justify-between gap-2 text-left text-xs px-3 py-2.5 rounded-card border ${mpesaTxId === t.id ? 'bg-field-50 border-field-500' : 'border-slate-200'}`}>
                    <span className="min-w-0"><span className="block font-medium tnum">{t.transactionCode}</span><span className="block text-slate-500 truncate">{t.senderName ?? 'Unknown'} · {new Date(t.receivedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span></span>
                    <span className="tnum font-semibold shrink-0">{money(t.amount, currency)}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        <label className="block mb-3">
          <span className="block text-xs font-medium text-slate-600 mb-1">Amount paid ({currency})</span>
          <input
            className="input tnum"
            type="number"
            inputMode="decimal"
            placeholder={method === 'credit' ? '0 (full credit)' : total.toFixed(2)}
            value={amountText}
            onChange={(e) => setAmountText(e.target.value)}
            onBlur={checkCreditLimit}
          />
        </label>

        <div className="space-y-1 text-sm mb-3 tnum">
          <div className="flex justify-between text-slate-500"><span>Subtotal</span><span>{money(subtotal, currency)}</span></div>
          {tax > 0 && <div className="flex justify-between text-slate-500"><span>Tax</span><span>{money(tax, currency)}</span></div>}
          <div className="flex justify-between font-semibold text-base pt-1 border-t border-slate-100"><span>Total</span><span>{money(total, currency)}</span></div>
          {balanceDue > 0 && (
            <div className="flex justify-between text-rust-600 font-medium"><span>Balance due (debt)</span><span>{money(balanceDue, currency)}</span></div>
          )}
        </div>

        {debtWarning && (
          <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-card p-2.5 mb-3">
            Customer debt limit reached — over by {money(debtWarning.overBy, currency)}. An owner or manager must confirm to proceed.
          </div>
        )}
        {error && <p className="text-sm text-rust-600 mb-2">{error}</p>}

        <button
          onClick={handleCompleteSale}
          disabled={submitting || cart.length === 0}
          className="btn-primary w-full sticky bottom-0"
        >
          {submitting ? 'Completing sale…' : `Complete sale · ${money(total, currency)}`}
        </button>
      </div>

      {receiptSaleId && <ReceiptModal saleId={receiptSaleId} pointsEarned={receiptPoints} onClose={() => setReceiptSaleId(null)} />}
      {showCalculator && <CalculatorModal onClose={() => setShowCalculator(false)} />}
      {showScanner && (
        <BarcodeScannerModal title="Scan product barcode" onDetected={handleScannedCode} onClose={() => setShowScanner(false)} />
      )}
    </div>
  );
}
