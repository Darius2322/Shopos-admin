import { ReactNode, useEffect, useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { downloadDebtStatementPdf } from '../../lib/downloads';
import { Plus, Search, X, ChevronRight, Share2, Printer, Download } from 'lucide-react';
import { db } from '../../lib/db';
import { useAuth } from '../../lib/auth';
import { recordDebtPayment } from '../../lib/sales';
import { createManualDebt, updateDebt, effectiveStatus, debtorLabel, debtSummaryText } from '../../lib/debts';
import type { Debt, PaymentMethod } from '../../lib/types';

function money(n: number, currency: string) {
  return `${currency} ${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
const today = () => new Date().toISOString().slice(0, 10);

function StatusBadge({ status }: { status: Debt['status'] }) {
  const styles: Record<string, string> = {
    outstanding: 'bg-rust-50 text-rust-600',
    partial: 'bg-amber-100 text-amber-600',
    paid: 'bg-field-50 text-field-700',
    overdue: 'bg-rust-600 text-white'
  };
  return <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${styles[status]}`}>{status}</span>;
}

/** Centered, scrollable, accessible dialog. Closes on Escape / backdrop click. */
function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-[55] flex items-center justify-center p-3">
      <div className="absolute inset-0 bg-ink/40" onClick={onClose} aria-hidden="true" />
      <div role="dialog" aria-modal="true" aria-label={title}
        className="relative w-full max-w-md max-h-[90vh] overflow-y-auto bg-paper-raised rounded-2xl p-5 space-y-3.5 shadow-xl">
        <div className="flex items-center justify-between gap-3">
          <h3 className="font-display font-semibold text-lg">{title}</h3>
          <button onClick={onClose} aria-label="Close" className="p-2 -m-2"><X className="w-5 h-5" /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="block text-sm font-medium text-slate-600 mb-1.5">{label}</span>
      {children}
    </label>
  );
}

export function DebtsList() {
  const { business, userId, activeBranchId, branches } = useAuth();
  const currency = business?.currency ?? 'KES';
  const businessId = business?.id;

  const debts = useLiveQuery(
    () => (businessId ? db.debts.where('businessId').equals(businessId).toArray() : []),
    [businessId]
  ) ?? [];
  const customers = useLiveQuery(
    () => (businessId ? db.customers.where('businessId').equals(businessId).toArray() : []),
    [businessId]
  ) ?? [];

  const [filter, setFilter] = useState<'all' | Debt['status']>('all');
  const [query, setQuery] = useState('');
  const [adding, setAdding] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);

  const customerName = (id: string | null) => (id ? customers.find((c) => c.id === id)?.name ?? null : null);
  const label = (d: Debt) => debtorLabel(d, customerName(d.customerId));

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return debts
      .filter((d) => filter === 'all' || effectiveStatus(d) === filter)
      .filter((d) => !q || label(d).toLowerCase().includes(q) || (d.reason ?? '').toLowerCase().includes(q) || (d.debtorPhone ?? '').includes(q))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debts, customers, filter, query]);

  const totalOutstanding = debts.reduce((s, d) => s + (effectiveStatus(d) === 'paid' ? 0 : d.remainingAmount), 0);
  const open = debts.find((d) => d.id === openId) ?? null;
  const branchId = activeBranchId ?? branches[0]?.id ?? null;

  return (
    <div className="p-4 md:p-8 max-w-4xl mx-auto">
      <div className="flex items-start justify-between gap-3 mb-1">
        <h1 className="font-display text-2xl font-semibold">Debts</h1>
        <button onClick={() => setAdding(true)} disabled={!userId || !branchId} className="btn-primary inline-flex items-center gap-1.5 !py-2 !px-3.5 text-sm">
          <Plus className="w-4 h-4" /> Add debt
        </button>
      </div>
      <p className="text-sm text-slate-500 mb-4">Total outstanding: <span className="tnum font-medium text-rust-600">{money(totalOutstanding, currency)}</span></p>

      <div className="relative mb-3">
        <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
        <input className="input !pl-9" placeholder="Search name, phone or reason" value={query} onChange={(e) => setQuery(e.target.value)} />
      </div>

      <div className="flex gap-1.5 mb-4 overflow-x-auto pb-1">
        {(['all', 'outstanding', 'partial', 'overdue', 'paid'] as const).map((f) => (
          <button key={f} onClick={() => setFilter(f)}
            className={`text-xs font-medium px-3 py-2 rounded-full whitespace-nowrap ${filter === f ? 'bg-field-600 text-white' : 'bg-slate-100 text-slate-600'}`}>
            {f[0].toUpperCase() + f.slice(1)}
          </button>
        ))}
      </div>

      <div className="card divide-y divide-slate-100">
        {filtered.length === 0 && <p className="text-sm text-slate-500 py-8 text-center">No debts match this filter.</p>}
        {filtered.map((d) => (
          <button key={d.id} onClick={() => setOpenId(d.id)}
            className="w-full flex items-center justify-between gap-3 p-4 text-left hover:bg-slate-50 focus-visible:bg-slate-50 min-h-[64px]">
            <div className="min-w-0">
              <div className="text-sm font-medium truncate">
                {label(d)}
                {!d.customerId && <span className="ml-2 text-[10px] font-medium uppercase tracking-wide text-slate-400">not a customer</span>}
              </div>
              <div className="text-xs text-slate-500 flex items-center gap-1.5 flex-wrap">
                <span>{new Date(d.debtDate ?? d.createdAt).toLocaleDateString()}</span>
                <StatusBadge status={effectiveStatus(d)} />
                {d.dueDate && effectiveStatus(d) !== 'paid' && <span>due {new Date(`${d.dueDate}T00:00:00`).toLocaleDateString()}</span>}
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <div className="text-right">
                <div className="tnum font-semibold">{money(d.remainingAmount, currency)}</div>
                <div className="text-xs text-slate-500 tnum">of {money(d.originalAmount, currency)}</div>
              </div>
              <ChevronRight className="w-4 h-4 text-slate-400" aria-hidden="true" />
            </div>
          </button>
        ))}
      </div>

      {adding && userId && business && branchId && (
        <AddDebtModal
          customers={customers.map((c) => ({ id: c.id, name: c.name }))}
          businessId={business.id} branchId={branchId} userId={userId}
          onClose={() => setAdding(false)}
        />
      )}
      {open && userId && business && (
        <DebtDetailModal
          debt={open} label={label(open)} currency={currency} businessName={business.name}
          businessId={business.id} branchId={branchId ?? open.branchId} userId={userId}
          onClose={() => setOpenId(null)}
        />
      )}
    </div>
  );
}

