/** Human-readable "last active" text; the exact timestamp stays available via title/tooltip. */
export function formatLastActive(iso: string | null | undefined, now: Date = new Date()): string {
  if (!iso) return 'Never';
  const then = new Date(iso);
  const diffMs = now.getTime() - then.getTime();
  if (Number.isNaN(diffMs)) return 'Unknown';
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins} minute${mins === 1 ? '' : 's'} ago`;
  const hours = Math.floor(mins / 60);
  const sameDay = then.toDateString() === now.toDateString();
  if (sameDay) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  const yesterday = new Date(now); yesterday.setDate(now.getDate() - 1);
  if (then.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return then.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

export function activityLabel(kind: string | null | undefined): string {
  switch (kind) {
    case 'login': return 'Signed in';
    case 'logout': return 'Signed out';
    case 'sale': return 'Made a sale';
    case 'inventory': return 'Inventory action';
    case 'dashboard': return 'Using dashboard';
    case 'backfill': return 'Historical';
    default: return '';
  }
}
