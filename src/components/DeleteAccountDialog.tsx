import { useState } from 'react';
import { AlertTriangle, X, Loader2 } from 'lucide-react';
import { supabase, backendConfigured } from '../lib/supabase';
import { db } from '../lib/db';
import { useAuth } from '../lib/auth';

/** Delete-my-account flow: clear warnings, then password + typed confirmation (and the business name for owners).
 * The server (edge function `delete-my-account`) re-checks the password itself; this UI is not the safeguard. */
export function DeleteAccountDialog({ pendingChanges, onClose }: { pendingChanges: number; onClose: () => void }) {
  const { profile, business, signOut } = useAuth();
  const isOwner = profile?.role === 'owner';
  const [password, setPassword] = useState('');
  const [confirmText, setConfirmText] = useState('');
  const [bizName, setBizName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const online = typeof navigator === 'undefined' ? true : navigator.onLine;

  const ready = password.length > 0 && confirmText.trim().toUpperCase() === 'DELETE'
    && (!isOwner || bizName.trim().toLowerCase() === (business?.name ?? '').trim().toLowerCase())
    && online && backendConfigured();

  async function submit() {
    if (!supabase || !ready) return;
    setBusy(true); setError(null);
    try {
      const { data, error: fnError } = await supabase.functions.invoke('delete-my-account', {
        body: { password, confirmText, businessName: isOwner ? bizName : undefined }
      });
      // Non-2xx responses carry the server's message in the error's context.
      if (fnError) {
        let msg = fnError.message;
        try { const ctx = (fnError as unknown as { context?: Response }).context; if (ctx) msg = (await ctx.json()).error ?? msg; } catch { /* keep default */ }
        throw new Error(msg);
      }
      if (data?.error) throw new Error(data.error);
      // The account (and, for owners, the business) no longer exists: nothing left here can sync.
      await db.syncQueue.clear();
      await signOut();
      window.location.replace('/');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not delete the account');
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-3">
      <div className="absolute inset-0 bg-ink/60" onClick={busy ? undefined : onClose} aria-hidden="true" />
      <div role="alertdialog" aria-modal="true" aria-labelledby="del-title" className="relative w-full max-w-md max-h-[92vh] overflow-y-auto bg-paper-raised rounded-2xl p-5 shadow-xl space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <span className="w-10 h-10 rounded-xl bg-rust-50 text-rust-600 flex items-center justify-center shrink-0"><AlertTriangle className="w-5 h-5" /></span>
            <h3 id="del-title" className="font-display font-semibold text-lg">Delete your account</h3>
          </div>
          <button onClick={onClose} disabled={busy} aria-label="Close" className="p-2 -m-2"><X className="w-5 h-5" /></button>
        </div>

        <div className="rounded-xl bg-rust-50 text-rust-600 p-3 text-sm space-y-1.5">
          <p className="font-medium">This cannot be undone.</p>
          {isOwner ? (
            <ul className="list-disc pl-5 space-y-1 text-[13px]">
              <li>You are the owner, so <strong>{business?.name}</strong> and <strong>all of its data</strong> will be permanently deleted: sales, products, customers, debts, payments and reports.</li>
              <li>Every staff member's account for this business is deleted too, and they will be signed out.</li>
              <li>Download or record anything you need <strong>before</strong> continuing. We cannot restore it.</li>
            </ul>
          ) : (
            <ul className="list-disc pl-5 space-y-1 text-[13px]">
              <li>Your sign-in is closed and you lose access to <strong>{business?.name}</strong>.</li>
              <li>Sales and records you created stay in the business, as they belong to it.</li>
              {pendingChanges > 0 && <li><strong>{pendingChanges} change{pendingChanges === 1 ? '' : 's'} on this device haven't synced yet</strong> and will be lost. Sync first if you can.</li>}
            </ul>
          )}
        </div>

        {!online && <p className="text-sm text-amber-600">You are offline. Connect to the internet to delete your account.</p>}

        <label className="block">
          <span className="block text-sm font-medium text-slate-600 mb-1.5">Your password</span>
          <input type="password" autoComplete="current-password" className="input" value={password} onChange={(e) => setPassword(e.target.value)} disabled={busy} />
        </label>
        {isOwner && (
          <label className="block">
            <span className="block text-sm font-medium text-slate-600 mb-1.5">Type your business name: <span className="text-ink">{business?.name}</span></span>
            <input className="input" value={bizName} onChange={(e) => setBizName(e.target.value)} disabled={busy} autoComplete="off" />
          </label>
        )}
        <label className="block">
          <span className="block text-sm font-medium text-slate-600 mb-1.5">Type <span className="font-mono text-ink">DELETE</span> to confirm</span>
          <input className="input font-mono" value={confirmText} onChange={(e) => setConfirmText(e.target.value)} disabled={busy} autoCapitalize="characters" autoComplete="off" />
        </label>

        {error && <p className="text-sm text-rust-600 break-words" role="alert">{error}</p>}

        <div className="grid grid-cols-2 gap-2 pt-1">
          <button onClick={onClose} disabled={busy} className="btn-secondary min-h-[48px]">Cancel</button>
          <button onClick={submit} disabled={!ready || busy} className="btn-primary min-h-[48px] !bg-rust-600 inline-flex items-center justify-center gap-2 disabled:opacity-50">
            {busy ? <><Loader2 className="w-4 h-4 animate-spin" /> Deleting…</> : 'Delete forever'}
          </button>
        </div>
      </div>
    </div>
  );
}
