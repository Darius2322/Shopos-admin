import { useEffect, useState } from 'react';
import { SupabaseClient } from '@supabase/supabase-js';
import { Card, EmptyState, ErrorText, Skeleton } from '../components/ui';
import { describeError } from '../lib/errors';
import { ago } from '../lib/siteUtil';

interface Row { who: string; detail: string | null; business: string | null; phone: string | null; last_seen: string | null; first_seen: string | null; visits: number; last_path: string | null; last_sign_in: string | null }

/** When owners and bookers were last in the apps. Owners also show their last sign-in. */
export default function LastSeen({ supabase }: { supabase: SupabaseClient }) {
  const [kind, setKind] = useState<'owner' | 'booker'>('owner');
  const [rows, setRows] = useState<Row[] | null>(null); const [err, setErr] = useState<string | null>(null); const [q, setQ] = useState('');
  async function load(k = kind) {
    setRows(null); setErr(null);
    const { data, error } = await supabase.rpc('admin_last_seen', { p_kind: k });
    if (error) { setErr(describeError(error, 'Could not load last seen')); setRows([]); return; }
    setRows((data ?? []) as Row[]);
  }
  useEffect(() => { void load(kind); const t = setInterval(() => void load(kind), 60000); return () => clearInterval(t); }, [kind]);
  const online = (iso: string | null) => !!iso && Date.now() - new Date(iso).getTime() < 5 * 60000;
  const shown = (rows ?? []).filter((r) => !q.trim() || [r.who, r.detail, r.business, r.phone].some((x) => (x ?? '').toLowerCase().includes(q.toLowerCase())));
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {(['owner', 'booker'] as const).map((k) => <button key={k} onClick={() => setKind(k)} className={`rounded-full border px-4 py-1.5 text-sm ${kind === k ? 'bg-emerald-600 border-emerald-600 text-white' : 'border-slate-600 text-slate-300'}`}>{k === 'owner' ? 'Owners' : 'Bookers'}</button>)}
        <input className="ml-auto rounded-xl border border-slate-600 bg-transparent px-3 py-1.5 text-sm w-48" placeholder="Search" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      {err && <ErrorText>{err}</ErrorText>}
      {rows === null ? <Skeleton /> : shown.length === 0 ? <EmptyState message={kind === 'booker' ? 'Nobody yet. Bookers appear here after they open the booker app or a booking page with the new version.' : 'No owners found.'} /> : (
        <Card>
          <div className="divide-y divide-slate-700/60">
            {shown.map((r, i) => (
              <div key={i} className="py-3 flex items-start gap-3">
                <span className={`mt-1.5 w-2.5 h-2.5 rounded-full shrink-0 ${online(r.last_seen) ? 'bg-emerald-500' : 'bg-slate-500'}`} title={online(r.last_seen) ? 'Online now' : 'Offline'} />
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium truncate">{r.who}{r.business ? <span className="text-slate-400 font-normal"> · {r.business}</span> : null}</div>
                  <div className="text-xs text-slate-400 truncate">{[r.detail, r.phone].filter(Boolean).join(' · ') || '—'}</div>
                  <div className="text-xs text-slate-500 mt-0.5">{r.visits ? `${r.visits} visit${r.visits === 1 ? '' : 's'}` : ''}{r.first_seen ? ` · first seen ${new Date(r.first_seen).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}` : ''}{r.last_path ? ` · last on ${r.last_path}` : ''}</div>
                </div>
                <div className="text-right text-xs shrink-0"><div className="font-medium">{online(r.last_seen) ? 'Online now' : ago(r.last_seen)}</div>{r.last_seen && <div className="text-slate-500">{new Date(r.last_seen).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</div>}{kind === 'owner' && r.last_sign_in && <div className="text-slate-500">signed in {ago(r.last_sign_in)}</div>}</div>
              </div>))}
          </div>
        </Card>)}
    </div>
  );
}
