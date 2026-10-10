import { useEffect, useState } from 'react';
import { SupabaseClient } from '@supabase/supabase-js';
import { ArrowLeft, KeyRound, Pause, Play, RefreshCw, ShieldOff, Star, XCircle, Lock, Trash2, Undo2 } from 'lucide-react';
import { Card, EmptyState, ErrorText, Skeleton, StatusBadge } from '../components/ui';
import { OtpDeliveryActions } from '../components/OtpDeliveryActions';
import { formatExpiry } from '../components/DurationSelect';
import { BusinessPlanPanel } from './Packages';
import { PackagePicker, PickerValue, applyPick, pickMonths } from '../components/PackagePicker';
import { Branch, Business, BusinessStatus, OtpStatusRow, Profile } from '../lib/types';
import { describeError } from '../lib/errors';
import { supabaseUrl } from '../lib/supabase';

const TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'activity', label: 'Activity' },
  { id: 'users', label: 'Users' },
  { id: 'access', label: 'Access & branches' },
  { id: 'consent', label: 'Consent' },
  { id: 'account', label: 'Account' },
] as const;
type TabId = (typeof TABS)[number]['id'];

export default function BusinessDetail({ supabase, businessId, onBack }: { supabase: SupabaseClient; businessId: string; onBack: () => void }) {
  const [business, setBusiness] = useState<Business | null>(null);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [otpHistory, setOtpHistory] = useState<OtpStatusRow[]>([]);
  const [usage, setUsage] = useState<Record<string, number> | null>(null);
  const [activity, setActivity] = useState<{ occurred_at: string; kind: string; detail: string | null; actor_name: string | null; was_offline: boolean }[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<TabId>('overview');
  const [consents, setConsents] = useState<{ full_name: string | null; email: string | null; document_version: string; context: string; accepted_at: string; user_agent: string | null }[]>([]);
  const [deletions, setDeletions] = useState<{ id: string; action: string; scope: string; email: string | null; reason: string | null; created_at: string }[]>([]);
  const [restoring, setRestoring] = useState(false);
  const [purgeMode, setPurgeMode] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reasonPromptFor, setReasonPromptFor] = useState<BusinessStatus | null>(null);
  const [reasonText, setReasonText] = useState('');
  const [newCode, setNewCode] = useState<string | null>(null);
  const [pick, setPick] = useState<PickerValue>({ months: 12, packageId: null });
  const [mainBranchBusyId, setMainBranchBusyId] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    const [biz, br, pr, otp, us, act, con, del] = await Promise.all([
      supabase.from('businesses').select('*').eq('id', businessId).single(),
      supabase.from('branches').select('*').eq('business_id', businessId).order('created_at'),
      supabase.from('profiles').select('*').eq('business_id', businessId).order('created_at'),
      supabase.rpc('admin_otp_status', { p_business_id: businessId }),
      supabase.rpc('admin_business_usage', { p_business_id: businessId }),
      supabase.rpc('admin_activity_feed', { p_business_id: businessId, p_limit: 60 }),
      supabase.rpc('admin_business_consents', { p_business_id: businessId }),
      supabase.from('account_deletions').select('id, action, scope, email, reason, created_at').eq('business_id', businessId).order('created_at', { ascending: false }).limit(20),
    ]);
    setBusiness(biz.data ?? null);
    setBranches(br.data ?? []);
    setProfiles(pr.data ?? []);
    setOtpHistory(otp.data ?? []);
    setUsage((us.data as Record<string, number>) ?? null);
    setActivity((act.data as any[]) ?? []);
    setConsents((con.data as any[]) ?? []);
    setDeletions((del.data as any[]) ?? []);
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
      const { data, error: rpcError } = await supabase.rpc('admin_generate_otp', { p_business_id: businessId, p_duration_months: pickMonths(pick) });
      if (rpcError) throw rpcError;
      const pickErr = await applyPick(supabase, businessId, pick);
      if (pickErr) setError(pickErr);
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
        body: JSON.stringify({ businessId, confirmName: deleteConfirmName, purge: purgeMode, reason: 'Deleted by platform admin' })
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? 'Could not delete business');
      if (purgeMode) { onBack(); return; }
      setDeleteOpen(false); setDeleteConfirmName(''); await load();
    } catch (err) {
      setDeleteError(describeError(err, 'Could not delete business'));
    } finally { setDeleting(false); }
  }

  async function restoreBusiness() {
    setRestoring(true); setError(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(`${supabaseUrl}/functions/v1/admin-restore-business`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` }, body: JSON.stringify({ businessId }) });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? 'Could not restore business');
      await load();
    } catch (err) { setError(describeError(err, 'Could not restore business')); } finally { setRestoring(false); }
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

      {(business as any).deleted_at && (
        <Card className="border-rust-500/40">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-sm font-medium text-rust-500">This business was deleted (soft delete)</div>
              <div className="text-xs text-slate-400 mt-0.5">Closed {new Date((business as any).deleted_at).toLocaleString()}. All data is still held{(business as any).purge_after ? ` until ${new Date((business as any).purge_after).toLocaleDateString()}` : ''}. Sign-in is disabled for the owner and staff.</div>
            </div>
            <button disabled={restoring} onClick={restoreBusiness} className="btn-primary text-xs px-3 py-1.5 flex items-center gap-1 shrink-0"><Undo2 className="w-3.5 h-3.5" /> {restoring ? 'Restoring…' : 'Restore'}</button>
          </div>
        </Card>
      )}

      <div role="tablist" aria-label="Business sections" className="flex gap-1 overflow-x-auto border-b border-slate-800 -mx-1 px-1 sticky top-0 z-10 bg-ink/95 backdrop-blur">
        {TABS.map((t) => (
          <button key={t.id} role="tab" aria-selected={tab === t.id} onClick={() => setTab(t.id)}
            className={`shrink-0 px-3 min-h-[44px] text-sm border-b-2 -mb-px ${tab === t.id ? 'border-field-500 text-ink font-medium' : 'border-transparent text-slate-400 hover:text-ink'}`}>
            {t.label}{t.id === 'consent' ? ` (${consents.length})` : t.id === 'users' ? ` (${profiles.length})` : ''}
          </button>
        ))}
      </div>

      {tab === 'overview' && (<Card className="section-anchor" id="section-overview">
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
      </Card>)}

      <div id="section-usage" className="section-anchor">
        {(tab === 'overview' || tab === 'activity') && <h3 className="font-display font-semibold text-sm mb-2 text-slate-400">{tab === 'overview' ? 'Usage' : 'Logins & activity timeline'}</h3>}
        {(tab === 'overview' || tab === 'activity') && (<Card className="mb-2">
          <div className="grid grid-cols-2 gap-3 text-xs mb-3">
            <div><span className="text-slate-500">Last active</span><div className="text-sm font-medium">{business.last_active_at ? new Date(business.last_active_at).toLocaleString() : 'Never'}{business.last_activity_kind ? ` · ${business.last_activity_kind.replace(/_/g, ' ')}` : ''}</div></div>
            <div><span className="text-slate-500">Last sale</span><div className="text-sm font-medium">{usage?.last_sale_at ? new Date(usage.last_sale_at as unknown as string).toLocaleString() : 'None recorded'}</div></div>
            <div><span className="text-slate-500">Last login</span><div className="text-sm font-medium">{usage?.last_login_at ? new Date(usage.last_login_at as unknown as string).toLocaleString() : 'None recorded'}</div></div>
            <div><span className="text-slate-500">Last inventory update</span><div className="text-sm font-medium">{usage?.last_inventory_update_at ? new Date(usage.last_inventory_update_at as unknown as string).toLocaleString() : 'None recorded'}</div></div>
            <div className="col-span-2"><span className="text-slate-500">Last offline session (uploaded after reconnecting)</span><div className="text-sm font-medium">{usage?.last_offline_session_at ? new Date(usage.last_offline_session_at as unknown as string).toLocaleString() : 'None recorded'}</div></div>
          </div>
          {usage && (
            <div className="grid grid-cols-3 gap-2 text-center mb-3">
              <div className="rounded-lg bg-slate-800 p-2"><div className="tnum font-semibold">{usage.logins_today}</div><div className="text-[10px] text-slate-400">Logins today</div></div>
              <div className="rounded-lg bg-slate-800 p-2"><div className="tnum font-semibold">{usage.logins_7d}</div><div className="text-[10px] text-slate-400">Logins, 7 days</div></div>
              <div className="rounded-lg bg-slate-800 p-2"><div className="tnum font-semibold">{usage.logins_30d}</div><div className="text-[10px] text-slate-400">Logins, 30 days</div></div>
            </div>
          )}
          {usage ? (
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 text-center">
              <div className="rounded-lg bg-slate-800 p-2"><div className="tnum font-semibold">{usage.products}</div><div className="text-[10px] text-slate-400">Products</div></div>
              <div className="rounded-lg bg-slate-800 p-2"><div className="tnum font-semibold">{usage.customers}</div><div className="text-[10px] text-slate-400">Customers</div></div>
              <div className="rounded-lg bg-slate-800 p-2"><div className="tnum font-semibold">{usage.sales}</div><div className="text-[10px] text-slate-400">Sales</div></div>
              <div className="rounded-lg bg-slate-800 p-2"><div className="tnum font-semibold">{Number(usage.sales_total).toLocaleString()}</div><div className="text-[10px] text-slate-400">{business.currency} sold</div></div>
              <div className="rounded-lg bg-slate-800 p-2"><div className="tnum font-semibold">{usage.debts}</div><div className="text-[10px] text-slate-400">Debts</div></div>
              <div className="rounded-lg bg-slate-800 p-2"><div className="tnum font-semibold">{Number(usage.debts_outstanding).toLocaleString()}</div><div className="text-[10px] text-slate-400">Owed</div></div>
              <div className="rounded-lg bg-slate-800 p-2"><div className="tnum font-semibold">{usage.quotations}</div><div className="text-[10px] text-slate-400">Quotations</div></div>
              <div className="rounded-lg bg-slate-800 p-2"><div className="tnum font-semibold">{usage.invoices}</div><div className="text-[10px] text-slate-400">Invoices</div></div>
              <div className="rounded-lg bg-slate-800 p-2"><div className="tnum font-semibold">{usage.expenses}</div><div className="text-[10px] text-slate-400">Expenses</div></div>
              <div className="rounded-lg bg-slate-800 p-2"><div className="tnum font-semibold">{usage.users}</div><div className="text-[10px] text-slate-400">Users</div></div>
            </div>
          ) : <p className="text-xs text-slate-500">Usage figures unavailable.</p>}
        </Card>)}
        {tab === 'activity' && (<details open>
          <summary className="text-xs text-slate-400 cursor-pointer">Activity timeline ({activity.length})</summary>
          <div className="mt-2 space-y-1.5">
            {activity.length === 0 && <p className="text-xs text-slate-500">No recorded events yet.</p>}
            {activity.map((a, i) => (
              <div key={i} className="text-xs text-slate-400 flex items-start justify-between gap-3">
                <span className="min-w-0">
                  {a.actor_name ? <b className="text-slate-300 font-medium">{a.actor_name} · </b> : null}
                  {a.kind.replace(/_/g, ' ')}{a.detail ? ` (${a.detail.replace(/_/g, ' ')})` : ''}
                  {a.was_offline && <span className="ml-1.5 text-[10px] px-1.5 py-0.5 rounded-full bg-slate-700 text-slate-300">offline session</span>}
                </span>
                <span className="shrink-0 tnum">{new Date(a.occurred_at).toLocaleString()}</span>
              </div>
            ))}
          </div>
        </details>)}
      </div>

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

      {tab === 'access' && (<div id="section-activation" className="section-anchor">
        <h3 className="font-display font-semibold text-sm mb-2 text-slate-400">Plan</h3>
        <div className="mb-4"><BusinessPlanPanel supabase={supabase} businessId={businessId} onChanged={() => void load()} /></div>
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
            <PackagePicker supabase={supabase} value={pick} onChange={setPick} />
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
      </div>)}

      {tab === 'access' && (<div id="section-branches" className="section-anchor">
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
      </div>)}

      {tab === 'users' && (<div id="section-owner" className="section-anchor">
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
      </div>)}

      {tab === 'users' && (<div id="section-employees" className="section-anchor">
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
      </div>)}

      {tab === 'consent' && (
        <div>
          <h3 className="font-display font-semibold text-sm mb-2 text-slate-400">Data-use consent</h3>
          <Card>
            {consents.length === 0 ? <p className="text-sm text-slate-400">No acceptance recorded for this business yet. Accounts created before the notice was introduced appear here once their owner accepts it.</p> : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs min-w-[460px]">
                  <thead><tr className="text-slate-500 text-left"><th className="py-1.5 font-medium">Person</th><th className="font-medium">Version</th><th className="font-medium">Where</th><th className="font-medium text-right">Accepted</th></tr></thead>
                  <tbody>
                    {consents.map((c, i) => (
                      <tr key={i} className="border-t border-slate-800 align-top">
                        <td className="py-2"><div className="text-sm">{c.full_name ?? '—'}</div><div className="text-slate-500">{c.email ?? ''}</div></td>
                        <td className="tnum">v{c.document_version}</td>
                        <td className="capitalize">{c.context.replace(/_/g, ' ')}</td>
                        <td className="text-right tnum">{new Date(c.accepted_at).toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </div>
      )}

      {tab === 'account' && (
        <div className="space-y-4">
          <div>
            <h3 className="font-display font-semibold text-sm mb-2 text-slate-400">Account</h3>
            <Card>
              <div className="grid grid-cols-2 gap-3 text-xs">
                <div><span className="text-slate-500">Business ID</span><div className="text-sm font-mono break-all">{business.id}</div></div>
                <div><span className="text-slate-500">Status</span><div className="text-sm"><StatusBadge status={business.status} /></div></div>
                <div><span className="text-slate-500">Registered</span><div className="text-sm">{new Date(business.created_at).toLocaleString()}</div></div>
                <div><span className="text-slate-500">Last updated</span><div className="text-sm">{new Date((business as any).updated_at ?? business.created_at).toLocaleString()}</div></div>
                <div><span className="text-slate-500">Document template</span><div className="text-sm capitalize">{(business as any).document_template ?? 'classic'}</div></div>
                <div><span className="text-slate-500">Currency</span><div className="text-sm">{business.currency}</div></div>
              </div>
            </Card>
          </div>

          <div>
            <h3 className="font-display font-semibold text-sm mb-2 text-slate-400">Deletion history</h3>
            <Card>
              {deletions.length === 0 ? <p className="text-xs text-slate-500">Never deleted.</p> : deletions.map((d) => (
                <div key={d.id} className="text-xs text-slate-400 flex justify-between gap-3 py-1.5 border-t first:border-t-0 border-slate-800">
                  <span className="capitalize">{d.action.replace(/_/g, ' ')} · {d.scope}{d.email ? ` · ${d.email}` : ''}{d.reason ? ` · ${d.reason}` : ''}</span>
                  <span className="shrink-0 tnum">{new Date(d.created_at).toLocaleString()}</span>
                </div>
              ))}
            </Card>
          </div>

          <div className="border-t border-rust-500/20 pt-4">
            <h3 className="font-display font-semibold text-sm mb-2 text-rust-500">Danger zone</h3>
            {(business as any).deleted_at ? (
              <Card className="space-y-3 border-rust-500/30">
                <div className="text-sm font-medium">Permanently erase</div>
                <div className="text-xs text-slate-400">Removes every record and account for good. Only available because this business is already deleted. Cannot be undone.</div>
                <button onClick={() => { setPurgeMode(true); setDeleteOpen(true); }} className="btn-secondary text-xs px-2.5 py-1 text-rust-500 flex items-center gap-1 w-fit"><Trash2 className="w-3.5 h-3.5" /> Permanently erase…</button>
              </Card>
            ) : (
              <Card className="flex items-center justify-between gap-3 border-rust-500/30">
                <div>
                  <div className="text-sm font-medium">Delete this business</div>
                  <div className="text-xs text-slate-400">Soft delete: closes access for the owner and all staff immediately. Nothing is erased, and it can be restored for 30 days.</div>
                </div>
                <button onClick={() => { setPurgeMode(false); setDeleteOpen(true); }} className="btn-secondary text-xs px-2.5 py-1 text-rust-500 flex items-center gap-1 shrink-0"><Trash2 className="w-3.5 h-3.5" /> Delete</button>
              </Card>
            )}
          </div>
        </div>
      )}

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
            <h3 className="font-display font-semibold text-lg mb-1 text-rust-500">{purgeMode ? 'Permanently erase' : 'Delete'} {business.name}</h3>
            <p className="text-xs text-slate-400 mb-3">
              {purgeMode
                ? "This permanently removes every branch, product, sale, customer, and financial record for this business, plus the owner's and every employee's account. There is no undo. Type the business name to confirm."
                : "This closes the business and everyone's sign-in straight away. No data is erased and you can restore it later. Type the business name to confirm."}
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
                {deleting ? 'Working…' : purgeMode ? 'Permanently erase' : 'Delete (soft)'}
              </button>
              <button onClick={() => { setDeleteOpen(false); setDeleteConfirmName(''); setDeleteError(null); }} className="btn-secondary flex-1">Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
