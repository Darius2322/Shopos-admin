import { useEffect, useState } from 'react';
import { CalendarCheck, ChevronDown, Bell, BellOff, Headphones, Briefcase, Cpu, LayoutDashboard, Users, Building2, Store, ScrollText, LifeBuoy, LogOut, Settings, X, Sparkles, ShieldCheck, Star, RefreshCw, BarChart3, Terminal, Database, Wallet, Bot, Trash2, Package, Palette } from 'lucide-react';

import { BadgeDot, badgeFor, groupCount, setSoundOn, soundOn, chime, type Badges } from '../lib/badges';

export type Tab = 'dashboard' | 'requests' | 'businesses' | 'create' | 'branches' | 'features' | 'audit' | 'support' | 'settings' | 'permissions' | 'reviews' | 'releases' | 'bk_overview' | 'bk_customers' | 'bk_reports' | 'bk_apps' | 'bk_analytics' | 'bk_owners' | 'bk_catalog' | 'bk_today' | 'bk_revenue' | 'bk_quotes' | 'bk_activity' | 'bk_biz' | 'bk_bookings' | 'apps' | 'analytics' | 'installers' | 'monitor' | 'database' | 'softdelete' | 'packages' | 'businesstypes' | 'mpesa' | 'assistant';

export const TABS: [Tab, string, any][] = [
  ['dashboard', 'Dashboard', LayoutDashboard],
  ['requests', 'Owner Requests', Users],
  ['analytics', 'Analytics', BarChart3],
  ['businesses', 'Businesses', Building2],
  ['mpesa', 'M-Pesa', Wallet],
  ['packages', 'Packages', Package],
  ['businesstypes', 'Business Types', Palette],
  ['bk_overview', 'Overview', LayoutDashboard],
  ['bk_analytics', 'Analytics', BarChart3],
  ['bk_owners', 'Owners & logins', ShieldCheck],
  ['bk_catalog', 'Services & chairs', Package],
  ['bk_today', 'Today & tomorrow', CalendarCheck],
  ['bk_revenue', 'Revenue', Wallet],
  ['bk_quotes', 'Quotes', ScrollText],
  ['bk_activity', 'Activity', Sparkles],
  ['bk_apps', 'Applications', Users],
  ['bk_biz', 'Booking businesses', Store],
  ['bk_bookings', 'All bookings', CalendarCheck],
  ['bk_customers', 'Customers', Users],
  ['bk_reports', 'Reports', BarChart3],
  ['softdelete', 'Soft Delete', Trash2],
  ['branches', 'Branches', Store],
  ['features', 'Feature Requests', Sparkles],
  ['reviews', 'Reviews', Star],
  ['permissions', 'Role Defaults', ShieldCheck],
  ['apps', 'Apps & Updates', RefreshCw],
  ['database', 'Database', Database],
  ['assistant', 'Assistant', Bot],
  ['monitor', 'Monitor', Terminal],
  ['audit', 'Audit Logs', ScrollText],
  ['support', 'Support', LifeBuoy],
  ['settings', 'Platform Settings', Settings],
];

interface SidebarProps {
  tab: Tab;
  onSelect: (tab: Tab) => void;
  onSignOut: () => void;
  mobileOpen: boolean;
  onCloseMobile: () => void;
  badges: Badges;
}

/** The menu, in sub-categories. Each group has an icon and a number for what is new inside it. */
const GROUPS: { id: string; label: string; icon: any; tabs: Tab[] }[] = [
  { id: 'overview', label: 'Overview', icon: LayoutDashboard, tabs: ['dashboard', 'analytics'] },
  { id: 'customers', label: 'Businesses & people', icon: Briefcase, tabs: ['requests', 'businesses', 'branches', 'softdelete', 'businesstypes'] },
  { id: 'money', label: 'Money & plans', icon: Wallet, tabs: ['mpesa', 'packages'] },
  { id: 'help', label: 'Feedback & support', icon: Headphones, tabs: ['support', 'features', 'reviews'] },
  { id: 'system', label: 'Platform & system', icon: Cpu, tabs: ['permissions', 'apps', 'database', 'assistant', 'monitor', 'audit', 'settings'] },
];
const BOOKING_GROUPS: { id: string; label: string; icon: any; tabs: Tab[] }[] = [
  { id: 'bk_overview_g', label: 'Overview', icon: LayoutDashboard, tabs: ['bk_overview', 'bk_analytics', 'bk_activity'] },
  { id: 'bk_people_g', label: 'Businesses & people', icon: Briefcase, tabs: ['bk_apps', 'bk_biz', 'bk_owners', 'bk_customers', 'bk_catalog'] },
  { id: 'bk_book_g', label: 'Bookings', icon: CalendarCheck, tabs: ['bk_bookings', 'bk_today'] },
  { id: 'bk_money_g', label: 'Money & reports', icon: Wallet, tabs: ['bk_revenue', 'bk_quotes', 'bk_reports'] },
];
const isBooking = (t: Tab) => BOOKING_GROUPS.some((g) => g.tabs.includes(t));
const label = (t: Tab) => TABS.find(([k]) => k === t)![1];
const iconOf = (t: Tab) => TABS.find(([k]) => k === t)![2];

