import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { MapPin, Plus, X, Pause, Play, ChevronRight, Sparkles, Clock, ShieldCheck, Smartphone, Tablet, Monitor, Trash2 } from 'lucide-react';
import { db, newRecordBase, enqueueSync } from '../../lib/db';
import { useAuth } from '../../lib/auth';
import { createBranch, assignBranchManager, setBranchStatus } from '../../lib/branches';
import { thisDeviceId } from '../../lib/deviceSessions';
import { BranchProfile } from './BranchProfile';

export function BranchesList() {
  const { business, profile } = useAuth();
  const [viewingProfile, setViewingProfile] = useState<string | null>(null);
  const branches = useLiveQuery(
    () => (business ? db.branches.where('businessId').equals(business.id).toArray() : []),
    [business?.id]
  ) ?? [];
  const profiles = useLiveQuery(
    () => (business ? db.profiles.where('businessId').equals(business.id).toArray() : []),
    [business?.id]
  ) ?? [];
  const canManage = profile?.role === 'owner';
  const [adding, setAdding] = useState(false);
  const [managing, setManaging] = useState<string | null>(null);

  const managerName = (id: string | null | undefined) => profiles.find((p) => p.id === id)?.fullName ?? 'No manager assigned';

  // A shop that's never had more than its one free branch and doesn't have
  // the feature sees the upgrade screen instead of an (empty-ish) list.
  // One that already has multiple branches — say, the feature was later
  // paused — keeps seeing all of them; the actual "no more branches" rule
  // is enforced server-side regardless (see schema_part19.sql), this just
  // decides which screen makes sense to show.
  const canAddMore = business?.branchesEnabled || branches.length === 0;
  if (business && !business.branchesEnabled && branches.length <= 1) {
    return <BranchUpgradeGate businessId={business.id} canRequest={canManage} />;
  }

  return (
    <div className="p-4 md:p-8 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-4">
        <h1 className="font-display text-2xl font-semibold">Branches</h1>
        {canManage && canAddMore && (
          <button onClick={() => setAdding(true)} className="btn-primary flex items-center gap-1.5 text-sm">
            <Plus className="w-4 h-4" /> Add branch
          </button>
        )}
      </div>
      {!business?.branchesEnabled && (
        <p className="text-xs text-amber-600 bg-amber-500/10 rounded-card p-2.5 mb-3">
          Multi-branch access isn't active for this shop right now — your existing branches still work normally, but new ones can't be added until it's reactivated.
        </p>
      )}
      <div className="card divide-y divide-slate-100">
        {branches.length === 0 && <p className="text-sm text-slate-500 py-8 text-center">No branches yet.</p>}
        {branches.map((b) => (
          <div key={b.id} className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-full bg-field-50 text-field-600 flex items-center justify-center shrink-0">
                <MapPin className="w-4.5 h-4.5" />
              </div>
              <button onClick={() => setViewingProfile(b.id)} className="flex-1 min-w-0 text-left">
                <div className="text-sm font-medium">{b.name} {b.status === 'paused' && <span className="text-xs text-amber-600 font-normal">· Paused</span>}</div>
                <div className="text-xs text-slate-500">{b.location ?? 'No location set'}{b.code ? ` · ${b.code}` : ''}</div>
                <div className="text-xs text-slate-500 mt-0.5">Manager: {managerName(b.managerId)}</div>
              </button>
              <button onClick={() => setViewingProfile(b.id)} className="shrink-0 text-slate-400 hover:text-field-600" aria-label="View branch profile">
                <ChevronRight className="w-4 h-4" />
              </button>
              {canManage && (
                <div className="flex gap-1.5 shrink-0">
                  <button onClick={() => setManaging(b.id)} className="btn-secondary text-xs px-2.5 py-1">Manage</button>
                  {b.status === 'active' ? (
                    <button onClick={() => setBranchStatus(b.id, 'paused', profile?.userId)} className="btn-secondary text-xs px-2 py-1"><Pause className="w-3.5 h-3.5" /></button>
                  ) : (
                    <button onClick={() => setBranchStatus(b.id, 'active', profile?.userId)} className="btn-primary text-xs px-2 py-1"><Play className="w-3.5 h-3.5" /></button>
                  )}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
      {!canManage && (
        <p className="text-xs text-slate-400 mt-3">Only owners can add branches or assign managers.</p>
      )}

      {(profile?.role === 'owner' || profile?.role === 'manager') && business && (
        <ConnectedDevicesSection businessId={business.id} branches={branches} profiles={profiles} />
      )}

      {adding && business && <AddBranchModal businessId={business.id} onClose={() => setAdding(false)} />}
      {managing && (
        <ManageBranchModal
          branch={branches.find((b) => b.id === managing)!}
          profiles={profiles}
          onClose={() => setManaging(null)}
        />
      )}
      {viewingProfile && <BranchProfile id={viewingProfile} onClose={() => setViewingProfile(null)} />}
    </div>
  );
}

function AddBranchModal({ businessId, onClose }: { businessId: string; onClose: () => void }) {
  const { userId } = useAuth();
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [location, setLocation] = useState('');
  const [phone, setPhone] = useState('');
  const [saving, setSaving] = useState(false);

  async function submit() {
    if (!name.trim()) return;
    setSaving(true);
    try {
      await createBranch({ businessId, name: name.trim(), code, location, phone }, userId);
      onClose();
    } finally { setSaving(false); }
  }

  return (
    <div className="fixed inset-0 z-[55] flex items-end md:items-center md:justify-center">
      <div className="absolute inset-0 bg-ink/40" onClick={onClose} />
      <div className="relative w-full md:max-w-sm bg-paper-raised rounded-t-2xl md:rounded-2xl p-5 space-y-3.5">
        <div className="flex items-center justify-between">
          <h3 className="font-display font-semibold text-lg">Add branch</h3>
          <button onClick={onClose}><X className="w-5 h-5" /></button>
        </div>
        <label className="block"><span className="block text-sm font-medium text-slate-600 mb-1.5">Name</span><input className="input" value={name} onChange={(e) => setName(e.target.value)} autoFocus /></label>
        <label className="block"><span className="block text-sm font-medium text-slate-600 mb-1.5">Code (optional)</span><input className="input" value={code} onChange={(e) => setCode(e.target.value)} /></label>
        <label className="block"><span className="block text-sm font-medium text-slate-600 mb-1.5">Location</span><input className="input" value={location} onChange={(e) => setLocation(e.target.value)} /></label>
        <label className="block"><span className="block text-sm font-medium text-slate-600 mb-1.5">Phone</span><input className="input" value={phone} onChange={(e) => setPhone(e.target.value)} /></label>
        <button onClick={submit} disabled={saving || !name.trim()} className="btn-primary w-full">{saving ? 'Saving…' : 'Add branch'}</button>
      </div>
    </div>
  );
}

function ManageBranchModal({ branch, profiles, onClose }: { branch: any; profiles: any[]; onClose: () => void }) {
  const { userId } = useAuth();
  const [managerId, setManagerId] = useState(branch.managerId ?? '');
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    try {
      await assignBranchManager(branch.id, managerId || null, userId);
      onClose();
    } finally { setSaving(false); }
  }

  return (
    <div className="fixed inset-0 z-[55] flex items-end md:items-center md:justify-center">
      <div className="absolute inset-0 bg-ink/40" onClick={onClose} />
      <div className="relative w-full md:max-w-sm bg-paper-raised rounded-t-2xl md:rounded-2xl p-5 space-y-3.5">
        <div className="flex items-center justify-between">
          <h3 className="font-display font-semibold text-lg">{branch.name}</h3>
          <button onClick={onClose}><X className="w-5 h-5" /></button>
        </div>
        <label className="block">
          <span className="block text-sm font-medium text-slate-600 mb-1.5">Branch manager</span>
          <select className="input" value={managerId} onChange={(e) => setManagerId(e.target.value)}>
            <option value="">No manager assigned</option>
            {profiles.filter((p) => p.status === 'active').map((p) => (
              <option key={p.id} value={p.id}>{p.fullName} ({p.role})</option>
            ))}
          </select>
        </label>
        <button onClick={save} disabled={saving} className="btn-primary w-full">{saving ? 'Saving…' : 'Save'}</button>
      </div>
    </div>
  );
}

const BENEFITS = [
  'Run multiple physical locations under one shop account',
  'Assign a manager and staff to each branch separately',
  'See stock, sales, and reports broken down per branch — or combined',
  'Switch between branches instantly from the same login',
];

function BranchUpgradeGate({ businessId, canRequest }: { businessId: string; canRequest: boolean }) {
  const existing = useLiveQuery(
    () => db.featureRequests.where({ businessId, feature: 'branches' }).reverse().sortBy('createdAt'),
    [businessId]
  );
  const latest = existing?.[0];
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function submitRequest() {
    setSubmitting(true);
    try {
      const record = { ...newRecordBase(), businessId, feature: 'branches', status: 'pending' as const, reason: reason.trim() || null };
      await db.featureRequests.add(record as any);
      await enqueueSync('featureRequests', record.id, 'create');
    } finally { setSubmitting(false); }
  }

  return (
    <div className="p-4 md:p-8 max-w-lg mx-auto text-center">
      <div className="w-14 h-14 rounded-full bg-field-600/10 text-field-600 flex items-center justify-center mx-auto mb-4">
        <Sparkles className="w-7 h-7" />
      </div>
      <h1 className="font-display text-2xl font-semibold mb-1">Branches</h1>
      <p className="text-sm text-slate-500 mb-5">A premium feature — not included on your shop's current plan.</p>

      <div className="card p-4 text-left space-y-2 mb-4">
        {BENEFITS.map((b) => (
          <div key={b} className="flex items-start gap-2 text-sm">
            <ShieldCheck className="w-4 h-4 text-field-600 shrink-0 mt-0.5" />
            <span>{b}</span>
          </div>
        ))}
      </div>

      <p className="text-xs text-slate-400 mb-4">Current plan: single branch</p>

      {!canRequest && (
        <p className="text-sm text-slate-500">Ask your shop owner to request this upgrade.</p>
      )}

      {canRequest && latest?.status === 'pending' && (
        <div className="card p-4 flex items-center gap-2 text-sm text-slate-600">
          <Clock className="w-4 h-4 text-amber-500 shrink-0" />
          Upgrade requested {new Date(latest.createdAt).toLocaleDateString()} — waiting on approval.
        </div>
      )}

      {canRequest && latest?.status === 'rejected' && (
        <div className="card p-4 text-left text-sm space-y-1 mb-4">
          <p className="text-rust-600 font-medium">Previous request wasn't approved</p>
          {latest.adminReason && <p className="text-slate-500">{latest.adminReason}</p>}
        </div>
      )}

      {canRequest && latest?.status !== 'pending' && (
        <div className="space-y-2">
          <textarea
            className="input min-h-20 text-sm"
            placeholder="Why do you need multiple branches? (optional)"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
          <button onClick={submitRequest} disabled={submitting} className="btn-primary w-full">
            {submitting ? 'Sending…' : latest?.status === 'rejected' ? 'Request again' : 'Request upgrade'}
          </button>
        </div>
      )}
    </div>
  );
}

const DEVICE_ICONS = { mobile: Smartphone, tablet: Tablet, desktop: Monitor } as const;

function deviceStatus(lastActiveAt: string): { label: string; dotClass: string } {
  const minutesAgo = (Date.now() - new Date(lastActiveAt).getTime()) / 60_000;
  if (minutesAgo < 2) return { label: 'Online', dotClass: 'bg-field-600' };
  if (minutesAgo < 15) return { label: 'Recently active', dotClass: 'bg-amber-500' };
  return { label: 'Offline', dotClass: 'bg-slate-300' };
}

/** Its own card, entirely within the page's normal scrolling content —
 * never positioned near the header, theme toggle, or notification bell,
 * so there's no way for it to grow and start covering those regardless of
 * how many devices are connected (the list scrolls internally past a
 * point instead of pushing the page around). */
function ConnectedDevicesSection({ businessId, branches, profiles }: { businessId: string; branches: any[]; profiles: any[] }) {
  const devices = useLiveQuery(
    () => db.deviceSessions.where('businessId').equals(businessId).toArray(),
    [businessId]
  ) ?? [];
  const sorted = [...devices].sort((a, b) => b.lastActiveAt.localeCompare(a.lastActiveAt));
  const myDeviceId = thisDeviceId();

  const branchName = (id: string | null | undefined) => branches.find((b) => b.id === id)?.name ?? '—';
  const userName = (id: string) => profiles.find((p) => p.id === id)?.fullName ?? 'Unknown user';

  async function forget(id: string) {
    await db.deviceSessions.delete(id);
    await enqueueSync('deviceSessions', id, 'delete');
  }

  return (
    <div className="mt-6">
      <h2 className="font-display font-semibold text-sm mb-2 text-slate-400">Connected devices ({sorted.length})</h2>
      {sorted.length === 0 && <p className="text-sm text-slate-500">No devices seen yet.</p>}
      <div className="card divide-y divide-slate-100 max-h-96 overflow-y-auto">
        {sorted.map((d) => {
          const Icon = DEVICE_ICONS[d.deviceType];
          const status = deviceStatus(d.lastActiveAt);
          return (
            <div key={d.id} className="flex items-center gap-3 p-3.5">
              <div className="w-8 h-8 rounded-full bg-slate-100 text-slate-500 flex items-center justify-center shrink-0">
                <Icon className="w-4 h-4" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium truncate flex items-center gap-1.5">
                  {d.deviceName}
                  {d.id === myDeviceId && <span className="text-[11px] text-field-600 font-normal">(this device)</span>}
                </div>
                <div className="text-xs text-slate-500 truncate">{userName(d.profileId)} · {branchName(d.branchId)}</div>
              </div>
              <div className="text-right shrink-0">
                <div className="flex items-center gap-1.5 justify-end text-xs font-medium">
                  <span className={`w-1.5 h-1.5 rounded-full ${status.dotClass}`} /> {status.label}
                </div>
                <div className="text-[11px] text-slate-400">{new Date(d.lastActiveAt).toLocaleString()}</div>
              </div>
              {status.label === 'Offline' && (
                <button onClick={() => forget(d.id)} title="Remove from list" className="p-1 text-slate-300 hover:text-rust-600 shrink-0">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
