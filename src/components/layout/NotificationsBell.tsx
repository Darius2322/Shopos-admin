import { useEffect, useState } from 'react';
import { Bell } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../lib/auth';
import { getDerivedNotifications, DerivedNotification } from '../../lib/notifications';

const SEVERITY_DOT: Record<DerivedNotification['severity'], string> = {
  info: 'bg-slate-400', warning: 'bg-amber-500', critical: 'bg-rust-500'
};

export function NotificationsBell() {
  const { business, activeBranchId } = useAuth();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<DerivedNotification[]>([]);

  useEffect(() => {
    if (!business) return;
    let cancelled = false;
    async function load() {
      const result = await getDerivedNotifications(business!.id, activeBranchId ?? null);
      if (!cancelled) setItems(result);
    }
    load();
    const interval = window.setInterval(load, 20000);
    return () => { cancelled = true; window.clearInterval(interval); };
  }, [business?.id, activeBranchId]);

  return (
    <div className="relative">
      <button onClick={() => setOpen((o) => !o)} className="relative w-8 h-8 flex items-center justify-center rounded-full hover:bg-slate-50">
        <Bell className="w-4.5 h-4.5 text-slate-600" />
        {items.length > 0 && (
          <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-rust-500" />
        )}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-10 z-50 w-72 card p-2 max-h-96 overflow-y-auto">
            {items.length === 0 && <p className="text-sm text-slate-500 text-center py-6">Nothing needs attention.</p>}
            {items.map((n) => (
              <Link key={n.id} to={n.href} onClick={() => setOpen(false)} className="flex items-start gap-2.5 p-2.5 rounded-card hover:bg-paper">
                <span className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${SEVERITY_DOT[n.severity]}`} />
                <div className="min-w-0">
                  <div className="text-sm font-medium">{n.title}</div>
                  <div className="text-xs text-slate-500 truncate">{n.body}</div>
                </div>
              </Link>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
