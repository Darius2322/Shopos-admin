import { useEffect, useState } from 'react';
import { SupabaseClient } from '@supabase/supabase-js';
import { Card, StatCard } from './ui';
import { ArrowRight } from 'lucide-react';
import { friendlyError } from '../lib/friendlyError';

interface Overview { visitors: number; pageviews: number; sessions: number; live_now: number; installs: number; demos: number; desktop_downloads: number; prev_visitors: number }
const n = (v: unknown) => Number(v ?? 0);

/** Small visitor summary for the Dashboard. The full report lives in the Analytics menu. */
export function AnalyticsSummary({ supabase, onGo }: { supabase: SupabaseClient; onGo?: () => void }) {
  const [today, setToday] = useState<Overview | null>(null);
  const [week, setWeek] = useState<Overview | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let off = false;
    const load = async () => {
      const [a, b] = await Promise.all([supabase.rpc('admin_site_overview', { p_days: 1 }), supabase.rpc('admin_site_overview', { p_days: 7 })]);
      if (off) return;
      if (a.error || b.error) { setErr(friendlyError(a.error ?? b.error, "Couldn't load visitor figures.")); return; }
      const pick = (d: unknown) => { const r = (Array.isArray(d) ? d[0] : d) as Record<string, unknown> | null; return r ? ({ visitors: n(r.visitors), pageviews: n(r.pageviews), sessions: n(r.sessions), live_now: n(r.live_now), installs: n(r.installs), demos: n(r.demos), desktop_downloads: n(r.desktop_downloads), prev_visitors: n(r.prev_visitors) } as Overview) : null; };
      setErr(null); setToday(pick(a.data)); setWeek(pick(b.data));
    };
    void load();
    const t = setInterval(load, 60_000);
    return () => { off = true; clearInterval(t); };
  }, [supabase]);

  return (
    <div>
      <div className="flex items-center justify-between mb-3 gap-3">
        <h2 className="font-display font-semibold text-lg">Visitors</h2>
        {onGo && <button onClick={onGo} className="inline-flex items-center gap-1 text-xs font-semibold text-field-500 hover:text-field-400">Full analytics <ArrowRight className="w-3.5 h-3.5" /></button>}
      </div>
      {err && <p role="alert" className="text-sm text-rust-500">{err}</p>}
      {!err && (!today || !week) && <Card><p className="text-xs text-slate-500">Loading…</p></Card>}
      {today && week && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <StatCard label="Online now" value={today.live_now} />
            <StatCard label="Visitors today" value={today.visitors.toLocaleString()} />
            <StatCard label="Visitors (7 days)" value={week.visitors.toLocaleString()} />
            <StatCard label="Page views (7 days)" value={week.pageviews.toLocaleString()} />
          </div>
          <div className="grid grid-cols-3 gap-3 mt-3">
            <StatCard label="Demos started (7d)" value={week.demos.toLocaleString()} />
            <StatCard label="App installs (7d)" value={week.installs.toLocaleString()} />
            <StatCard label="Desktop downloads (7d)" value={week.desktop_downloads.toLocaleString()} />
          </div>
          {week.visitors === 0 && <p className="text-[11px] text-slate-500 mt-2">No visits recorded yet. Counting starts once the latest ShopOS app is live; visitors who block tracking (Do Not Track) are never counted.</p>}
        </>
      )}
    </div>
  );
}