function AddDebtModal({ customers, businessId, branchId, userId, onClose }: {
  customers: { id: string; name: string }[]; businessId: string; branchId: string; userId: string; onClose: () => void;
}) {
  const [kind, setKind] = useState<'customer' | 'other'>('other');
  const [customerId, setCustomerId] = useState('');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [debtDate, setDebtDate] = useState(today());
  const [dueDate, setDueDate] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function submit() {
    setError(null);
    if (kind === 'customer' && !customerId) { setError('Choose a customer'); return; }
    setSaving(true);
    try {
      await createManualDebt({
        businessId, branchId, userId,
        customerId: kind === 'customer' ? customerId : null,
        debtorName: name, debtorPhone: phone,
        amount: parseFloat(amount), reason, notes, debtDate, dueDate: dueDate || null
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save debt');
    } finally { setSaving(false); }
  }

  return (
    <Modal title="Add debt" onClose={onClose}>
      <div className="grid grid-cols-2 gap-1 p-1 bg-slate-100 rounded-xl" role="tablist">
        {([['other', 'Not a customer'], ['customer', 'Existing customer']] as const).map(([k, l]) => (
          <button key={k} role="tab" aria-selected={kind === k} onClick={() => setKind(k)}
            className={`text-sm font-medium py-2 rounded-lg ${kind === k ? 'bg-paper-raised shadow-sm' : 'text-slate-500'}`}>{l}</button>
        ))}
      </div>
      {kind === 'customer' ? (
        <Field label="Customer">
          <select className="input" value={customerId} onChange={(e) => setCustomerId(e.target.value)}>
            <option value="">Select a customer…</option>
            {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </Field>
      ) : (
        <>
          <Field label="Name"><input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. John Mwangi" autoFocus /></Field>
          <Field label="Phone (optional)"><input className="input" type="tel" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="07XXXXXXXX" /></Field>
        </>
      )}
      <Field label={`Amount`}><input className="input tnum" type="number" inputMode="decimal" min="0" value={amount} onChange={(e) => setAmount(e.target.value)} /></Field>
      <Field label="Reason"><input className="input" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Goods on credit" /></Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Date"><input className="input" type="date" value={debtDate} onChange={(e) => setDebtDate(e.target.value)} /></Field>
        <Field label="Due date"><input className="input" type="date" value={dueDate} min={debtDate} onChange={(e) => setDueDate(e.target.value)} /></Field>
      </div>
      <Field label="Notes (optional)"><textarea className="input" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>
      {error && <p className="text-sm text-rust-600">{error}</p>}
      <button onClick={submit} disabled={saving} className="btn-primary w-full">{saving ? 'Saving…' : 'Save debt'}</button>
    </Modal>
  );
}

function DebtDetailModal({ debt, label, currency, businessName, businessId, branchId, userId, onClose }: {
  debt: Debt; label: string; currency: string; businessName: string; businessId: string; branchId: string; userId: string; onClose: () => void;
}) {
  const payments = useLiveQuery(() => db.payments.where('debtId').equals(debt.id).toArray(), [debt.id]) ?? [];
  const [mode, setMode] = useState<'view' | 'pay' | 'edit'>('view');
  const status = effectiveStatus(debt);
  const sorted = [...payments].sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  async function share() {
    const text = debtSummaryText(debt, businessName, currency, label);
    if (navigator.share) { try { await navigator.share({ title: 'Debt statement', text }); return; } catch { /* cancelled */ } }
    try { await navigator.clipboard.writeText(text); } catch { /* clipboard unavailable */ }
  }
  async function downloadPdf() {
    const b = useAuth.getState().business;
    if (b) await downloadDebtStatementPdf({ business: b, debt, debtor: label, status: effectiveStatus(debt), payments, currency });
  }
  function print() {
    const w = window.open('', '_blank', 'width=420,height=600');
    if (!w) return;
    const esc = (s: string) => s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c] as string));
    w.document.write(`<pre style="font:14px/1.5 monospace;white-space:pre-wrap">${esc(debtSummaryText(debt, businessName, currency, label))}</pre>`);
    w.document.close(); w.focus(); w.print();
  }

  if (mode === 'pay') return <PayForm debt={debt} currency={currency} businessId={businessId} branchId={branchId} userId={userId} onBack={() => setMode('view')} onClose={onClose} />;
  if (mode === 'edit') return <EditForm debt={debt} currency={currency} onBack={() => setMode('view')} />;

  return (
    <Modal title={label} onClose={onClose}>
      <div className="flex items-center gap-2 flex-wrap">
        <StatusBadge status={status} />
        {!debt.customerId && <span className="text-xs text-slate-500">Not a registered customer</span>}
      </div>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
        <dt className="text-slate-500">Amount</dt><dd className="text-right tnum">{money(debt.originalAmount, currency)}</dd>
        <dt className="text-slate-500">Paid</dt><dd className="text-right tnum">{money(debt.paidAmount, currency)}</dd>
        <dt className="font-medium">Balance</dt><dd className="text-right tnum font-semibold text-rust-600">{money(debt.remainingAmount, currency)}</dd>
        <dt className="text-slate-500">Date</dt><dd className="text-right">{new Date(debt.debtDate ?? debt.createdAt).toLocaleDateString()}</dd>
        {debt.dueDate && (<><dt className="text-slate-500">Due</dt><dd className="text-right">{new Date(`${debt.dueDate}T00:00:00`).toLocaleDateString()}</dd></>)}
        {debt.debtorPhone && (<><dt className="text-slate-500">Phone</dt><dd className="text-right"><a className="text-field-600" href={`tel:${debt.debtorPhone}`}>{debt.debtorPhone}</a></dd></>)}
        {debt.reason && (<><dt className="text-slate-500">Reason</dt><dd className="text-right break-words">{debt.reason}</dd></>)}
      </dl>
      {debt.notes && <p className="text-sm text-slate-600 bg-slate-50 rounded-lg p-3 break-words">{debt.notes}</p>}

      <div>
        <h4 className="text-sm font-medium mb-1.5">Payment history</h4>
        {sorted.length === 0 ? <p className="text-xs text-slate-500">No payments yet.</p> : (
          <ul className="divide-y divide-slate-100 text-sm">
            {sorted.map((p) => (
              <li key={p.id} className="py-2 flex justify-between gap-3">
                <span className="text-slate-500">{new Date(p.createdAt).toLocaleDateString()} · {p.method}</span>
                <span className="tnum font-medium">{money(p.amount, currency)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="grid grid-cols-2 gap-2 pt-1">
        {status !== 'paid' && <button onClick={() => setMode('pay')} className="btn-primary col-span-2">Record payment</button>}
        {debt.source === 'manual' ? <button onClick={() => setMode('edit')} className="btn-secondary">Edit</button> : <span />}
        <div className="flex gap-2">
          <button onClick={downloadPdf} className="btn-secondary flex-1 inline-flex items-center justify-center gap-1.5" aria-label="Download PDF statement"><Download className="w-4 h-4" /></button>
          <button onClick={share} className="btn-secondary flex-1 inline-flex items-center justify-center gap-1.5" aria-label="Share"><Share2 className="w-4 h-4" /></button>
          <button onClick={print} className="btn-secondary flex-1 inline-flex items-center justify-center gap-1.5" aria-label="Print"><Printer className="w-4 h-4" /></button>
        </div>
      </div>
    </Modal>
  );
}

function PayForm({ debt, currency, businessId, branchId, userId, onBack, onClose }: {
  debt: Debt; currency: string; businessId: string; branchId: string; userId: string; onBack: () => void; onClose: () => void;
}) {
  const [amount, setAmount] = useState(String(debt.remainingAmount));
  const [method, setMethod] = useState<PaymentMethod>('cash');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function submit() {
    setError(null);
    const n = parseFloat(amount);
    if (!n || n <= 0) { setError('Enter a valid amount'); return; }
    setSaving(true);
    try {
      await recordDebtPayment({ businessId, branchId, debt, amount: n, method, userId });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not record payment');
    } finally { setSaving(false); }
  }

  return (
    <Modal title="Record payment" onClose={onBack}>
      <p className="text-sm text-slate-500">Remaining balance: <span className="tnum font-medium text-ink">{money(debt.remainingAmount, currency)}</span></p>
      <Field label="Amount"><input className="input tnum" type="number" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} autoFocus /></Field>
      <Field label="Method">
        <select className="input" value={method} onChange={(e) => setMethod(e.target.value as PaymentMethod)}>
          <option value="cash">Cash</option><option value="mpesa">M-Pesa</option><option value="card">Card</option>
          <option value="bank">Bank</option><option value="other">Other</option>
        </select>
      </Field>
      {error && <p className="text-sm text-rust-600">{error}</p>}
      <button onClick={submit} disabled={saving} className="btn-primary w-full">{saving ? 'Saving…' : 'Record payment'}</button>
    </Modal>
  );
}

function EditForm({ debt, currency, onBack }: { debt: Debt; currency: string; onBack: () => void }) {
  const [name, setName] = useState(debt.debtorName ?? '');
  const [phone, setPhone] = useState(debt.debtorPhone ?? '');
  const [amount, setAmount] = useState(String(debt.originalAmount));
  const [reason, setReason] = useState(debt.reason ?? '');
  const [dueDate, setDueDate] = useState(debt.dueDate ?? '');
  const [notes, setNotes] = useState(debt.notes ?? '');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function submit() {
    setError(null); setSaving(true);
    try {
      await updateDebt(debt, { debtorName: name, debtorPhone: phone, amount: parseFloat(amount), reason, notes, dueDate: dueDate || null });
      onBack();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save changes');
    } finally { setSaving(false); }
  }

  return (
    <Modal title="Edit debt" onClose={onBack}>
      {!debt.customerId && (
        <>
          <Field label="Name"><input className="input" value={name} onChange={(e) => setName(e.target.value)} /></Field>
          <Field label="Phone (optional)"><input className="input" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} /></Field>
        </>
      )}
      <Field label={`Amount (${currency}) — paid so far ${debt.paidAmount}`}><input className="input tnum" type="number" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} /></Field>
      <Field label="Reason"><input className="input" value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
      <Field label="Due date"><input className="input" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} /></Field>
      <Field label="Notes"><textarea className="input" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>
      {error && <p className="text-sm text-rust-600">{error}</p>}
      <button onClick={submit} disabled={saving} className="btn-primary w-full">{saving ? 'Saving…' : 'Save changes'}</button>
    </Modal>
  );
}
