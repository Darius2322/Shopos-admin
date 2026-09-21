import { BrandMark } from '../BrandMark';
import { ReactNode, useEffect, useRef, useState } from 'react';
import { touchActivity } from '../../lib/activity';
import { NavLink, useLocation } from 'react-router-dom';
import {
  LayoutGrid, ShoppingCart, Package, Users, Wallet, Truck, Receipt,
  Building2, RefreshCw, LogOut, WifiOff, RotateCcw, ListOrdered, Banknote,
  AlertOctagon, FileText, FileSpreadsheet, LifeBuoy, ShieldCheck, Store, Star, SunMoon, Sun, Moon, Ban, Coffee, CalendarCheck2, Megaphone, Maximize2, Printer, Tags, Menu, X, BarChart3, ScrollText
} from 'lucide-react';
import { BranchSwitcher } from './BranchSwitcher';
import { NotificationsBell } from './NotificationsBell';
import { useAuth } from '../../lib/auth';
import { useSyncStore, syncHealth, syncHealthReport } from '../../lib/sync';
import { ThemeSwitch } from '../ThemeSwitch';
import { MoreMenu } from './MoreMenu';
import { DeleteAccountDialog } from '../DeleteAccountDialog';
import { useTheme } from '../../lib/theme';
import { useLock, initAutoLock } from '../../lib/lock';
import { usePosFocus } from '../../lib/posFocus';
import { getDerivedNotifications } from '../../lib/notifications';
import { startDeviceHeartbeat, stopDeviceHeartbeat } from '../../lib/deviceSessions';
import { LockScreen } from '../lock/LockScreen';
import { WelcomeToast } from './WelcomeToast';
import { Permission, profileHasAnyPermission } from '../../lib/permissions';
import type { Profile } from '../../lib/types';

// `permission` gates a nav item by ANY of the listed permissions (owners
// always pass, see profileHasAnyPermission). Items with no `permission`
// are visible to every signed-in role — Dashboard, Notice Board, Theme,
// Support, and Security are personal/general enough that scoping them
// would just be friction, not a real security boundary (nothing sensitive
// renders on any of those four regardless of who's viewing).
//
// This is the actual fix for spec section 6 ("staff portal displaying
// itself like an admin portal") — every role was seeing the exact same
// full nav (Users, Branches, Employee Payments, Business Profile) with no
// distinction at all. The backend already blocks unauthorized actions
// (phase2/phase2b); this makes what's SHOWN match what's actually usable.
const NAV_GROUPS: { label: string; items: { to: string; label: string; icon: any; end?: boolean; permission?: Permission[] }[] }[] = [
  { label: '', items: [{ to: '/', label: 'Dashboard', icon: LayoutGrid, end: true }] },
  { label: '', items: [{ to: '/analytics', label: 'Profit & Loss', icon: BarChart3, permission: ['reports.view', 'reports.financial'] }] },
  {
    label: 'Sell',
    items: [
      { to: '/pos', label: 'POS', icon: ShoppingCart, permission: ['sales.create'] },
      { to: '/sales', label: 'Sales', icon: ListOrdered, permission: ['sales.view'] },
      { to: '/end-of-day', label: 'End of Day', icon: CalendarCheck2, permission: ['closings.reopen', 'reports.financial'] }
    ]
  },
  {
    label: 'Documents',
    items: [
      { to: '/quotations', label: 'Quotations', icon: FileText, permission: ['sales.create'] },
      { to: '/invoices', label: 'Invoices', icon: FileSpreadsheet, permission: ['sales.create'] }
    ]
  },
  {
    label: 'Sales Adjustments',
    items: [
      { to: '/cancellations', label: 'Cancel Sale', icon: Ban, permission: ['sales.cancel'] },
      { to: '/corrections', label: 'Correct Sale', icon: AlertOctagon, permission: ['sales.cancel'] },
      { to: '/refunds', label: 'Refund', icon: RotateCcw, permission: ['sales.refund'] }
    ]
  },
  {
    label: 'Manage',
    items: [
      { to: '/inventory', label: 'Inventory', icon: Package, permission: ['inventory.view'] },
      { to: '/categories', label: 'Categories', icon: Tags, permission: ['inventory.view'] },
      { to: '/customers', label: 'Customers', icon: Users, permission: ['customers.view'] },
      { to: '/debts', label: 'Debts', icon: Wallet, permission: ['customers.view', 'reports.financial'] },
      { to: '/payments', label: 'M-Pesa', icon: Banknote, permission: ['sales.create', 'reports.financial'] },
      { to: '/suppliers', label: 'Suppliers', icon: Truck, permission: ['suppliers.view'] },
      { to: '/expenses', label: 'Expenses', icon: Receipt, permission: ['expenses.view'] }
    ]
  },
  {
    label: 'Team',
    items: [
      { to: '/employee-payments', label: 'Employee Payments', icon: Banknote, permission: ['reports.financial'] },
      { to: '/users', label: 'Users', icon: Users, permission: ['staff.view'] },
      { to: '/audit-log', label: 'Audit Log', icon: ScrollText, permission: ['audit.view'] },
      { to: '/branches', label: 'Branches', icon: Building2, permission: ['business.manage'] }
    ]
  },
  {
    label: 'System',
    items: [
      { to: '/business-profile', label: 'Business Profile', icon: Store, permission: ['business.settings'] },
      { to: '/loyalty-settings', label: 'Loyalty Program', icon: Star, permission: ['business.settings'] },
      { to: '/printer-settings', label: 'Receipts & Printer', icon: Printer, permission: ['business.settings'] },
      { to: '/notices', label: 'Notice Board', icon: Megaphone },
      { to: '/theme', label: 'Theme', icon: SunMoon },
      { to: '/support', label: 'Support', icon: LifeBuoy },
      { to: '/security', label: 'Security', icon: ShieldCheck },
      { to: '/legal', label: 'Legal', icon: ScrollText }
    ]
  }
];

