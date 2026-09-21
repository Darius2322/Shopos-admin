import { useLiveQuery } from 'dexie-react-hooks';
import { Check, X as XIcon } from 'lucide-react';
import { db } from '../../lib/db';
import { useAuth } from '../../lib/auth';
import { approveAndProcessRefund, rejectRefund } from '../../lib/refunds';
import { isBiometricEnabled, verifyBiometric } from '../../lib/webauthn';
import type { Refund } from '../../lib/types';

function money(n: number, currency: string) {
  return `${currency} ${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

const STATUS_STYLES: Record<Refund['status'], string> = {
  pending: 'bg-amber-100 text-amber-600',
  approved: 'bg-field-50 text-field-700',
  processed: 'bg-field-50 text-field-700',
  rejected: 'bg-rust-50 text-rust-600'
};

export function RefundsList() {
  const { business, profile, userId } = useAuth();
  const currency = business?.currency ?? 'KES';
  const canDecide = profile?.role === 'owner' || profile?.role === 'manager';

  const refunds = useLiveQuery(
    () => (business ? db.refunds.where('businessId').equals(business.id).toArray() : []),
    [business?.id]
  ) ?? [];
  const sales = useLiveQuery(() => db.sales.toArray(), []) ?? [];

  const sorted = [...refunds].sort((a, b) => b.requestedAt.localeCompare(a.requestedAt));

  async function handleApprove(r: Refund) {
    if (!userId) return;
    if (await isBiometricEnabled()) {
      const verified = await verifyBiometric();
      if (!verified) return; // cancelled or failed — do not approve
    }
    await approveAndProcessRefund(r, userId);
  }
  async function handleReject(r: Refund) {
    if (!userId) return;
    await rejectRefund(r, userId);
  }

  return (
    <div className="p-4 md:p-8 max-w-4xl mx-auto">
      <h1 className="font-display text-2xl font-semibold mb-1">Refunds</h1>
      <p className="text-sm text-slate-500 mb-4">
        {canDecide ? 'Approve or reject requests from your team.' : 'Only owners and managers can approve refunds.'}
      </p>
      <div className="card divide-y divide-slate-100">
        {sorted.length === 0 && <p className="text-sm text-slate-500 py-8 text-center">No refund requests.</p>}
        {sorted.map((r) => {
          const sale = sales.find((s) => s.id === r.saleId);
          return (
            <div key={r.id} className="p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-sm font-medium">{sale?.receiptNumber ?? 'Sale'} · {r.reason}</div>
                  <div className="text-xs text-slate-500 mt-0.5">{new Date(r.requestedAt).toLocaleString()}</div>
                </div>
                <span className={`text-xs font-medium px-2 py-0.5 rounded-full shrink-0 ${STATUS_STYLES[r.status]}`}>{r.status}</span>
              </div>
              <div className="tnum text-sm font-semibold mt-2">{money(r.totalAmount, currency)}</div>
              {canDecide && r.status === 'pending' && (
                <div className="flex gap-2 mt-3">
                  <button onClick={() => handleApprove(r)} className="btn-primary text-xs flex items-center gap-1 py-1.5 px-3">
                    <Check className="w-3.5 h-3.5" /> Approve
                  </button>
                  <button onClick={() => handleReject(r)} className="btn-secondary text-xs flex items-center gap-1 py-1.5 px-3">
                    <XIcon className="w-3.5 h-3.5" /> Reject
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
