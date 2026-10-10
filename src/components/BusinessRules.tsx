import { useCallback, useEffect, useState } from 'react';
import { SupabaseClient } from '@supabase/supabase-js';
import { Loader2, Save } from 'lucide-react';
import { Card } from './ui';
import { friendlyError } from '../lib/friendlyError';

interface Req { id: string; number: string; status: string; requesting_branch_id: string; supplying_branch_id: string; created_at: string }
interface Xfer { id: string; number: string; status: string; from_branch_id: string; to_branch_id: string; created_at: string }
interface Sess { id: string; register_name: string; status: string; opened_at: string; closed_at: string | null; cash_difference: number | null; branch_id: string | null }

const dt = (iso: string | null) => (iso ? new Date(iso).toLocaleString() : '–');
const pill = (s: string) => (s === 'completed' || s === 'fulfilled' || s === 'closed' ? 'bg-emerald-500/15 text-emerald-400' : s === 'cancelled' || s === 'rejected' ? 'bg-slate-700 text-slate-300' : 'bg-amber-500/20 text-amber-400');

/** Branch limit, price rules and a read-only view of branch requisitions, stock transfers and POS sessions for one business. */
export function BusinessRules({ supabase, businessId, branches, onChanged }: { supabase: SupabaseClient; businessId: string; branches: { id: string; name: string }[]; onChanged?: () => void }) {
  const [limit, setLimit] = useState('');
  const [current, setCurrent] = useState<number | null>(null);
  const [enforce, setEnforce] = useState(false);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [reqs, setReqs] = useState<Req[]>([]);
  const [xfers, setXfers] = useState<Xfer[]>([]);
  const [sess, setSess] = useState<Sess[]>([]);
  const name = (id: string | null) => branches.find((b) => b.id === id)?.name ?? 'Branch';

  const load = useCallback(async () => {
    const [b, r, t, s] = await Promise.all([
      supabase.from('businesses').select('branch_limit, enforce_price_rules').eq('id', businessId).single(),
      supabase.from('stock_requisitions').select('id, number, status, requesting_branch_id, supplying_branch_id, created_at').eq('business_id', businessId).order('created_at', { ascending: false }).limit(10),
      supabase.from('stock_transfers').select('id, number, status, from_branch_id, to_branch_id, created_at').eq('business_id', businessId).order('created_at', { ascending: false }).limit(10),
      supabase.from('pos_sessions').select('id, register_name, status, opened_at, closed_at, cash_difference, branch_id').eq('business_id', businessId).order('opened_at', { ascending: false }).limit(10),
    ]);
    const row = b.data as { branch_limit: number | null; enforce_price_rules: boolean } | null;
    if (row) { setCurrent(row.branch_limit ?? 5); setLimit(String(row.branch_limit ?? 5)); setEnforce(!!row.enforce_price_rules); }
    setReqs((r.data ?? []) as Req[]); setXfers((t.data ?? []) as Xfer[]); setSess((s.data ?? []) as Sess[]);
  }, [supabase, businessId]);
  useEffect(() => { void load(); }, [load]);

  async function saveLimit() {
    const n = parseInt(limit, 10);
    if (!(n >= 1 && n <= 500)) { setMsg({ ok: false, text: 'Enter a limit between 1 and 500.' }); return; }
    setBusy('limit'); setMsg(null);
    const { data, error } = await supabase.rpc('admin_set_branch_limit', { p_business_id: businessId, p_limit: n, p_reason: reason || null });
    if (error) setMsg({ ok: false, text: friendlyError(error, 'Could not change the branch limit.') });
    else { const d = data as { over_limit: boolean; branches: number }; setMsg({ ok: true, text: d.over_limit ? `Limit saved. The business already has ${d.branches} branches, so none will be removed but no new one can be added.` : 'Branch limit saved.' }); setReason(''); await load(); onChanged?.(); }
    setBusy(null);
  }
  async function toggleRules(v: boolean) {
    setBusy('rules'); setMsg(null);
    const { error } = await supabase.rpc('admin_set_price_rules', { p_business_id: businessId, p_enforce: v });
    if (error) setMsg({ ok: false, text: friendlyError(error, 'Could not change price rules.') }); else { setEnforce(v); setMsg({ ok: true, text: v ? 'Price rules are now enforced for this business.' : 'Price rules relaxed.' }); }
    setBusy(null);
  }

  return (
    <div className="space-y-3">
      <Card className="space-y-3">
        <div>
          <p className="text-sm font-medium">Branch limit</p>
          <p className="text-xs text-slate-400">The most branches this business can have. The server refuses extra branches, whatever the app sends. Lowering it never removes existing branches. Now: {branches.length} of {current ?? '…'} used.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <input className="input !w-24" inputMode="numeric" value={limit} onChange={(e) => { if (/^\d{0,3}$/.test(e.target.value)) setLimit(e.target.value); }} aria-label="Branch limit" />
          <input className="input flex-1 min-w-[160px]" placeholder="Reason (optional)" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={200} />
          <button onClick={() => void saveLimit()} disabled={busy === 'limit'} className="btn-primary min-h-[40px] px-4 inline-flex items-center gap-1.5">{busy === 'limit' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Save</button>
        </div>
        <div className="border-t border-slate-800 pt-3">
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" className="mt-1" checked={enforce} disabled={busy === 'rules'} onChange={(e) => void toggleRules(e.target.checked)} />
            <span><b>Enforce price rules</b><span className="block text-xs text-slate-400">Staff need the right permission and a reason to discount or change a selling price. Prices below a product's minimum always need a manager's approval.</span></span>
          </label>
        </div>
        {msg && <p className={`text-sm ${msg.ok ? 'text-emerald-400' : 'text-rust-500'}`} role="status">{msg.text}</p>}
      </Card>
      <Card className="space-y-2">
        <p className="text-sm font-medium">Stock requests between branches</p>
        {reqs.length === 0 ? <p className="text-xs text-slate-500">None yet.</p> : <ul className="divide-y divide-slate-800 text-xs">{reqs.map((r) => <li key={r.id} className="py-2 flex justify-between gap-3"><span><b>{r.number}</b> · {name(r.requesting_branch_id)} asks {name(r.supplying_branch_id)}<span className="block text-slate-500">{dt(r.created_at)}</span></span><span className={`self-start px-2 py-0.5 rounded-full capitalize ${pill(r.status)}`}>{r.status.replace('_', ' ')}</span></li>)}</ul>}
      </Card>
      <Card className="space-y-2">
        <p className="text-sm font-medium">Stock transfers</p>
        {xfers.length === 0 ? <p className="text-xs text-slate-500">None yet.</p> : <ul className="divide-y divide-slate-800 text-xs">{xfers.map((r) => <li key={r.id} className="py-2 flex justify-between gap-3"><span><b>{r.number}</b> · {name(r.from_branch_id)} → {name(r.to_branch_id)}<span className="block text-slate-500">{dt(r.created_at)}</span></span><span className={`self-start px-2 py-0.5 rounded-full capitalize ${pill(r.status)}`}>{r.status.replace('_', ' ')}</span></li>)}</ul>}
      </Card>
      <Card className="space-y-2">
        <p className="text-sm font-medium">POS sessions</p>
        {sess.length === 0 ? <p className="text-xs text-slate-500">None yet.</p> : <ul className="divide-y divide-slate-800 text-xs">{sess.map((r) => <li key={r.id} className="py-2 flex justify-between gap-3"><span><b>{r.register_name}</b>{r.branch_id ? ` · ${name(r.branch_id)}` : ''}<span className="block text-slate-500">{dt(r.opened_at)} → {r.closed_at ? dt(r.closed_at) : 'open'}{r.cash_difference !== null && Math.abs(Number(r.cash_difference)) >= 0.005 ? ` · difference ${Number(r.cash_difference).toLocaleString()}` : ''}</span></span><span className={`self-start px-2 py-0.5 rounded-full capitalize ${pill(r.status)}`}>{r.status}</span></li>)}</ul>}
      </Card>
    </div>
  );
}
