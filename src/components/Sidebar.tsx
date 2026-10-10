import { LayoutDashboard, Users, Building2, Store, ScrollText, LifeBuoy, LogOut, Settings, X, Sparkles, ShieldCheck, Star, RefreshCw, BarChart3, Terminal, HardDrive, Database, Trash2, Package, Palette } from 'lucide-react';

import { BadgeDot, badgeFor, type Badges } from '../lib/badges';

export type Tab = 'dashboard' | 'requests' | 'businesses' | 'create' | 'branches' | 'features' | 'audit' | 'support' | 'settings' | 'permissions' | 'reviews' | 'releases' | 'analytics' | 'installers' | 'monitor' | 'database' | 'softdelete' | 'packages' | 'businesstypes';

export const TABS: [Tab, string, any][] = [
  ['dashboard', 'Dashboard', LayoutDashboard],
  ['requests', 'Owner Requests', Users],
  ['analytics', 'Analytics', BarChart3],
  ['businesses', 'Businesses', Building2],
  ['packages', 'Packages', Package],
  ['businesstypes', 'Business Types', Palette],
  ['softdelete', 'Soft Delete', Trash2],
  ['branches', 'Branches', Store],
  ['features', 'Feature Requests', Sparkles],
  ['reviews', 'Reviews', Star],
  ['permissions', 'Role Defaults', ShieldCheck],
  ['releases', 'App Updates', RefreshCw],
  ['installers', 'Installers', HardDrive],
  ['database', 'Database', Database],
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

function NavList({ tab, onSelect, badges }: { tab: Tab; onSelect: (tab: Tab) => void; badges: Badges }) {
  return (
    <nav className="flex-1 overflow-y-auto px-3 py-3 space-y-0.5">
      {TABS.map(([key, label, Icon]) => (
        <button
          key={key}
          onClick={() => onSelect(key)}
          className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-card text-sm font-medium text-left ${
            tab === key ? 'bg-field-600 text-paper' : 'text-slate-400 hover:bg-slate-800 hover:text-ink'
          }`}
        >
          <Icon className="w-4 h-4 shrink-0" /> <span className="flex-1 truncate">{label}</span><BadgeDot n={badgeFor(badges, key)} />
        </button>
      ))}
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
      <aside className="hidden lg:flex lg:flex-col w-60 shrink-0 h-screen border-r border-slate-700 bg-paper">
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
