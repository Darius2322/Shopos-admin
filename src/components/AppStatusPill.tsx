import { useEffect, useState } from 'react';
import { SupabaseClient } from '@supabase/supabase-js';

type St = { closed: boolean; parts: string[] } | null;
/** Small always-visible badge: is the main app open, partly closed or closed for maintenance? Tap to open the maintenance settings. */
export function AppStatusPill({ supabase, onOpen }: { supabase: SupabaseClient; onOpen: () => void }) {
  const [st, setSt] = useState<St>(null);
  useEffect(() => {
    let alive = true;
    const load = () => { void supabase.rpc('app_status').then(({ data }) => { if (alive && data) setSt({ closed: !!(data as { closed?: boolean }).closed, parts: ((data as { parts?: string[] }).parts ?? []) }); }); };
    load();
    const t = window.setInterval(load, 60_000);
    window.addEventListener('shopos-status', load);
    return () => { alive = false; window.clearInterval(t); window.removeEventListener('shopos-status', load); };
  }, [supabase]);
  if (!st) return null;
  const kind = st.closed ? 'closed' : st.parts.length ? 'partial' : 'open';
  const cls = kind === 'closed' ? 'bg-rust-500/20 text-rust-500' : kind === 'partial' ? 'bg-amber-500/20 text-amber-500' : 'bg-field-600/20 text-field-600';
  const dot = kind === 'closed' ? 'bg-rust-500' : kind === 'partial' ? 'bg-amber-500' : 'bg-field-600';
  return (
    <button onClick={onOpen} aria-label={`Main app status: ${kind}. Open maintenance settings`} className={`shrink-0 inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${cls}`}>
      <span className={`w-2 h-2 rounded-full ${dot}`} />{kind === 'closed' ? 'Closed' : kind === 'partial' ? 'Partly closed' : 'App open'}
    </button>
  );
}
