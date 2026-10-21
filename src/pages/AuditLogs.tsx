import { useEffect, useMemo, useState } from 'react';
import { SupabaseClient } from '@supabase/supabase-js';
import { Card, EmptyState, Skeleton, StatCard } from '../components/ui';
import { AdminAction } from '../lib/types';

interface BusinessAuditRow {
  id: string;
  business_id: string;
  action: string;
  entity_type: string | null;
  created_at: string;
}

interface SecurityEventRow {
  id: string;
  business_id: string | null;
  event_type: string;
  detail: string | null;
  created_at: string;
}

type Source = 'admin' | 'business' | 'security';
type Range = 'today' | '7d' | '30d' | 'all';
const RANGE_LABEL: Record<Range, string> = { today: 'Today', '7d': 'Last 7 days', '30d': 'Last 30 days', all: 'All time' };

function rangeStart(range: Range): string | null {
  const now = new Date();
  if (range === 'today') return new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
  if (range === '7d') { const d = new Date(now); d.setDate(d.getDate() - 7); return d.toISOString(); }
  if (range === '30d') { const d = new Date(now); d.setDate(d.getDate() - 30); return d.toISOString(); }
  return null;
}

/** System Activity / Logs (spec section: System Activity / Logs, and
 * Admin Login / User Activity Analytics) — three sources sharing one date
 * filter: platform-admin actions, per-business activity, and security
 * events (logins, failed logins, permission changes). Nothing here is
 * fabricated — an empty tab just means nothing of that kind has happened
 * in the selected range. */
export default function AuditLogs({ supabase }: { supabase: SupabaseClient }) {
  const [source, setSource] = useState<Source>('admin');
  const [range, setRange] = useState<Range>('7d');
  const [adminActions, setAdminActions] = useState<AdminAction[]>([]);
  const [businessLog, setBusinessLog] = useState<BusinessAuditRow[]>([]);
  const [securityEvents, setSecurityEvents] = useState<SecurityEventRow[]>([]);
  const [businessNames, setBusinessNames] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => { load(); }, [source, range]);

  async function load() {
    setLoading(true);
    const since = rangeStart(range);
    if (source === 'admin') {
      let q = supabase.from('admin_actions').select('*').order('created_at', { ascending: false }).limit(200);
      if (since) q = q.gte('created_at', since);
      const { data } = await q;
      setAdminActions(data ?? []);
    } else if (source === 'business') {
      let q = supabase.from('audit_log').select('id,business_id,action,entity_type,created_at').order('created_at', { ascending: false }).limit(200);
      if (since) q = q.gte('created_at', since);
      const [logRes, bizRes] = await Promise.all([q, supabase.from('businesses').select('id,name')]);
      setBusinessLog(logRes.data ?? []);
      const map: Record<string, string> = {};
      for (const b of bizRes.data ?? []) map[b.id] = b.name;
      setBusinessNames(map);
    } else {
      let q = supabase.from('security_events').select('id,business_id,event_type,detail,created_at').order('created_at', { ascending: false }).limit(300);
      if (since) q = q.gte('created_at', since);
      const [evRes, bizRes] = await Promise.all([q, supabase.from('businesses').select('id,name')]);
      setSecurityEvents(evRes.data ?? []);
      const map: Record<string, string> = {};
      for (const b of bizRes.data ?? []) map[b.id] = b.name;
      setBusinessNames(map);
    }
    setLoading(false);
  }

  const loginCount = useMemo(() => securityEvents.filter((e) => e.event_type === 'login_success').length, [securityEvents]);
  const failedLoginCount = useMemo(() => securityEvents.filter((e) => e.event_type === 'login_failed').length, [securityEvents]);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h2 className="font-display font-semibold text-lg">System activity</h2>
        <div className="flex gap-1 flex-wrap">
          <button onClick={() => setSource('admin')} className={`text-xs px-2.5 py-1 rounded-card ${source === 'admin' ? 'bg-field-600 text-paper' : 'btn-secondary'}`}>Admin actions</button>
          <button onClick={() => setSource('business')} className={`text-xs px-2.5 py-1 rounded-card ${source === 'business' ? 'bg-field-600 text-paper' : 'btn-secondary'}`}>Business activity</button>
          <button onClick={() => setSource('security')} className={`text-xs px-2.5 py-1 rounded-card ${source === 'security' ? 'bg-field-600 text-paper' : 'btn-secondary'}`}>Logins & security</button>
        </div>
      </div>

      <div className="flex gap-1.5">
        {(Object.keys(RANGE_LABEL) as Range[]).map((r) => (
          <button key={r} onClick={() => setRange(r)} className={`text-xs font-medium px-3 py-1 rounded-full ${range === r ? 'bg-field-600 text-paper' : 'bg-slate-800 text-slate-400'}`}>
            {RANGE_LABEL[r]}
          </button>
        ))}
      </div>

      {loading && <Skeleton />}

      {!loading && source === 'admin' && (
        adminActions.length === 0 ? <EmptyState message="No admin actions in this range." /> : (
          <div className="space-y-2">
            {adminActions.map((a) => (
              <Card key={a.id}>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm font-medium">{a.action.replace(/_/g, ' ')}</span>
                  <span className="text-xs text-slate-500">{new Date(a.created_at).toLocaleString()}</span>
                </div>
                <p className="text-xs text-slate-400 mt-0.5">{a.entity_type}{a.entity_id ? ` · ${a.entity_id.slice(0, 8)}…` : ''}</p>
                {a.reason && <p className="text-xs text-slate-400 mt-1">{a.reason}</p>}
              </Card>
            ))}
          </div>
        )
      )}

      {!loading && source === 'business' && (
        businessLog.length === 0 ? <EmptyState message="No business activity in this range." /> : (
          <div className="space-y-2">
            {businessLog.map((a) => (
              <Card key={a.id}>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm font-medium">{a.action.replace(/_/g, ' ')}</span>
                  <span className="text-xs text-slate-500">{new Date(a.created_at).toLocaleString()}</span>
                </div>
                <p className="text-xs text-slate-400 mt-0.5">{businessNames[a.business_id] ?? 'Unknown business'}{a.entity_type ? ` · ${a.entity_type}` : ''}</p>
              </Card>
            ))}
          </div>
        )
      )}

      {!loading && source === 'security' && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-1">
            <StatCard label="Successful logins" value={loginCount} />
            <StatCard label="Failed logins" value={failedLoginCount} />
            <StatCard label="Total events" value={securityEvents.length} />
          </div>
          {securityEvents.length === 0 ? <EmptyState message="No security events in this range." /> : (
            <div className="space-y-2">
              {securityEvents.map((e) => (
                <Card key={e.id}>
                  <div className="flex items-center justify-between gap-3">
                    <span className={`text-sm font-medium ${e.event_type === 'login_failed' ? 'text-rust-500' : ''}`}>{e.event_type.replace(/_/g, ' ')}</span>
                    <span className="text-xs text-slate-500">{new Date(e.created_at).toLocaleString()}</span>
                  </div>
                  <p className="text-xs text-slate-400 mt-0.5">{e.business_id ? (businessNames[e.business_id] ?? 'Unknown business') : 'Platform-level'}{e.detail ? ` · ${e.detail}` : ''}</p>
                </Card>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