function visibleNavGroups(profile: Profile | null) {
  return NAV_GROUPS
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => !item.permission || profileHasAnyPermission(profile, item.permission))
    }))
    .filter((group) => group.items.length > 0);
}

const MOBILE_NAV_PATHS = ['/', '/pos', '/customers', '/debts'];

// The 4 preferred shortcuts, filtered to what this role can actually use —
// hardcoding these regardless of permission had the same problem as the
// two NAV_GROUPS.map call sites above: a role without sales.create would
// still get a POS tab that leads nowhere useful. Falls back to filling
// remaining slots from whatever else is visible, so every role always
// gets up to 4 relevant shortcuts rather than fewer than 4 with dead ones
// mixed in.
function mobileNav(profile: Profile | null) {
  const visible = visibleNavGroups(profile).flatMap((g) => g.items);
  const preferred = MOBILE_NAV_PATHS
    .map((path) => visible.find((n) => n.to === path))
    .filter((n): n is (typeof visible)[number] => !!n);
  const rest = visible.filter((item) => !preferred.includes(item));
  return [...preferred, ...rest].slice(0, 4);
}

export function AppShell({ children }: { children: ReactNode }) {
  const { business, profile, activeBranchId, branches, userId, signOut } = useAuth();
  const connection = useSyncStore((s) => s.connection);
  const pending = useSyncStore((s) => s.pendingCount);
  const failed = useSyncStore((s) => s.failedCount);
  const authRequired = useSyncStore((s) => s.authRequired);
  const health = syncHealth({ connection, authRequired, failedCount: failed });
  const syncLabel = health === 'signin' ? 'Sign in to sync'
    : health === 'action' ? `Sync failed (${failed})`
    : health === 'syncing' ? 'Syncing…'
    : health === 'offline' ? 'Offline'
    : pending > 0 ? `${pending} pending` : '✓ Synced';
  const lastError = useSyncStore((s) => s.lastError);
  const report = syncHealthReport({ connection, authRequired, failedCount: failed, pendingCount: pending, lastError });
  const [confirmingSignOut, setConfirmingSignOut] = useState(false);
  const [deletingAccount, setDeletingAccount] = useState(false);
  const lastSyncAt = useSyncStore((s) => s.lastSyncAt);
  const syncTone = health === 'action' || health === 'signin' ? 'text-rust-600' : health === 'offline' ? 'text-amber-600' : 'text-field-700';
  const takeBreak = useLock((s) => s.takeBreak);
  const { focused, exit } = usePosFocus();
  const location = useLocation();
  const mainRef = useRef<HTMLElement>(null);
  const [moreOpen, setMoreOpen] = useState(false);
  // Per-route notification counts (e.g. how many low-stock alerts route to
  // /inventory, how many overdue debts route to /debts) so the nav can
  // show a badge on exactly the items that need attention, not just a
  // single bell icon — same underlying data as NotificationsBell, grouped
  // by where each item actually links to.
  const [navBadgeCounts, setNavBadgeCounts] = useState<Record<string, number>>({});

  useEffect(() => {
    if (!business) return;
    let cancelled = false;
    async function load() {
      const items = await getDerivedNotifications(business!.id, activeBranchId ?? null);
      if (cancelled) return;
      const counts: Record<string, number> = {};
      for (const item of items) {
        counts[item.href] = (counts[item.href] ?? 0) + 1;
      }
      setNavBadgeCounts(counts);
    }
    load();
    const interval = window.setInterval(load, 20000);
    return () => { cancelled = true; window.clearInterval(interval); };
  }, [business?.id, activeBranchId]);

  useEffect(() => { initAutoLock(); }, []);

  // Dashboard heartbeat: only while the tab is visible, at most every 10 minutes
  // (an idle background tab doesn't count as "active").
  useEffect(() => {
    const ping = () => { if (document.visibilityState === 'visible') touchActivity('dashboard'); };
    ping();
    const id = window.setInterval(ping, 10 * 60_000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    if (!business || !profile) return;
    startDeviceHeartbeat(business.id, profile.id, activeBranchId ?? null);
    return () => stopDeviceHeartbeat();
  }, [business?.id, profile?.id, activeBranchId]);

  // Close automatically on navigation, and never leave the body scrollable
  // underneath an open drawer.
  useEffect(() => { setMoreOpen(false); }, [location.pathname]);
  useEffect(() => {
    document.body.style.overflow = moreOpen ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [moreOpen]);

  // Now that <main> scrolls independently of the sidebar (see the shell
  // layout below), the browser no longer resets scroll position on
  // navigation the way it does for whole-page scrolling — without this,
  // opening a new section keeps whatever scroll position the previous one
  // was left at.
  useEffect(() => {
    mainRef.current?.scrollTo(0, 0);
  }, [location.pathname]);

  // Focus mode only makes sense while actually on the POS screen — if the
  // user navigates elsewhere (including via browser back), silently drop
  // out of it rather than leaving other pages stuck in a stripped-down
  // shell with no way back to normal navigation.
  useEffect(() => {
    if (focused && location.pathname !== '/pos') exit();
  }, [location.pathname, focused]);

  const branchName = branches.find((b) => b.id === activeBranchId)?.name;

  if (focused && location.pathname === '/pos') {
    return (
      <div className="min-h-screen flex flex-col">
        <LockScreen />
        <header className="shrink-0 bg-paper-raised border-b border-slate-200 px-4 py-2.5 flex items-center justify-between">
          <div className="flex items-center gap-2.5 min-w-0">
            <BrandMark className="w-7 h-7 rounded-lg shrink-0" />
            <span className="text-sm font-medium truncate">{business?.name}</span>
            {branchName && <span className="text-xs text-slate-500 truncate hidden sm:inline">· {branchName}</span>}
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <span className="text-xs text-slate-500 hidden sm:inline">{profile?.fullName}</span>
            {connection === 'offline' && <WifiOff className="w-4 h-4 text-amber-600" />}
            <button onClick={exit} className="flex items-center gap-1.5 text-xs font-medium text-slate-600 hover:text-ink px-2.5 py-1.5 rounded-card hover:bg-slate-50">
              Exit Focus
            </button>
          </div>
        </header>
        <main className="flex-1 min-w-0">{children}</main>
      </div>
    );
  }

  return (
    <div className="h-screen flex overflow-hidden">
      <LockScreen />
      <WelcomeToast />
      {/* Desktop sidebar — h-screen + overflow-hidden on the shell above
          means this column no longer grows/scrolls with page content; only
          its own <nav> (already overflow-y-auto) scrolls if the nav list
          itself is too tall. */}
      <aside className="hidden md:flex md:flex-col w-60 shrink-0 border-r border-slate-200 bg-paper-raised">
        <div className="p-5 flex items-center gap-2">
          <BrandMark className="w-8 h-8 rounded-lg" />
          <span className="font-display font-semibold text-lg">ShopOS</span>
        </div>
        <nav className="flex-1 px-3 space-y-4 overflow-y-auto">
          {visibleNavGroups(profile).map((group, gi) => (
            <div key={gi}>
              {group.label && <div className="px-3 text-[11px] font-semibold uppercase tracking-wide text-slate-400 mb-1">{group.label}</div>}
              <div className="space-y-0.5">
                {group.items.map((item) => (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    end={item.end}
                    className={({ isActive }) =>
                      `flex items-center gap-3 px-3 py-2.5 rounded-card text-sm font-medium transition-colors ${
                        isActive ? 'bg-field-50 text-field-700' : 'text-slate-600 hover:bg-slate-50'
                      }`
                    }
                  >
                    <item.icon className="w-4.5 h-4.5" />
                    {item.label}
                    {!!navBadgeCounts[item.to] && (
                      <span className="ml-auto text-[10px] font-semibold bg-rust-500 text-white rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1">
                        {navBadgeCounts[item.to] > 9 ? '9+' : navBadgeCounts[item.to]}
                      </span>
                    )}
                  </NavLink>
                ))}
              </div>
            </div>
          ))}
        </nav>
        <div className="p-3 border-t border-slate-200">
          <NavLink to="/sync" className="flex items-center gap-2 px-3 py-2 text-xs text-slate-500 hover:text-ink">
            <RefreshCw className={`w-3.5 h-3.5 ${syncTone}`} />
            <span className={health === 'action' || health === 'signin' ? 'text-rust-600 font-medium' : ''}>{syncLabel}</span>
          </NavLink>
          <div className="px-3 py-2 text-xs text-slate-500 truncate">{profile?.fullName} · {profile?.role}</div>
          {business && activeBranchId && userId && (
            <button
              onClick={() => takeBreak(business.id, activeBranchId, userId)}
              className="w-full flex items-center gap-2 px-3 py-2 text-sm text-slate-600 hover:bg-slate-50 rounded-card"
            >
              <Coffee className="w-4 h-4" /> Take a break
            </button>
          )}
          <button onClick={() => setDeletingAccount(true)} className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-slate-400 hover:text-rust-600 rounded-card">Delete my account</button>
          <button onClick={() => setConfirmingSignOut(true)} className="w-full flex items-center gap-2 px-3 py-2 text-sm text-slate-600 hover:bg-slate-50 rounded-card">
            <LogOut className="w-4 h-4" /> Sign out
          </button>
        </div>
      </aside>

      <div className="flex-1 flex flex-col min-w-0 h-full overflow-hidden">
        {/* Top header */}
        <header className="sticky top-0 z-40 bg-paper-raised/95 backdrop-blur border-b border-slate-200 px-4 md:px-6 py-2.5 flex items-center justify-between">
          <div className="flex items-center gap-2 min-w-0">
            <BrandMark className="md:hidden w-7 h-7 rounded-lg shrink-0" />
            <span className="text-sm font-medium text-slate-500 hidden md:inline truncate">{business?.name}</span>
            <span className="hidden md:inline text-slate-300">/</span>
            <BranchSwitcher />
          </div>
          <div className="flex items-center gap-1">
            {connection === 'offline' && (
              <span className="flex items-center gap-1 text-xs text-amber-600 font-medium mr-1">
                <WifiOff className="w-3.5 h-3.5" /> Offline
              </span>
            )}
            <NotificationsBell />
            <div className="hidden md:block"><ThemeToggleButton /></div>
          </div>
        </header>

        <main ref={mainRef} className="flex-1 pb-20 md:pb-0 min-w-0 overflow-y-auto">{children}</main>
      </div>

      {/* Mobile bottom nav — the 4 most-used destinations get a permanent
          slot; everything else (Categories, Suppliers, Debts, Refunds,
          Employee Payments, Users, Branches, Business Profile, and every
          other System/Team item) previously had NO way to be reached at
          all below the md breakpoint, since only these 4 hardcoded routes
          existed here and the full sidebar is desktop-only. "More" opens
          every section the sidebar has, so nothing is actually hidden on
          a phone anymore — just one tap further away. */}
      {(() => {
        const items = mobileNav(profile);
        const pos = items.find((i) => i.to === '/pos');
        const others = items.filter((i) => i.to !== '/pos');
        // POS sits in the middle as a raised call-to-action; the other shortcuts flank it.
        const left = pos ? others.slice(0, 2) : others.slice(0, 2);
        const right = pos ? others.slice(2) : others.slice(2);
        const tab = (item: (typeof items)[number]) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={({ isActive }) =>
              `relative flex-1 flex flex-col items-center justify-center gap-0.5 pt-2 pb-2 text-[11px] font-medium min-h-[56px] ${isActive ? 'text-field-600' : 'text-slate-500'}`
            }
          >
            {!!navBadgeCounts[item.to] && (
              <span className="absolute top-1 right-1/4 min-w-[16px] h-[16px] px-1 rounded-full bg-rust-500 text-white text-[9px] font-semibold flex items-center justify-center">
                {navBadgeCounts[item.to] > 9 ? '9+' : navBadgeCounts[item.to]}
              </span>
            )}
            <item.icon className="w-5 h-5" />
            {item.label}
          </NavLink>
        );
        return (
          <nav className="md:hidden fixed bottom-0 inset-x-0 z-40 bg-paper-raised border-t border-slate-200 flex items-stretch pb-[env(safe-area-inset-bottom)]">
            {left.map(tab)}
            {pos && (
              <NavLink to="/pos" aria-label="Open POS" className="relative flex-1 flex flex-col items-center justify-end pb-1.5 text-[11px] font-semibold min-h-[56px]">
                {({ isActive }) => (
                  <>
                    <span className={`absolute -top-7 w-[68px] h-[68px] rounded-full flex items-center justify-center text-white shadow-lg ring-[6px] ring-paper-raised transition-transform active:scale-95 ${isActive ? 'bg-field-700' : 'bg-field-600'}`}
                      style={{ backgroundImage: 'linear-gradient(135deg, rgb(var(--color-field-600)), rgb(var(--color-field-700)))' }}>
                      <pos.icon className="w-8 h-8" />
                    </span>
                    <span className={isActive ? 'text-field-600' : 'text-slate-500'}>POS</span>
                  </>
                )}
              </NavLink>
            )}
            {right.map(tab)}
            <button
              onClick={() => setMoreOpen((o) => !o)}
              aria-expanded={moreOpen}
              className={`relative flex-1 flex flex-col items-center justify-center gap-0.5 py-2 text-[11px] font-medium min-h-[56px] ${moreOpen ? 'text-field-600' : 'text-slate-500'}`}
            >
              {Object.values(navBadgeCounts).reduce((a, b) => a + b, 0) > 0 && (
                <span className="absolute top-1 right-1/4 w-2 h-2 rounded-full bg-rust-500" />
              )}
              <Menu className="w-5 h-5" />
              More
            </button>
          </nav>
        );
      })()}

      {/* Full-page menu — every NAV_GROUPS section, not a curated subset,
          so nothing available on desktop is ever unreachable on mobile.
          Takes the whole screen rather than a partial bottom sheet, so it
          reads as its own page, not a floating panel. */}
      {moreOpen && (
        <MoreMenu
          groups={visibleNavGroups(profile)}
          badges={navBadgeCounts}
          businessName={business?.name ?? 'ShopOS'}
          logoUrl={business?.logoUrl ?? null}
          userName={profile?.fullName ?? 'You'}
          roleLabel={(profile?.role ?? '').replace(/_/g, ' ')}
          branchName={branches.find((br) => br.id === activeBranchId)?.name ?? null}
          health={{ healthy: report.healthy, offline: report.title === 'Offline', title: report.title, detail: report.detail }}
          syncLabel={syncLabel}
          syncTone={syncTone}
          lastSyncAt={lastSyncAt}
          onClose={() => setMoreOpen(false)}
          onSignOut={() => setConfirmingSignOut(true)}
          onDeleteAccount={() => setDeletingAccount(true)}
        />
      )}

      {deletingAccount && <DeleteAccountDialog pendingChanges={pending + failed} onClose={() => setDeletingAccount(false)} />}

      {confirmingSignOut && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-ink/50" onClick={() => setConfirmingSignOut(false)} aria-hidden="true" />
          <div role="alertdialog" aria-modal="true" aria-labelledby="signout-title" className="relative w-full max-w-sm bg-paper-raised rounded-2xl p-5 shadow-xl space-y-3">
            <h3 id="signout-title" className="font-display font-semibold text-lg">Sign out of ShopOS?</h3>
            <p className="text-sm text-slate-600">
              {pending > 0 || failed > 0
                ? `You have ${pending + failed} change${pending + failed === 1 ? '' : 's'} not yet synced. They stay safely on this device and will sync after you sign in again.`
                : 'You will need to sign in again to keep using ShopOS on this device.'}
            </p>
            <div className="grid grid-cols-2 gap-2 pt-1">
              <button autoFocus onClick={() => setConfirmingSignOut(false)} className="btn-secondary min-h-[44px]">Stay signed in</button>
              <button onClick={() => { setConfirmingSignOut(false); setMoreOpen(false); void signOut(); }} className="btn-primary min-h-[44px] !bg-rust-600">Sign out</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ThemeToggleButton() {
  const { preference, setPreference } = useTheme();
  const next: Record<string, 'light' | 'dark' | 'system'> = { light: 'dark', dark: 'system', system: 'light' };
  const Icon = preference === 'dark' ? Moon : preference === 'system' ? SunMoon : Sun;
  return (
    <button
      onClick={() => setPreference(next[preference])}
      className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-slate-50"
      aria-label={`Theme: ${preference}. Tap to change.`}
      title={`Theme: ${preference}`}
    >
      <Icon className="w-4.5 h-4.5 text-slate-600" />
    </button>
  );
}
