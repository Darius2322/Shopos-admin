import { useCallback, useEffect, useState } from 'react';
import { SupabaseClient } from '@supabase/supabase-js';
import { Globe, Smartphone, Monitor, AppWindow, Apple, Loader2, RefreshCw } from 'lucide-react';
import { Card } from './ui';
import { friendlyError } from '../lib/friendlyError';

interface Row { channel: string; label: string; visitors: number; signed_in_visitors: number; sessions: number; pageviews: number; live_now: number }
const ICON: Record<string, typeof Globe> = { web: Globe, pwa: AppWindow, android_app: Smartphone, ios_app: Apple, desktop_app: Monitor };
const NOTE: Record<string, string> = {
  web: 'Opened ShopOS in a normal browser tab.',
  pwa: 'Installed ShopOS from the browser (Add to Home Screen / Install app).',
  android_app: 'The Android app (APK) from the installer library.',
  ios_app: 'The iPhone / iPad app (TestFlight or App Store).',
  desktop_app: 'The Windows, Mac or Linux program from the installers.'
};
const PERIODS = [{ d: 1, l: 'Today' }, { d: 7, l: '7 days' }, { d: 30, l: '30 days' }, { d: 90, l: '90 days' }];
const n = (v: unknown) => Number(v ?? 0);

/** Admin → Apps & updates → Who uses ShopOS: how many different people opened ShopOS through each way (web, installed web app, Android app, iPhone app, desktop installer). */
export function AppUsage({ supabase }: { supabase: SupabaseClient }) {
  const [days, setDays] = useState(30);
  const [rows, setRows] = useState<Row[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const load = useCallback(async () => {
    setErr(null);
    const { data, error } = await supabase.rpc('admin_channel_usage', { p_days: days });
    if (error) { setErr(friendlyError(error)); return; }
    setRows((data ?? []) as Row[]);
  }, [supabase, days]);
  useEffect(() => { void load(); }, [load]);
  const total = (rows ?? []).reduce((s, r) => s + n(r.visitors), 0);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 flex-wrap">
        {PERIODS.map((p) => <button key={p.d} onClick={() => setDays(p.d)} className={`text-xs px-3 py-1.5 rounded-full border ${days === p.d ? 'border-field-500 text-ink bg-field-500/10' : 'border-slate-700 text-slate-400'}`}>{p.l}</button>)}
        <button onClick={() => void load()} className="ml-auto text-xs text-slate-400 inline-flex items-center gap-1"><RefreshCw className="w-3.5 h-3.5" /> Refresh</button>
      </div>
      {err && <p className="text-sm text-rust-500">{err}</p>}
      {!rows && !err && <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-slate-400" /></div>}
      {rows && (
        <>
          <p className="text-sm text-slate-400">{total.toLocaleString()} visitor{total === 1 ? '' : 's'} in this period. A visitor is one browser or device, counted once per way of opening ShopOS. Counting starts from when the tracking was updated, so older visits appear under Web browser or Installed web app.</p>
          <div className="grid sm:grid-cols-2 gap-3">
            {rows.map((r) => {
              const Icon = ICON[r.channel] ?? Globe; const pct = total ? Math.round((n(r.visitors) / total) * 100) : 0;
              return (
                <Card key={r.channel}>
                  <div className="flex items-start gap-3">
                    <span className="w-10 h-10 rounded-xl bg-slate-800 flex items-center justify-center shrink-0"><Icon className="w-5 h-5" /></span>
                    <div className="min-w-0 flex-1">
                      <div className="font-semibold text-sm">{r.label}</div>
                      <div className="text-[11px] text-slate-400">{NOTE[r.channel]}</div>
                    </div>
                    <div className="text-right"><div className="text-2xl font-semibold tnum">{n(r.visitors).toLocaleString()}</div><div className="text-[11px] text-slate-400">{pct}%</div></div>
                  </div>
                  <div className="h-1.5 rounded-full bg-slate-800 mt-3 overflow-hidden"><div className="h-full bg-field-500" style={{ width: `${pct}%` }} /></div>
                  <dl className="grid grid-cols-3 gap-2 mt-3 text-center">
                    <div><dt className="text-[10px] text-slate-400">Signed in</dt><dd className="text-sm font-medium tnum">{n(r.signed_in_visitors)}</dd></div>
                    <div><dt className="text-[10px] text-slate-400">Sessions</dt><dd className="text-sm font-medium tnum">{n(r.sessions)}</dd></div>
                    <div><dt className="text-[10px] text-slate-400">Using now</dt><dd className="text-sm font-medium tnum">{n(r.live_now)}</dd></div>
                  </dl>
                </Card>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
