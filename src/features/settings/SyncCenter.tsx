import { useLiveQuery } from 'dexie-react-hooks';
import { RefreshCw, AlertTriangle, Wifi, WifiOff, CheckCircle2, Loader2 } from 'lucide-react';
import { db } from '../../lib/db';
import { syncNow, retryFailed, retryItem, MAX_ATTEMPTS, useSyncStore, syncHealth, syncHealthReport } from '../../lib/sync';
import { useAuth } from '../../lib/auth';
import { syncPayments } from '../../lib/payments/store';
import { backendConfigured } from '../../lib/supabase';

export function SyncCenter() {
  const { connection, lastSyncAt, lastError, pendingCount, failedCount, authRequired } = useSyncStore();
  const { signOut } = useAuth();
  const health = syncHealth({ connection, authRequired, failedCount });
  const queue = useLiveQuery(() => db.syncQueue.orderBy('createdAt').reverse().toArray(), []) ?? [];
  const failedPayments = useLiveQuery(() => db.paymentTransactions.where('syncStatus').equals('failed').toArray(), []) ?? [];
  const failedPaymentsCount = failedPayments.filter((t) => !t.localFlag).length;
  const report = syncHealthReport({ connection, authRequired, failedCount: failedCount + failedPaymentsCount, pendingCount, lastError });

  // One clear headline state, in the order the person cares about.
  const headline =
    health === 'signin' ? { label: 'Sign in to sync', cls: 'text-rust-600', icon: <AlertTriangle className="w-5 h-5" /> }
    : failedCount > 0 || failedPayments.length > 0 ? { label: 'Sync failed', cls: 'text-rust-600', icon: <AlertTriangle className="w-5 h-5" /> }
    : connection === 'offline' ? { label: 'Offline', cls: 'text-amber-600', icon: <WifiOff className="w-5 h-5" /> }
    : connection === 'syncing' ? { label: 'Syncing', cls: 'text-field-700', icon: <Loader2 className="w-5 h-5 animate-spin" /> }
    : pendingCount > 0 ? { label: `Online · ${pendingCount} waiting to sync`, cls: 'text-field-700', icon: <Wifi className="w-5 h-5" /> }
    : { label: 'Synced', cls: 'text-field-700', icon: <CheckCircle2 className="w-5 h-5" /> };

  return (
    <div className="p-4 md:p-8 max-w-2xl mx-auto">
      <h1 className="font-display text-2xl font-semibold mb-4">Sync Center</h1>

      {!backendConfigured() && (
        <div className="card p-4 mb-4 bg-amber-50 border-amber-200 flex gap-3">
          <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
          <div className="text-sm">
            <p className="font-medium text-amber-700">No cloud backend connected yet</p>
            <p className="text-slate-600 mt-0.5">Every sale, payment and change is being saved locally and will sync once Supabase is configured.</p>
          </div>
        </div>
      )}

      <div className={`card p-4 mb-3 flex items-start gap-3 ${report.healthy ? 'border-field-600/40' : 'border-rust-600/40'}`}>
        <span className={`mt-1 w-3 h-3 rounded-full shrink-0 ${report.healthy ? 'bg-field-600' : report.title === 'Offline' ? 'bg-amber-500' : 'bg-rust-600'}`} />
        <div className="min-w-0">
          <div className="font-medium">{report.healthy ? 'System is healthy' : report.title === 'Offline' ? 'System is offline' : 'System needs attention'}</div>
          <div className="text-sm text-slate-500 break-words">{report.detail}</div>
        </div>
      </div>

      <div className={`card p-4 mb-4 flex items-center gap-3 ${headline.cls}`}>
        {headline.icon}
        <div className="min-w-0">
          <div className="font-medium">{headline.label}</div>
          <div className="text-xs text-slate-500">Last synced: {lastSyncAt ? new Date(lastSyncAt).toLocaleString() : 'never'}</div>
        </div>
      </div>

      <div className="card p-4 mb-4 grid grid-cols-3 gap-3 text-sm">
        <div><div className="text-slate-500 text-xs">Waiting</div><div className="font-medium tnum">{pendingCount}</div></div>
        <div><div className="text-slate-500 text-xs">Failed</div><div className="font-medium tnum text-rust-600">{failedCount + failedPayments.length}</div></div>
        <div><div className="text-slate-500 text-xs">Connection</div><div className="font-medium capitalize">{connection}</div></div>
      </div>

      {lastError && (
        <div className="mb-4 text-sm bg-rust-50 text-rust-600 rounded-card p-3 break-words">
          <span className="font-medium">Reason: </span>{lastError}
        </div>
      )}

      {health === 'signin' && (
        <div className="mb-4 card p-4 text-sm">
          <p className="mb-3 text-slate-600">Your sign-in has expired, so nothing can be sent to the cloud right now. Everything you've done is saved on this device and will sync after you sign in again.</p>
          <button onClick={() => signOut()} className="btn-primary min-h-[44px]">Sign in again</button>
        </div>
      )}

      <div className="flex flex-wrap gap-2 mb-6">
        <button onClick={() => { void syncNow(); }} className="btn-primary flex items-center gap-1.5 text-sm min-h-[44px]">
          <RefreshCw className="w-4 h-4" /> Sync now
        </button>
        {(failedCount > 0 || failedPayments.length > 0) && (
          <button
            onClick={async () => {
              for (const t of failedPayments) if (!t.localFlag) await db.paymentTransactions.update(t.id, { syncStatus: 'pending', syncError: null });
              await retryFailed(); await syncPayments();
            }}
            className="btn-secondary text-sm min-h-[44px]"
          >Retry failed ({failedCount + failedPayments.filter((t) => !t.localFlag).length})</button>
        )}
      </div>

      <h2 className="font-display font-semibold mb-2 text-sm">Queue</h2>
      <div className="card divide-y divide-slate-100">
        {queue.length === 0 && failedPayments.length === 0 && <p className="text-sm text-slate-500 py-6 text-center">Nothing queued. Everything is synced.</p>}
        {queue.slice(0, 50).map((item) => {
          const failed = item.attempts >= MAX_ATTEMPTS;
          const state = failed ? 'Failed' : item.attempts > 0 ? `Retrying (${item.attempts}/${MAX_ATTEMPTS})` : 'Pending sync';
          return (
            <div key={item.id} className="px-4 py-3 text-sm">
              <div className="flex items-center justify-between gap-3">
                <div className="font-medium min-w-0 truncate">{item.entity} · {item.op}</div>
                <span className={`text-xs shrink-0 ${failed ? 'text-rust-600 font-medium' : 'text-slate-500'}`}>{state}</span>
              </div>
              <div className="text-xs text-slate-400 tnum">{new Date(item.createdAt).toLocaleString()}</div>
              {item.lastError && <div className="text-xs text-rust-600 mt-1 break-words">Reason: {item.lastError}</div>}
              {failed && <button onClick={() => retryItem(item.id)} className="btn-secondary text-xs !py-1.5 !px-3 mt-2">Retry</button>}
            </div>
          );
        })}
        {failedPayments.map((t) => (
          <div key={t.id} className="px-4 py-3 text-sm">
            <div className="flex items-center justify-between gap-3">
              <div className="font-medium tnum truncate">M-Pesa · {t.transactionCode}</div>
              <span className="text-xs text-rust-600 font-medium shrink-0">Failed</span>
            </div>
            {t.syncError && <div className="text-xs text-rust-600 mt-1 break-words">Reason: {t.syncError}</div>}
            {!t.localFlag && (
              <button onClick={async () => { await db.paymentTransactions.update(t.id, { syncStatus: 'pending', syncError: null }); await syncPayments(); }} className="btn-secondary text-xs !py-1.5 !px-3 mt-2">Retry</button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
