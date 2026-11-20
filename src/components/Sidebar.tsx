import { useEffect, useState } from 'react';
import { Clock, Radio, CalendarCheck, ChevronDown, Bell, BellOff, Headphones, Briefcase, Cpu, LayoutDashboard, Users, Building2, Store, ScrollText, LifeBuoy, LogOut, Settings, X, Sparkles, ShieldCheck, Star, RefreshCw, BarChart3, Terminal, Database, Wallet, Bot, Trash2, Package, Palette, Rocket, Globe } from 'lucide-react';

import { BadgeDot, badgeFor, groupCount, setSoundOn, soundOn, chime, type Badges } from '../lib/badges';
import { DownloadApp } from './DownloadApp';
import { useBackClose } from '../lib/backStack';

export type Tab = 'lastseen' | 'notifications' | 'dashboard' | 'requests' | 'businesses' | 'create' | 'branches' | 'features' | 'audit' | 'support' | 'settings' | 'permissions' | 'reviews' | 'releases' | 'bookings' | 'apps' | 'analytics' | 'installers' | 'monitor' | 'database' | 'softdelete' | 'packages' | 'businesstypes' | 'mpesa' | 'assistant' | 'golive' | 'website' | 'live';

export const TABS: [Tab, string, any][] = [
  ['dashboard', 'Dashboard', LayoutDashboard],
  ['requests', 'Owner Requests', Users],
  ['analytics', 'Analytics', BarChart3],
  ['businesses', 'Businesses', Building2],
  ['lastseen', 'Last seen', Clock],
  ['bookings', 'Bookings', CalendarCheck],
  ['mpesa', 'M-Pesa', Wallet],
  ['packages', 'Packages', Package],
  ['businesstypes', 'Business Types', Palette],
  ['softdelete', 'Soft Delete', Trash2],
  ['branches', 'Branches', Store],
  ['features', 'Feature Requests', Sparkles],
  ['reviews', 'Reviews', Star],
  ['permissions', 'Role Defaults', ShieldCheck],
  ['apps', 'Apps & Updates', RefreshCw],
  ['database', 'Database', Database],
  ['assistant', 'Assistant', Bot],
  ['notifications', 'Notifications', Bell],
  ['website', 'Website', Globe],
  ['golive', 'Go live', Rocket],
  ['live', 'Live terminal', Radio],
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

/** The menu: groups can hold pages or more groups, to any depth (menu, sub-menu, sub-sub-menu). */
interface Group { id: string; label: string; icon: any; tabs: (Tab | Group)[] }
const GROUPS: Group[] = [
  { id: 'overview', label: 'Overview', icon: LayoutDashboard, tabs: ['dashboard', 'analytics'] },
  { id: 'customers', label: 'Businesses & people', icon: Briefcase, tabs: ['requests', 'businesses', 'lastseen', { id: 'bookapp', label: 'Booking app', icon: CalendarCheck, tabs: ['bookings', 'businesstypes'] }, 'branches', 'softdelete'] },
  { id: 'money', label: 'Money & plans', icon: Wallet, tabs: ['mpesa', 'packages'] },
  { id: 'help', label: 'Feedback & support', icon: Headphones, tabs: ['support', 'features', 'reviews'] },
  { id: 'site', label: 'Marketing website', icon: Globe, tabs: ['website'] },
  { id: 'notify', label: 'Notifications', icon: Bell, tabs: ['notifications'] },
  { id: 'release', label: 'Go live', icon: Rocket, tabs: ['golive'] },
  { id: 'system', label: 'Platform & system', icon: Cpu, tabs: ['permissions', 'apps', { id: 'tools', label: 'Tools', icon: Terminal, tabs: ['database', 'assistant', { id: 'watch', label: 'Watching', icon: Radio, tabs: ['live', 'monitor', 'audit'] }] }, 'settings'] },
];
const isGroup = (n: Tab | Group): n is Group => typeof n !== 'string';
const flat = (g: Group): Tab[] => g.tabs.flatMap((n) => (isGroup(n) ? flat(n) : [n]));
const label = (t: Tab) => TABS.find(([k]) => k === t)![1];
const iconOf = (t: Tab) => TABS.find(([k]) => k === t)![2];

function NavList({ tab, onSelect, badges }: { tab: Tab; onSelect: (tab: Tab) => void; badges: Badges }) {
  const [open, setOpen] = useState<Record<string, boolean>>(() => {
    try { return JSON.parse(localStorage.getItem('shopos-admin-groups') ?? '{}'); } catch { return {}; }
  });
  const [sound, setSound] = useState(soundOn());
  useEffect(() => { try { localStorage.setItem('shopos-admin-groups', JSON.stringify(open)); } catch { /* ignore */ } }, [open]);
  // A group is open if you opened it, or if the page you are on lives inside it.
  const isOpen = (g: Group) => open[g.id] ?? flat(g).includes(tab);
  const render = (g: Group, depth: number) => {
    const GIcon = g.icon; const expanded = isOpen(g); const inside = flat(g).includes(tab);
    return (
      <div key={g.id}>
        <button
          onClick={() => setOpen({ ...open, [g.id]: !expanded })}
          aria-expanded={expanded}
          className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-card text-left hover:bg-slate-800 ${depth === 0 ? 'text-xs font-semibold uppercase tracking-wide' : 'text-sm font-medium'} ${inside ? 'text-ink' : 'text-slate-400'}`}
        >
          <GIcon className="w-4 h-4 shrink-0" /> <span className="flex-1 truncate">{g.label}</span>
          {!expanded && <BadgeDot n={groupCount(badges, flat(g))} />}
          <ChevronDown className={`w-3.5 h-3.5 shrink-0 transition-transform ${expanded ? '' : '-rotate-90'}`} />
        </button>
        {expanded && (
          <div className="ml-3 pl-2 border-l border-slate-700 space-y-0.5 mt-0.5">
            {g.tabs.map((n) => {
              if (isGroup(n)) return render(n, depth + 1);
              const Icon = iconOf(n);
              return (
                <button key={n} onClick={() => onSelect(n)}
                  className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-card text-sm font-medium text-left ${tab === n ? 'bg-field-600 text-paper' : 'text-slate-400 hover:bg-slate-800 hover:text-ink'}`}>
                  <Icon className="w-4 h-4 shrink-0" /> <span className="flex-1 truncate">{label(n)}</span><BadgeDot n={badgeFor(badges, n)} />
                </button>
              );
            })}
          </div>
        )}
      </div>
    );
  };
  return (
    <nav className="flex-1 overflow-y-auto px-3 py-3 space-y-1">
      {GROUPS.map((g) => render(g, 0))}
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
  useBackClose(mobileOpen, onCloseMobile);
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
          <DownloadApp app="admin" className="mb-2 !min-h-[40px] text-sm" />
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
              <DownloadApp app="admin" className="mb-2 !min-h-[40px] text-sm" />
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
