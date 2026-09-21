import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Plus, X } from 'lucide-react';
import { db, newRecordBase, enqueueSync } from '../../lib/db';
import { useAuth } from '../../lib/auth';
import { recordAuditEvent } from '../../lib/audit';

export function ExpensesList() {
  const { business, activeBranchId, userId } = useAuth();
  const currency = business?.currency ?? 'KES';
  const expenses = useLiveQuery(
    () => (business ? db.expenses.where('businessId').equals(business.id).toArray() : []),
    [business?.id]
  ) ?? [];
  const [adding, setAdding] = useState(false);

  const scoped = activeBranchId ? expenses.filter((e) => e.branchId === activeBranchId) : expenses;
  const total = scoped.reduce((s, e) => s + e.amount, 0);

  return (
    <div className="p-4 md:p-8 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-4">
        <h1 className="font-display text-2xl font-semibold">Expenses</h1>
        <button onClick={() => setAdding(true)} className="btn-primary flex items-center gap-1.5 text-sm">
          <Plus className="w-4 h-4" /> Add expense
        </button>
      </div>
      <p className="text-sm text-slate-500 mb-4">Total: <span className="tnum font-medium">{currency} {total.toLocaleString()}</span></p>
      <div className="card divide-y divide-slate-100">
        {scoped.length === 0 && <p className="text-sm text-slate-500 py-8 text-center">No expenses recorded.</p>}
        {[...scoped].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map((e) => (
          <div key={e.id} className="flex items-center justify-between p-4">
            <div>
              <div className="text-sm font-medium">{e.category}</div>
              <div className="text-xs text-slate-500">{e.description ?? '—'} · {new Date(e.createdAt).toLocaleDateString()}</div>
            </div>
            <div className="tnum font-medium">{currency} {e.amount.toLocaleString()}</div>
          </div>
        ))}
      </div>
      {adding && business && activeBranchId && userId && (
        <AddExpenseModal businessId={business.id} branchId={activeBranchId} userId={userId} onClose={() => setAdding(false)} />
      )}
    </div>
  );
}

function AddExpenseModal({ businessId, branchId, userId, onClose }: { businessId: string; branchId: string; userId: string; onClose: () => void }) {
  const [category, setCategory] = useState('');
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);

  async function submit() {
    if (!category.trim() || !amount) return;
    setSaving(true);
    try {
      const record = {
        ...newRecordBase(),
        businessId, branchId,
        category: category.trim(),
        amount: parseFloat(amount) || 0,
        paymentMethod: 'cash',
        description: description || null,
        userId
      };
      await db.expenses.add(record as any);
      await enqueueSync('expenses', record.id, 'create');
      await recordAuditEvent({ businessId, branchId, userId, action: 'expense_created', entityType: 'expense', entityId: record.id, newValue: JSON.stringify({ category: record.category, amount: record.amount }) });
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
          <h3 className="font-display font-semibold text-lg">Add expense</h3>
          <button onClick={onClose}><X className="w-5 h-5" /></button>
        </div>
        <label className="block"><span className="block text-sm font-medium text-slate-600 mb-1.5">Category</span><input className="input" value={category} onChange={(e) => setCategory(e.target.value)} autoFocus /></label>
        <label className="block"><span className="block text-sm font-medium text-slate-600 mb-1.5">Amount</span><input className="input tnum" type="number" value={amount} onChange={(e) => setAmount(e.target.value)} /></label>
        <label className="block"><span className="block text-sm font-medium text-slate-600 mb-1.5">Description</span><input className="input" value={description} onChange={(e) => setDescription(e.target.value)} /></label>
        <button onClick={submit} disabled={saving || !category.trim() || !amount} className="btn-primary w-full">{saving ? 'Saving…' : 'Add expense'}</button>
      </div>
    </div>
  );
}
