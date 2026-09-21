import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Plus, X, Send } from 'lucide-react';
import { db, newRecordBase, enqueueSync } from '../../lib/db';
import { useAuth } from '../../lib/auth';
import type { SupportTicket } from '../../lib/types';

const CATEGORIES = ['Account', 'POS', 'Inventory', 'Debt', 'Payments', 'Synchronization', 'Branches', 'Users', 'Technical issue', 'Other'];

const STATUS_STYLES: Record<string, string> = {
  open: 'bg-amber-100 text-amber-600',
  in_progress: 'bg-field-50 text-field-700',
  waiting_for_user: 'bg-slate-200 text-slate-600',
  resolved: 'bg-field-50 text-field-700',
  closed: 'bg-slate-200 text-slate-500'
};

export function SupportCenter() {
  const { business, activeBranchId, userId, profile } = useAuth();
  const tickets = useLiveQuery(
    () => (business ? db.supportTickets.where('businessId').equals(business.id).toArray() : []),
    [business?.id]
  ) ?? [];
  const mine = profile?.role === 'owner' ? tickets : tickets.filter((t) => t.userId === userId);
  const [creating, setCreating] = useState(false);
  const [openTicket, setOpenTicket] = useState<SupportTicket | null>(null);

  return (
    <div className="p-4 md:p-8 max-w-3xl mx-auto">
      <div className="flex items-center justify-between mb-4">
        <h1 className="font-display text-2xl font-semibold">Support</h1>
        <button onClick={() => setCreating(true)} className="btn-primary flex items-center gap-1.5 text-sm">
          <Plus className="w-4 h-4" /> Contact support
        </button>
      </div>
      <div className="card divide-y divide-slate-100">
        {mine.length === 0 && <p className="text-sm text-slate-500 py-8 text-center">No support requests yet.</p>}
        {[...mine].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map((t) => (
          <button key={t.id} onClick={() => setOpenTicket(t)} className="w-full text-left p-4 hover:bg-paper">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="text-sm font-medium">{t.subject}</div>
                <div className="text-xs text-slate-500">{t.category} · {new Date(t.createdAt).toLocaleDateString()}</div>
              </div>
              <span className={`text-xs font-medium px-2 py-0.5 rounded-full shrink-0 ${STATUS_STYLES[t.status]}`}>{t.status.replace(/_/g, ' ')}</span>
            </div>
            <p className="text-sm text-slate-600 mt-2 line-clamp-2">{t.description}</p>
          </button>
        ))}
      </div>
      {creating && business && userId && (
        <NewTicketModal businessId={business.id} branchId={activeBranchId} userId={userId} onClose={() => setCreating(false)} />
      )}
      {openTicket && userId && (
        <TicketThreadModal ticket={openTicket} userId={userId} onClose={() => setOpenTicket(null)} />
      )}
    </div>
  );
}

function NewTicketModal({ businessId, branchId, userId, onClose }: { businessId: string; branchId: string | null; userId: string; onClose: () => void }) {
  const [subject, setSubject] = useState('');
  const [category, setCategory] = useState('');
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);

  async function submit() {
    if (!subject.trim() || !category || !description.trim()) return;
    setSaving(true);
    try {
      const record = {
        ...newRecordBase(),
        businessId, branchId, userId,
        subject: subject.trim(), category, description: description.trim(),
        status: 'open' as const,
        appVersion: '0.1.0',
        deviceInfo: navigator.userAgent
      };
      await db.supportTickets.add(record as any);
      await enqueueSync('supportTickets', record.id, 'create');
      onClose();
    } finally { setSaving(false); }
  }

  return (
    <div className="fixed inset-0 z-[55] flex items-end md:items-center md:justify-center">
      <div className="absolute inset-0 bg-ink/40" onClick={onClose} />
      <div className="relative w-full md:max-w-sm bg-paper-raised rounded-t-2xl md:rounded-2xl p-5 space-y-3.5">
        <div className="flex items-center justify-between">
          <h3 className="font-display font-semibold text-lg">Contact support</h3>
          <button onClick={onClose}><X className="w-5 h-5" /></button>
        </div>
        <label className="block"><span className="block text-sm font-medium text-slate-600 mb-1.5">Subject</span><input className="input" value={subject} onChange={(e) => setSubject(e.target.value)} /></label>
        <label className="block">
          <span className="block text-sm font-medium text-slate-600 mb-1.5">Category</span>
          <select className="input" value={category} onChange={(e) => setCategory(e.target.value)}>
            <option value="">Select…</option>
            {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
          </select>
        </label>
        <label className="block"><span className="block text-sm font-medium text-slate-600 mb-1.5">Description</span><textarea className="input min-h-24" value={description} onChange={(e) => setDescription(e.target.value)} /></label>
        <button onClick={submit} disabled={saving || !subject.trim() || !category || !description.trim()} className="btn-primary w-full">
          {saving ? 'Sending…' : 'Send request'}
        </button>
      </div>
    </div>
  );
}

function TicketThreadModal({ ticket, userId, onClose }: { ticket: SupportTicket; userId: string; onClose: () => void }) {
  const replies = useLiveQuery(
    () => db.supportTicketReplies.where('ticketId').equals(ticket.id).sortBy('createdAt'),
    [ticket.id]
  ) ?? [];
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);

  async function send() {
    if (!message.trim()) return;
    setSending(true);
    try {
      const record = {
        id: crypto.randomUUID(), ticketId: ticket.id, authorId: userId, isAdmin: false,
        message: message.trim(), createdAt: new Date().toISOString()
      };
      await db.supportTicketReplies.add(record as any);
      await enqueueSync('supportTicketReplies', record.id, 'create');
      setMessage('');
    } finally { setSending(false); }
  }

  return (
    <div className="fixed inset-0 z-[55] flex items-end md:items-center md:justify-center">
      <div className="absolute inset-0 bg-ink/40" onClick={onClose} />
      <div className="relative w-full md:max-w-md bg-paper-raised rounded-t-2xl md:rounded-2xl flex flex-col max-h-[85vh]">
        <div className="flex items-center justify-between p-5 pb-3 border-b border-slate-100">
          <div>
            <h3 className="font-display font-semibold text-lg">{ticket.subject}</h3>
            <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${STATUS_STYLES[ticket.status]}`}>{ticket.status.replace(/_/g, ' ')}</span>
          </div>
          <button onClick={onClose}><X className="w-5 h-5" /></button>
        </div>
        <div className="flex-1 overflow-y-auto p-5 space-y-3">
          <div className="text-sm bg-paper rounded-card p-3">{ticket.description}</div>
          {replies.map((r) => (
            <div key={r.id} className={`text-sm rounded-card p-3 max-w-[85%] ${r.isAdmin ? 'bg-field-50 text-field-800' : 'bg-paper ml-auto'}`}>
              <div className="text-xs text-slate-500 mb-0.5">{r.isAdmin ? 'ShopOS Support' : 'You'}</div>
              {r.message}
            </div>
          ))}
        </div>
        <div className="p-3 border-t border-slate-100 flex gap-2">
          <input className="input" placeholder="Write a reply…" value={message} onChange={(e) => setMessage(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && send()} />
          <button onClick={send} disabled={sending || !message.trim()} className="btn-primary px-3"><Send className="w-4 h-4" /></button>
        </div>
      </div>
    </div>
  );
}
