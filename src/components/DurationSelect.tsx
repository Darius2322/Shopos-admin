const OPTIONS: { label: string; months: number | null }[] = [
  { label: '1 month', months: 1 },
  { label: '2 months', months: 2 },
  { label: '3 months', months: 3 },
  { label: '6 months', months: 6 },
  { label: '1 year', months: 12 },
  { label: 'Lifetime', months: null },
];

export function DurationSelect({ value, onChange }: { value: number | null; onChange: (months: number | null) => void }) {
  return (
    <select
      className="input w-auto text-xs py-1.5"
      value={value === null ? 'lifetime' : String(value)}
      onChange={(e) => onChange(e.target.value === 'lifetime' ? null : Number(e.target.value))}
    >
      {OPTIONS.map((o) => (
        <option key={o.label} value={o.months === null ? 'lifetime' : o.months}>{o.label}</option>
      ))}
    </select>
  );
}

export function formatExpiry(expiresAt: string | null): string {
  if (!expiresAt) return 'Lifetime access';
  const date = new Date(expiresAt);
  const isPast = date < new Date();
  return `${isPast ? 'Expired' : 'Active until'} ${date.toLocaleDateString()}`;
}
