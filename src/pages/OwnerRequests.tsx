import { useEffect, useState } from 'react';
import { SupabaseClient } from '@supabase/supabase-js';
import { Check, X, HelpCircle } from 'lucide-react';
import { Card, EmptyState, ErrorText, Skeleton, StatusBadge } from '../components/ui';
import { DurationSelect } from '../components/DurationSelect';
import { OtpDeliveryActions } from '../components/OtpDeliveryActions';
import { OwnerRequest } from '../lib/types';
import { supabaseUrl } from '../lib/supabase';

export default function OwnerRequests({ supabase }: { supabase: SupabaseClient }) {
  const [requests, setRequests] = useState<OwnerRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [approvedCode, setApprovedCode] = useState<{ businessName: string; code: string; phone: string | null; email: string } | null>(null);
  const [reasonPromptFor, setReasonPromptFor] = useState<{ id: string; decision: 'rejected' | 'info_requested' } | null>(null);
  const [reasonText, setReasonText] = useState('');
  const [durationByRequest, setDurationByRequest] = useState<Record<string, number | null>>({});

  async function load() {
    setLoading(true);
    const { data } = await supabase.from('owner_requests').select('*').order('created_at', { ascending: false });
    setRequests(data ?? []);
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  async function approve(request: OwnerRequest) {
    setBusy(request.id); setError(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(`${supabaseUrl}/functions/v1/approve-owner`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
        body: JSON.stringify({ ownerRequestId: request.id, durationMonths: durationByRequest[request.id] ?? 12 })
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? 'Approval failed');
      if (body.activationCode) setApprovedCode({ businessName: request.business_name, code: body.activationCode, phone: request.phone, email: request.email });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Approval failed — is the approve-owner Edge Function deployed?');
    } finally { setBusy(null); }
  }

  async function submitDecision() {
    if (!reasonPromptFor) return;
    setBusy(reasonPromptFor.id); setError(null);
    try {
      const { error: rpcError } = await supabase.rpc('admin_decide_owner_request', {
        p_request_id: reasonPromptFor.id, p_decision: reasonPromptFor.decision, p_reason: reasonText || null
      });
      if (rpcError) throw rpcError;
      setReasonPromptFor(null); setReasonText('');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Action failed');
    } finally { setBusy(null); }
  }

  if (loading) return <Skeleton />;

  return (
    <div className="space-y-3">
      <h2 className="font-display font-semibold text-lg mb-1">Owner sign-up requests</h2>
      <ErrorText>{error}</ErrorText>
      {requests.length === 0 && <EmptyState message="No requests." />}
      {requests.map((r) => (
        <Card key={r.id}>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="text-sm font-medium">{r.business_name}</div>
              <div className="text-xs text-slate-400 mt-0.5">
                {r.full_name} · {r.email}{r.phone ? ` · ${r.phone}` : ''}
              </div>
              <div className="text-xs text-slate-500 mt-0.5">Ref: {r.reference_code ?? '—'} · {new Date(r.created_at).toLocaleString()}</div>
              {r.message && <p className="text-xs text-slate-400 mt-2 italic">"{r.message}"</p>}
              {r.decision_reason && (
                <p className="text-xs text-slate-400 mt-2">Reason: {r.decision_reason}</p>
              )}
            </div>
            <StatusBadge status={r.status} />
          </div>
          {r.status !== 'approved' && (
            <div className="flex flex-wrap items-center gap-2 mt-3">
              {(r.status === 'rejected' || r.status === 'info_requested') && (
                <span className="text-xs text-slate-500 w-full">
                  {r.status === 'rejected' ? 'Rejected — you can still approve this if you change your mind.' : 'Waiting on the applicant, or approve now if you have enough information.'}
                </span>
              )}
              <DurationSelect value={durationByRequest[r.id] ?? 12} onChange={(months) => setDurationByRequest((d) => ({ ...d, [r.id]: months }))} />
              <button onClick={() => approve(r)} disabled={busy === r.id} className="btn-primary text-xs px-2.5 py-1 flex items-center gap-1">
                <Check className="w-3.5 h-3.5" /> Approve
              </button>
              {r.status !== 'rejected' && (
                <button onClick={() => setReasonPromptFor({ id: r.id, decision: 'info_requested' })} disabled={busy === r.id} className="btn-secondary text-xs px-2.5 py-1 flex items-center gap-1">
                  <HelpCircle className="w-3.5 h-3.5" /> Request info
                </button>
              )}
              {r.status !== 'rejected' && (
                <button onClick={() => setReasonPromptFor({ id: r.id, decision: 'rejected' })} disabled={busy === r.id} className="btn-secondary text-xs px-2.5 py-1 flex items-center gap-1">
                  <X className="w-3.5 h-3.5" /> Reject
                </button>
              )}
            </div>
          )}
        </Card>
      ))}

      {reasonPromptFor && (
        <Modal onClose={() => { setReasonPromptFor(null); setReasonText(''); }}>
          <h3 className="font-display font-semibold text-lg mb-1">
            {reasonPromptFor.decision === 'rejected' ? 'Reject request' : 'Request more information'}
          </h3>
          <p className="text-xs text-slate-400 mb-3">This reason is recorded and shown to the applicant.</p>
          <textarea
            className="input min-h-[80px] mb-3"
            placeholder="Reason (optional but recommended)"
            value={reasonText}
            onChange={(e) => setReasonText(e.target.value)}
          />
          <div className="flex gap-2">
            <button onClick={submitDecision} disabled={busy === reasonPromptFor.id} className="btn-primary flex-1">
              {busy === reasonPromptFor.id ? 'Saving…' : 'Confirm'}
            </button>
            <button onClick={() => { setReasonPromptFor(null); setReasonText(''); }} className="btn-secondary flex-1">Cancel</button>
          </div>
        </Modal>
      )}

      {approvedCode && (
        <Modal onClose={() => setApprovedCode(null)}>
          <h3 className="font-display font-semibold text-lg mb-1">Activation code for {approvedCode.businessName}</h3>
          <p className="text-xs text-slate-400 mb-4">
            An invite email has also been sent so they can set a password. This code is shown only once here and expires in 15 minutes.
          </p>
          <div className="text-3xl font-mono font-semibold tracking-widest text-center py-4 bg-paper rounded-card mb-4">
            {approvedCode.code}
          </div>
          <OtpDeliveryActions supabase={supabase} code={approvedCode.code} businessName={approvedCode.businessName} phone={approvedCode.phone} email={approvedCode.email} />
          <button onClick={() => setApprovedCode(null)} className="btn-primary w-full mt-4">Done</button>
        </Modal>
      )}
    </div>
  );
}

function Modal({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative card p-5 max-w-sm w-full">{children}</div>
    </div>
  );
}
