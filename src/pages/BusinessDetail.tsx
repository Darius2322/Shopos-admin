import { useEffect, useState } from 'react';
import { SupabaseClient } from '@supabase/supabase-js';
import { ArrowLeft, KeyRound, Pause, Play, RefreshCw, ShieldOff, Star, XCircle, Lock, Trash2 } from 'lucide-react';
import { Card, EmptyState, ErrorText, Skeleton, StatusBadge } from '../components/ui';
import { OtpDeliveryActions } from '../components/OtpDeliveryActions';
import { DurationSelect, formatExpiry } from '../components/DurationSelect';
import { Branch, Business, BusinessStatus, OtpStatusRow, Profile } from '../lib/types';
import { describeError } from '../lib/errors';
import { supabaseUrl } from '../lib/supabase';

const SECTIONS = [
  { id: 'section-overview', label: 'Overview & status' },
  { id: 'section-activation', label: 'Activation & access' },
  { id: 'section-branches', label: 'Branches' },
  { id: 'section-owner', label: 'Owner' },
  { id: 'section-employees', label: 'Employees' },
] as const;

function jumpTo(id: string) {
  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

export default function BusinessDetail({ supabase, businessId, onBack }: { supabase: SupabaseClient; businessId: string; onBack: () => void }) {
  const [business, setBusiness] = useState<Business | null>(null);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [otpHistory, setOtpHistory] = useState<OtpStatusRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reasonPromptFor, setReasonPromptFor] = useState<BusinessStatus | null>(null);
  const [reasonText, setReasonText] = useState('');
  const [newCode, setNewCode] = useState<string | null>(null);
  const [duration, setDuration] = useState<number | null>(12);
  const [mainBranchBusyId, setMainBranchBusyId] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    const [biz, br, pr, otp] = await Promise.all([
      supabase.from('businesses').select('*').eq('id', businessId).single(),
      supabase.from('branches').select('*').eq('business_id', businessId).order('created_at'),
      supabase.from('profiles').select('*').eq('business_id', businessId).order('created_at'),
      supabase.rpc('admin_otp_status', { p_business_id: businessId }),
    ]);
    setBusiness(biz.data ?? null);
    setBranches(br.data ?? []);
    setProfiles(pr.data ?? []);
    setOtpHistory(otp.data ?? []);
    setLoading(false);
  }
  useEffect(() => { load(); }, [businessId]);

  async function applyStatus(status: BusinessStatus, reason: string | null) {
    setBusy(true); setError(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(`${supabaseUrl}/functions/v1/admin-set-business-status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
        body: JSON.stringify({ businessId, status, reason })
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? 'Status change failed');
      setReasonPromptFor(null); setReasonText('');
      await load();
    } catch (err) {
      setError(describeError(err, 'Status change failed'));
    } finally { setBusy(false); }
  }

  async function generateCode() {
    setBusy(true); setError(null);
    try {
      const { data, error: rpcError } = await supabase.rpc('admin_generate_otp', { p_business_id: businessId, p_duration_months: duration });
      if (rpcError) throw rpcError;
      setNewCode(data as string);
      await load();
    } catch (err) {
      setError(describeError(err, 'Could not generate code'));
    } finally { setBusy(false); }
  }

  async function revokeCode() {
    setBusy(true); setError(null);
    try {
      const { error: rpcError } = await supabase.rpc('admin_revoke_otp', { p_business_id: businessId });
      if (rpcError) throw rpcError;
      await load();
    } catch (err) {
      setError(describeError(err, 'Could not revoke code'));
    } finally { setBusy(false); }
  }

  async function setMainBranch(branchId: string) {
    setMainBranchBusyId(branchId); setError(null);
    try {
      const { error: rpcError } = await supabase.rpc('admin_set_main_branch', { p_business_id: businessId, p_branch_id: branchId });
      if (rpcError) throw rpcError;
      await load();
    } catch (err) {
      setError(describeError(err, 'Could not set main branch'));
    } finally { setMainBranchBusyId(null); }
  }

  async function setBranchesEnabled(enabled: boolean) {
    setBusy(true); setError(null);
    try {
      const { error: rpcError } = await supabase.rpc('admin_set_branches_enabled', {
        p_business_id: businessId, p_enabled: enabled, p_reason: null
      });
      if (rpcError) throw rpcError;
      await load();
    } catch (err) {
      setError(describeError(err, 'Could not change branches access'));
    } finally { setBusy(false); }
  }

  const [resetPasswordOpen, setResetPasswordOpen] = useState(false);
  const [newOwnerPassword, setNewOwnerPassword] = useState('');
  const [resettingPassword, setResettingPassword] = useState(false);
  const [resetPasswordResult, setResetPasswordResult] = useState<string | null>(null);

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteConfirmName, setDeleteConfirmName] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  async function deleteBusiness() {
    setDeleting(true); setDeleteError(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(`${supabaseUrl}/functions/v1/admin-delete-business`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
        body: JSON.stringify({ businessId, confirmName: deleteConfirmName })
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? 'Could not delete business');
      onBack();
    } catch (err) {
      setDeleteError(describeError(err, 'Could not delete business'));
    } finally { setDeleting(false); }
  }

  async function resetOwnerPassword() {
    if (newOwnerPassword.length < 8) { setError('Password must be at least 8 characters'); return; }
    setResettingPassword(true); setError(null); setResetPasswordResult(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(`${supabaseUrl}/functions/v1/admin-reset-owner-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
        body: JSON.stringify({ businessId, newPassword: newOwnerPassword })
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? 'Could not reset password');
      setResetPasswordResult('Password reset. Share it with the owner directly — it is shown only once here.');
      setNewOwnerPassword('');
    } catch (err) {
      setError(describeError(err, 'Could not reset password — is admin-reset-owner-password deployed?'));
    } finally { setResettingPassword(false); }
  }

  if (loading) return <Skeleton rows={5} />;
  if (!business) return <EmptyState message="Business not found." />;

  const owner = profiles.find((p) => p.role === 'owner');
  const employees = profiles.filter((p) => p.role !== 'owner');
  const activeOtp = otpHistory.find((o) => !o.used_at && new Date(o.expires_at) > new Date());

  return (
    <div className="space-y-5">
      <button onClick={onBack} className="flex items-center gap-1.5 text-sm text-slate-400 hover:text-ink">
        <ArrowLeft className="w-4 h-4" /> Back to businesses
      </button>

      <ErrorText>{error}</ErrorText>

      {/* Phone-only quick nav — this business's own sub-sections (Activation,
          Branches, Owner, Employees) are otherwise easy to lose track of
          once you've scrolled past them on a small screen. */}
      <select
        className="input text-sm lg:hidden"
        defaultValue=""
        onChange={(e) => { if (e.target.value) jumpTo(e.target.value); e.target.value = ''; }}
      >
        <option value="" disabled>Jump to section…</option>
        {SECTIONS.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
      </select>

      <Card className="section-anchor" id="section-overview">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="font-display font-semibold text-lg">{business.name}</h2>
            <p className="text-xs text-slate-400 mt-0.5">{business.email ?? 'No email'} · {business.phone ?? 'No phone'}</p>
            <p className="text-xs text-slate-500 mt-0.5">Registered {new Date(business.created_at).toLocaleDateString()}</p>
          </div>
          <StatusBadge status={business.status} />
        </div>

        <div className="flex flex-wrap items-center gap-2 mt-4">
          {business.status !== 'active' && (
            <button disabled={busy} onClick={() => applyStatus('active', null)} className="btn-primary text-xs px-2.5 py-1 flex items-center gap-1">
              <Play className="w-3.5 h-3.5" /> Activate
            </button>
          )}
          {business.status === 'active' && (
            <button disabled={busy} onClick={() => setReasonPromptFor('paused')} className="btn-secondary text-xs px-2.5 py-1 flex items-center gap-1">
              <Pause className="w-3.5 h-3.5" /> Pause
            </button>
          )}
          {business.status !== 'suspended' && (
            <button disabled={busy} onClick={() => setReasonPromptFor('suspended')} className="btn-secondary text-xs px-2.5 py-1 flex items-center gap-1 text-rust-500">
              <ShieldOff className="w-3.5 h-3.5" /> Suspend
            </button>
          )}
          {business.status === 'suspended' && (
            <button disabled={busy} onClick={() => applyStatus('active', null)} className="btn-primary text-xs px-2.5 py-1 flex items-center gap-1">
              <Play className="w-3.5 h-3.5" /> Reactivate
            </button>
          )}
        </div>
      </Card>

      {reasonPromptFor && (
        <Card>
          <p className="text-sm font-medium mb-2">Reason for {reasonPromptFor === 'suspended' ? 'suspending' : 'pausing'} this business</p>
          <textarea className="input min-h-[70px] mb-3" placeholder="Reason (recorded in audit log)" value={reasonText} onChange={(e) => setReasonText(e.target.value)} />
          <div className="flex gap-2">
            <button disabled={busy} onClick={() => applyStatus(reasonPromptFor, reasonText || null)} className="btn-primary flex-1">Confirm</button>
            <button onClick={() => { setReasonPromptFor(null); setReasonText(''); }} className="btn-secondary flex-1">Cancel</button>
          </div>
        </Card>
      )}

      <div id="section-activation" className="section-anchor">
        <h3 className="font-display font-semibold text-sm mb-2 text-slate-400">Activation & access</h3>
        <Card>
          <p className={`text-sm font-medium mb-3 ${business.activation_expires_at && new Date(business.activation_expires_at) < new Date() ? 'text-rust-500' : ''}`}>
            {formatExpiry(business.activation_expires_at)}
          </p>

          {business.status !== 'pending_activation' && !activeOtp && (
            <p className="text-sm text-slate-400 mb-3">Business is {business.status.replace(/_/g, ' ')} — no activation code pending.</p>
          )}
          {activeOtp && (
            <div className="mb-3">
              <p className="text-sm">Code pending — {activeOtp.attempts}/{activeOtp.max_attempts} attempts used, expires {new Date(activeOtp.expires_at).toLocaleTimeString()}.</p>
            </div>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <DurationSelect value={duration} onChange={setDuration} />
            <button disabled={busy} onClick={generateCode} className="btn-primary text-xs px-2.5 py-1 flex items-center gap-1">
              <KeyRound className="w-3.5 h-3.5" /> {activeOtp ? 'Regenerate code' : 'Generate code'}
            </button>
            {activeOtp && (
              <button disabled={busy} onClick={revokeCode} className="btn-secondary text-xs px-2.5 py-1 flex items-center gap-1 text-rust-500">
                <XCircle className="w-3.5 h-3.5" /> Revoke
              </button>
            )}
            <button disabled={busy} onClick={load} className="btn-secondary text-xs px-2.5 py-1 flex items-center gap-1">
              <RefreshCw className="w-3.5 h-3.5" /> Refresh
            </button>
          </div>
          <p className="text-xs text-slate-500 mt-2">
            The duration you pick here sets how long the business stays active once activated — separate from the code's own 15-minute entry window. Generating a new code updates the access duration too, even if the code isn't used yet.
          </p>

          {newCode && (
            <div className="mt-3 p-3 bg-paper rounded-card space-y-3">
              <div>
                <p className="text-xs text-slate-400 mb-2">Shown once — expires in 15 minutes.</p>
                <div className="text-2xl font-mono font-semibold tracking-widest text-center">{newCode}</div>
              </div>
              <OtpDeliveryActions supabase={supabase} code={newCode} businessName={business.name} phone={business.phone} email={business.email} />
            </div>
          )}

          {otpHistory.length > 0 && (
            <details className="mt-3">
              <summary className="text-xs text-slate-400 cursor-pointer">Activation history ({otpHistory.length})</summary>
              <div className="mt-2 space-y-1.5">
                {otpHistory.map((o) => (
                  <div key={o.id} className="text-xs text-slate-400 flex items-center justify-between">
                    <span>{new Date(o.created_at).toLocaleString()}</span>
                    <span>{o.used_at ? 'used' : new Date(o.expires_at) < new Date() ? 'expired' : 'pending'} · {o.attempts}/{o.max_attempts} attempts</span>
                  </div>
                ))}
              </div>
            </details>
          )}
        </Card>
      </div>

      <div id="section-branches" className="section-anchor">
        <h3 className="font-display font-semibold text-sm mb-2 text-slate-400">Branches ({branches.length})</h3>
        <Card className="flex items-center justify-between gap-3 mb-2">
          <div>
            <div className="text-sm font-medium">Multi-branch access</div>
            <div className="text-xs text-slate-400">{business.branches_enabled ? 'Active — this shop can add more branches.' : 'Not active — limited to its one existing branch.'}</div>
          </div>
          {business.branches_enabled ? (
            <button onClick={() => setBranchesEnabled(false)} disabled={busy} className="btn-secondary text-xs px-2.5 py-1">Pause</button>
          ) : (
            <button onClick={() => setBranchesEnabled(true)} disabled={busy} className="btn-primary text-xs px-2.5 py-1">Activate</button>
          )}
        </Card>
        {branches.length === 0 && <EmptyState message="No branches yet." />}
        <div className="space-y-2">
          {branches.map((b) => (
            <Card key={b.id} className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="text-sm font-medium flex items-center gap-1.5">
                  {b.name}
                  {b.is_main && (
                    <span className="inline-flex items-center gap-1 text-[11px] font-medium text-amber-500 bg-amber-500/15 px-1.5 py-0.5 rounded-full">
                      <Star className="w-3 h-3 fill-current" /> Main
                    </span>
                  )}
                </div>
                <div className="text-xs text-slate-400">{b.location ?? 'No location'}{b.code ? ` · ${b.code}` : ''}</div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <StatusBadge status={b.status} />
                {!b.is_main && (
                  <button
                    disabled={mainBranchBusyId === b.id}
                    onClick={() => setMainBranch(b.id)}
                    className="btn-secondary text-xs px-2 py-1 whitespace-nowrap"
                  >
                    {mainBranchBusyId === b.id ? 'Setting…' : 'Set as main'}
                  </button>
                )}
              </div>
            </Card>
          ))}
        </div>
      </div>

      <div id="section-owner" className="section-anchor">
        <h3 className="font-display font-semibold text-sm mb-2 text-slate-400">Owner</h3>
        {owner ? (
          <Card className="flex items-center justify-between gap-3">
            <div>
              <div className="text-sm font-medium">{owner.full_name}</div>
              <div className="text-xs text-slate-400">{owner.phone ?? 'No phone'}</div>
            </div>
            <div className="flex items-center gap-2">
              <StatusBadge status={owner.status} />
              <button onClick={() => setResetPasswordOpen(true)} title="Reset password" className="p-1.5 text-slate-400 hover:text-ink">
                <Lock className="w-4 h-4" />
              </button>
            </div>
          </Card>
        ) : <EmptyState message="No owner profile found." />}
      </div>

      <div id="section-employees" className="section-anchor">
        <h3 className="font-display font-semibold text-sm mb-2 text-slate-400">Employees ({employees.length})</h3>
        {employees.length === 0 && <EmptyState message="No employees yet." />}
        <div className="space-y-2">
          {employees.map((p) => (
            <Card key={p.id} className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="text-sm font-medium">{p.full_name}</div>
                <div className="text-xs text-slate-400">{p.role.replace(/_/g, ' ')}</div>
              </div>
              <StatusBadge status={p.status} />
            </Card>
          ))}
        </div>
      </div>

      <div className="border-t border-rust-500/20 pt-4 mt-2">
        <h3 className="font-display font-semibold text-sm mb-2 text-rust-500">Danger zone</h3>
        <Card className="flex items-center justify-between gap-3 border-rust-500/30">
          <div>
            <div className="text-sm font-medium">Delete this business</div>
            <div className="text-xs text-slate-400">Permanently removes all branches, products, sales, and every account tied to it. Cannot be undone.</div>
          </div>
          <button onClick={() => setDeleteOpen(true)} className="btn-secondary text-xs px-2.5 py-1 text-rust-500 flex items-center gap-1 shrink-0">
            <Trash2 className="w-3.5 h-3.5" /> Delete
          </button>
        </Card>
      </div>

      {resetPasswordOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60" onClick={() => { setResetPasswordOpen(false); setResetPasswordResult(null); }} />
          <div className="relative card p-5 max-w-sm w-full">
            <h3 className="font-display font-semibold text-lg mb-1">Reset {owner?.full_name ?? "owner"}'s password</h3>
            <p className="text-xs text-slate-400 mb-3">Sets a new password directly — you never see or need their current one. Share the new one with them yourself; it's shown only once here.</p>
            {resetPasswordResult ? (
              <>
                <p className="text-sm text-field-600 mb-3">{resetPasswordResult}</p>
                <button onClick={() => { setResetPasswordOpen(false); setResetPasswordResult(null); }} className="btn-secondary w-full">Done</button>
              </>
            ) : (
              <>
                <input
                  className="input mb-3" type="text" placeholder="New password (min 8 characters)"
                  value={newOwnerPassword} onChange={(e) => setNewOwnerPassword(e.target.value)} minLength={8} autoFocus
                />
                <div className="flex gap-2">
                  <button onClick={resetOwnerPassword} disabled={resettingPassword || newOwnerPassword.length < 8} className="btn-primary flex-1">
                    {resettingPassword ? 'Resetting…' : 'Reset password'}
                  </button>
                  <button onClick={() => setResetPasswordOpen(false)} className="btn-secondary flex-1">Cancel</button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {deleteOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60" onClick={() => { setDeleteOpen(false); setDeleteConfirmName(''); setDeleteError(null); }} />
          <div className="relative card p-5 max-w-sm w-full border-rust-500/30">
            <h3 className="font-display font-semibold text-lg mb-1 text-rust-500">Delete {business.name}</h3>
            <p className="text-xs text-slate-400 mb-3">
              This permanently removes every branch, product, sale, customer, and financial record for this business,
              plus the owner's and every employee's account. There is no undo. Type the business name to confirm.
            </p>
            <input
              className="input mb-3" type="text" placeholder={business.name}
              value={deleteConfirmName} onChange={(e) => setDeleteConfirmName(e.target.value)} autoFocus
            />
            {deleteError && <p className="text-xs text-rust-500 mb-3">{deleteError}</p>}
            <div className="flex gap-2">
              <button
                onClick={deleteBusiness}
                disabled={deleting || deleteConfirmName.trim().toLowerCase() !== business.name.trim().toLowerCase()}
                className="btn-primary flex-1 !bg-rust-500 hover:!bg-rust-500"
              >
                {deleting ? 'Deleting…' : 'Permanently delete'}
              </button>
              <button onClick={() => { setDeleteOpen(false); setDeleteConfirmName(''); setDeleteError(null); }} className="btn-secondary flex-1">Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
