import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { ChevronRight, X, UserPlus } from 'lucide-react';
import { db, enqueueSync } from '../../lib/db';
import { useAuth } from '../../lib/auth';
import { inviteEmployee, resetEmployeePassword } from '../../lib/invites';
import { getReceiptLink } from '../../lib/receipts';
import { recordAuditEvent } from '../../lib/audit';
import type { Profile, Role } from '../../lib/types';
import { PERMISSION_KEYS } from '../../lib/types';

const ROLE_LABEL: Record<Role, string> = {
  owner: 'Owner', manager: 'Manager', cashier: 'Cashier',
  inventory_manager: 'Inventory Manager', accountant: 'Accountant', sales_staff: 'Sales Staff'
};

const STATUS_STYLES: Record<Profile['status'], string> = {
  active: 'bg-field-50 text-field-700',
  paused: 'bg-amber-100 text-amber-600',
  suspended: 'bg-rust-50 text-rust-600',
  pending: 'bg-slate-200 text-slate-600'
};

export function UsersList() {
  const { business, profile: myProfile, branches } = useAuth();
  const canManage = myProfile?.role === 'owner' || myProfile?.role === 'manager';
  const profiles = useLiveQuery(
    () => (business ? db.profiles.where('businessId').equals(business.id).toArray() : []),
    [business?.id]
  ) ?? [];
  const [selected, setSelected] = useState<Profile | null>(null);
  const [inviting, setInviting] = useState(false);

  return (
    <div className="p-4 md:p-8 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-4">
        <h1 className="font-display text-2xl font-semibold">Users</h1>
        {canManage && (
          <button onClick={() => setInviting(true)} className="btn-primary flex items-center gap-1.5 text-sm">
            <UserPlus className="w-4 h-4" /> Add employee
          </button>
        )}
      </div>
      <div className="card divide-y divide-slate-100">
        {profiles.length === 0 && <p className="text-sm text-slate-500 py-8 text-center">No users yet.</p>}
        {profiles.map((p) => (
          <button
            key={p.id}
            onClick={() => setSelected(p)}
            className="w-full flex items-center justify-between gap-3 p-4 text-left hover:bg-paper"
          >
            <div className="min-w-0">
              <div className="text-sm font-medium truncate">{p.fullName}</div>
              <div className="text-xs text-slate-500">{ROLE_LABEL[p.role]}</div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${STATUS_STYLES[p.status]}`}>{p.status}</span>
              <ChevronRight className="w-4 h-4 text-slate-400" />
            </div>
          </button>
        ))}
      </div>
      {selected && (
        <UserDrawer profile={selected} canManage={myProfile?.role === 'owner'} viewerRole={myProfile?.role} onClose={() => setSelected(null)} />
      )}
      {inviting && business && (
        <InviteEmployeeModal businessId={business.id} branches={branches} onClose={() => setInviting(false)} />
      )}
    </div>
  );
}

const INVITABLE_ROLES: Role[] = ['manager', 'cashier', 'inventory_manager', 'accountant', 'sales_staff'];

function InviteEmployeeModal({ businessId, branches, onClose }: { businessId: string; branches: any[]; onClose: () => void }) {
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [role, setRole] = useState<Role>('cashier');
  const [branchId, setBranchId] = useState(branches[0]?.id ?? '');
  const [temporaryPassword, setTemporaryPassword] = useState('');
  const [skipEmail, setSkipEmail] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [reusedExistingAccount, setReusedExistingAccount] = useState(false);
  const [emailSent, setEmailSent] = useState(false);

  async function submit() {
    if (!fullName.trim() || !email.trim() || !branchId || temporaryPassword.length < 8) return;
    setError(null); setSending(true);
    try {
      const result = await inviteEmployee({ fullName: fullName.trim(), email: email.trim(), phone: phone || undefined, role, branchId, temporaryPassword, skipEmail });
      setReusedExistingAccount(result.reusedExistingAccount);
      setEmailSent(result.emailSent);
      setSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not add employee');
    } finally { setSending(false); }
  }

  if (sent) {
    return (
      <div className="fixed inset-0 z-[55] flex items-end md:items-center md:justify-center">
        <div className="absolute inset-0 bg-ink/40" onClick={onClose} />
        <div className="relative w-full md:max-w-sm bg-paper-raised rounded-t-2xl md:rounded-2xl p-5 text-center space-y-3">
          <p className="font-display font-semibold text-lg">{reusedExistingAccount ? 'Employee added' : 'Account created'}</p>
          <p className="text-sm text-slate-500">
            {reusedExistingAccount
              ? `${fullName.trim()} already has a ShopOS account from another business, so their existing password still applies — the temporary password you set was not used. They can switch to this business from inside the app after signing in.`
              : `Share the email and password you set with ${fullName.trim()} directly — they can sign in right away and change it later from their own profile.`}
          </p>
          {!emailSent && (
            <p className="text-xs text-amber-600">
              We couldn't send them a notification email — make sure they know their sign-in details some other way.
            </p>
          )}
          <button onClick={onClose} className="btn-primary w-full">Done</button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[55] flex items-end md:items-center md:justify-center">
      <div className="absolute inset-0 bg-ink/40" onClick={onClose} />
      <div className="relative w-full md:max-w-sm bg-paper-raised rounded-t-2xl md:rounded-2xl p-5 space-y-3.5 max-h-[85vh] overflow-y-auto">
        <div className="flex items-center justify-between">
          <h3 className="font-display font-semibold text-lg">Add employee</h3>
          <button onClick={onClose}><X className="w-5 h-5" /></button>
        </div>
        <label className="block"><span className="block text-sm font-medium text-slate-600 mb-1.5">Full name</span><input className="input" value={fullName} onChange={(e) => setFullName(e.target.value)} autoFocus /></label>
        <label className="block"><span className="block text-sm font-medium text-slate-600 mb-1.5">Email</span><input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></label>
        <label className="block"><span className="block text-sm font-medium text-slate-600 mb-1.5">Phone (optional)</span><input className="input" value={phone} onChange={(e) => setPhone(e.target.value)} /></label>
        <label className="block">
          <span className="block text-sm font-medium text-slate-600 mb-1.5">Role</span>
          <select className="input" value={role} onChange={(e) => setRole(e.target.value as Role)}>
            {INVITABLE_ROLES.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
          </select>
        </label>
        <label className="block">
          <span className="block text-sm font-medium text-slate-600 mb-1.5">Branch</span>
          <select className="input" value={branchId} onChange={(e) => setBranchId(e.target.value)}>
            {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        </label>
        <label className="block">
          <span className="block text-sm font-medium text-slate-600 mb-1.5">Temporary password</span>
          <input className="input" type="text" value={temporaryPassword} onChange={(e) => setTemporaryPassword(e.target.value)} placeholder="At least 8 characters" minLength={8} />
          <span className="block text-xs text-slate-500 mt-1">They can sign in with this immediately and change it later.</span>
        </label>
        <label className="flex items-center gap-2 text-sm text-slate-600">
          <input type="checkbox" checked={skipEmail} onChange={(e) => setSkipEmail(e.target.checked)} />
          Skip notification email (saves your daily email limit)
        </label>
        {error && <p className="text-sm text-rust-600">{error}</p>}
        <button onClick={submit} disabled={sending || !fullName.trim() || !email.trim() || !branchId || temporaryPassword.length < 8} className="btn-primary w-full">
          {sending ? 'Creating…' : 'Create account'}
        </button>
      </div>
    </div>
  );
}

function ResetPasswordModal({ profileName, targetUserId, onClose }: { profileName: string; targetUserId: string; onClose: () => void }) {
  const [newPassword, setNewPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function submit() {
    if (newPassword.length < 8) return;
    setBusy(true); setError(null);
    try {
      await resetEmployeePassword(targetUserId, newPassword);
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not reset password');
    } finally { setBusy(false); }
  }

  return (
    <div className="fixed inset-0 z-[65] flex items-end md:items-center md:justify-center">
      <div className="absolute inset-0 bg-ink/40" onClick={onClose} />
      <div className="relative w-full md:max-w-sm bg-paper-raised rounded-t-2xl md:rounded-2xl p-5 space-y-3">
        {done ? (
          <>
            <p className="font-display font-semibold text-lg">Password reset</p>
            <p className="text-sm text-slate-500">Share the new password with {profileName} directly — they can change it again later from their own profile.</p>
            <button onClick={onClose} className="btn-primary w-full">Done</button>
          </>
        ) : (
          <>
            <div className="flex items-center justify-between">
              <h3 className="font-display font-semibold text-lg">Reset {profileName}'s password</h3>
              <button onClick={onClose}><X className="w-5 h-5" /></button>
            </div>
            <label className="block">
              <span className="block text-sm font-medium text-slate-600 mb-1.5">New password</span>
              <input className="input" type="text" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="At least 8 characters" minLength={8} autoFocus />
            </label>
            {error && <p className="text-sm text-rust-600">{error}</p>}
            <button onClick={submit} disabled={busy || newPassword.length < 8} className="btn-primary w-full">{busy ? 'Resetting…' : 'Reset password'}</button>
          </>
        )}
      </div>
    </div>
  );
}

function UserDrawer({ profile, canManage, viewerRole, onClose }: { profile: Profile; canManage: boolean; viewerRole?: Role; onClose: () => void }) {
  const [tab, setTab] = useState<'profile' | 'permissions'>('profile');
  const [editing, setEditing] = useState(false);
  // sale.userId is the AUTH user id (see lib/sales.ts), not a profile row
  // id — those differ for anyone whose profile.id was freshly generated
  // (any employee added since the phase1 migration), so this must query
  // by profile.userId, not profile.id, or it silently returns nothing for
  // exactly the staff added most recently.
  const sales = useLiveQuery(() => db.sales.where('userId').equals(profile.userId).toArray(), [profile.userId]) ?? [];
  const totalSalesValue = sales.reduce((s, sale) => s + sale.total, 0);
  const lastSale = sales.length ? [...sales].sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0] : null;
  const [role, setRole] = useState<Role>(profile.role);
  const [status, setStatus] = useState<Profile['status']>(profile.status);
  const [saving, setSaving] = useState(false);
  const [resettingPassword, setResettingPassword] = useState(false);

  // canManage (owner-only) governs role/status edits; password reset is
  // available to managers too, just never against an owner's account.
  const canResetPassword = viewerRole === 'owner' || (viewerRole === 'manager' && profile.role !== 'owner');

  // "Added by" is derived from the audit trail (the employee_added entry
  // written when invite-employee created this membership) rather than a
  // dedicated column.
  const createdByEntry = useLiveQuery(
    () => db.auditLog.where('entityId').equals(profile.id).filter((e) => e.action === 'employee_added').first(),
    [profile.id]
  );
  const createdByProfile = useLiveQuery(
    async () => (createdByEntry?.userId
      ? db.profiles.where('[userId+businessId]').equals([createdByEntry.userId, profile.businessId]).first()
      : undefined),
    [createdByEntry?.userId, profile.businessId]
  );
  const recentActivity = useLiveQuery(
    async () => {
      const rows = await db.auditLog.where('userId').equals(profile.userId).toArray();
      return rows.sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 20);
    },
    [profile.userId]
  ) ?? [];

  async function save() {
    setSaving(true);
    try {
      await db.profiles.update(profile.id, { role, status, updatedAt: new Date().toISOString() });
      await enqueueSync('profiles', profile.id, 'update');
      setEditing(false);
    } finally { setSaving(false); }
  }

  return (
    <div className="fixed inset-0 z-[55] flex items-end md:items-center md:justify-center">
      <div className="absolute inset-0 bg-ink/40" onClick={onClose} />
      <div className="relative w-full md:max-w-md bg-paper-raised rounded-t-2xl md:rounded-2xl p-5 space-y-4 max-h-[85vh] overflow-y-auto">
        <div className="flex items-center justify-between">
          <h3 className="font-display font-semibold text-lg">{profile.fullName}</h3>
          <button onClick={onClose}><X className="w-5 h-5" /></button>
        </div>

        <div className="flex gap-1 p-1 bg-slate-100 rounded-xl">
          <button
            onClick={() => setTab('profile')}
            className={`flex-1 text-xs font-medium py-2 rounded-lg transition-colors ${tab === 'profile' ? 'bg-paper-raised text-field-600 shadow-sm' : 'text-slate-500'}`}
          >
            Profile
          </button>
          <button
            onClick={() => setTab('permissions')}
            className={`flex-1 text-xs font-medium py-2 rounded-lg transition-colors ${tab === 'permissions' ? 'bg-paper-raised text-field-600 shadow-sm' : 'text-slate-500'}`}
          >
            Permissions
          </button>
        </div>

        {tab === 'profile' && (
          <>
            <div className="text-sm text-slate-600 space-y-0.5">
              <div>{ROLE_LABEL[profile.role]} · <span className="capitalize">{profile.status}</span></div>
              {profile.phone && <div>{profile.phone}</div>}
              <div className="text-xs text-slate-400 pt-1">
                Joined {new Date(profile.createdAt).toLocaleString()}{createdByProfile ? ` · added by ${createdByProfile.fullName}` : ''}
              </div>
              <div className="text-xs text-slate-400">
                {profile.lastLoginAt ? `Last signed in ${new Date(profile.lastLoginAt).toLocaleString()}` : 'Never signed in yet'}
              </div>
              <div className="text-xs text-slate-400 flex items-center gap-1.5">
                <span>{lastSale ? `Last sale ${new Date(lastSale.createdAt).toLocaleString()} — ${lastSale.total.toLocaleString()}` : 'No sales recorded yet'}</span>
                {lastSale && (
                  <button
                    onClick={async () => {
                      const link = await getReceiptLink(lastSale.id, lastSale.receiptNumber);
                      if (link) window.open(link, '_blank');
                      else alert("This sale hasn't synced yet — try again once it's online.");
                    }}
                    className="text-field-600 font-medium shrink-0"
                  >
                    Receipt
                  </button>
                )}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 text-sm">
              <div className="card p-3"><div className="text-xs text-slate-500">Transactions</div><div className="tnum font-semibold">{sales.length}</div></div>
              <div className="card p-3"><div className="text-xs text-slate-500">Sales value</div><div className="tnum font-semibold">{totalSalesValue.toLocaleString()}</div></div>
            </div>

            {!editing ? (
              <div className="flex gap-2">
                {canManage && (
                  <button onClick={() => setEditing(true)} className="btn-secondary flex-1 text-sm">Edit profile</button>
                )}
                {canResetPassword && (
                  <button onClick={() => setResettingPassword(true)} className="btn-secondary flex-1 text-sm">Reset password</button>
                )}
              </div>
            ) : (
              <div className="space-y-3 pt-1 border-t border-slate-100">
                <label className="block">
                  <span className="block text-sm font-medium text-slate-600 mb-1.5">Role</span>
                  <select className="input" value={role} onChange={(e) => setRole(e.target.value as Role)}>
                    {Object.entries(ROLE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                </label>
                <label className="block">
                  <span className="block text-sm font-medium text-slate-600 mb-1.5">Status</span>
                  <select className="input" value={status} onChange={(e) => setStatus(e.target.value as Profile['status'])}>
                    <option value="active">Active</option>
                    <option value="paused">Paused</option>
                    <option value="suspended">Suspended</option>
                  </select>
                </label>
                <div className="flex gap-2">
                  <button onClick={() => setEditing(false)} className="btn-secondary flex-1 text-sm">Cancel</button>
                  <button onClick={save} disabled={saving} className="btn-primary flex-1 text-sm">{saving ? 'Saving…' : 'Save'}</button>
                </div>
              </div>
            )}

            <div>
              <h4 className="text-sm font-medium mb-2">Recent activity</h4>
              {recentActivity.length === 0 ? (
                <p className="text-xs text-slate-400">No recorded activity yet.</p>
              ) : (
                <div className="space-y-1.5">
                  {recentActivity.map((entry) => (
                    <div key={entry.id} className="flex items-center justify-between text-xs py-1.5 border-b border-slate-50 last:border-0">
                      <span className="text-slate-600">{entry.action.replace(/_/g, ' ')}</span>
                      <span className="text-slate-400 tnum">{new Date(entry.createdAt).toLocaleString()}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}

        {tab === 'permissions' && (
          <>
            {!canManage && <p className="text-xs text-slate-400">Only the business owner can change permissions.</p>}
            {canManage && profile.role !== 'owner' && <PermissionsEditor profileId={profile.id} businessId={profile.businessId} />}
            {canManage && profile.role !== 'owner' && <BranchAssignmentEditor profile={profile} />}
            {profile.role === 'owner' && <p className="text-xs text-slate-400">Owners have full access — permissions don't apply.</p>}
          </>
        )}

        {resettingPassword && (
          <ResetPasswordModal profileName={profile.fullName} targetUserId={profile.id} onClose={() => setResettingPassword(false)} />
        )}
      </div>
    </div>
  );
}

function BranchAssignmentEditor({ profile }: { profile: Profile }) {
  const { business } = useAuth();
  const branches = useLiveQuery(
    () => (business ? db.branches.where('businessId').equals(business.id).toArray() : []),
    [business?.id]
  ) ?? [];
  const assignments = useLiveQuery(
    () => db.profileBranches.where('profileId').equals(profile.id).toArray(),
    [profile.id]
  ) ?? [];
  const assignedIds = new Set(assignments.map((a) => a.branchId));
  const restricted = profile.role !== 'manager';

  async function toggle(branchId: string) {
    const id = `${profile.id}:${branchId}`;
    if (assignedIds.has(branchId)) {
      await db.profileBranches.delete(id);
      await enqueueSync('profileBranches', id, 'delete');
    } else {
      await db.profileBranches.put({ id, profileId: profile.id, branchId, updatedAt: new Date().toISOString(), syncStatus: 'pending' });
      await enqueueSync('profileBranches', id, 'create');
    }
  }

  return (
    <div className="pt-2 border-t border-slate-100">
      <h4 className="text-sm font-medium mb-2">Branch access</h4>
      <p className="text-xs text-slate-500 mb-2.5">
        {restricted
          ? 'Which branches this person can see and work in. They can only access branches checked here.'
          : 'Managers see every branch regardless of what\'s checked here — this is informational only.'}
      </p>
      <div className="space-y-1.5">
        {branches.length === 0 && <p className="text-xs text-slate-400">No branches yet.</p>}
        {branches.map((b) => (
          <label key={b.id} className="w-full flex items-center justify-between px-3 py-2 rounded-card border border-slate-200 text-sm cursor-pointer">
            <span>{b.name}</span>
            <input type="checkbox" checked={assignedIds.has(b.id)} onChange={() => toggle(b.id)} />
          </label>
        ))}
      </div>
    </div>
  );
}

function PermissionsEditor({ profileId, businessId }: { profileId: string; businessId: string }) {
  const { userId } = useAuth();
  const overrides = useLiveQuery(
    () => db.profilePermissions.where('profileId').equals(profileId).toArray(),
    [profileId]
  ) ?? [];

  function isAllowed(key: string): boolean | null {
    const row = overrides.find((o) => o.permission === key);
    return row ? row.allowed : null; // null = using role default
  }

  async function toggle(key: string) {
    const current = isAllowed(key);
    const nextAllowed = current === false ? true : current === true ? false : false; // default -> revoke -> restore
    const id = `${profileId}:${key}`;
    await db.profilePermissions.put({
      id, profileId, permission: key, allowed: nextAllowed,
      grantedBy: userId ?? null, updatedAt: new Date().toISOString(), syncStatus: 'pending'
    });
    await enqueueSync('profilePermissions', id, 'update');
    await recordAuditEvent({
      businessId, userId, action: 'permission_override_changed', entityType: 'profile', entityId: profileId,
      newValue: JSON.stringify({ permission: key, allowed: nextAllowed })
    });
  }

  return (
    <div className="pt-2 border-t border-slate-100">
      <h4 className="text-sm font-medium mb-2">Permission overrides</h4>
      <p className="text-xs text-slate-500 mb-2.5">Tap to revoke a permission this role normally has. Enforced server-side via RLS, not just hidden in the UI.</p>
      <div className="space-y-1.5">
        {PERMISSION_KEYS.map((key) => {
          const allowed = isAllowed(key);
          return (
            <button
              key={key}
              onClick={() => toggle(key)}
              className="w-full flex items-center justify-between px-3 py-2 rounded-card border border-slate-200 text-sm"
            >
              <span className="font-mono text-xs">{key}</span>
              <span className={`text-xs font-medium ${allowed === false ? 'text-rust-600' : 'text-field-600'}`}>
                {allowed === false ? 'Revoked' : 'Allowed'}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

