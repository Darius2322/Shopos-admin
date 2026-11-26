import { useCallback, useEffect, useState } from 'react';
import { SupabaseClient } from '@supabase/supabase-js';
import { Card, EmptyState, ErrorText, Modal, Skeleton } from '../components/ui';
import { describeError } from '../lib/errors';

interface Settings { auto_pause: boolean; after: number; warn: number[]; mode: 'instant' | 'approval'; skip: boolean }
interface Over {
  pending: { id: string; business_id: string; name: string; phone: string | null; at: string }[];
  paused: { id: string; name: string; paused_at: string | null; days: number }[];
  upcoming: { id: string; name: string; days: number; left: number }[];
  history: { name: string; action: string; days: number | null; at: string }[];
}
const when = (d?: string | null) => (d ? new Date(d).toLocaleString('en-KE', { timeZone: 'Africa/Nairobi', day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—');
const ACTION: Record<string, string> = { warn: 'Warning sent', pause: 'Paused', reactivate: 'Activated again', refuse: 'Request declined' };

/** Pause businesses that stay unused, warn them first, and let them switch back on. Nothing is deleted when a business is paused. */
export default function AutoPause({ supabase }: { supabase: SupabaseClient }) {
  const [s, setS] = useState<Settings | null>(null); const [o, setO] = useState<Over | null>(null); const [err, setErr] = useState<string | null>(null); const [busy, setBusy] = useState(false);
  const [after, setAfter] = useState('90'); const [warn, setWarn] = useState('14, 3'); const [saved, setSaved] = useState(false);
  const [decline, setDecline] = useState<{ id: string; name: string } | null>(null); const [reason, setReason] = useState('');

  const apply = (x: Settings) => { setS(x); setAfter(String(x.after)); setWarn(x.warn.join(', ')); };
  const loadOver = useCallback(async () => {
    const { data, error } = await supabase.rpc('admin_autopause_overview'); if (error) setErr(describeError(error, 'Could not load')); else setO(data as Over);
  }, [supabase]);
  const save = useCallback(async (patch: Record<string, unknown> = {}) => {
    setBusy(true); setErr(null);
    const { data, error } = await supabase.rpc('admin_autopause_settings', { p_auto_pause: null, p_after: null, p_warn: null, p_mode: null, p_skip: null, ...patch });
    setBusy(false); if (error) { setErr(describeError(error, 'Could not save')); return; }
    apply(data as Settings); setSaved(true); setTimeout(() => setSaved(false), 1500); void loadOver();
  }, [supabase, loadOver]);
  useEffect(() => { void save(); }, [save]);

  const saveNumbers = () => {
    const a = parseInt(after, 10); const w = warn.split(/[ ,]+/).map((x) => parseInt(x, 10)).filter((x) => !Number.isNaN(x));
    if (Number.isNaN(a)) { setErr('Enter the number of days'); return; }
    void save({ p_after: a, p_warn: w.length ? w : null });
  };
  const decide = async (businessId: string, approve: boolean, why?: string) => {
    setBusy(true); setErr(null);
    const { error } = await supabase.rpc('admin_reactivation_decide', { p_business_id: businessId, p_approve: approve, p_reason: why ?? null });
    setBusy(false); if (error) { setErr(describeError(error, 'Could not save')); return; }
    setDecline(null); setReason(''); void loadOver();
  };

  if (!s || !o) return err ? <ErrorText>{err}</ErrorText> : <Skeleton />;
  return (
    <div className="space-y-4">
      <div><h2 className="text-lg font-semibold">Auto-pause unused businesses</h2><p className="text-xs text-slate-400">Pausing saves resources and nothing is deleted. Products, sales and customers stay exactly as they are, and the owner can switch the account back on.</p></div>
      {err && <ErrorText>{err}</ErrorText>}

      <Card>
        <div className="flex items-start justify-between gap-3">
          <div><h3 className="text-sm font-semibold">Automatic pausing</h3><p className="text-xs text-slate-400">Checked every morning (10:00 Nairobi). Owners get a push notification and an in-app message before the pause and when it happens.</p></div>
          <button disabled={busy} onClick={() => void save({ p_auto_pause: !s.auto_pause })} className={`shrink-0 rounded-full px-3 py-1 text-xs font-medium ${s.auto_pause ? 'bg-emerald-600 text-white' : 'border border-slate-600 text-slate-300'}`}>{s.auto_pause ? 'On' : 'Off'}</button>
        </div>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <label className="text-xs text-slate-400">Pause after (days unused)<input inputMode="numeric" value={after} onChange={(e) => setAfter(e.target.value)} className="mt-1 w-full rounded border border-slate-600 bg-transparent px-2 py-1.5 text-sm" /></label>
          <label className="text-xs text-slate-400">Warn this many days before (e.g. 14, 3)<input value={warn} onChange={(e) => setWarn(e.target.value)} className="mt-1 w-full rounded border border-slate-600 bg-transparent px-2 py-1.5 text-sm" /></label>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="text-xs text-slate-400">When the owner presses Activate:</span>
          {([['instant', 'Switch on at once'], ['approval', 'Ask me first']] as const).map(([k, l]) => <button key={k} disabled={busy} onClick={() => void save({ p_mode: k })} className={`rounded-full border px-3 py-1 text-xs ${s.mode === k ? 'bg-emerald-600 border-emerald-600 text-white' : 'border-slate-600 text-slate-300'}`}>{l}</button>)}
        </div>
        <label className="mt-3 flex items-center gap-2 text-xs text-slate-300"><input type="checkbox" checked={s.skip} onChange={(e) => void save({ p_skip: e.target.checked })} /> Never pause a business whose access period has not ended yet</label>
        <div className="mt-3 flex items-center gap-2"><button className="btn-secondary text-xs" disabled={busy} onClick={saveNumbers}>Save days</button>{saved && <span className="text-xs text-emerald-400">Saved ✓</span>}</div>
        <p className="mt-2 text-[11px] text-slate-500">Only shops are paused automatically. A business you pause yourself, or one paused for an expired plan, can't be switched back on by the owner; only you can.</p>
      </Card>

      <Card>
        <h3 className="text-sm font-semibold mb-2">Activation requests ({o.pending.length})</h3>
        {o.pending.length === 0 ? <p className="text-xs text-slate-500">No one is waiting.{s.mode === 'instant' ? ' Owners currently switch themselves back on, so requests only appear when you choose “Ask me first”.' : ''}</p> : <ul className="divide-y divide-slate-700/60">{o.pending.map((p) => (
          <li key={p.id} className="py-2 flex flex-wrap items-center gap-2 text-sm"><span className="flex-1 min-w-0"><span className="block truncate">{p.name}</span><span className="block text-[11px] text-slate-500">{p.phone ?? 'no phone'} · asked {when(p.at)}</span></span>
            <button className="btn-secondary text-xs" disabled={busy} onClick={() => void decide(p.business_id, true)}>Activate</button>
            <button className="btn-secondary text-xs" disabled={busy} onClick={() => setDecline({ id: p.business_id, name: p.name })}>Decline</button></li>))}</ul>}
      </Card>

      <Card>
        <h3 className="text-sm font-semibold mb-2">Paused for being unused ({o.paused.length})</h3>
        {o.paused.length === 0 ? <p className="text-xs text-slate-500">None right now.</p> : <ul className="divide-y divide-slate-700/60">{o.paused.map((p) => (
          <li key={p.id} className="py-2 flex items-center gap-2 text-sm"><span className="flex-1 min-w-0"><span className="block truncate">{p.name}</span><span className="block text-[11px] text-slate-500">Paused {when(p.paused_at)}</span></span><button className="btn-secondary text-xs" disabled={busy} onClick={() => void decide(p.id, true)}>Activate</button></li>))}</ul>}
      </Card>

      <Card>
        <h3 className="text-sm font-semibold mb-2">Coming up, next 30 days ({o.upcoming.length})</h3>
        {o.upcoming.length === 0 ? <p className="text-xs text-slate-500">No business is close to the limit.</p> : <ul className="text-sm space-y-1">{o.upcoming.map((u) => <li key={u.id} className="flex justify-between gap-2"><span className="truncate">{u.name}</span><span className="text-xs text-slate-400 shrink-0">{u.days} days unused · pauses in {u.left} day{u.left === 1 ? '' : 's'}{s.auto_pause ? '' : ' (if switched on)'}</span></li>)}</ul>}
      </Card>

      <Card>
        <h3 className="text-sm font-semibold mb-2">Recent activity</h3>
        {o.history.length === 0 ? <EmptyState message="Nothing yet." /> : <ul className="text-xs text-slate-400 space-y-1">{o.history.map((h, i) => <li key={i}>{when(h.at)} · <span className="text-slate-200">{h.name}</span> · {ACTION[h.action] ?? h.action}{h.days != null ? ` (${h.days} days unused)` : ''}</li>)}</ul>}
      </Card>

      {decline && (
        <Modal title="Decline activation" subtitle={decline.name} onClose={() => setDecline(null)}>
          <label className="text-xs text-slate-400">Reason the owner will see (optional)<textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)} className="mt-1 w-full rounded border border-slate-600 bg-transparent px-2 py-1.5 text-sm" /></label>
          <div className="mt-3 flex gap-2"><button className="btn-secondary text-xs" disabled={busy} onClick={() => void decide(decline.id, false, reason)}>Decline request</button><button className="btn-secondary text-xs" onClick={() => setDecline(null)}>Cancel</button></div>
        </Modal>
      )}
    </div>
  );
}
