import { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Search } from 'lucide-react';
import { db } from '../../lib/db';
import { useAuth } from '../../lib/auth';
import type { AuditEntry } from '../../lib/types';

// Audit coverage across the app is still partial (see lib/audit.ts) — this
// page shows whatever HAS been instrumented, not a complete record of
// every action yet. It's still the right place to add filters/columns as
// more call sites start writing entries, without needing to touch this
// file again for each one.
function actorLabel(entry: AuditEntry, actorName: string | undefined) {
  if (actorName) return actorName;
  if (!entry.userId) return 'System';
  return entry.userId.slice(0, 8);
}

function formatValue(raw: string): string {
  try { return JSON.stringify(JSON.parse(raw), null, 2); } catch { return raw; }
}

export function AuditLog() {
  const { business } = useAuth();
  const [query, setQuery] = useState('');
  const [actionFilter, setActionFilter] = useState('all');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const entries = useLiveQuery(
    async () => {
      if (!business) return [];
      const rows = await db.auditLog.where('businessId').equals(business.id).toArray();
      return rows.sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 300);
    },
    [business?.id]
  ) ?? [];

  const profiles = useLiveQuery(
    () => (business ? db.profiles.where('businessId').equals(business.id).toArray() : []),
    [business?.id]
  ) ?? [];
  const nameByUserId = useMemo(() => {
    const map = new Map<string, string>();
    for (const p of profiles) map.set(p.userId, p.fullName);
    return map;
  }, [profiles]);

  const actionTypes = useMemo(() => Array.from(new Set(entries.map((e) => e.action))).sort(), [entries]);

  const filtered = entries.filter((e) => {
    if (actionFilter !== 'all' && e.action !== actionFilter) return false;
    if (!query.trim()) return true;
    const actor = actorLabel(e, e.userId ? nameByUserId.get(e.userId) : undefined);
    const haystack = `${e.action} ${e.entityType ?? ''} ${actor}`.toLowerCase();
    return haystack.includes(query.trim().toLowerCase());
  });

  return (
    <div className="p-4 md:p-8 max-w-4xl mx-auto">
      <h1 className="font-display text-2xl font-semibold mb-4">Audit Log</h1>

      <div className="flex flex-col sm:flex-row gap-2 mb-4">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            className="input pl-9"
            placeholder="Search by action, entity, or person"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <select className="input sm:w-56" value={actionFilter} onChange={(e) => setActionFilter(e.target.value)}>
          <option value="all">All actions</option>
          {actionTypes.map((a) => <option key={a} value={a}>{a.replace(/_/g, ' ')}</option>)}
        </select>
      </div>

      <div className="card divide-y divide-slate-100">
        {filtered.length === 0 && (
          <p className="text-sm text-slate-500 py-8 text-center">
            {entries.length === 0 ? 'No audit entries recorded yet.' : 'No entries match your search.'}
          </p>
        )}
        {filtered.map((entry) => {
          const hasDetail = entry.previousValue || entry.newValue || entry.entityId;
          const expanded = expandedId === entry.id;
          return (
            <div key={entry.id}>
              <button
                className="w-full flex items-center justify-between gap-3 p-4 text-left"
                onClick={() => hasDetail && setExpandedId(expanded ? null : entry.id)}
              >
                <div className="min-w-0">
                  <div className="text-sm font-medium truncate">{entry.action.replace(/_/g, ' ')}</div>
                  <div className="text-xs text-slate-500 truncate">
                    {actorLabel(entry, entry.userId ? nameByUserId.get(entry.userId) : undefined)}
                    {entry.entityType ? ` · ${entry.entityType}` : ''}
                  </div>
                </div>
                <div className="text-xs text-slate-400 tnum shrink-0">{new Date(entry.createdAt).toLocaleString()}</div>
              </button>
              {expanded && hasDetail && (
                <div className="px-4 pb-4 -mt-1 space-y-2 text-xs">
                  {entry.entityId && <div className="text-slate-400">Entity ID: <span className="font-mono">{entry.entityId}</span></div>}
                  {entry.previousValue && (
                    <div>
                      <div className="text-slate-400 mb-0.5">Before</div>
                      <pre className="bg-slate-50 rounded-lg p-2 overflow-x-auto whitespace-pre-wrap break-words">{formatValue(entry.previousValue)}</pre>
                    </div>
                  )}
                  {entry.newValue && (
                    <div>
                      <div className="text-slate-400 mb-0.5">After</div>
                      <pre className="bg-slate-50 rounded-lg p-2 overflow-x-auto whitespace-pre-wrap break-words">{formatValue(entry.newValue)}</pre>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
