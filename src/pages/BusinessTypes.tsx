import { useCallback, useEffect, useState } from 'react';
import { SupabaseClient } from '@supabase/supabase-js';
import { Loader2, Save } from 'lucide-react';
import { Card, ErrorText, Skeleton } from '../components/ui';
import { friendlyError } from '../lib/friendlyError';

const LABELS: Record<string, string> = { retail: 'Shop / duka', supermarket: 'Supermarket', wholesale: 'Wholesale', bar: 'Bar & liquor store', restaurant: 'Restaurant / café', chemist: 'Pharmacy / chemist', hardware: 'Hardware', electronics: 'Electronics & phones', boutique: 'Clothes & shoes', butchery: 'Butchery', agrovet: 'Agrovet', salon: 'Salon & barber', cosmetics: 'Cosmetics & beauty', stationery: 'Stationery & books', greengrocer: 'Fruits & vegetables', autospares: 'Auto spares & garage', manufacturing: 'Manufacturer', services: 'Services', other: 'Other' };
interface Row { id: string; enabled: boolean; accent: string | null; customer_label: string | null }

/** Business types: switch a type on or off for new registrations, choose its colour and what the app calls customers.
 * Each business keeps the type it chose, so its look is the same on every device. */
export default function BusinessTypes({ supabase }: { supabase: SupabaseClient }) {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [{ data, error }, biz] = await Promise.all([
      supabase.rpc('public_business_type_settings'),
      supabase.from('businesses').select('business_type').is('deleted_at', null),
    ]);
    if (error) { setErr(friendlyError(error, 'Could not load business types.')); return; }
    const list = (data as Row[]).filter((r) => LABELS[r.id]).sort((a, b) => Object.keys(LABELS).indexOf(a.id) - Object.keys(LABELS).indexOf(b.id));
    setRows(list);
    const c: Record<string, number> = {};
    for (const b of (biz.data ?? []) as { business_type: string | null }[]) { const k = b.business_type || 'not_set'; c[k] = (c[k] ?? 0) + 1; }
    setCounts(c);
  }, [supabase]);
  useEffect(() => { void load(); }, [load]);

  const patch = (id: string, p: Partial<Row>) => setRows((cur) => (cur ?? []).map((r) => (r.id === id ? { ...r, ...p } : r)));
  async function save(r: Row) {
    setBusy(r.id); setMsg(null);
    const { error } = await supabase.rpc('admin_save_business_type', { p_id: r.id, p_enabled: r.enabled, p_accent: r.accent, p_customer_label: r.customer_label });
    if (error) setMsg({ ok: false, text: friendlyError(error, 'Could not save.') }); else setMsg({ ok: true, text: `${LABELS[r.id]} saved.` });
    setBusy(null);
  }
  if (err) return <ErrorText>{err}</ErrorText>;
  if (!rows) return <Skeleton />;
  return (
    <div className="space-y-3">
      <div>
        <h2 className="font-display font-semibold text-lg">Business types</h2>
        <p className="text-xs text-slate-400">Choose which types owners can pick, the colour the app uses for each, and what customers are called (leave blank to keep "Customers"). Businesses that already chose a type keep it, even if you switch it off for new sign-ups.</p>
      </div>
      {msg && <p className={`text-sm ${msg.ok ? 'text-emerald-400' : 'text-rust-500'}`} role="status">{msg.text}</p>}
      {rows.map((r) => (
        <Card key={r.id} className={`space-y-2.5 ${r.enabled ? '' : 'opacity-70'}`}>
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0"><p className="font-medium truncate">{LABELS[r.id]}</p><p className="text-xs text-slate-400">{counts[r.id] ?? 0} business{(counts[r.id] ?? 0) === 1 ? '' : 'es'} use it</p></div>
            <label className="flex items-center gap-2 text-sm shrink-0"><input type="checkbox" checked={r.enabled} disabled={r.id === 'other'} onChange={(e) => patch(r.id, { enabled: e.target.checked })} /> Available</label>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-2 text-xs text-slate-400">Colour
              <input type="color" value={r.accent ?? '#146B4A'} onChange={(e) => patch(r.id, { accent: e.target.value.toUpperCase() })} className="w-10 h-8 rounded border border-slate-700 bg-transparent p-0.5" aria-label={`${LABELS[r.id]} colour`} />
              <span className="font-mono">{r.accent ?? '#146B4A'}</span></label>
            <label className="flex items-center gap-2 text-xs text-slate-400 flex-1 min-w-[160px]">Customers called
              <input className="input !py-1.5 flex-1" placeholder="Customers" maxLength={24} value={r.customer_label ?? ''} onChange={(e) => patch(r.id, { customer_label: e.target.value || null })} /></label>
            <button onClick={() => void save(r)} disabled={busy === r.id} className="btn-primary min-h-[38px] px-4 text-sm inline-flex items-center gap-1.5">{busy === r.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Save</button>
          </div>
        </Card>
      ))}
    </div>
  );
}
