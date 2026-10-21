import { useEffect, useState } from 'react';
import { SupabaseClient } from '@supabase/supabase-js';
import { Card, Skeleton, EmptyState } from './ui';
import { friendlyError } from '../lib/friendlyError';

interface Row { id: string; name: string; is_active: boolean; price: number; currency: string; businesses_now: number; active_now: number; ever_chosen: number; times_assigned: number; requested: number }
interface Stats { packages: Row[]; no_package: number; expiring_7d: number; expired: number }

/** Which packages businesses are on now, how many ever chose each one, and how many asked for it. Read live from the database. */
export function PackageStats({ supabase }: { supabase: SupabaseClient }) {
  const [s, setS] = useState<Stats | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    void supabase.rpc('admin_package_stats').then(({ data, error }) => { if (error) setErr(friendlyError(error, 'Could not load package numbers.')); else setS(data as Stats); });
  }, [supabase]);
  if (err) return <Card><p className="text-sm text-rust-500">{err}</p></Card>;
  if (!s) return <Skeleton rows={2} />;
  const max = Math.max(1, ...s.packages.map((p) => p.businesses_now));
  return (
    <Card className="space-y-3">
      <div><h3 className="font-medium">Package popularity</h3><p className="text-xs text-slate-400">Businesses on each package right now, how many ever chose it, and how many asked for it.</p></div>
      <div className="grid grid-cols-3 gap-2 text-center">
        {([['No package', s.no_package], ['Ending in 7 days', s.expiring_7d], ['Expired', s.expired]] as [string, number][]).map(([l, v]) => (
          <div key={l} className="rounded-xl bg-slate-800/70 p-2.5"><div className="text-lg font-semibold tnum">{v}</div><div className="text-[11px] text-slate-400">{l}</div></div>
        ))}
      </div>
      {s.packages.length === 0 ? <EmptyState message="No packages yet." /> : (
        <ul className="space-y-2.5">
          {s.packages.map((p) => (
            <li key={p.id}>
              <div className="flex items-baseline justify-between gap-2 text-sm"><span className="font-medium truncate">{p.name}{!p.is_active && <span className="text-xs text-slate-500"> (archived)</span>}</span><span className="tnum shrink-0">{p.businesses_now} now</span></div>
              <div className="h-2 rounded-full bg-slate-800 overflow-hidden mt-1"><div className="h-full rounded-full bg-gradient-to-r from-teal-600 to-teal-400" style={{ width: `${(p.businesses_now / max) * 100}%`, minWidth: p.businesses_now ? 6 : 0 }} /></div>
              <p className="text-[11px] text-slate-500 mt-1">{p.active_now} with time left · {p.ever_chosen} ever chose it · {p.times_assigned} times applied · {p.requested} requests</p>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
