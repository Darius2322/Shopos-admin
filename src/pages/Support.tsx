import { useEffect, useState } from 'react';
import { SupabaseClient } from '@supabase/supabase-js';
import { Card, EmptyState, Skeleton } from '../components/ui';
import { SupportTicket } from '../lib/types';

export default function Support({ supabase }: { supabase: SupabaseClient }) {
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    const { data } = await supabase.from('support_tickets').select('*').order('created_at', { ascending: false });
    setTickets(data ?? []);
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  async function setStatus(id: string, status: string) {
    await supabase.from('support_tickets').update({ status }).eq('id', id);
    await load();
  }

  if (loading) return <Skeleton />;

  return (
    <div className="space-y-3">
      <h2 className="font-display font-semibold text-lg mb-1">Support tickets</h2>
      {tickets.length === 0 && <EmptyState message="No tickets." />}
      {tickets.map((t) => (
        <Card key={t.id}>
          <div className="flex items-center justify-between gap-3">
            <div className="text-sm font-medium">{t.subject}</div>
            <select className="input w-auto text-xs py-1" value={t.status} onChange={(e) => setStatus(t.id, e.target.value)}>
              {['open', 'in_progress', 'waiting_for_user', 'resolved', 'closed'].map((s) => <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>)}
            </select>
          </div>
          <p className="text-xs text-slate-400 mt-1">{t.category} · {new Date(t.created_at).toLocaleString()}</p>
          <p className="text-sm text-slate-300 mt-2">{t.description}</p>
        </Card>
      ))}
    </div>
  );
}
