import { useEffect, useState } from 'react';
import { CheckCircle2, Lock, Printer, Share2 } from 'lucide-react';
import { useAuth } from '../../lib/auth';
import { supabase } from '../../lib/supabase';
import { computeDailyTotals, closeDay, getTodaysClosing, reopenClosing, DailyTotals, ExistingClosing } from '../../lib/closing';
import { PasswordInput } from '../../components/PasswordInput';

function money(n: number, currency: string) {
  return `${currency} ${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function EndOfDay() {
  const { business, profile, activeBranchId, userId, branches, canViewAllBranches, setActiveBranch } = useAuth();
  const currency = business?.currency ?? 'KES';
  const branch = branches.find((b) => b.id === activeBranchId);
  const viewingAll = activeBranchId === null && canViewAllBranches;
  const canReopen = profile?.role === 'owner' || profile?.role === 'manager';

  const [totals, setTotals] = useState<DailyTotals | null>(null);
  const [actualCash, setActualCash] = useState('');
  const [discrepancyReason, setDiscrepancyReason] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ cashDifference: number } | null>(null);
  const [saving, setSaving] = useState(false);

  const [existing, setExisting] = useState<ExistingClosing | null | undefined>(undefined); // undefined = still checking
  const [reopening, setReopening] = useState(false);

  useEffect(() => {
    if (business && activeBranchId) {
      setExisting(undefined);
      getTodaysClosing(business.id, activeBranchId).then(setExisting);
      computeDailyTotals(business.id, activeBranchId).then((t) => {
        setTotals(t);
        setActualCash(String(t.expectedCash));
      });
    }
  }, [business?.id, activeBranchId]);

  const diffValue = totals ? (parseFloat(actualCash) || 0) - totals.expectedCash : 0;
  const needsReason = Math.abs(diffValue) > 0.005;

  async function submit() {
    if (!business || !activeBranchId || !userId || !totals) return;
    if (needsReason && !discrepancyReason.trim()) {
      setError('A reason is required when actual cash doesn\'t match the expected amount');
      return;
    }
    setError(null); setSaving(true);
    try {
      const res = await closeDay({
        businessId: business.id, branchId: activeBranchId, closedBy: userId,
        totals, actualCash: parseFloat(actualCash) || 0,
        discrepancyReason: needsReason ? discrepancyReason.trim() : null,
        notes: notes.trim() || null
      });
      setResult(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not close the day — check your connection');
    } finally { setSaving(false); }
  }

  if (!activeBranchId) {
    return (
      <div className="p-6 max-w-md mx-auto text-center">
        {viewingAll ? (
          <>
            <p className="text-sm font-medium mb-1">Pick a branch to close</p>
            <p className="text-sm text-slate-500 mb-4">Closing is done per branch — "All Branches" is a reporting view.</p>
            <div className="space-y-1.5 text-left">
              {branches.map((b) => (
                <button key={b.id} onClick={() => setActiveBranch(b.id)} className="w-full btn-secondary text-sm justify-start">{b.name}</button>
              ))}
            </div>
          </>
        ) : (
          <p className="text-sm text-slate-500">Select a branch first.</p>
        )}
      </div>
    );
  }

  // Already closed today, and nobody has reopened it — show the record,
  // not another input form. Only owner/manager can reopen; a cashier just
  // sees that it's done.
  if (existing && !existing.reopenedAt && !result) {
    return (
      <div className="p-4 md:p-8 max-w-lg mx-auto">
        <ClosingReceipt closing={existing} branchName={branch?.name} currency={currency} />
        {canReopen && (
          <button onClick={() => setReopening(true)} className="btn-secondary w-full mt-4 flex items-center justify-center gap-1.5">
            <Lock className="w-4 h-4" /> Reopen this day
          </button>
        )}
        {reopening && (
          <ReopenModal closing={existing} onClose={() => setReopening(false)} onReopened={() => { setExisting({ ...existing, reopenedAt: new Date().toISOString() }); setReopening(false); }} />
        )}
      </div>
    );
  }

  if (!totals || existing === undefined) {
    return <div className="p-6 text-sm text-slate-500">Calculating today's totals…</div>;
  }

  if (result) {
    return (
      <div className="p-4 md:p-8 max-w-lg mx-auto">
        <div className="text-center mb-4">
          <CheckCircle2 className="w-12 h-12 text-field-600 mx-auto mb-3" />
          <h1 className="font-display text-xl font-semibold mb-1">Day closed</h1>
          <p className="text-sm text-slate-500">{branch?.name} · {new Date().toLocaleDateString()}</p>
        </div>
        <ClosingReceipt
          closing={{
            id: '', totalSales: totals.totalSales, cashSales: totals.cashSales, mpesaSales: totals.mpesaSales,
            cardSales: totals.cardSales, bankSales: totals.bankSales, creditSales: totals.creditSales, otherSales: totals.otherSales,
            refundsTotal: totals.refundsTotal, expensesTotal: totals.expensesTotal, expectedCash: totals.expectedCash,
            actualCash: parseFloat(actualCash) || 0, cashDifference: result.cashDifference, discrepancyReason: discrepancyReason || null,
            notes: notes || null, closedBy: userId, createdAt: new Date().toISOString(), reopenedAt: null, reopenedBy: null, reopenReason: null
          }}
          branchName={branch?.name}
          currency={currency}
          cancellationsCount={totals.cancellationsCount}
        />
        <div className="flex gap-2 mt-4">
          <button onClick={() => window.print()} className="btn-secondary flex-1 flex items-center justify-center gap-1.5">
            <Printer className="w-4 h-4" /> Print
          </button>
          {'share' in navigator && (
            <button
              onClick={() => (navigator as any).share({ title: 'Daily closing', text: `${branch?.name} closed ${new Date().toLocaleDateString()} — total sales ${money(totals.totalSales, currency)}, cash difference ${money(result.cashDifference, currency)}` })}
              className="btn-secondary flex-1 flex items-center justify-center gap-1.5"
            >
              <Share2 className="w-4 h-4" /> Share
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-8 max-w-lg mx-auto">
      <h1 className="font-display text-2xl font-semibold mb-1">Close the day</h1>
      <p className="text-sm text-slate-500 mb-4">{branch?.name} · {new Date().toLocaleDateString()}</p>

      {existing?.reopenedAt && (
        <div className="card p-3 mb-4 bg-amber-50 border-amber-200">
          <p className="text-xs text-amber-700">
            This day was reopened{existing.reopenReason ? ` — reason: "${existing.reopenReason}"` : ''}. Closing again will record fresh totals.
          </p>
        </div>
      )}

      <div className="card p-4 space-y-2 mb-4 text-sm">
        <Row label="Transactions" value={String(totals.transactionCount)} />
        <Row label="Total sales" value={money(totals.totalSales, currency)} />
        <div className="border-t border-slate-100 my-2" />
        <Row label="Cash" value={money(totals.cashSales, currency)} />
        <Row label="M-Pesa" value={money(totals.mpesaSales, currency)} />
        <Row label="Card" value={money(totals.cardSales, currency)} />
        <Row label="Bank" value={money(totals.bankSales, currency)} />
        <Row label="Credit" value={money(totals.creditSales, currency)} />
        <div className="border-t border-slate-100 my-2" />
        <Row label="Refunds" value={money(totals.refundsTotal, currency)} negative />
        <Row label="Expenses" value={money(totals.expensesTotal, currency)} negative />
        <Row label="Cancellations" value={String(totals.cancellationsCount)} />
        <div className="border-t border-slate-100 my-2" />
        <Row label="Expected cash in drawer" value={money(totals.expectedCash, currency)} bold />
      </div>

      <div className="card p-4 space-y-3">
        <label className="block">
          <span className="block text-sm font-medium text-slate-600 mb-1.5">Actual cash counted</span>
          <input className="input tnum" type="number" value={actualCash} onChange={(e) => setActualCash(e.target.value)} />
        </label>
        {needsReason && (
          <label className="block">
            <span className="block text-sm font-medium text-slate-600 mb-1.5">
              Reason for the {diffValue > 0 ? 'overage' : 'shortage'} ({money(Math.abs(diffValue), currency)})
            </span>
            <textarea className="input min-h-16" value={discrepancyReason} onChange={(e) => setDiscrepancyReason(e.target.value)} placeholder="What happened?" />
          </label>
        )}
        <label className="block">
          <span className="block text-sm font-medium text-slate-600 mb-1.5">Notes (optional)</span>
          <textarea className="input min-h-16" value={notes} onChange={(e) => setNotes(e.target.value)} />
        </label>
        {error && <p className="text-sm text-rust-600">{error}</p>}
        <button onClick={submit} disabled={saving} className="btn-primary w-full">
          {saving ? 'Closing…' : 'Confirm and close day'}
        </button>
      </div>
    </div>
  );
}

function ClosingReceipt({ closing, branchName, currency, cancellationsCount }: { closing: ExistingClosing; branchName?: string; currency: string; cancellationsCount?: number }) {
  const diff = closing.cashDifference ?? 0;
  return (
    <div className="card p-4 space-y-2 text-sm">
      <div className="flex items-center justify-between mb-1">
        <span className="font-medium">{branchName}</span>
        <span className="text-xs text-slate-500">{new Date(closing.createdAt).toLocaleString()}</span>
      </div>
      <Row label="Total sales" value={money(closing.totalSales, currency)} />
      <div className="border-t border-slate-100 my-2" />
      <Row label="Cash" value={money(closing.cashSales, currency)} />
      <Row label="M-Pesa" value={money(closing.mpesaSales, currency)} />
      <Row label="Card" value={money(closing.cardSales, currency)} />
      <Row label="Bank" value={money(closing.bankSales, currency)} />
      <Row label="Credit" value={money(closing.creditSales, currency)} />
      <div className="border-t border-slate-100 my-2" />
      <Row label="Refunds" value={money(closing.refundsTotal, currency)} negative />
      <Row label="Expenses" value={money(closing.expensesTotal, currency)} negative />
      {cancellationsCount !== undefined && <Row label="Cancellations" value={String(cancellationsCount)} />}
      <div className="border-t border-slate-100 my-2" />
      <Row label="Expected cash" value={money(closing.expectedCash, currency)} />
      <Row label="Actual cash" value={money(closing.actualCash ?? 0, currency)} />
      <Row label="Difference" value={diff === 0 ? 'Exact' : `${diff > 0 ? '+' : ''}${money(diff, currency)}`} bold negative={diff < 0} />
      {closing.discrepancyReason && (
        <p className="text-xs text-slate-500 pt-1">Reason: {closing.discrepancyReason}</p>
      )}
      {closing.notes && (
        <p className="text-xs text-slate-500 pt-1">Notes: {closing.notes}</p>
      )}
    </div>
  );
}

function ReopenModal({ closing, onClose, onReopened }: { closing: ExistingClosing; onClose: () => void; onReopened: () => void }) {
  const [reason, setReason] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (!reason.trim() || !password) return;
    if (!supabase) { setError('No backend configured'); return; }
    setBusy(true); setError(null);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user?.email) throw new Error('Could not verify your account');
      // Re-authentication before reopening a closed day, per spec — the
      // RPC itself also checks role server-side, this just confirms it's
      // really the signed-in person typing right now, not a device left
      // unlocked.
      const { error: authError } = await supabase.auth.signInWithPassword({ email: user.email, password });
      if (authError) throw new Error('Incorrect password');
      await reopenClosing(closing.id, reason.trim());
      onReopened();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not reopen this day');
    } finally { setBusy(false); }
  }

  return (
    <div className="fixed inset-0 z-[55] flex items-end md:items-center md:justify-center">
      <div className="absolute inset-0 bg-ink/40" onClick={onClose} />
      <div className="relative w-full md:max-w-sm bg-paper-raised rounded-t-2xl md:rounded-2xl p-5 space-y-3">
        <h3 className="font-display font-semibold text-lg">Reopen this day</h3>
        <p className="text-xs text-slate-500">Confirm your password and give a reason — this is recorded and cannot be undone.</p>
        <label className="block">
          <span className="block text-sm font-medium text-slate-600 mb-1.5">Reason</span>
          <textarea className="input min-h-16" value={reason} onChange={(e) => setReason(e.target.value)} autoFocus />
        </label>
        <label className="block">
          <span className="block text-sm font-medium text-slate-600 mb-1.5">Your password</span>
          <PasswordInput value={password} onChange={setPassword} />
        </label>
        {error && <p className="text-sm text-rust-600">{error}</p>}
        <div className="flex gap-2">
          <button onClick={submit} disabled={busy || !reason.trim() || !password} className="btn-primary flex-1">{busy ? 'Reopening…' : 'Reopen'}</button>
          <button onClick={onClose} className="btn-secondary flex-1">Cancel</button>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value, negative, bold }: { label: string; value: string; negative?: boolean; bold?: boolean }) {
  return (
    <div className="flex justify-between">
      <span className="text-slate-500">{label}</span>
      <span className={`tnum ${bold ? 'font-semibold' : ''} ${negative ? 'text-rust-600' : ''}`}>{negative ? '−' : ''}{value}</span>
    </div>
  );
}
