import { useCallback, useEffect, useRef, useState } from 'react';
import { SupabaseClient } from '@supabase/supabase-js';
import { Bell, ChevronRight } from 'lucide-react';
import type { Tab } from './Sidebar';

interface Item { kind: string; id: string; title: string; detail: string | null; at: string; tab: Tab; business_id: string | null; pending: boolean; status: string | null }
const KEY = 'shopos-admin-inbox-seen';
const readSeen = () => { try { return localStorage.getItem(KEY) ?? ''; } catch { return ''; } };
const ago = (d: string) => { const m = Math.max(0, Math.floor((Date.now() - new Date(d).getTime()) / 60000)); if (m < 1) return 'just now'; if (m < 60) return `${m} min ago`; const h = Math.floor(m / 60); return h < 48 ? `${h} h ago` : `${Math.floor(h / 24)} days ago`; };

/** The bell: a red number for everything waiting for you or new since you last looked. Tap an item to open the right menu. */
export function NotificationsMenu({ supabase, onGo }: { supabase: SupabaseClient; onGo: (tab: Tab, businessId?: string | null, kind?: string) => void }) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<Item[]>([]);
  const [seen, setSeen] = useState(readSeen());
  const [failed, setFailed] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    const { data, error } = await supabase.rpc('admin_inbox', { p_limit: 40, p_before: null });
    if (error) { setFailed(true); return; }
    setFailed(false); setItems((data ?? []) as Item[]); setSeen(readSeen());
  }, [supabase]);

  useEffect(() => {
    void load();
    const t = setInterval(() => void load(), 60_000);
    const refresh = () => void load();
    window.addEventListener('badges:refresh', refresh);
    const vis = () => { if (!document.hidden) void load(); };
    document.addEventListener('visibilitychange', vis);
    return () => { clearInterval(t); window.removeEventListener('badges:refresh', refresh); document.removeEventListener('visibilitychange', vis); };
  }, [load]);

  useEffect(() => {
    function onClickOutside(e: MouseEvent | TouchEvent) { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); }
    document.addEventListener('mousedown', onClickOutside); document.addEventListener('touchstart', onClickOutside);
    return () => { document.removeEventListener('mousedown', onClickOutside); document.removeEventListener('touchstart', onClickOutside); };
  }, []);

  const fresh = (i: Item) => i.pending || (!!seen && i.at > seen) || (!seen && Date.now() - new Date(i.at).getTime() < 3 * 864e5);
  const news = items.filter(fresh);
  const needs = items.filter((i) => i.pending).length;
  const count = news.length;
  const go = (tab: Tab, bid?: string | null, kind?: string) => { setOpen(false); onGo(tab, bid, kind); };
  const markRead = () => { const now = new Date().toISOString(); try { localStorage.setItem(KEY, now); } catch { /* ignore */ } setSeen(now); };

  return (
    <div className="relative shrink-0" ref={ref}>
      <button onClick={() => { setOpen((o) => !o); if (!open) void load(); }} aria-label={count ? `Notifications, ${count} new` : 'Notifications'} aria-expanded={open} className="relative p-2 rounded-card text-slate-400 hover:text-ink hover:bg-slate-800">
        <Bell className="w-5 h-5" />
        {count > 0 && <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-rust-500 text-white text-[10px] leading-[18px] text-center font-semibold">{count > 9 ? '9+' : count}</span>}
      </button>
      {open && (
        <div className="fixed right-2 left-2 top-14 sm:absolute sm:left-auto sm:right-0 sm:top-full sm:mt-2 sm:w-96 max-h-[70vh] overflow-y-auto card p-2 z-[60] shadow-lg">
          <div className="flex items-center justify-between px-2 py-1">
            <p className="text-xs font-medium text-slate-400">{needs ? `${needs} need${needs === 1 ? 's' : ''} you` : count ? `${count} new` : 'Notifications'}</p>
            {count > 0 && <button className="text-[11px] text-slate-400 hover:text-ink" onClick={markRead}>Mark all read</button>}
          </div>
          {failed && <p className="text-xs text-rust-500 px-2 py-2">Could not load. Check your connection.</p>}
          {!failed && news.length === 0 && <p className="text-sm text-slate-400 px-2 py-4 text-center">You are all caught up.</p>}
          {news.slice(0, 8).map((i) => (
            <button key={`${i.kind}-${i.id}`} onClick={() => go(i.tab, i.business_id, i.kind)} className="w-full text-left flex items-center gap-2 px-2 py-2 rounded-card hover:bg-slate-800">
              <span className={`w-2 h-2 rounded-full shrink-0 ${i.pending ? 'bg-rust-500' : 'bg-slate-500'}`} />
              <span className="min-w-0 flex-1"><span className="block text-sm font-medium truncate">{i.title}</span><span className="block text-xs text-slate-400 truncate">{i.detail} · {ago(i.at)}</span></span>
              <ChevronRight className="w-4 h-4 text-slate-500 shrink-0" />
            </button>
          ))}
          <div className="flex justify-between mt-1 px-2">
            <button onClick={() => go('inbox')} className="text-xs text-field-600 py-1.5 hover:underline">All new notifications</button>
            <button onClick={() => go('inboxpast')} className="text-xs text-slate-400 py-1.5 hover:underline">Past notifications</button>
          </div>
        </div>
      )}
    </div>
  );
}
