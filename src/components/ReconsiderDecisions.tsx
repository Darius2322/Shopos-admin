import { useCallback, useEffect, useState } from 'react';
import { SupabaseClient } from '@supabase/supabase-js';
import { Card } from './ui';
import { RotateCcw, Loader2 } from 'lucide-react';

interface Owner { id: string; full_name: string; business_name: string; status: string; decision_reason: string | null; decided_at: string | null; claimed_at: string | null }
interface Feature { id: string; feature: string; admin_reason: string | null; decided_at: string | null; businesses: { name: string } | null }
const day = (s?: string | null) => (s ? new Date(s).toLocaleDateString() : '');

/** Dashboard section: anything you rejected can be turned around. A rejected registration or feature request goes back to
 * "waiting" with one tap, and you then approve it the usual way. (Desktop setup requests have their own button above.) */
export function ReconsiderDecisions({ supabase }: { supabase: SupabaseClient }) {
  const [owners, setOwners] = useState<Owner[] | null>(null);
  const [features, setFeatures] = useState<Feature[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [o, f] = await Promise.all([
      supabase.from('owner_requests').select('id, full_name, business_name, status, decision_reason, decided_at, claimed_at').in('status', ['rejected', 'info_requested']).is('claimed_at', null).order('decided_at', { ascending: false }).limit(15),
      supabase.from('feature_requests').select('id, feature, admin_reason, decided_at, businesses(name)').eq('status', 'rejected').order('decided_at', { ascending: false }).limit(15)
    ]);
    if (o.error) setError(o.error.message);
    setOwners((o.data ?? []) as Owner[]);
    setFeatures(((f.data ?? []) as unknown as (Omit<Feature, 'businesses'> & { businesses: { name: string } | { name: string }[] | null })[]).map((x) => ({ ...x, businesses: Array.isArray(x.businesses) ? x.businesses[0] ?? null : x.businesses })));
  }, [supabase]);
  useEffect(() => { void load(); }, [load]);

  async function reopen(kind: 'owner' | 'feature', id: string) {
    setBusy(id); setError(null); setMsg(null);
    const { error: e } = await supabase.rpc(kind === 'owner' ? 'admin_reopen_owner_request' : 'admin_reopen_feature_request', { p_request_id: id });
    setBusy(null);
    if (e) { setError(e.message); return; }
    setMsg(kind === 'owner' ? 'Application moved back to waiting. Approve it from your applications list.' : 'Request moved back to waiting. Decide it from your requests list.');
    await load();
  }

  if (owners !== null && owners.length === 0 && features.length === 0) return null;
  return (
    <div className="mt-6">
      <h2 className="font-display font-semibold text-lg mb-3">Changed your mind?</h2>
      {error && <p role="alert" className="text-sm text-rust-500 mb-2">{error}</p>}
      {msg && <p className="text-sm text-field-500 mb-2">{msg}</p>}
      <Card className="space-y-2">
        {owners === null && <p className="text-xs text-slate-500">Loading…</p>}
        {(owners ?? []).map((o) => (
          <div key={o.id} className="flex items-center justify-between gap-3 text-xs border-t border-slate-800 first:border-0 pt-2 first:pt-0">
            <div className="min-w-0"><div className="text-sm">{o.business_name} <span className="text-slate-400">· {o.full_name}</span></div><div className="text-slate-400">Registration {o.status === 'rejected' ? 'rejected' : 'needs more information'} {day(o.decided_at)}{o.decision_reason ? ` — “${o.decision_reason}”` : ''}</div></div>
            <button disabled={busy === o.id} onClick={() => reopen('owner', o.id)} className="shrink-0 inline-flex items-center gap-1 font-semibold bg-slate-800 text-slate-200 rounded-lg px-3 min-h-[34px]">{busy === o.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RotateCcw className="w-3.5 h-3.5" />} Reopen</button>
          </div>
        ))}
        {features.map((f) => (
          <div key={f.id} className="flex items-center justify-between gap-3 text-xs border-t border-slate-800 pt-2">
            <div className="min-w-0"><div className="text-sm">{f.businesses?.name ?? 'Business'} <span className="text-slate-400">· {f.feature}</span></div><div className="text-slate-400">Feature request rejected {day(f.decided_at)}{f.admin_reason ? ` — “${f.admin_reason}”` : ''}</div></div>
            <button disabled={busy === f.id} onClick={() => reopen('feature', f.id)} className="shrink-0 inline-flex items-center gap-1 font-semibold bg-slate-800 text-slate-200 rounded-lg px-3 min-h-[34px]">{busy === f.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RotateCcw className="w-3.5 h-3.5" />} Reopen</button>
          </div>
        ))}
        <p className="text-[11px] text-slate-500">Reopen sends it back to waiting. Then approve it the normal way. Desktop setup requests can be approved straight from Closed requests above.</p>
      </Card>
    </div>
  );
}
