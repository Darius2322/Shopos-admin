import { useEffect, useState } from 'react';
import { SupabaseClient } from '@supabase/supabase-js';
import { Check, X, Sparkles } from 'lucide-react';
import { Card, EmptyState, ErrorText, Skeleton, StatusBadge } from '../components/ui';
import { FeatureRequest } from '../lib/types';
import { describeError } from '../lib/errors';

export default function FeatureRequests({ supabase }: { supabase: SupabaseClient }) {
  const [requests, setRequests] = useState<FeatureRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reasonPromptFor, setReasonPromptFor] = useState<{ id: string; approve: boolean } | null>(null);
  const [reasonText, setReasonText] = useState('');

  async function load() {
    setLoading(true);
    // businesses(name) is a foreign-table select via the FK on business_id
    // — same pattern GlobalSearch already uses for branches → businesses.
    const { data } = await supabase
      .from('feature_requests')
      .select('*, businesses(name)')
      .order('created_at', { ascending: false });
    setRequests((data ?? []).map((r: any) => ({ ...r, business_name: r.businesses?.name ?? 'Unknown business' })));
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  async function decide(id: string, approve: boolean, adminReason: string | null) {
    setBusy(id); setError(null);
    try {
      const { error: rpcError } = await supabase.rpc('admin_decide_feature_request', {
        p_request_id: id, p_approve: approve, p_admin_reason: adminReason
      });
      if (rpcError) throw rpcError;
      setReasonPromptFor(null); setReasonText('');
      await load();
    } catch (err) {
      setError(describeError(err, 'Could not record the decision'));
    } finally { setBusy(null); }
  }

  async function remove(id: string) {
    if (!window.confirm('Delete this request permanently? This cannot be undone.')) return;
    setBusy(id); setError(null);
    try {
      const { error: deleteError } = await supabase.from('feature_requests').delete().eq('id', id);
      if (deleteError) throw deleteError;
      await load();
    } catch (err) {
      setError(describeError(err, 'Could not delete the request'));
    } finally { setBusy(null); }
  }

  if (loading) return <Skeleton />;

  const pending = requests.filter((r) => r.status === 'pending');
  const decided = requests.filter((r) => r.status !== 'pending');

  return (
    <div className="space-y-4">
      <div>
        <h2 className="font-display font-semibold text-lg mb-1 flex items-center gap-1.5"><Sparkles className="w-4 h-4" /> Feature requests</h2>
        <p className="text-xs text-slate-400">Premium feature upgrade requests from shop owners — currently just Branches.</p>
      </div>
      <ErrorText>{error}</ErrorText>

      {pending.length === 0 && <EmptyState message="No pending requests." />}
      {pending.map((r) => (
        <Card key={r.id}>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="text-sm font-medium capitalize">{r.feature} — {r.business_name}</div>
              <div className="text-xs text-slate-400 mt-0.5">Requested {new Date(r.created_at).toLocaleString()}</div>
              {r.reason && <p className="text-xs text-slate-400 mt-2 italic">"{r.reason}"</p>}
            </div>
            <StatusBadge status={r.status} />
          </div>
          <div className="flex items-center gap-2 mt-3">
            <button onClick={() => decide(r.id, true, null)} disabled={busy === r.id} className="btn-primary text-xs px-2.5 py-1 flex items-center gap-1">
              <Check className="w-3.5 h-3.5" /> Approve
            </button>
            <button onClick={() => setReasonPromptFor({ id: r.id, approve: false })} disabled={busy === r.id} className="btn-secondary text-xs px-2.5 py-1 flex items-center gap-1">
              <X className="w-3.5 h-3.5" /> Reject
            </button>
            <button onClick={() => remove(r.id)} disabled={busy === r.id} className="text-xs px-2.5 py-1 flex items-center gap-1 text-rust-600 hover:bg-rust-50 rounded-card ml-auto">
              <Trash2 className="w-3.5 h-3.5" /> Delete
            </button>
          </div>
        </Card>
      ))}

      {decided.length > 0 && (
        <div className="pt-2">
          <h3 className="text-xs font-medium text-slate-400 mb-2">Decided</h3>
          <div className="space-y-2">
            {decided.map((r) => (
              <Card key={r.id}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-sm font-medium capitalize">{r.feature} — {r.business_name}</div>
                    <div className="text-xs text-slate-400 mt-0.5">
                      Decided {r.decided_at ? new Date(r.decided_at).toLocaleString() : '—'}
                    </div>
                    {r.admin_reason && <p className="text-xs text-slate-400 mt-1">Reason: {r.admin_reason}</p>}
                  </div>
                  <StatusBadge status={r.status} />
                </div>
              </Card>
            ))}
          </div>
        </div>
      )}

      {reasonPromptFor && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60" onClick={() => setReasonPromptFor(null)} />
          <div className="relative card p-5 max-w-sm w-full">
            <h3 className="font-display font-semibold text-lg mb-1">Reject request</h3>
            <p className="text-xs text-slate-400 mb-3">This reason is shown to the shop owner.</p>
            <textarea className="input min-h-[80px] mb-3" placeholder="Reason (optional)" value={reasonText} onChange={(e) => setReasonText(e.target.value)} />
            <div className="flex gap-2">
              <button onClick={() => decide(reasonPromptFor.id, false, reasonText || null)} disabled={busy === reasonPromptFor.id} className="btn-primary flex-1">
                {busy === reasonPromptFor.id ? 'Saving…' : 'Confirm reject'}
              </button>
              <button onClick={() => setReasonPromptFor(null)} className="btn-secondary flex-1">Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