function NavList({ tab, onSelect, badges }: { tab: Tab; onSelect: (tab: Tab) => void; badges: Badges }) {
  const [open, setOpen] = useState<Record<string, boolean>>(() => {
    try { return JSON.parse(localStorage.getItem('shopos-admin-groups') ?? '{}'); } catch { return {}; }
  });
  const [sound, setSound] = useState(soundOn());
  const [product, setProduct] = useState<'shopos' | 'booking'>(isBooking(tab) ? 'booking' : 'shopos');
  useEffect(() => { setProduct(isBooking(tab) ? 'booking' : 'shopos'); }, [tab]);
  const groups = product === 'booking' ? BOOKING_GROUPS : GROUPS;
  const activeGroup = groups.find((g) => g.tabs.includes(tab))?.id;
  useEffect(() => { try { localStorage.setItem('shopos-admin-groups', JSON.stringify(open)); } catch { /* ignore */ } }, [open]);
  // A group is open if you opened it, or if the page you are on lives inside it.
  const isOpen = (id: string) => open[id] ?? (id === activeGroup);
  return (
    <nav className="flex-1 overflow-y-auto px-3 py-3 space-y-1">
      <div className="grid grid-cols-2 gap-1 p-1 mb-2 rounded-card bg-slate-800/60" role="tablist" aria-label="Product">
        {([['shopos', 'ShopOS'], ['booking', 'Booking']] as const).map(([id, text]) => (
          <button key={id} role="tab" aria-selected={product === id} onClick={() => { setProduct(id); if (id === 'booking' && !isBooking(tab)) onSelect('bk_overview'); if (id === 'shopos' && isBooking(tab)) onSelect('dashboard'); }}
            className={`py-1.5 rounded-card text-xs font-semibold ${product === id ? 'bg-field-600 text-paper' : 'text-slate-400 hover:text-ink'}`}>{text}</button>
        ))}
      </div>
      {groups.map((g) => {
        const GIcon = g.icon;
        const n = groupCount(badges, g.tabs);
        const expanded = isOpen(g.id);
        return (
          <div key={g.id}>
            <button
              onClick={() => setOpen({ ...open, [g.id]: !expanded })}
              aria-expanded={expanded}
              className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-card text-xs font-semibold uppercase tracking-wide text-left ${g.id === activeGroup ? 'text-ink' : 'text-slate-400'} hover:bg-slate-800`}
            >
              <GIcon className="w-4 h-4 shrink-0" /> <span className="flex-1 truncate">{g.label}</span>
              {!expanded && <BadgeDot n={n} />}
              <ChevronDown className={`w-3.5 h-3.5 shrink-0 transition-transform ${expanded ? '' : '-rotate-90'}`} />
            </button>
            {expanded && (
              <div className="ml-3 pl-2 border-l border-slate-700 space-y-0.5 mt-0.5">
                {g.tabs.map((key) => {
                  const Icon = iconOf(key);
                  return (
                    <button
                      key={key}
                      onClick={() => onSelect(key)}
                      className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-card text-sm font-medium text-left ${
                        tab === key ? 'bg-field-600 text-paper' : 'text-slate-400 hover:bg-slate-800 hover:text-ink'
                      }`}
                    >
                      <Icon className="w-4 h-4 shrink-0" /> <span className="flex-1 truncate">{label(key)}</span><BadgeDot n={badgeFor(badges, key)} />
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
      <button
        onClick={() => { const next = !sound; setSound(next); setSoundOn(next); if (next) chime(); }}
        className="w-full flex items-center gap-2.5 px-3 py-2 mt-2 rounded-card text-xs text-slate-400 hover:bg-slate-800 text-left"
      >
        {sound ? <Bell className="w-4 h-4" /> : <BellOff className="w-4 h-4" />} Alert sound: {sound ? 'on' : 'off'}
      </button>
    </nav>
  );
}

function Brand() {
  return (
    <div className="flex items-center gap-2 px-4 py-4 shrink-0">
      <img src="/logo-emblem.png" alt="ShopOS" width={28} height={28} className="w-7 h-7 rounded-lg object-contain" />
      <span className="font-display font-semibold">ShopOS Admin</span>
    </div>
  );
}

export default function Sidebar({ tab, onSelect, onSignOut, mobileOpen, onCloseMobile, badges }: SidebarProps) {
  function select(t: Tab) {
    onSelect(t);
    onCloseMobile();
  }

  return (
    <>
      {/* Desktop: permanent column with its own scroll, independent of the
          main content's scroll container. */}
      <aside className="hidden lg:flex lg:flex-col w-60 shrink-0 h-dvh border-r border-slate-700 bg-paper">
        <Brand />
        <NavList tab={tab} onSelect={select} badges={badges} />
        <div className="p-3 border-t border-slate-700 shrink-0">
          <button onClick={onSignOut} className="w-full flex items-center gap-2 px-3 py-2 text-sm text-slate-400 hover:text-ink">
            <LogOut className="w-4 h-4" /> Sign out
          </button>
        </div>
      </aside>

      {/* Mobile: off-canvas drawer, so every tab is reachable behind one
          menu button instead of a horizontal-scrolling strip that could
          hide items off-screen. */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <button aria-label="Close menu" className="absolute inset-0 bg-black/50" onClick={onCloseMobile} />
          <aside className="absolute left-0 top-0 h-full w-72 max-w-[85vw] bg-paper border-r border-slate-700 flex flex-col">
            <div className="flex items-center justify-between px-4 py-4 shrink-0">
              <div className="flex items-center gap-2">
                <img src="/logo-emblem.png" alt="ShopOS" width={28} height={28} className="w-7 h-7 rounded-lg object-contain" />
                <span className="font-display font-semibold">ShopOS Admin</span>
              </div>
              <button aria-label="Close menu" onClick={onCloseMobile} className="p-1 text-slate-400 hover:text-ink">
                <X className="w-5 h-5" />
              </button>
            </div>
            <NavList tab={tab} onSelect={select} badges={badges} />
            <div className="p-3 border-t border-slate-700 shrink-0">
              <button onClick={onSignOut} className="w-full flex items-center gap-2 px-3 py-2 text-sm text-slate-400 hover:text-ink">
                <LogOut className="w-4 h-4" /> Sign out
              </button>
            </div>
          </aside>
        </div>
      )}
    </>
  );
}
