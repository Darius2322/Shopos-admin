import { useCallback, useEffect, useState } from 'react';
import { SupabaseClient } from '@supabase/supabase-js';
import { Card, EmptyState, ErrorText, Modal, Skeleton } from '../components/ui';
import { describeError } from '../lib/errors';

interface Settings { auto_pause: boolean; after: number; warn: number[]; mode: 'instant' | 'approval'; skip: boolean }
interface Over {
  pending: { id: string; business_id: string; name: string; phone: string | null; at: string }[];
  paused: { id: string; name: string; paused_at: string | null; days: number }[];
  upcoming: { id: string; name: string; days: number; left: number }[];
  businesses: { id: string; name: string; status: string; mode: 'instant' | 'approval' | null; days: number }[];
  history: { name: string; action: string; days: number | null; at: string }[];
}
type Unit = 'days' | 'weeks' | 'months';
const MUL: Record<Unit, number> = { days: 1, weeks: 7, months: 30 };
const when = (d?: string | null) => (d ? new Date(d).toLocaleString('en-KE', { timeZone: 'Africa/Nairobi', day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—');
const ACTION: Record<string, string> = { warn: 'Warning sent', pause: 'Paused', reactivate: 'Activated again', refuse: 'Request declined' };
/** 14 -> "2 weeks", 90 -> "3 months", 10 -> "10 days". */
export function human(d: number): string {
  if (d % 30 === 0) return `${d / 30} month${d === 30 ? '' : 's'}`;
  if (d % 7 === 0) return `${d / 7} week${d === 7 ? '' : 's'}`;
  return `${d} day${d === 1 ? '' : 's'}`;
}
const WARN_PRESETS = [1, 3, 7, 14, 21, 30];
const AFTER_PRESETS = [30, 60, 90, 180, 365];

function Switch({ on, onChange, label, disabled }: { on: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean }) {
  return (
    <button type="button" role="switch" aria-checked={on} aria-label={label} disabled={disabled} onClick={() => onChange(!on)} className={`relative shrink-0 w-11 h-6 rounded-full transition-colors ${on ? 'bg-emerald-600' : 'bg-slate-600'} disabled:opacity-50`}>
      <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition-transform ${on ? 'translate-x-5' : ''}`} />
    </button>
  );
}
function UnitInput({ id, label, onAdd, cta }: { id: string; label: string; onAdd: (days: number) => void; cta: string }) {
  const [n, setN] = useState(''); const [u, setU] = useState<Unit>('weeks');
  return (
    <div className="flex flex-wrap items-end gap-2">
      <label className="text-xs text-slate-400" htmlFor={id}>{label}<input id={id} inputMode="numeric" value={n} onChange={(e) => setN(e.target.value.replace(/\D/g, '').slice(0, 3))} placeholder="e.g. 2" className="mt-1 block w-20 rounded border border-slate-600 bg-transparent px-2 py-1.5 text-sm" /></label>
      <select aria-label="Unit" value={u} onChange={(e) => setU(e.target.value as Unit)} className="rounded border border-slate-600 bg-slate-900 px-2 py-1.5 text-sm">{(['days', 'weeks', 'months'] as Unit[]).map((x) => <option key={x} value={x}>{x}</option>)}</select>
      <button className="btn-secondary text-xs" onClick={() => { const v = parseInt(n, 10); if (v > 0) { onAdd(v * MUL[u]); setN(''); } }}>{cta}</button>
    </div>
  );
}

const SUBS = [['settings', 'Settings'], ['requests', 'Requests'], ['paused', 'Paused'], ['soon', 'Coming up'], ['each', 'Per business'], ['history', 'History']] as const;
type Sub = (typeof SUBS)[number][0];

/** Pause businesses that stay unused, warn them first, and let them switch back on. Nothing is deleted when a business is paused. */
export default function AutoPause({ supabase }: { supabase: SupabaseClient }) {
  const [s, setS] = useState<Settings | null>(null); const [o, setO] = useState<Over | null>(null); const [err, setErr] = useState<string | null>(null); const [busy, setBusy] = useState(false);
  const [sub, setSub] = useState<Sub>('settings'); const [saved, setSaved] = useState(false);
  const [decline, setDecline] = useState<{ id: string; name: string } | null>(null); const [reason, setReason] = useState('');

  const loadOver = useCallback(async () => {
    const { data, error } = await supabase.rpc('admin_autopause_overview'); if (error) setErr(describeError(error, 'Could not load')); else setO(data as Over);
  }, [supabase]);
  const save = useCallback(async (patch: Record<string, unknown> = {}) => {
    setBusy(true); setErr(null);
    const { data, error } = await supabase.rpc('admin_autopause_settings', { p_auto_pause: null, p_after: null, p_warn: null, p_mode: null, p_skip: null, ...patch });
    setBusy(false); if (error) { setErr(describeError(error, 'Could not save')); return; }
    setS(data as Settings); if (Object.keys(patch).length) { setSaved(true); setTimeout(() => setSaved(false), 1500); } void loadOver();
  }, [supabase, loadOver]);
  useEffect(() => { void save(); }, [save]);

  const decide = async (businessId: string, approve: boolean, why?: string) => {
    setBusy(true); setErr(null);
    const { error } = await supabase.rpc('admin_reactivation_decide', { p_business_id: businessId, p_approve: approve, p_reason: why ?? null });
    setBusy(false); if (error) { setErr(describeError(error, 'Could not save')); return; }
    setDecline(null); setReason(''); void loadOver();
  };
  const setMode = async (id: string, mode: 'instant' | 'approval' | null) => {
    setErr(null);
    const { error } = await supabase.rpc('admin_set_business_reactivation', { p_business_id: id, p_mode: mode });
    if (error) { setErr(describeError(error, 'Could not save')); return; } void loadOver();
  };

  if (!s || !o) return err ? <ErrorText>{err}</ErrorText> : <Skeleton />;
  const warnSet = new Set(s.warn);
  const toggleWarn = (d: number) => { const next = new Set(warnSet); if (next.has(d)) next.delete(d); else next.add(d); const arr = [...next].sort((a, b) => b - a); if (arr.length === 0) { setErr('Keep at least one warning so owners are told before being paused'); return; } void save({ p_warn: arr }); };
  const counts: Record<Sub, number | null> = { settings: null, requests: o.pending.length, paused: o.paused.length, soon: o.upcoming.length, each: null, history: null };
  const modeName = (m: 'instant' | 'approval') => (m === 'instant' ? 'Switch on at once' : 'Ask me first');

  return (
    <div className="space-y-4">
      <div><h2 className="text-lg font-semibold">Auto-pause unused businesses</h2><p className="text-xs text-slate-400">Pausing saves resources and nothing is deleted. Products, sales and customers stay exactly as they are.</p></div>
      <div className="flex flex-wrap gap-2">{SUBS.map(([k, l]) => <button key={k} onClick={() => setSub(k)} className={`rounded-full border px-3 py-1.5 text-xs ${sub === k ? 'bg-emerald-600 border-emerald-600 text-white' : 'border-slate-600 text-slate-300'}`}>{l}{counts[k] ? <span className={`ml-1.5 rounded-full px-1.5 text-[10px] ${sub === k ? 'bg-white/20' : k === 'requests' ? 'bg-rust-500 text-white' : 'bg-slate-700'}`}>{counts[k]}</span> : null}</button>)}</div>
      {err && <ErrorText>{err}</ErrorText>}

      {sub === 'settings' && (
        <div className="space-y-4">
          <Card>
            <div className="flex items-start justify-between gap-3">
              <div><h3 className="text-sm font-semibold">Automatic pausing</h3><p className="text-xs text-slate-400">Checked every morning (10:00 Nairobi). Owners get a push notification and an in-app message before the pause and when it happens.</p></div>
              <Switch on={s.auto_pause} disabled={busy} label="Automatic pausing" onChange={(v) => void save({ p_auto_pause: v })} />
            </div>
          </Card>
          <Card>
            <h3 className="text-sm font-semibold">Pause a business after it has not been used for</h3>
            <p className="mt-1 text-sm">Currently <b>{human(s.after)}</b></p>
            <div className="mt-2 flex flex-wrap gap-2">{AFTER_PRESETS.map((d) => <button key={d} disabled={busy} onClick={() => void save({ p_after: d })} className={`rounded-full border px-3 py-1 text-xs ${s.after === d ? 'bg-emerald-600 border-emerald-600 text-white' : 'border-slate-600 text-slate-300'}`}>{human(d)}</button>)}</div>
            <div className="mt-3"><UnitInput id="after-n" label="Or choose your own" cta="Set" onAdd={(d) => void save({ p_after: d })} /></div>
            {saved && <p className="mt-2 text-xs text-emerald-400">Saved ✓</p>}
          </Card>
          <Card>
            <h3 className="text-sm font-semibold">Warn the owner before pausing</h3>
            <p className="text-xs text-slate-400">Tap to switch a warning on or off. Each one is sent that long before the pause.</p>
            <div className="mt-2 flex flex-wrap gap-2">{[...new Set([...WARN_PRESETS, ...s.warn])].sort((a, b) => a - b).map((d) => <button key={d} disabled={busy} onClick={() => toggleWarn(d)} aria-pressed={warnSet.has(d)} className={`rounded-full border px-3 py-1 text-xs ${warnSet.has(d) ? 'bg-emerald-600 border-emerald-600 text-white' : 'border-slate-600 text-slate-300'}`}>{human(d)} before</button>)}</div>
            <div className="mt-3"><UnitInput id="warn-n" label="Add your own" cta="Add warning" onAdd={(d) => { if (d >= s.after) { setErr('A warning must come before the pause'); return; } void save({ p_warn: [...new Set([...s.warn, d])].sort((a, b) => b - a) }); }} /></div>
          </Card>
          <Card>
            <h3 className="text-sm font-semibold">When an owner presses Activate</h3>
            <p className="text-xs text-slate-400">This is the default for every business. You can set a different choice for a single business under “Per business”.</p>
            <div className="mt-2 flex flex-wrap gap-2">{(['instant', 'approval'] as const).map((k) => <button key={k} disabled={busy} onClick={() => void save({ p_mode: k })} className={`rounded-full border px-3 py-1.5 text-xs ${s.mode === k ? 'bg-emerald-600 border-emerald-600 text-white' : 'border-slate-600 text-slate-300'}`}>{modeName(k)}</button>)}</div>
          </Card>
          <Card>
            <div className="flex items-start justify-between gap-3">
              <div><h3 className="text-sm font-semibold">Protect businesses with active access</h3><p className="text-xs text-slate-400">When on, a business whose access period has not ended is never paused.</p></div>
              <Switch on={s.skip} disabled={busy} label="Protect businesses with active access" onChange={(v) => void save({ p_skip: v })} />
            </div>
          </Card>
          <p className="text-[11px] text-slate-500">Only shops are paused automatically. A business you pause yourself, or one paused for an expired plan, can’t be switched back on by the owner; only you can.</p>
        </div>
      )}

      {sub === 'requests' && (
        <Card>
          <h3 className="text-sm font-semibold mb-2">Activation requests ({o.pending.length})</h3>
          {o.pending.length === 0 ? <p className="text-xs text-slate-500">No one is waiting. Requests appear here for businesses set to “Ask me first”.</p> : <ul className="divide-y divide-slate-700/60">{o.pending.map((p) => (
            <li key={p.id} className="py-2 flex flex-wrap items-center gap-2 text-sm"><span className="flex-1 min-w-0"><span className="block truncate">{p.name}</span><span className="block text-[11px] text-slate-500">{p.phone ?? 'no phone'} · asked {when(p.at)}</span></span>
              <button className="btn-secondary text-xs" disabled={busy} onClick={() => void decide(p.business_id, true)}>Activate</button>
              <button className="btn-secondary text-xs" disabled={busy} onClick={() => setDecline({ id: p.business_id, name: p.name })}>Decline</button></li>))}</ul>}
        </Card>
      )}

      {sub === 'paused' && (
        <Card>
          <h3 className="text-sm font-semibold mb-2">Paused for being unused ({o.paused.length})</h3>
          {o.paused.length === 0 ? <p className="text-xs text-slate-500">None right now.</p> : <ul className="divide-y divide-slate-700/60">{o.paused.map((p) => (
            <li key={p.id} className="py-2 flex items-center gap-2 text-sm"><span className="flex-1 min-w-0"><span className="block truncate">{p.name}</span><span className="block text-[11px] text-slate-500">Paused {when(p.paused_at)} · unused for {human(p.days)}</span></span><button className="btn-secondary text-xs" disabled={busy} onClick={() => void decide(p.id, true)}>Activate</button></li>))}</ul>}
        </Card>
      )}

      {sub === 'soon' && (
        <Card>
          <h3 className="text-sm font-semibold mb-2">Coming up, next 30 days ({o.upcoming.length})</h3>
          {o.upcoming.length === 0 ? <p className="text-xs text-slate-500">No business is close to the limit.</p> : <ul className="text-sm space-y-1.5">{o.upcoming.map((u) => <li key={u.id} className="flex justify-between gap-2"><span className="truncate">{u.name}</span><span className="text-xs text-slate-400 shrink-0">unused {human(u.days)} · pauses in {human(u.left)}{s.auto_pause ? '' : ' (if switched on)'}</span></li>)}</ul>}
        </Card>
      )}

      {sub === 'each' && (
        <Card>
          <h3 className="text-sm font-semibold">What happens when each business presses Activate</h3>
          <p className="text-xs text-slate-400 mb-2">“Default” follows the setting in Settings ({modeName(s.mode)}).</p>
          <ul className="divide-y divide-slate-700/60">{o.businesses.map((b) => (
            <li key={b.id} className="py-2.5">
              <div className="flex items-center justify-between gap-2"><span className="text-sm truncate">{b.name}</span><span className="text-[11px] text-slate-500 shrink-0">{b.status} · unused {human(b.days)}</span></div>
              <div className="mt-1.5 flex flex-wrap gap-1.5">{([[null, 'Default'], ['instant', 'Switch on at once'], ['approval', 'Ask me first']] as const).map(([k, l]) => <button key={String(k)} onClick={() => void setMode(b.id, k)} aria-pressed={b.mode === k} className={`rounded-full border px-2.5 py-1 text-[11px] ${b.mode === k ? 'bg-emerald-600 border-emerald-600 text-white' : 'border-slate-600 text-slate-300'}`}>{l}</button>)}</div>
            </li>))}</ul>
        </Card>
      )}

      {sub === 'history' && (
        <Card>
          <h3 className="text-sm font-semibold mb-2">Recent activity</h3>
          {o.history.length === 0 ? <EmptyState message="Nothing yet." /> : <ul className="text-xs text-slate-400 space-y-1">{o.history.map((h, i) => <li key={i}>{when(h.at)} · <span className="text-slate-200">{h.name}</span> · {ACTION[h.action] ?? h.action}{h.days != null ? ` (unused ${human(h.days)})` : ''}</li>)}</ul>}
        </Card>
      )}

      {decline && (
        <Modal title="Decline activation" subtitle={decline.name} onClose={() => setDecline(null)}>
          <label className="text-xs text-slate-400">Reason the owner will see (optional)<textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)} className="mt-1 w-full rounded border border-slate-600 bg-transparent px-2 py-1.5 text-sm" /></label>
          <div className="mt-3 flex gap-2"><button className="btn-secondary text-xs" disabled={busy} onClick={() => void decide(decline.id, false, reason)}>Decline request</button><button className="btn-secondary text-xs" onClick={() => setDecline(null)}>Cancel</button></div>
        </Modal>
      )}
    </div>
  );
}
