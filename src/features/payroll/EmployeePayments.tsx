import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Plus, X } from 'lucide-react';
import { db, newRecordBase, enqueueSync } from '../../lib/db';
import { useAuth } from '../../lib/auth';

function money(n: number, currency: string) {
  return `${currency} ${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function EmployeePayments() {
  const { business, profile, userId, activeBranchId } = useAuth();
  const currency = business?.currency ?? 'KES';
  const canManage = profile?.role === 'owner' || profile?.role === 'manager';

  const allPayments = useLiveQuery(
    () => (business ? db.employeePayments.where('businessId').equals(business.id).toArray() : []),
    [business?.id]
  ) ?? [];
  const profiles = useLiveQuery(
    () => (business ? db.profiles.where('businessId').equals(business.id).toArray() : []),
    [business?.id]
  ) ?? [];

  // Staff below manager only ever see their own payments — enforced here
  // AND server-side by the employee_payments RLS policy.
  const visible = canManage ? allPayments : allPayments.filter((p) => p.employeeId === userId);
  const sorted = [...visible].sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  const [adding, setAdding] = useState(false);
  const employeeName = (id: string) => profiles.find((p) => p.id === id)?.fullName ?? 'Unknown';

  return (
    <div className="p-4 md:p-8 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-4">
        <h1 className="font-display text-2xl font-semibold">Employee Payments</h1>
        {canManage && (
          <button onClick={() => setAdding(true)} className="btn-primary flex items-center gap-1.5 text-sm">
            <Plus className="w-4 h-4" /> Record payment
          </button>
        )}
      </div>
      <div className="card divide-y divide-slate-100">
        {sorted.length === 0 && <p className="text-sm text-slate-500 py-8 text-center">No payments recorded.</p>}
        {sorted.map((p) => (
          <div key={p.id} className="flex items-center justify-between p-4">
            <div>
              <div className="text-sm font-medium">{canManage ? employeeName(p.employeeId) : 'You'}</div>
              <div className="text-xs text-slate-500">{new Date(p.createdAt).toLocaleDateString()} · {p.paymentMethod} · {p.status}</div>
            </div>
            <div className="tnum font-medium">{money(p.netAmount, currency)}</div>
          </div>
        ))}
      </div>
      {adding && business && activeBranchId && userId && (
        <AddPaymentModal businessId={business.id} branchId={activeBranchId} paidBy={userId} employees={profiles} currency={currency} onClose={() => setAdding(false)} />
      )}
    </div>
  );
}

function AddPaymentModal({
  businessId, branchId, paidBy, employees, currency, onClose
}: { businessId: string; branchId: string; paidBy: string; employees: any[]; currency: string; onClose: () => void }) {
  const [employeeId, setEmployeeId] = useState('');
  const [base, setBase] = useState('');
  const [additions, setAdditions] = useState('0');
  const [deductions, setDeductions] = useState('0');
  const [advance, setAdvance] = useState('0');
  const [method, setMethod] = useState('cash');
  const [saving, setSaving] = useState(false);

  const net = (parseFloat(base) || 0) + (parseFloat(additions) || 0) - (parseFloat(deductions) || 0) - (parseFloat(advance) || 0);

  async function submit() {
    if (!employeeId || !base) return;
    setSaving(true);
    try {
      const record = {
        ...newRecordBase(),
        businessId, branchId, employeeId, paidBy,
        periodStart: null, periodEnd: null,
        baseAmount: parseFloat(base) || 0,
        additions: parseFloat(additions) || 0,
        deductions: parseFloat(deductions) || 0,
        advance: parseFloat(advance) || 0,
        netAmount: net,
        paymentMethod: method,
        reference: null, notes: null,
        status: 'paid' as const
      };
      await db.employeePayments.add(record as any);
      await enqueueSync('employeePayments', record.id, 'create');
      onClose();
    } finally { setSaving(false); }
  }

  return (
    <div className="fixed inset-0 z-[55] flex items-end md:items-center md:justify-center">
      <div className="absolute inset-0 bg-ink/40" onClick={onClose} />
      <div className="relative w-full md:max-w-sm bg-paper-raised rounded-t-2xl md:rounded-2xl p-5 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="font-display font-semibold text-lg">Record payment</h3>
          <button onClick={onClose}><X className="w-5 h-5" /></button>
        </div>
        <label className="block">
          <span className="block text-sm font-medium text-slate-600 mb-1.5">Employee</span>
          <select className="input" value={employeeId} onChange={(e) => setEmployeeId(e.target.value)}>
            <option value="">Select employee…</option>
            {employees.map((e) => <option key={e.id} value={e.id}>{e.fullName}</option>)}
          </select>
        </label>
        <label className="block"><span className="block text-sm font-medium text-slate-600 mb-1.5">Base salary/wage</span><input className="input tnum" type="number" value={base} onChange={(e) => setBase(e.target.value)} /></label>
        <div className="grid grid-cols-3 gap-2">
          <label className="block"><span className="block text-xs font-medium text-slate-600 mb-1">Additions</span><input className="input tnum" type="number" value={additions} onChange={(e) => setAdditions(e.target.value)} /></label>
          <label className="block"><span className="block text-xs font-medium text-slate-600 mb-1">Deductions</span><input className="input tnum" type="number" value={deductions} onChange={(e) => setDeductions(e.target.value)} /></label>
          <label className="block"><span className="block text-xs font-medium text-slate-600 mb-1">Advance</span><input className="input tnum" type="number" value={advance} onChange={(e) => setAdvance(e.target.value)} /></label>
        </div>
        <label className="block">
          <span className="block text-sm font-medium text-slate-600 mb-1.5">Method</span>
          <select className="input" value={method} onChange={(e) => setMethod(e.target.value)}>
            <option value="cash">Cash</option><option value="mpesa">M-Pesa</option><option value="bank">Bank</option><option value="other">Other</option>
          </select>
        </label>
        <div className="text-sm font-semibold tnum">Net: {currency} {net.toLocaleString()}</div>
        <button onClick={submit} disabled={saving || !employeeId || !base} className="btn-primary w-full">{saving ? 'Saving…' : 'Record payment'}</button>
      </div>
    </div>
  );
}
