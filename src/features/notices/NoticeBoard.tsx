import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Plus, X, Pin, Check, Archive, Search, Pencil, Users, Clock } from 'lucide-react';
import { db } from '../../lib/db';
import { useAuth } from '../../lib/auth';
import { createNotice, updateNotice, archiveNotice, togglePin, acknowledgeNotice, isNoticeLive, isNoticeScheduled } from '../../lib/notices';
import type { Notice, NoticeCategory, Role } from '../../lib/types';

const CATEGORIES: { key: NoticeCategory; label: string }[] = [
  { key: 'announcement', label: 'Announcement' },
  { key: 'staff_notice', label: 'Staff notice' },
  { key: 'meeting', label: 'Meeting' },
  { key: 'training', label: 'Training' },
  { key: 'policy', label: 'Policy' },
  { key: 'reminder', label: 'Reminder' },
  { key: 'maintenance', label: 'Maintenance' },
  { key: 'emergency', label: 'Emergency' }
];

const CATEGORY_STYLES: Record<NoticeCategory, string> = {
  announcement: 'bg-field-50 text-field-700',
  staff_notice: 'bg-slate-100 text-slate-600',
  meeting: 'bg-amber-100 text-amber-600',
  training: 'bg-field-50 text-field-700',
  policy: 'bg-slate-100 text-slate-600',
  reminder: 'bg-amber-100 text-amber-600',
  maintenance: 'bg-slate-100 text-slate-600',
  emergency: 'bg-rust-50 text-rust-600'
};

export function NoticeBoard() {
  const { business, profile, userId, branches } = useAuth();
  const canManage = profile?.role === 'owner' || profile?.role === 'manager';
  // `branches` is already scoped to what this user is authorized to see —
  // for a cashier/other non-management role that's their assigned
  // branch(es) via profile_branches, for owner/manager it's every branch.
  const visibleBranchIds = new Set(branches.map((b) => b.id));

  const notices = useLiveQuery(
    () => (business ? db.notices.where('businessId').equals(business.id).toArray() : []),
    [business?.id]
  ) ?? [];
  const acks = useLiveQuery(
    () => (userId ? db.noticeAcknowledgements.where('userId').equals(userId).toArray() : []),
    [userId]
  ) ?? [];
  const ackedIds = new Set(acks.map((a) => a.noticeId));

  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Notice | null>(null);
  const [viewingAcks, setViewingAcks] = useState<Notice | null>(null);
  const [query, setQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<NoticeCategory | 'all'>('all');
  const [showScheduled, setShowScheduled] = useState(false);

  const visible = notices
    .filter((n) => (showScheduled ? isNoticeScheduled(n) : isNoticeLive(n)))
    .filter((n) => {
      // Owners/managers see and moderate every notice regardless of
      // targeting, since they're responsible for the whole board — this
      // was previously the behavior for EVERYONE (a bug: a "Main Branch
      // only" notice was visible to staff at every other branch too,
      // and role-targeted notices weren't filtered at all).
      if (canManage) return true;
      if (n.branchId && !visibleBranchIds.has(n.branchId)) return false;
      if (n.targetRole && n.targetRole !== profile?.role) return false;
      if (n.targetUserId && n.targetUserId !== userId) return false;
      return true;
    })
    .filter((n) => categoryFilter === 'all' || n.category === categoryFilter)
    .filter((n) => {
      if (!query.trim()) return true;
      const q = query.trim().toLowerCase();
      return n.title.toLowerCase().includes(q) || n.body.toLowerCase().includes(q);
    })
    .sort((a, b) => {
      if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
      return b.publishedAt.localeCompare(a.publishedAt);
    });

  return (
    <div className="p-4 md:p-8 max-w-3xl mx-auto">
      <div className="flex items-center justify-between mb-4">
        <h1 className="font-display text-2xl font-semibold">Notice Board</h1>
        {canManage && (
          <button onClick={() => setCreating(true)} className="btn-primary flex items-center gap-1.5 text-sm">
            <Plus className="w-4 h-4" /> New notice
          </button>
        )}
      </div>

      <div className="flex flex-col sm:flex-row gap-2 mb-4">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input className="input pl-9" placeholder="Search notices…" value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
        <select className="input sm:w-44" value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value as any)}>
          <option value="all">All categories</option>
          {CATEGORIES.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
        </select>
        {canManage && (
          <button
            onClick={() => setShowScheduled((s) => !s)}
            className={`text-sm font-medium px-3 py-2 rounded-card whitespace-nowrap flex items-center gap-1.5 ${showScheduled ? 'bg-field-600 text-white' : 'bg-slate-100 text-slate-600'}`}
          >
            <Clock className="w-4 h-4" /> Scheduled
          </button>
        )}
      </div>

      <div className="space-y-3">
        {visible.length === 0 && <p className="text-sm text-slate-500 py-8 text-center">{showScheduled ? 'Nothing scheduled.' : 'No notices right now.'}</p>}
        {visible.map((n) => (
          <NoticeCard
            key={n.id}
            notice={n}
            canManage={canManage}
            acked={ackedIds.has(n.id)}
            userId={userId}
            branchName={branches.find((b) => b.id === n.branchId)?.name}
            onEdit={() => setEditing(n)}
            onViewAcks={() => setViewingAcks(n)}
          />
        ))}
      </div>
      {creating && business && userId && (
        <CreateNoticeModal businessId={business.id} createdBy={userId} branches={branches} onClose={() => setCreating(false)} />
      )}
      {editing && (
        <CreateNoticeModal businessId={editing.businessId} createdBy={editing.createdBy ?? userId ?? ''} branches={branches} existing={editing} onClose={() => setEditing(null)} />
      )}
      {viewingAcks && (
        <AcknowledgementsModal notice={viewingAcks} onClose={() => setViewingAcks(null)} />
      )}
    </div>
  );
}

