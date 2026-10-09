import { useEffect, useState } from 'react';
import { SupabaseClient } from '@supabase/supabase-js';
import { DurationSelect } from './DurationSelect';

export interface PkgLite { id: string; name: string; price: number; currency: string; validity_months: number | null }
export interface PickerValue { months: number | null; packageId: string | null }

/** Choose a package (its validity sets the access end date) or a custom duration. Feeds the same access-duration
 * mechanism the approval and create flows already use, so nothing about activation changes. */
export function PackagePicker({ supabase, value, onChange }: { supabase: SupabaseClient; value: PickerValue; onChange: (v: PickerValue) => void }) {
  const [pkgs, setPkgs] = useState<PkgLite[]>([]);
  useEffect(() => {
    supabase.from('packages').select('id, name, price, currency, validity_months').eq('is_active', true).order('sort').order('price').then(({ data }) => setPkgs((data ?? []) as PkgLite[]));
  }, [supabase]);
  if (pkgs.length === 0) return <DurationSelect value={value.months} onChange={(m) => onChange({ months: m, packageId: null })} />;
  const chosen = pkgs.find((p) => p.id === value.packageId) ?? null;
  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <select
        className="input w-auto text-xs py-1.5"
        aria-label="Package"
        value={value.packageId ?? 'custom'}
        onChange={(e) => {
          const p = pkgs.find((x) => x.id === e.target.value);
          onChange(p ? { packageId: p.id, months: p.validity_months } : { packageId: null, months: value.months });
        }}
      >
        {pkgs.map((p) => <option key={p.id} value={p.id}>{p.name} · {p.currency} {Number(p.price).toLocaleString()} · {p.validity_months ? `${p.validity_months} mo` : 'lifetime'}</option>)}
        <option value="custom">Custom duration (no package)</option>
      </select>
      {!chosen && <DurationSelect value={value.months} onChange={(m) => onChange({ months: m, packageId: null })} />}
    </span>
  );
}
