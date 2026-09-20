import { useEffect, useState } from 'react';
import { SupabaseClient } from '@supabase/supabase-js';
import { Check, X, Trash2, Star } from 'lucide-react';
import { Card, EmptyState, ErrorText, Skeleton, StatusBadge } from '../components/ui';
import { describeError } from '../lib/errors';

interface ReviewRow {
  id: string; author_name: string; business_name: string | null; rating: number; body: string;
  status: 'pending' | 'approved' | 'rejected'; verified: boolean; created_at: string;
}

/** Moderation queue for public reviews. Only approved reviews are ever shown on the
 * public site; the database (RLS) restricts this table to platform admins. */
export default function Reviews({ supabase }: { supabase: SupabaseClient }) {
  const [rows, setRows] = useState<ReviewRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<'pending' | 'approved' | 'rejected' | 'all'>('pending');

  async function load() {
    setLoading(true);
    const { data, error: err } = await supabase.from('reviews').select('*').order('created_at', { ascending: false }).limit(200);
    if (err) setError(describeError(err, 'Could not load reviews'));
    setRows((data ?? []) as ReviewRow[]);
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  async function setStatus(id: string, status: 'approved' | 'rejected') {
    setBusy(id); setError(null);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const { error: err } = await supabase.from('reviews').update({ status, moderated_by: user?.id ?? null, moderated_at: new Date().toISOString() }).eq('id', id);
      if (err) throw err;
      await load();
    } catch (e) { setError(describeError(e, 'Could not update the review')); } finally { setBusy(null); }
  }

  async function remove(id: string) {
    if (!window.confirm('Delete this review permanently?')) return;
    setBusy(id); setError(null);
    try {
      const { error: err } = await supabase.from('reviews').delete().eq('id', id);
      if (err) throw err;
      await load();
    } catch (e) { setError(describeError(e, 'Could not delete the review')); } finally { setBusy(null); }
  }

  const shown = rows.filter((r) => filter === 'all' || r.status === filter);
  const pending = rows.filter((r) => r.status === 'pending').length;

  return (
    <div>
      <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
        <h2 className="font-display font-semibold text-lg">Reviews {pending > 0 && <span className="text-xs text-amber-500 font-normal ml-1">{pending} awaiting approval</span>}</h2>
        <select className="input w-auto text-xs py-1.5" value={filter} onChange={(e) => setFilter(e.target.value as typeof filter)} aria-label="Filter reviews">
          <option value="pending">Pending</option><option value="approved">Approved</option>
          <option value="rejected">Rejected</option><option value="all">All</option>
        </select>
      </div>
      <ErrorText>{error}</ErrorText>
      {loading ? <Skeleton /> : shown.length === 0 ? <EmptyState message="No reviews in this view." /> : (
        <div className="space-y-3">
          {shown.map((r) => (
            <Card key={r.id}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-1" aria-label={`${r.rating} out of 5`}>
                    {[1, 2, 3, 4, 5].map((n) => <Star key={n} className={`w-4 h-4 ${n <= r.rating ? 'fill-amber-500 text-amber-500' : 'text-slate-600'}`} />)}
                  </div>
                  <p className="text-sm mt-2 break-words whitespace-pre-line">{r.body}</p>
                  <p className="text-xs text-slate-400 mt-2">{r.author_name}{r.business_name ? ` · ${r.business_name}` : ''} · {new Date(r.created_at).toLocaleDateString()}</p>
                </div>
                <StatusBadge status={r.status} />
              </div>
              <div className="flex gap-2 mt-3">
                {r.status !== 'approved' && <button disabled={busy === r.id} onClick={() => setStatus(r.id, 'approved')} className="btn-primary text-xs inline-flex items-center gap-1"><Check className="w-3.5 h-3.5" /> Approve</button>}
                {r.status !== 'rejected' && <button disabled={busy === r.id} onClick={() => setStatus(r.id, 'rejected')} className="btn-secondary text-xs inline-flex items-center gap-1"><X className="w-3.5 h-3.5" /> Reject</button>}
                <button disabled={busy === r.id} onClick={() => remove(r.id)} className="btn-secondary text-xs inline-flex items-center gap-1 text-rust-500 ml-auto" aria-label="Delete review"><Trash2 className="w-3.5 h-3.5" /></button>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
