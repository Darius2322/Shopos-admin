import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Plus, X, Star } from 'lucide-react';
import { db, newRecordBase, enqueueSync } from '../../lib/db';
import { useAuth } from '../../lib/auth';
import { customerOutstandingDebt } from '../../lib/sales';
import { getReceiptLink } from '../../lib/receipts';
import { recordAuditEvent } from '../../lib/audit';
import type { Customer } from '../../lib/types';

export function CustomersList() {
  const { business } = useAuth();
  const currency = business?.currency ?? 'KES';
  const customers = useLiveQuery(
    () => (business ? db.customers.where('businessId').equals(business.id).toArray() : []),
    [business?.id]
  ) ?? [];
  const [adding, setAdding] = useState(false);
  const [detail, setDetail] = useState<Customer | null>(null);

  return (
    <div className="p-4 md:p-8 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-4">
        <h1 className="font-display text-2xl font-semibold">Customers</h1>
        <button onClick={() => setAdding(true)} className="btn-primary flex items-center gap-1.5 text-sm">
          <Plus className="w-4 h-4" /> Add customer
        </button>
      </div>
      <div className="card divide-y divide-slate-100">
        {customers.length === 0 && <p className="text-sm text-slate-500 py-8 text-center">No customers yet.</p>}
        {customers.map((c) => <CustomerRow key={c.id} customer={c} currency={currency} onOpen={() => setDetail(c)} />)}
      </div>
      {adding && business && <AddCustomerModal businessId={business.id} onClose={() => setAdding(false)} />}
      {detail && <CustomerDetailModal customer={detail} currency={currency} onClose={() => setDetail(null)} />}
    </div>
  );
}

function CustomerRow({ customer, currency, onOpen }: { customer: Customer; currency: string; onOpen: () => void }) {
  const debt = useLiveQuery(() => customerOutstandingDebt(customer.id), [customer.id]) ?? 0;
  return (
    <button onClick={onOpen} className="w-full flex items-center justify-between gap-3 p-4 text-left hover:bg-paper">
      <div className="min-w-0">
        <div className="text-sm font-medium truncate flex items-center gap-1.5">
          {customer.name}
          {customer.loyaltyRegistered && <Star className="w-3.5 h-3.5 text-amber-500 fill-amber-500" />}
        </div>
        <div className="text-xs text-slate-500">{customer.phone ?? 'No phone'}</div>
      </div>
      <div className="text-right shrink-0">
        {debt > 0
          ? <div className="tnum text-sm font-medium text-rust-600">{currency} {debt.toLocaleString()}</div>
          : <div className="text-xs text-slate-400">No debt</div>}
      </div>
    </button>
  );
}

