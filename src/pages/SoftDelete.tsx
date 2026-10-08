import { useCallback, useEffect, useState } from 'react';
import { SupabaseClient } from '@supabase/supabase-js';
import { Loader2, RotateCcw, Trash2, CalendarPlus, RefreshCw } from 'lucide-react';
import { Card, EmptyState, Skeleton, ErrorText } from '../components/ui';
import { supabaseUrl } from '../lib/supabase';
import { friendlyError } from '../lib/friendlyError';

interface Row { id: string; name: string; owner_email: string | null; deleted_at: string; deletion_reason: string | null; status_before_delete: string | null; purge_after: string | null; days_left: number | null; overdue: boolean; products: number; sales: number; staff: number }

/** Every soft-deleted business, including those whose 30 days have ended. Restore brings it back exactly as it was;
 * Extend gives it more time; Delete forever permanently removes it and all of its data (type its name to confirm). */
export default function SoftDelete({ supabase }: { supabase: SupabaseClient }) {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<Row | null>(null);
  const [typed, setTyped] = useState('');
  const [extend, setExtend] = useState<{ row: Row; days: number } | null>(null);

  const load = useCallback(async () => {
    const { data, error: e } = await supabase.rpc('admin_deleted_businesses');
    if (e) setError(friendlyError(e, 'Could not load deleted businesses.')); else { setError(null); setRows((data ?? []) as Row[]); }
  }, [supabase]);
  useEffect(() => { void load(); }, [load]);

  async function call(fn: string, body: Record<string, unknown>, fallback: string) {
    const { data: { session } } = await supabase.auth.getSession();
    const res = await fetch(`${supabaseUrl}/functions/v1/${fn}`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` }, body: JSON.stringify(body) });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(typeof j.error === 'string' && j.error.length < 140 ? j.error : fallback);
  }

  async function restore(r: Row) {
    setBusy(`r-${r.id}`); setError(null); setNotice(null);
    try { await call('admin-restore-business', { businessId: r.id }, 'Could not restore this business.'); setNotice(`${r.name} was restored.`); await load(); }
    catch (e) { setError(friendlyError(e, 'Could not restore this business.')); } finally { setBusy(null); }
  }
  async function purge(r: Row) {
    setBusy(`d-${r.id}`); setError(null); setNotice(null);
    try { await call('admin-delete-business', { businessId: r.id, confirmName: typed, purge: true, reason: 'Permanently deleted by platform admin' }, 'Could not delete this business.'); setNotice(`${r.name} was permanently deleted.`); setConfirm(null); setTyped(''); await load(); }
    catch (e) { setError(friendlyError(e, 'Could not delete this business.')); } finally { setBusy(null); }
  }
  async function extendNow() {
    if (!extend) return;
    setBusy(`e-${extend.row.id}`); setError(null); setNotice(null);
    const { error: e } = await supabase.rpc('admin_extend_purge', { p_business_id: extend.row.id, p_days: extend.days });
    if (e) setError(friendlyError(e, 'Could not extend the time.')); else { setNotice(`${extend.row.name} now has ${extend.days} more days.`); setExtend(null); await load(); }
    setBusy(null);
  }

  const overdue = rows?.filter((r) => r.overdue).length ?? 0;
  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="font-display font-semibold text-lg">Soft delete</h2>
          <p className="text-xs text-slate-400">Deleted businesses are kept for 30 days so they can be restored. {rows ? `${rows.length} in total${overdue ? `, ${overdue} past the 30 days` : ''}.` : ''}</p>
        </div>
        <button onClick={() => void load()} className="btn-secondary inline-flex items-center gap-1.5 text-xs min-h-[36px] px-3 shrink-0"><RefreshCw className="w-3.5 h-3.5" /> Refresh</button>
      </div>
      {notice && <p className="text-sm rounded-xl p-3 bg-emerald-500/10 text-emerald-300" role="status">{notice}</p>}
      <ErrorText>{error}</ErrorText>
      {!rows ? <Skeleton /> : rows.length === 0 ? <Card><EmptyState message="No deleted businesses." /></Card> : rows.map((r) => (
        <Card key={r.id} className="space-y-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="font-medium truncate">{r.name}</p>
              <p className="text-xs text-slate-400 truncate">{r.owner_email ?? 'Owner not found'} · deleted {new Date(r.deleted_at).toLocaleDateString()}</p>
              {r.deletion_reason && <p className="text-xs text-slate-500 mt-0.5">{r.deletion_reason}</p>}
            </div>
            <span className={`text-xs px-2 py-0.5 rounded-full whitespace-nowrap ${r.overdue ? 'bg-red-500/20 text-red-400' : (r.days_left ?? 99) <= 7 ? 'bg-amber-500/20 text-amber-400' : 'bg-slate-700 text-slate-300'}`}>
              {r.purge_after == null ? 'No expiry' : r.overdue ? `Past 30 days` : `${r.days_left} day${r.days_left === 1 ? '' : 's'} left`}
            </span>
          </div>
          <p className="text-xs text-slate-400 tnum">{r.products.toLocaleString()} products · {r.sales.toLocaleString()} sales · {r.staff.toLocaleString()} staff{r.status_before_delete ? ` · was ${r.status_before_delete.replace(/_/g, ' ')}` : ''}</p>
          <div className="flex flex-wrap gap-2">
            <button onClick={() => void restore(r)} disabled={!!busy} className="btn-primary inline-flex items-center gap-1.5 min-h-[40px] px-4 text-sm">{busy === `r-${r.id}` ? <Loader2 className="w-4 h-4 animate-spin" /> : <RotateCcw className="w-4 h-4" />} Restore</button>
            <button onClick={() => setExtend({ row: r, days: 30 })} disabled={!!busy} className="btn-secondary inline-flex items-center gap-1.5 min-h-[40px] px-4 text-sm"><CalendarPlus className="w-4 h-4" /> Extend</button>
            <button onClick={() => { setConfirm(r); setTyped(''); }} disabled={!!busy} className="inline-flex items-center gap-1.5 min-h-[40px] px-4 text-sm rounded-xl border border-red-500/40 text-red-400 hover:bg-red-500/10"><Trash2 className="w-4 h-4" /> Delete forever</button>
          </div>
        </Card>
      ))}

      {extend && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60" role="dialog" aria-modal="true" aria-label="Extend retention">
          <Card className="w-full max-w-sm space-y-3">
            <p className="font-medium">Extend {extend.row.name}</p>
            <p className="text-xs text-slate-400">Counts from today. The business stays restorable until then.</p>
            <div className="flex gap-1.5">{[7, 30, 60, 90].map((d) => <button key={d} onClick={() => setExtend({ ...extend, days: d })} className={`flex-1 text-sm min-h-[40px] rounded-xl ${extend.days === d ? 'bg-field-600 text-white' : 'bg-slate-800 text-slate-300'}`}>{d} days</button>)}</div>
            <div className="flex gap-2 justify-end"><button onClick={() => setExtend(null)} className="btn-secondary min-h-[40px] px-4">Cancel</button><button onClick={() => void extendNow()} disabled={!!busy} className="btn-primary min-h-[40px] px-4 inline-flex items-center gap-1.5">{busy && <Loader2 className="w-4 h-4 animate-spin" />} Extend</button></div>
          </Card>
        </div>
      )}
      {confirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60" role="dialog" aria-modal="true" aria-label="Delete forever">
          <Card className="w-full max-w-sm space-y-3">
            <p className="font-medium text-red-400">Delete {confirm.name} forever?</p>
            <p className="text-xs text-slate-400">This removes the business and ALL of its data ({confirm.products.toLocaleString()} products, {confirm.sales.toLocaleString()} sales). It cannot be undone. Type the business name to confirm.</p>
            <input value={typed} onChange={(e) => setTyped(e.target.value)} className="input w-full" placeholder={confirm.name} aria-label="Type the business name" autoFocus />
            <div className="flex gap-2 justify-end"><button onClick={() => setConfirm(null)} className="btn-secondary min-h-[40px] px-4">Cancel</button><button onClick={() => void purge(confirm)} disabled={typed.trim() !== confirm.name.trim() || !!busy} className="min-h-[40px] px-4 rounded-xl bg-red-600 text-white disabled:opacity-40 inline-flex items-center gap-1.5">{busy && <Loader2 className="w-4 h-4 animate-spin" />} Delete forever</button></div>
          </Card>
        </div>
      )}
    </div>
  );
}
