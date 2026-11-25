import { useEffect, useMemo, useState } from 'react';
import { SupabaseClient } from '@supabase/supabase-js';
import { Card, EmptyState, ErrorText, Modal, Skeleton } from '../components/ui';
import { describeError } from '../lib/errors';

interface Ticket { id: string; ticket_no: number; business_id: string | null; subject: string; category: string; description: string; status: string; app_version: string | null; device_info: string | null; created_at: string; updated_at: string; businesses: { name: string; phone: string | null } | null }
interface Reply { id: string; is_admin: boolean; message: string; created_at: string }
interface Ev { id: string; status: string; note: string | null; created_at: string }
export const TICKET_STATUSES: [string, string][] = [['open', 'Received'], ['in_progress', 'Working on it'], ['waiting_for_user', 'Waiting for the owner'], ['testing', 'Testing the fix'], ['resolved', 'Resolved'], ['closed', 'Closed'], ['duplicate', 'Duplicate']];
const label = (s: string) => TICKET_STATUSES.find(([k]) => k === s)?.[1] ?? s;
const TONE: Record<string, string> = { open: 'bg-amber-500/20 text-amber-400', in_progress: 'bg-sky-500/20 text-sky-400', waiting_for_user: 'bg-slate-600/40 text-slate-300', testing: 'bg-violet-500/20 text-violet-400', resolved: 'bg-emerald-500/20 text-emerald-400', closed: 'bg-slate-700/60 text-slate-400', duplicate: 'bg-slate-700/60 text-slate-400' };
const Chip = ({ s }: { s: string }) => <span className={`text-[11px] px-2 py-0.5 rounded-full whitespace-nowrap ${TONE[s] ?? 'bg-slate-700 text-slate-300'}`}>{label(s)}</span>;
const when = (d: string) => new Date(d).toLocaleString('en-KE', { timeZone: 'Africa/Nairobi', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

/** Problems and questions sent by owners. Every ticket has a number and a status the owner can see. */
export default function Support({ supabase }: { supabase: SupabaseClient }) {
  const [tickets, setTickets] = useState<Ticket[] | null>(null); const [err, setErr] = useState<string | null>(null);
  const [f, setF] = useState<'active' | 'all' | string>('active'); const [q, setQ] = useState(''); const [open, setOpen] = useState<Ticket | null>(null);

  async function load() {
    const { data, error } = await supabase.from('support_tickets').select('*, businesses(name, phone)').order('created_at', { ascending: false }).limit(500);
    if (error) { setErr(describeError(error, 'Could not load tickets')); setTickets([]); return; }
    setErr(null); setTickets((data ?? []) as unknown as Ticket[]);
    setOpen((o) => (o ? ((data ?? []) as unknown as Ticket[]).find((t) => t.id === o.id) ?? o : o));
  }
  useEffect(() => { void load(); }, []);

  const shown = useMemo(() => (tickets ?? []).filter((t) => (f === 'all' ? true : f === 'active' ? !['resolved', 'closed', 'duplicate'].includes(t.status) : t.status === f) && (!q.trim() || `${t.ticket_no} ${t.subject} ${t.businesses?.name ?? ''} ${t.category}`.toLowerCase().includes(q.trim().replace(/^#/, '').toLowerCase()))), [tickets, f, q]);
  const count = (st: string) => (tickets ?? []).filter((t) => t.status === st).length;

  if (tickets === null) return <Skeleton />;
  return (
    <div className="space-y-3">
      <div><h2 className="font-display font-semibold text-lg">Support tickets</h2><p className="text-xs text-slate-400">Problems reported by owners. Change the status as you work; the owner is notified and sees it in their app.</p></div>
      <div className="flex flex-wrap gap-2">
        {([['active', 'Open'], ...TICKET_STATUSES.map(([k, l]) => [k, `${l} (${count(k)})`]), ['all', 'All']] as [string, string][]).map(([k, l]) => <button key={k} onClick={() => setF(k)} className={`rounded-full border px-3 py-1 text-xs ${f === k ? 'bg-emerald-600 border-emerald-600 text-white' : 'border-slate-600 text-slate-300'}`}>{l}</button>)}
      </div>
      <input className="w-full rounded-xl border border-slate-600 bg-transparent px-3 py-2 text-sm" placeholder="Search ticket number, shop or subject" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search tickets" />
      {err && <ErrorText>{err}</ErrorText>}
      {shown.length === 0 && <EmptyState message={tickets.length === 0 ? 'No tickets yet. When an owner reports a problem it appears here with a ticket number.' : 'No tickets match.'} />}
      {shown.map((t) => (
        <Card key={t.id}>
          <button className="w-full text-left" onClick={() => setOpen(t)}>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0"><div className="text-sm font-medium truncate"><span className="text-slate-400">#{t.ticket_no}</span> {t.subject}</div><p className="text-xs text-slate-400 mt-0.5">{t.businesses?.name ?? 'Unknown shop'} · {t.category} · {when(t.created_at)}</p></div>
              <Chip s={t.status} />
            </div>
          </button>
        </Card>
      ))}
      {open && <TicketModal supabase={supabase} ticket={open} onClose={() => setOpen(null)} onChanged={load} />}
    </div>
  );
}

function TicketModal({ supabase, ticket, onClose, onChanged }: { supabase: SupabaseClient; ticket: Ticket; onClose: () => void; onChanged: () => Promise<void> }) {
  const [replies, setReplies] = useState<Reply[]>([]); const [events, setEvents] = useState<Ev[]>([]); const [msg, setMsg] = useState(''); const [note, setNote] = useState(''); const [busy, setBusy] = useState(false); const [err, setErr] = useState<string | null>(null);
  const loadThread = async () => {
    const [r, e] = await Promise.all([supabase.from('support_ticket_replies').select('id, is_admin, message, created_at').eq('ticket_id', ticket.id).order('created_at'), supabase.from('support_ticket_events').select('id, status, note, created_at').eq('ticket_id', ticket.id).order('created_at')]);
    setReplies((r.data ?? []) as Reply[]); setEvents((e.data ?? []) as Ev[]);
  };
  useEffect(() => { void loadThread(); }, [ticket.id]);
  const run = async (fn: () => PromiseLike<{ error: { message: string } | null }>) => { setBusy(true); setErr(null); const { error } = await fn(); setBusy(false); if (error) { setErr(describeError(error, 'Could not save')); return false; } await Promise.all([loadThread(), onChanged()]); return true; };
  const setStatus = (st: string) => run(() => supabase.rpc('admin_ticket_set_status', { p_id: ticket.id, p_status: st, p_note: note || null })).then((ok) => { if (ok) setNote(''); });
  const send = () => run(() => supabase.rpc('admin_ticket_reply', { p_id: ticket.id, p_message: msg })).then((ok) => { if (ok) setMsg(''); });
  return (
    <Modal title={`Ticket #${ticket.ticket_no}`} subtitle={`${ticket.businesses?.name ?? 'Unknown shop'} · ${ticket.category} · ${when(ticket.created_at)}`} onClose={onClose} wide>
      <div className="space-y-3">
        <div className="flex items-center gap-2"><Chip s={ticket.status} /><h3 className="text-sm font-semibold">{ticket.subject}</h3></div>
        <TicketText supabase={supabase} description={ticket.description} />
        {(ticket.app_version || ticket.device_info) && <p className="text-[11px] text-slate-500 break-words">App {ticket.app_version ?? '?'} · {ticket.device_info}</p>}
        <div>
          <h4 className="text-xs font-semibold text-slate-300 mb-1">Set status</h4>
          <input className="w-full rounded border border-slate-600 bg-transparent px-2 py-1 text-sm mb-2" placeholder="Optional note the owner will see" value={note} onChange={(e) => setNote(e.target.value)} />
          <div className="flex flex-wrap gap-2">{TICKET_STATUSES.map(([k, l]) => <button key={k} disabled={busy || k === ticket.status} onClick={() => void setStatus(k)} className={`rounded-full border px-3 py-1 text-xs ${k === ticket.status ? 'bg-emerald-600 border-emerald-600 text-white' : 'border-slate-600 text-slate-300'}`}>{l}</button>)}</div>
        </div>
        <div>
          <h4 className="text-xs font-semibold text-slate-300 mb-1">Conversation</h4>
          {replies.length === 0 ? <p className="text-xs text-slate-500">No replies yet.</p> : <div className="space-y-2">{replies.map((r) => <div key={r.id} className={`text-sm rounded-lg p-2 max-w-[90%] ${r.is_admin ? 'bg-emerald-500/10 ml-auto' : 'bg-slate-800'}`}><div className="text-[11px] text-slate-400">{r.is_admin ? 'You' : 'Owner'} · {when(r.created_at)}</div><div className="whitespace-pre-wrap">{r.message}</div></div>)}</div>}
          <div className="mt-2 flex gap-2"><input className="flex-1 rounded border border-slate-600 bg-transparent px-2 py-1.5 text-sm" placeholder="Reply to the owner…" value={msg} onChange={(e) => setMsg(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && msg.trim()) void send(); }} /><button className="btn-secondary text-xs" disabled={busy || !msg.trim()} onClick={() => void send()}>Send</button></div>
        </div>
        {events.length > 0 && <div><h4 className="text-xs font-semibold text-slate-300 mb-1">History</h4><ul className="text-xs text-slate-400 space-y-0.5">{events.map((e) => <li key={e.id}>{when(e.created_at)} · {label(e.status)}{e.note ? ` — ${e.note}` : ''}</li>)}</ul></div>}
        {err && <ErrorText>{err}</ErrorText>}
      </div>
    </Modal>
  );
}

const SHOT = /\n*\[\[shot:([0-9a-f-]{36}\/[0-9a-f-]{36}\.jpg)\]\]/i;
/** The request text, with the screenshot the shop sent (if any) shown under it. */
function TicketText({ supabase, description }: { supabase: SupabaseClient; description: string }) {
  const m = description.match(SHOT);
  const text = description.replace(SHOT, '').trim();
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let off = false;
    if (m) void supabase.storage.from('support-shots').createSignedUrl(m[1], 600).then(({ data }) => { if (!off) setUrl(data?.signedUrl ?? null); });
    return () => { off = true; };
  }, [m?.[1]]);
  return (
    <div className="mt-2 space-y-2">
      <p className="text-sm text-slate-300 whitespace-pre-wrap">{text}</p>
      {m && (url ? <a href={url} target="_blank" rel="noreferrer"><img src={url} alt="Screenshot from the shop" className="max-h-64 rounded-lg border border-slate-700" /></a> : <p className="text-xs text-slate-400">A screenshot was attached.</p>)}
    </div>
  );
}