function NoticeCard({ notice, canManage, acked, userId, branchName, onEdit, onViewAcks }: {
  notice: Notice; canManage: boolean; acked: boolean; userId: string | null; branchName?: string;
  onEdit: () => void; onViewAcks: () => void;
}) {
  return (
    <div className="card p-4">
      <div className="flex items-start justify-between gap-3 mb-2">
        <div className="flex items-center gap-2 flex-wrap">
          {notice.pinned && <Pin className="w-3.5 h-3.5 text-amber-600 shrink-0" />}
          <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${CATEGORY_STYLES[notice.category]}`}>
            {CATEGORIES.find((c) => c.key === notice.category)?.label}
          </span>
          {canManage && (branchName || notice.targetRole) && (
            <span className="text-xs text-slate-400">
              {branchName ?? 'All branches'}{notice.targetRole ? ` · ${notice.targetRole.replace(/_/g, ' ')}` : ''}
            </span>
          )}
          <span className="text-xs text-slate-400">{new Date(notice.publishedAt).toLocaleDateString()}</span>
        </div>
        {canManage && (
          <div className="flex gap-1 shrink-0">
            <button onClick={onViewAcks} className="text-xs text-slate-400 hover:text-ink p-1" aria-label="View acknowledgements"><Users className="w-3.5 h-3.5" /></button>
            <button onClick={onEdit} className="text-xs text-slate-400 hover:text-ink p-1" aria-label="Edit notice"><Pencil className="w-3.5 h-3.5" /></button>
            <button onClick={() => togglePin(notice.id, !notice.pinned)} className="text-xs text-slate-400 hover:text-ink p-1"><Pin className="w-3.5 h-3.5" /></button>
            <button onClick={() => archiveNotice(notice.id)} className="text-xs text-slate-400 hover:text-rust-600 p-1"><Archive className="w-3.5 h-3.5" /></button>
          </div>
        )}
      </div>
      <h3 className="font-medium text-sm mb-1">{notice.title}</h3>
      <p className="text-sm text-slate-600 whitespace-pre-wrap">{notice.body}</p>
      {isNoticeScheduled(notice) && (
        <p className="text-xs text-amber-600 mt-2 flex items-center gap-1"><Clock className="w-3 h-3" /> Scheduled for {new Date(notice.scheduledFor!).toLocaleString()}</p>
      )}
      {notice.expiresAt && (
        <p className="text-xs text-slate-400 mt-1">Expires {new Date(notice.expiresAt).toLocaleString()}</p>
      )}
      {!canManage && userId && (
        <button
          onClick={() => acknowledgeNotice(notice.id, userId)}
          disabled={acked}
          className={`mt-3 flex items-center gap-1.5 text-xs font-medium ${acked ? 'text-field-600' : 'text-slate-500 hover:text-ink'}`}
        >
          <Check className="w-3.5 h-3.5" /> {acked ? 'Acknowledged' : 'Acknowledge'}
        </button>
      )}
    </div>
  );
}

function CreateNoticeModal({ businessId, createdBy, branches, existing, onClose }: { businessId: string; createdBy: string; branches: any[]; existing?: Notice; onClose: () => void }) {
  const [title, setTitle] = useState(existing?.title ?? '');
  const [body, setBody] = useState(existing?.body ?? '');
  const [category, setCategory] = useState<NoticeCategory>(existing?.category ?? 'announcement');
  const [branchId, setBranchId] = useState(existing?.branchId ?? '');
  const [targetRole, setTargetRole] = useState<Role | ''>(existing?.targetRole ?? '');
  const [pinned, setPinned] = useState(existing?.pinned ?? false);
  // datetime-local inputs need "YYYY-MM-DDTHH:mm", not a full ISO string
  const toLocalInput = (iso: string | null | undefined) => (iso ? iso.slice(0, 16) : '');
  const [scheduledFor, setScheduledFor] = useState(toLocalInput(existing?.scheduledFor));
  const [expiresAt, setExpiresAt] = useState(toLocalInput(existing?.expiresAt));
  const [saving, setSaving] = useState(false);

  async function submit() {
    if (!title.trim() || !body.trim()) return;
    setSaving(true);
    try {
      const scheduledIso = scheduledFor ? new Date(scheduledFor).toISOString() : null;
      const expiresIso = expiresAt ? new Date(expiresAt).toISOString() : null;
      if (existing) {
        await updateNotice(existing.id, {
          title: title.trim(), body: body.trim(), category,
          branchId: branchId || null, targetRole: targetRole || null,
          scheduledFor: scheduledIso, expiresAt: expiresIso
        });
      } else {
        await createNotice({
          businessId, createdBy, title: title.trim(), body: body.trim(), category,
          branchId: branchId || null, targetRole: targetRole || null, pinned,
          scheduledFor: scheduledIso, expiresAt: expiresIso
        });
      }
      onClose();
    } finally { setSaving(false); }
  }

  return (
    <div className="fixed inset-0 z-[55] flex items-end md:items-center md:justify-center">
      <div className="absolute inset-0 bg-ink/40" onClick={onClose} />
      <div className="relative w-full md:max-w-md bg-paper-raised rounded-t-2xl md:rounded-2xl p-5 space-y-3 max-h-[85vh] overflow-y-auto">
        <div className="flex items-center justify-between">
          <h3 className="font-display font-semibold text-lg">{existing ? 'Edit notice' : 'New notice'}</h3>
          <button onClick={onClose}><X className="w-5 h-5" /></button>
        </div>
        <label className="block"><span className="block text-sm font-medium text-slate-600 mb-1.5">Title</span><input className="input" value={title} onChange={(e) => setTitle(e.target.value)} autoFocus /></label>
        <label className="block"><span className="block text-sm font-medium text-slate-600 mb-1.5">Message</span><textarea className="input min-h-24" value={body} onChange={(e) => setBody(e.target.value)} /></label>
        <label className="block">
          <span className="block text-sm font-medium text-slate-600 mb-1.5">Category</span>
          <select className="input" value={category} onChange={(e) => setCategory(e.target.value as NoticeCategory)}>
            {CATEGORIES.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
          </select>
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="block text-sm font-medium text-slate-600 mb-1.5">Branch</span>
            <select className="input" value={branchId} onChange={(e) => setBranchId(e.target.value)}>
              <option value="">All branches</option>
              {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </label>
          <label className="block">
            <span className="block text-sm font-medium text-slate-600 mb-1.5">Role</span>
            <select className="input" value={targetRole} onChange={(e) => setTargetRole(e.target.value as Role | '')}>
              <option value="">All roles</option>
              <option value="manager">Managers</option>
              <option value="cashier">Cashiers</option>
              <option value="inventory_manager">Inventory managers</option>
              <option value="accountant">Accountants</option>
              <option value="sales_staff">Sales staff</option>
            </select>
          </label>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="block text-sm font-medium text-slate-600 mb-1.5">Schedule for (optional)</span>
            <input className="input" type="datetime-local" value={scheduledFor} onChange={(e) => setScheduledFor(e.target.value)} />
          </label>
          <label className="block">
            <span className="block text-sm font-medium text-slate-600 mb-1.5">Expires (optional)</span>
            <input className="input" type="datetime-local" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} />
          </label>
        </div>
        {!existing && (
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={pinned} onChange={(e) => setPinned(e.target.checked)} />
            <span className="text-sm">Pin to top</span>
          </label>
        )}
        <button onClick={submit} disabled={saving || !title.trim() || !body.trim()} className="btn-primary w-full">
          {saving ? 'Saving…' : existing ? 'Save changes' : scheduledFor ? 'Schedule notice' : 'Publish notice'}
        </button>
      </div>
    </div>
  );
}

function AcknowledgementsModal({ notice, onClose }: { notice: Notice; onClose: () => void }) {
  const acks = useLiveQuery(() => db.noticeAcknowledgements.where('noticeId').equals(notice.id).toArray(), [notice.id]) ?? [];
  const profiles = useLiveQuery(() => db.profiles.where('businessId').equals(notice.businessId).toArray(), [notice.businessId]) ?? [];
  const eligible = profiles.filter((p) => {
    if (p.role === 'owner') return false;
    if (notice.targetRole && p.role !== notice.targetRole) return false;
    return true;
  });
  const ackedUserIds = new Set(acks.map((a) => a.userId));

  return (
    <div className="fixed inset-0 z-[60] flex items-end md:items-center md:justify-center">
      <div className="absolute inset-0 bg-ink/40" onClick={onClose} />
      <div className="relative w-full md:max-w-sm bg-paper-raised rounded-t-2xl md:rounded-2xl p-5 space-y-3 max-h-[80vh] overflow-y-auto">
        <div className="flex items-center justify-between">
          <h3 className="font-display font-semibold text-lg">"{notice.title}"</h3>
          <button onClick={onClose}><X className="w-5 h-5" /></button>
        </div>
        <p className="text-sm text-slate-500">{acks.length} of {eligible.length} acknowledged</p>
        <div className="space-y-1.5">
          {eligible.map((p) => (
            <div key={p.id} className="flex items-center justify-between text-sm py-1.5 border-b border-slate-100 last:border-0">
              <span>{p.fullName}</span>
              {ackedUserIds.has(p.id) ? (
                <span className="text-xs text-field-600 flex items-center gap-1"><Check className="w-3.5 h-3.5" /> Acknowledged</span>
              ) : (
                <span className="text-xs text-slate-400">Not yet</span>
              )}
            </div>
          ))}
          {eligible.length === 0 && <p className="text-sm text-slate-400 text-center py-4">No employees match this notice's targeting.</p>}
        </div>
      </div>
    </div>
  );
}
