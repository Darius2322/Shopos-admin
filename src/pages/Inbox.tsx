import { useCallback, useEffect, useState } from 'react';
import { SupabaseClient } from '@supabase/supabase-js';
import { UserPlus, LifeBuoy, Lightbulb, Star, Building2, Trash2, ChevronRight, CheckCheck } from 'lucide-react';
import { Card, EmptyState, ErrorText, Skeleton } from '../components/ui';
import { describeError } from '../lib/errors';
import type { Tab } from '../components/Sidebar';

interface Item { kind: string; id: string; title: string; detail: string | null; at: string; tab: Tab; business_id: string | null; pending: boolean; status: string | null }
const ICON: Record<string, typeof Star> = { request: UserPlus, support: LifeBuoy, feature: Lightbulb, review: Star, signup: Building2, deletion: Trash2 };
const KEY = 'shopos-admin-inbox-seen';
const readSeen = () => { try { return localStorage.getItem(KEY) ?? ''; } catch { return ''; } };
const when = (d: string) => new Date(d).toLocaleString('en-KE', { timeZone: 'Africa/Nairobi', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
const ago = (d: string) => { const m = Math.max(0, Math.floor((Date.now() - new Date(d).getTime()) / 60000)); if (m < 1) return 'just now'; if (m < 60) return `${m} min ago`; const h = Math.floor(m / 60); return h < 48 ? `${h} h ago` : `${Math.floor(h / 24)} days ago`; };

/** Everything that needs the admin's attention, newest first. Tap one to go straight to it. "New" = waiting for action or arrived since you last marked all read; "Past" = everything older. */
export default function Inbox({ supabase, view, onGo }: { supabase: SupabaseClient; view: 'new' | 'past'; onGo: (tab: Tab, businessId?: string | null, kind?: string) => void }) {
  const [items, setItems] = useState<Item[] | null>(null); const [err, setErr] = useState<string | null>(null); const [seen, setSeen] = useState(readSeen()); const [more, setMore] = useState(true); const [busy, setBusy] = useState(false);

  const load = useCallback(async (before?: string) => {
    setBusy(true);
    const { data, error } = await supabase.rpc('admin_inbox', { p_limit: 100, p_before: before ?? null });
    setBusy(false);
    if (error) { setErr(describeError(error, 'Could not load notifications')); setItems((x) => x ?? []); return; }
    const rows = (data ?? []) as Item[]; setErr(null); setMore(rows.length >= 100);
    setItems((x) => (before ? [...(x ?? []), ...rows] : rows));
  }, [supabase]);
  useEffect(() => { void load(); }, [load]);

  const isNew = (i: Item) => i.pending || (!!seen && i.at > seen) || (!seen && Date.now() - new Date(i.at).getTime() < 3 * 864e5);
  const shown = (items ?? []).filter((i) => (view === 'new' ? isNew(i) : !isNew(i)));
  const markRead = () => { const now = new Date().toISOString(); try { localStorage.setItem(KEY, now); } catch { /* ignore */ } setSeen(now); window.dispatchEvent(new Event('badges:refresh')); };

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">{view === 'new' ? 'New notifications' : 'Past notifications'}</h1>
          <p className="text-xs text-slate-400">{view === 'new' ? 'Requests, tickets, reviews and sign-ups that need you or arrived since you last marked all as read. Tap one to open it.' : 'Everything you have already dealt with or marked as read.'}</p>
        </div>
        {view === 'new' && <button className="btn-secondary text-xs shrink-0 inline-flex items-center gap-1" onClick={markRead}><CheckCheck className="w-3.5 h-3.5" /> Mark all read</button>}
      </div>
      {err && <ErrorText>{err}</ErrorText>}
      {items === null ? <Skeleton /> : shown.length === 0 ? <EmptyState message={view === 'new' ? 'You are all caught up.' : 'Nothing here yet.'} /> : (
        <Card className="p-0">
          <ul className="divide-y divide-slate-700/60">
            {shown.map((i) => {
              const Icon = ICON[i.kind] ?? Building2;
              return (
                <li key={`${i.kind}-${i.id}`}>
                  <button className="w-full text-left flex items-center gap-3 px-3 py-3 hover:bg-slate-800/60" onClick={() => onGo(i.tab, i.business_id, i.kind)}>
                    <span className={`shrink-0 grid place-items-center w-9 h-9 rounded-full ${i.pending ? 'bg-rust-500/20 text-rust-500' : 'bg-slate-700/60 text-slate-300'}`}><Icon className="w-4 h-4" /></span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-medium truncate">{i.title}</span>
                      <span className="block text-xs text-slate-400 truncate">{i.detail}</span>
                      <span className="block text-[11px] text-slate-500">{when(i.at)} · {ago(i.at)}{i.status ? ` · ${i.status}` : ''}</span>
                    </span>
                    {i.pending && <span className="shrink-0 text-[10px] rounded-full bg-rust-500 text-white px-2 py-0.5">Needs action</span>}
                    <ChevronRight className="w-4 h-4 text-slate-500 shrink-0" />
                  </button>
                </li>
              );
            })}
          </ul>
        </Card>
      )}
      {items !== null && more && <button className="btn-secondary text-xs" disabled={busy} onClick={() => items.length && void load(items[items.length - 1].at)}>{busy ? 'Loading…' : 'Load older'}</button>}
    </div>
  );
}
