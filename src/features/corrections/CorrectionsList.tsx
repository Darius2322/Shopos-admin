import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Check, X as XIcon } from 'lucide-react';
import { db } from '../../lib/db';
import { useAuth } from '../../lib/auth';
import { enqueueSync } from '../../lib/db';
import type { CorrectionRequest } from '../../lib/types';

const STATUS_STYLES: Record<CorrectionRequest['status'], string> = {
  requested: 'bg-amber-100 text-amber-600',
  info_needed: 'bg-slate-200 text-slate-600',
  approved: 'bg-field-50 text-field-700',
  rejected: 'bg-rust-50 text-rust-600'
};

export function CorrectionsList() {
  const { business, profile, userId } = useAuth();
  const canDecide = profile?.role === 'owner' || profile?.role === 'manager';
  const requests = useLiveQuery(
    () => (business ? db.correctionRequests.where('businessId').equals(business.id).toArray() : []),
    [business?.id]
  ) ?? [];
  const sales = useLiveQuery(() => db.sales.toArray(), []) ?? [];
  const [notes, setNotes] = useState<Record<string, string>>({});

  async function decide(r: CorrectionRequest, status: 'approved' | 'rejected') {
    if (!userId) return;
    await db.correctionRequests.update(r.id, {
      status, decidedBy: userId, decidedAt: new Date().toISOString(),
      resolutionNotes: notes[r.id] ?? null
    });
    await enqueueSync('correctionRequests', r.id, 'update');
  }

  const sorted = [...requests].sort((a, b) => b.requestedAt.localeCompare(a.requestedAt));

  return (
    <div className="p-4 md:p-8 max-w-4xl mx-auto">
      <h1 className="font-display text-2xl font-semibold mb-1">Correction requests</h1>
      <p className="text-sm text-slate-500 mb-4">
        {canDecide ? 'Review requests from your team. Approving records the resolution — the original sale stays intact.' : 'Only owners and managers can approve corrections.'}
      </p>
      <div className="card divide-y divide-slate-100">
        {sorted.length === 0 && <p className="text-sm text-slate-500 py-8 text-center">No correction requests.</p>}
        {sorted.map((r) => {
          const sale = sales.find((s) => s.id === r.saleId);
          return (
            <div key={r.id} className="p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-sm font-medium">{sale?.receiptNumber ?? 'Sale'} · {r.problem}</div>
                  <div className="text-xs text-slate-500 mt-0.5">{new Date(r.requestedAt).toLocaleString()}</div>
                </div>
                <span className={`text-xs font-medium px-2 py-0.5 rounded-full shrink-0 ${STATUS_STYLES[r.status]}`}>{r.status.replace('_', ' ')}</span>
              </div>
              <p className="text-sm mt-2 text-slate-700">{r.requestedCorrection}</p>
              {canDecide && r.status === 'requested' && (
                <div className="mt-3 space-y-2">
                  <input
                    className="input text-sm"
                    placeholder="Resolution notes (optional)"
                    value={notes[r.id] ?? ''}
                    onChange={(e) => setNotes((prev) => ({ ...prev, [r.id]: e.target.value }))}
                  />
                  <div className="flex gap-2">
                    <button onClick={() => decide(r, 'approved')} className="btn-primary text-xs flex items-center gap-1 py-1.5 px-3">
                      <Check className="w-3.5 h-3.5" /> Approve
                    </button>
                    <button onClick={() => decide(r, 'rejected')} className="btn-secondary text-xs flex items-center gap-1 py-1.5 px-3">
                      <XIcon className="w-3.5 h-3.5" /> Reject
                    </button>
                  </div>
                </div>
              )}
              {r.resolutionNotes && <p className="text-xs text-slate-500 mt-2">Resolution: {r.resolutionNotes}</p>}
            </div>
          );
        })}
      </div>
    </div>
  );
}
