import { useEffect, useState } from 'react';
import { SupabaseClient } from '@supabase/supabase-js';

export interface PkgLite { id: string; name: string; price: number; currency: string; validity_months: number | null; validity_days: number | null }
export interface PickerValue { months: number | null; packageId: string | null; days?: number | null; expiresAt?: string | null }

/** The whole-month number the activation flows need. A day or exact-date choice runs them for 1 month and is then set precisely by applyPick. */
export const pickMonths = (v: PickerValue) => (v.days || v.expiresAt ? 1 : v.months);

/** After the activation flow has run: apply the chosen package (exact days included), or the exact days / date picked. Returns an error message or null. */
export async function applyPick(supabase: SupabaseClient, businessId: string, v: PickerValue): Promise<string | null> {
  if (v.packageId) {
    const { error } = await supabase.rpc('admin_assign_package2', { p_business_id: businessId, p_package_id: v.packageId, p_source: 'activation' });
    return error ? 'The business was activated, but the package could not be applied. Open Packages → Business plans to set it.' : null;
  }
  const at = v.expiresAt ?? (v.days ? new Date(Date.now() + v.days * 86400000).toISOString() : null);
  if (!at) return null;
  const { error } = await supabase.rpc('admin_set_business_expiry', { p_business_id: businessId, p_expires_at: at, p_note: v.days ? `${v.days} day access` : 'Chosen expiry date' });
  return error ? 'The business was activated, but the exact expiry could not be set. Open Packages → Business plans to set it.' : null;
}

const localInput = (iso?: string | null) => { const t = iso ? new Date(iso) : new Date(Date.now() + 86400000); t.setMinutes(t.getMinutes() - t.getTimezoneOffset()); return t.toISOString().slice(0, 16); };

/** No package: pick days (as low as 1), months, lifetime, or an exact expiry date. */
function CustomDuration({ value, onChange }: { value: PickerValue; onChange: (v: PickerValue) => void }) {
  const mode = value.expiresAt ? 'date' : value.days ? 'days' : value.months === null ? 'life' : 'months';
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      <select className="input w-auto text-xs py-1.5" aria-label="Duration type" value={mode}
        onChange={(e) => { const m = e.target.value; onChange({ packageId: null, months: m === 'months' ? 1 : m === 'life' ? null : 1, days: m === 'days' ? 1 : null, expiresAt: m === 'date' ? new Date(localInput()).toISOString() : null }); }}>
        <option value="days">Days</option><option value="months">Months</option><option value="date">Exact date</option><option value="life">Lifetime</option>
      </select>
      {mode === 'days' && <input className="input !w-20 text-xs py-1.5" type="number" min={1} max={3650} aria-label="Days" value={value.days ?? 1} onChange={(e) => onChange({ ...value, days: Math.max(1, Math.min(3650, Number(e.target.value) || 1)) })} />}
      {mode === 'months' && <input className="input !w-20 text-xs py-1.5" type="number" min={1} max={120} aria-label="Months" value={value.months ?? 1} onChange={(e) => onChange({ ...value, months: Math.max(1, Math.min(120, Number(e.target.value) || 1)) })} />}
      {mode === 'date' && <input className="input !w-auto text-xs py-1.5" type="datetime-local" aria-label="Expiry date and time" value={localInput(value.expiresAt)} min={localInput(new Date(Date.now() + 60000).toISOString())} onChange={(e) => onChange({ ...value, expiresAt: e.target.value ? new Date(e.target.value).toISOString() : null })} />}
    </span>
  );
}

/** Choose a package (its validity sets the access end date) or a custom duration. Feeds the same access-duration
 * mechanism the approval and create flows already use, so nothing about activation changes. */
export function PackagePicker({ supabase, value, onChange }: { supabase: SupabaseClient; value: PickerValue; onChange: (v: PickerValue) => void }) {
  const [pkgs, setPkgs] = useState<PkgLite[]>([]);
  useEffect(() => {
    supabase.from('packages').select('id, name, price, currency, validity_months, validity_days').eq('is_active', true).order('sort').order('price').then(({ data }) => setPkgs((data ?? []) as PkgLite[]));
  }, [supabase]);
  if (pkgs.length === 0) return <CustomDuration value={value} onChange={onChange} />;
  const chosen = pkgs.find((p) => p.id === value.packageId) ?? null;
  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <select
        className="input w-auto text-xs py-1.5"
        aria-label="Package"
        value={value.packageId ?? 'custom'}
        onChange={(e) => {
          const p = pkgs.find((x) => x.id === e.target.value);
          onChange(p ? { packageId: p.id, months: p.validity_days ? Math.max(1, Math.ceil(p.validity_days / 30)) : p.validity_months } : { packageId: null, months: value.months ?? 1, days: 1, expiresAt: null });
        }}
      >
        {pkgs.map((p) => <option key={p.id} value={p.id}>{p.name} · {p.currency} {Number(p.price).toLocaleString()} · {p.validity_days ? `${p.validity_days} day${p.validity_days === 1 ? '' : 's'}` : p.validity_months ? `${p.validity_months} mo` : 'lifetime'}</option>)}
        <option value="custom">Custom duration (no package)</option>
      </select>
      {!chosen && <CustomDuration value={value} onChange={onChange} />}
    </span>
  );
}
