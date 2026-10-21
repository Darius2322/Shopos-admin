import { useEffect, useRef, useState } from 'react';
import { SupabaseClient } from '@supabase/supabase-js';
import { Bell } from 'lucide-react';

interface PendingRequest {
  id: string;
  full_name: string;
  business_name: string;
  created_at: string;
}

export function NotificationsMenu({ supabase, onGoToRequests }: { supabase: SupabaseClient; onGoToRequests: () => void }) {
  const [open, setOpen] = useState(false);
  const [requests, setRequests] = useState<PendingRequest[]>([]);
  const [count, setCount] = useState(0);
  const ref = useRef<HTMLDivElement>(null);

  async function load() {
    const { data, count: c } = await supabase
      .from('owner_requests')
      .select('id, full_name, business_name, created_at', { count: 'exact' })
      .eq('status', 'pending')
      .order('created_at', { ascending: false })
      .limit(5);
    setRequests(data ?? []);
    setCount(c ?? 0);
  }

  useEffect(() => {
    load();
    const interval = setInterval(load, 60_000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  return (
    <div className="relative shrink-0" ref={ref}>
      <button
        onClick={() => { setOpen((o) => !o); if (!open) load(); }}
        aria-label="Notifications"
        className="relative p-2 rounded-card text-slate-400 hover:text-ink hover:bg-slate-800"
      >
        <Bell className="w-4 h-4" />
        {count > 0 && (
          <span className="absolute top-0.5 right-0.5 w-4 h-4 rounded-full bg-rust-500 text-paper text-[10px] leading-4 text-center font-medium">
            {count > 9 ? '9+' : count}
          </span>
        )}
      </button>
      {open && (
        <div className="absolute right-0 mt-2 w-72 max-w-[85vw] card p-2 z-30 shadow-lg">
          <p className="text-xs font-medium text-slate-400 px-2 py-1">Pending owner requests</p>
          {requests.length === 0 && <p className="text-sm text-slate-400 px-2 py-3 text-center">Nothing pending.</p>}
          {requests.map((r) => (
            <button
              key={r.id}
              onClick={() => { setOpen(false); onGoToRequests(); }}
              className="w-full text-left px-2 py-2 rounded-card hover:bg-slate-800"
            >
              <div className="text-sm font-medium">{r.business_name}</div>
              <div className="text-xs text-slate-400">{r.full_name} · {new Date(r.created_at).toLocaleDateString()}</div>
            </button>
          ))}
          {count > 0 && (
            <button
              onClick={() => { setOpen(false); onGoToRequests(); }}
              className="w-full text-center text-xs text-field-600 py-1.5 mt-1 hover:underline"
            >
              View all owner requests
            </button>
          )}
        </div>
      )}
    </div>
  );
}
