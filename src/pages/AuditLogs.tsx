import { useEffect, useState } from 'react';
import { SupabaseClient } from '@supabase/supabase-js';
import { Card, EmptyState, Skeleton } from '../components/ui';
import { AdminAction } from '../lib/types';

interface BusinessAuditRow {
  id: string;
  business_id: string;
  action: string;
  entity_type: string | null;
  created_at: string;
}

type Source = 'admin' | 'business';

export default function AuditLogs({ supabase }: { supabase: SupabaseClient }) {
  const [source, setSource] = useState<Source>('admin');
  const [adminActions, setAdminActions] = useState<AdminAction[]>([]);
  const [businessLog, setBusinessLog] = useState<BusinessAuditRow[]>([]);
  const [businessNames, setBusinessNames] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => { load(); }, [source]);

  async function load() {
    setLoading(true);
    if (source === 'admin') {
      const { data } = await supabase.from('admin_actions').select('*').order('created_at', { ascending: false }).limit(200);
      setAdminActions(data ?? []);
    } else {
      const [logRes, bizRes] = await Promise.all([
        supabase.from('audit_log').select('id,business_id,action,entity_type,created_at').order('created_at', { ascending: false }).limit(200),
        supabase.from('businesses').select('id,name'),
      ]);
      setBusinessLog(logRes.data ?? []);
      const map: Record<string, string> = {};
      for (const b of bizRes.data ?? []) map[b.id] = b.name;
      setBusinessNames(map);
    }
    setLoading(false);
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-display font-semibold text-lg">Audit logs</h2>
        <div className="flex gap-1">
          <button onClick={() => setSource('admin')} className={`text-xs px-2.5 py-1 rounded-card ${source === 'admin' ? 'bg-field-600 text-paper' : 'btn-secondary'}`}>Admin actions</button>
          <button onClick={() => setSource('business')} className={`text-xs px-2.5 py-1 rounded-card ${source === 'business' ? 'bg-field-600 text-paper' : 'btn-secondary'}`}>Business activity</button>
        </div>
      </div>

      {loading && <Skeleton />}

      {!loading && source === 'admin' && (
        adminActions.length === 0 ? <EmptyState message="No admin actions recorded yet." /> : (
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
        businessLog.length === 0 ? <EmptyState message="No business activity recorded yet." /> : (
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
    </div>
  );
}