function CustomerDetailModal({ customer, currency, onClose }: { customer: Customer; currency: string; onClose: () => void }) {
  const [registering, setRegistering] = useState(false);
  const debt = useLiveQuery(() => customerOutstandingDebt(customer.id), [customer.id]) ?? 0;
  const sales = useLiveQuery(
    async () => {
      const rows = await db.sales.where('customerId').equals(customer.id).toArray();
      return rows.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    },
    [customer.id]
  ) ?? [];
  const payments = useLiveQuery(
    async () => {
      const rows = await db.payments.where('customerId').equals(customer.id).toArray();
      return rows.sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 15);
    },
    [customer.id]
  ) ?? [];
  const totalPurchases = sales.reduce((s, sale) => s + sale.total, 0);

  async function registerLoyalty() {
    setRegistering(true);
    try {
      await db.customers.update(customer.id, { loyaltyRegistered: true, updatedAt: new Date().toISOString(), syncStatus: 'pending' });
      await enqueueSync('customers', customer.id, 'update');
    } finally { setRegistering(false); }
  }

  return (
    <div className="fixed inset-0 z-[55] flex items-end md:items-center md:justify-center">
      <div className="absolute inset-0 bg-ink/40" onClick={onClose} />
      <div className="relative w-full md:max-w-sm bg-paper-raised rounded-t-2xl md:rounded-2xl p-5 space-y-4 max-h-[85vh] overflow-y-auto">
        <div className="flex items-center justify-between">
          <h3 className="font-display font-semibold text-lg">{customer.name}</h3>
          <button onClick={onClose}><X className="w-5 h-5" /></button>
        </div>
        <div className="text-sm text-slate-500 space-y-0.5">
          <div>{customer.phone ?? 'No phone'}</div>
          {customer.email && <div>{customer.email}</div>}
          {customer.address && <div>{customer.address}</div>}
          <div className="text-xs text-slate-400">Added {new Date(customer.createdAt).toLocaleDateString()}</div>
        </div>

        <div className="card p-3.5">
          <div className="flex items-center justify-between mb-1">
            <span className="text-sm font-medium">Loyalty status</span>
            <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${customer.loyaltyRegistered ? 'bg-field-50 text-field-700' : 'bg-slate-100 text-slate-500'}`}>
              {customer.loyaltyRegistered ? 'Registered' : 'Not registered'}
            </span>
          </div>
          {customer.loyaltyRegistered ? (
            <div className="tnum text-lg font-semibold">{customer.loyaltyPoints.toLocaleString()} points</div>
          ) : (
            <button onClick={registerLoyalty} disabled={registering} className="btn-secondary text-sm w-full mt-2">
              {registering ? 'Registering…' : 'Register for loyalty program'}
            </button>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3 text-sm">
          <div className="card p-3"><div className="text-xs text-slate-500">Total purchases</div><div className="tnum font-semibold">{currency} {totalPurchases.toLocaleString()}</div></div>
          <div className="card p-3"><div className="text-xs text-slate-500">Outstanding debt</div><div className={`tnum font-semibold ${debt > 0 ? 'text-rust-600' : ''}`}>{currency} {debt.toLocaleString()}</div></div>
        </div>

        <div className="card p-3.5 text-sm">
          <div className="flex justify-between"><span className="text-slate-500">Credit limit</span><span className="tnum">{currency} {customer.creditLimit.toLocaleString()}</span></div>
        </div>

        <div>
          <h4 className="text-sm font-medium mb-2">Purchase history</h4>
          {sales.length === 0 ? (
            <p className="text-xs text-slate-400">No purchases yet.</p>
          ) : (
            <div className="divide-y divide-slate-100 border border-slate-100 rounded-card max-h-40 overflow-y-auto">
              {sales.slice(0, 20).map((s) => (
                <div key={s.id} className="flex justify-between items-center px-3 py-2 text-xs">
                  <span className="text-slate-500">{new Date(s.createdAt).toLocaleString()}</span>
                  <span className="tnum font-medium">{currency} {s.total.toLocaleString()}</span>
                  <button
                    onClick={async () => {
                      const link = await getReceiptLink(s.id, s.receiptNumber);
                      if (link) window.open(link, '_blank');
                      else alert("This sale hasn't synced yet — try again once it's online.");
                    }}
                    className="text-field-600 font-medium ml-2 shrink-0"
                  >
                    Receipt
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {payments.length > 0 && (
          <div>
            <h4 className="text-sm font-medium mb-2">Payments</h4>
            <div className="divide-y divide-slate-100 border border-slate-100 rounded-card max-h-40 overflow-y-auto">
              {payments.map((p) => (
                <div key={p.id} className="flex justify-between px-3 py-2 text-xs">
                  <span className="text-slate-500 capitalize">{new Date(p.createdAt).toLocaleString()} · {p.method}</span>
                  <span className="tnum font-medium">{currency} {p.amount.toLocaleString()}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function AddCustomerModal({ businessId, onClose }: { businessId: string; onClose: () => void }) {
  const { userId } = useAuth();
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [creditLimit, setCreditLimit] = useState('0');
  const [saving, setSaving] = useState(false);

  async function submit() {
    if (!name.trim()) return;
    setSaving(true);
    try {
      const record = {
        ...newRecordBase(),
        businessId,
        branchId: null,
        name: name.trim(),
        phone: phone || null,
        email: null,
        address: null,
        creditLimit: parseFloat(creditLimit) || 0,
        loyaltyRegistered: false,
        loyaltyPoints: 0,
        active: true
      };
      await db.customers.add(record as any);
      await enqueueSync('customers', record.id, 'create');
      await recordAuditEvent({ businessId, userId, action: 'customer_created', entityType: 'customer', entityId: record.id, newValue: JSON.stringify({ name: record.name, phone: record.phone }) });
      onClose();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[55] flex items-end md:items-center md:justify-center">
      <div className="absolute inset-0 bg-ink/40" onClick={onClose} />
      <div className="relative w-full md:max-w-sm bg-paper-raised rounded-t-2xl md:rounded-2xl p-5 space-y-3.5">
        <div className="flex items-center justify-between">
          <h3 className="font-display font-semibold text-lg">Add customer</h3>
          <button onClick={onClose}><X className="w-5 h-5" /></button>
        </div>
        <label className="block">
          <span className="block text-sm font-medium text-slate-600 mb-1.5">Name</span>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
        </label>
        <label className="block">
          <span className="block text-sm font-medium text-slate-600 mb-1.5">Phone</span>
          <input className="input" value={phone} onChange={(e) => setPhone(e.target.value)} />
        </label>
        <label className="block">
          <span className="block text-sm font-medium text-slate-600 mb-1.5">Credit limit</span>
          <input className="input tnum" type="number" value={creditLimit} onChange={(e) => setCreditLimit(e.target.value)} />
        </label>
        <button onClick={submit} disabled={saving || !name.trim()} className="btn-primary w-full">{saving ? 'Saving…' : 'Add customer'}</button>
      </div>
    </div>
  );
}
