import { useEffect, useState } from 'react';
import { SupabaseClient } from '@supabase/supabase-js';
import { Bot, Menu, RefreshCw } from 'lucide-react';
import { AppStatusPill } from './components/AppStatusPill';
import { supabase } from './lib/supabase';
import { Centered } from './components/ui';
import Packages from './pages/Packages';
import BusinessTypes from './pages/BusinessTypes';
import Bookings from './pages/Bookings';
import { Merged } from './components/Merged';
import BookingAdmin, { type BkView } from './pages/BookingAdmin';
import BookingInsights from './pages/BookingInsights';
import DatabasePage from './pages/Database';
import SoftDelete from './pages/SoftDelete';
import { useBadges, markTabSeen } from './lib/badges';
import Sidebar, { Tab } from './components/Sidebar';
import { GlobalSearch } from './components/GlobalSearch';
import { NotificationsMenu } from './components/NotificationsMenu';
import { ThemeToggle, useTheme } from './components/ThemeToggle';
import Dashboard from './pages/Dashboard';
import OwnerRequests from './pages/OwnerRequests';
import Businesses from './pages/Businesses';
import BusinessDetail from './pages/BusinessDetail';
import CreateBusiness from './pages/CreateBusiness';
import Branches from './pages/Branches';
import FeatureRequests from './pages/FeatureRequests';
import AuditLogs from './pages/AuditLogs';
import Support from './pages/Support';
import PlatformSettingsPage from './pages/PlatformSettings';
import RoleDefaultsPage from './pages/RoleDefaults';
import Reviews from './pages/Reviews';
import Analytics from './pages/Analytics';
import AppsAndUpdates from './pages/AppsAndUpdates';
import Monitor from './pages/Monitor';
import Mpesa from './pages/Mpesa';
import Assistant from './pages/Assistant';
import { friendlyError } from './lib/friendlyError';
import { registerPush } from './lib/push';
import { DownloadApp } from './components/DownloadApp';
import { useTabHistory } from './lib/backStack';

export default function App() {
  const [session, setSession] = useState<any>(null);
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!supabase) { setLoading(false); return; }
    supabase.auth.getSession().then(async ({ data }) => {
      setSession(data.session);
      if (data.session) await checkAdmin(data.session.user.id);
      setLoading(false);
    });
  }, []);

  // On the phone app: ring this phone the moment a new request, ticket or review-hide request arrives.
  useEffect(() => { if (session && isAdmin) void registerPush('admin'); }, [session, isAdmin]);

  async function checkAdmin(userId: string) {
    if (!supabase) return;
    const { data } = await supabase.from('platform_admins').select('user_id').eq('user_id', userId).maybeSingle();
    setIsAdmin(!!data);
  }

  if (!supabase) {
    return <Centered><p className="text-sm text-slate-400">Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.</p></Centered>;
  }
  // Captured into a locally-typed const so nested closures below (onClick,
  // onSignedIn) see the narrowed SupabaseClient type directly, instead of
  // re-checking the outer `supabase` import's SupabaseClient | null type —
  // TS doesn't carry a null-guard across a function boundary, even though
  // it's logically safe here since this is a plain, never-reassigned const.
  const client = supabase;
  if (loading) return <Centered><p className="text-sm text-slate-400">Loading…</p></Centered>;
  if (!session) {
    return <Login supabase={client} onSignedIn={async (uid) => { await checkAdmin(uid); setSession(await client.auth.getSession().then(r => r.data.session)); }} />;
  }
  if (isAdmin === false) {
    return (
      <Centered>
        <p className="text-sm text-rust-500 mb-3">This account isn't a platform admin.</p>
        <button className="btn-secondary text-sm" onClick={() => client.auth.signOut().then(() => setSession(null))}>Sign out</button>
      </Centered>
    );
  }
  if (isAdmin === null) return <Centered><p className="text-sm text-slate-400">Checking access…</p></Centered>;

  return <Shell supabase={client} onSignOut={() => { client.auth.signOut(); setSession(null); }} />;
}

function Login({ supabase, onSignedIn }: { supabase: SupabaseClient; onSignedIn: (uid: string) => void }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null); setBusy(true);
    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      if (data.user) onSignedIn(data.user.id);
    } catch (err) {
      setError(friendlyError(err, 'Sign in failed. Please try again.'));
    } finally { setBusy(false); }
  }

  return (
    <Centered>
      <div className="w-full max-w-xs">
        <img src="/logo-emblem.png" alt="ShopOS" width={56} height={56} className="w-14 h-14 rounded-2xl mb-3" />
        <h1 className="font-display font-semibold text-xl mb-1">ShopOS Admin</h1>
        <p className="text-sm text-slate-400 mb-5">Platform administrator sign-in</p>
        <form onSubmit={submit} className="card p-4 space-y-3">
          <input className="input" type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          <input className="input" type="password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          {error && <p className="text-xs text-rust-500">{error}</p>}
          <button className="btn-primary w-full" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
        </form>
        <div className="mt-4 max-w-xs mx-auto w-full"><DownloadApp app="admin" /></div>
        <p className="text-xs text-slate-500 mt-5 text-center max-w-xs mx-auto">
          This portal is for the ShopOS platform administrator only. There is no self-service access here —
          admin accounts are created directly in the database.
        </p>
      </div>
    </Centered>
  );
}

const TAB_LABELS: Record<Tab, string> = {
  mpesa: 'M-Pesa', assistant: 'Assistant',
  dashboard: 'Dashboard', requests: 'Owner Requests', businesses: 'Businesses', create: 'New Business',
  bookings: 'Bookings', branches: 'Branches', features: 'Feature Requests', reviews: 'Reviews', permissions: 'Role Defaults', releases: 'App Updates', apps: 'Apps & Updates', analytics: 'Analytics', installers: 'Installers', monitor: 'Monitor', database: 'Database', packages: 'Packages', businesstypes: 'Business Types', softdelete: 'Soft Delete', audit: 'Audit Logs', support: 'Support', settings: 'Platform Settings',
};

function Shell({ supabase, onSignOut }: { supabase: SupabaseClient; onSignOut: () => void }) {
  const [tab, setTab] = useState<Tab>('dashboard'); useTabHistory(tab, setTab, 'dashboard');
  const [openBusinessId, setOpenBusinessId] = useState<string | null>(null);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [theme, toggleTheme] = useTheme();
  const badges = useBadges(supabase);
  useEffect(() => { markTabSeen(tab); }, [tab, badges]);
  const [refreshKey, setRefreshKey] = useState(0);
  const [refreshing, setRefreshing] = useState(false);

  /** Refreshes the whole portal: checks for a newer version of the portal itself (and loads it if there is one), then reloads the
   * numbers on whatever page is open, the status pill, the badges and the notifications. */
  async function refreshAll() {
    if (refreshing) return;
    setRefreshing(true);
    try {
      const reg = await navigator.serviceWorker?.getRegistration();
      if (reg) { await reg.update(); if (reg.waiting) { reg.waiting.postMessage({ type: 'SKIP_WAITING' }); window.location.reload(); return; } }
    } catch { /* offline or no service worker: just refresh the data */ }
    setRefreshKey((k) => k + 1);
    window.dispatchEvent(new Event('badges:refresh'));
    window.dispatchEvent(new Event('admin-refresh'));
    window.setTimeout(() => setRefreshing(false), 800);
  }

  function openBusiness(id: string) {
    setOpenBusinessId(id);
    setTab('businesses');
  }

  function selectTab(key: Tab) {
    setTab(key);
    if (key !== 'businesses') setOpenBusinessId(null);
  }

  return (
    // Sidebar and content are separate flex columns, each with their own
    // height/overflow — scrolling one never moves the other, and on phones
    // the sidebar becomes a drawer opened from the hamburger button below
    // instead of a horizontal tab strip that could hide items off-screen.
    <div className="h-dvh flex overflow-hidden bg-paper text-ink">
      <Sidebar tab={tab === 'installers' || tab === 'releases' ? 'apps' : tab} onSelect={selectTab} onSignOut={onSignOut} mobileOpen={mobileNavOpen} onCloseMobile={() => setMobileNavOpen(false)} badges={badges} />

      <div className="flex-1 min-w-0 flex flex-col h-dvh">
        <header className="shrink-0 sticky top-0 z-30 border-b border-slate-700 bg-paper">
          {/* One sticky bar, same on phone and desktop: menu, main-app status, assistant, search, theme, notifications. */}
          <div className="flex items-center gap-2 px-3 py-2">
            <button aria-label="Open menu" onClick={() => setMobileNavOpen(true)} className="relative p-1.5 text-slate-400 hover:text-ink lg:hidden shrink-0">
              <Menu className="w-5 h-5" />
              {Object.entries(badges).some(([k, v]) => k !== 'packages_expiring' && v > 0) && <span className="absolute top-0.5 right-0.5 w-2.5 h-2.5 rounded-full bg-rust-500" aria-label="New items" />}
            </button>
            <span className="hidden lg:inline font-display font-semibold text-sm shrink-0 mr-1">{TAB_LABELS[tab]}</span>
            <AppStatusPill key={`pill${refreshKey}`} supabase={supabase} onOpen={() => selectTab('settings')} />
            <button aria-label="AI assistant" title="AI assistant" onClick={() => selectTab('assistant')} className="p-1.5 text-slate-400 hover:text-ink shrink-0"><Bot className="w-5 h-5" /></button>
            <div className="flex-1 min-w-0"><GlobalSearch supabase={supabase} onOpenBusiness={openBusiness} onGo={(t) => selectTab(t)} /></div>
            <div className="flex items-center gap-0.5 shrink-0">
              <button aria-label="Refresh everything" title="Refresh everything" onClick={() => void refreshAll()} className="p-1.5 text-slate-400 hover:text-ink"><RefreshCw className={`w-5 h-5 ${refreshing ? 'animate-spin' : ''}`} /></button>
              <ThemeToggle theme={theme} onToggle={toggleTheme} />
              <NotificationsMenu key={`bell${refreshKey}`} supabase={supabase} onGoToRequests={() => selectTab('requests')} />
            </div>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto overscroll-contain p-5">
          <div key={refreshKey} className={`mx-auto ${tab === 'monitor' || tab === 'analytics' ? 'max-w-5xl' : 'max-w-3xl'}`}>
            {tab === 'dashboard' && <Merged id="dashboard" shop={<Dashboard supabase={supabase} onOpenBusiness={openBusiness} onGo={(t) => selectTab(t)} />} booking={[{ id: 'o', label: 'Overview', node: <BookingInsights supabase={supabase} view="overview" /> }, { id: 'a', label: 'Activity', node: <BookingAdmin supabase={supabase} view="activity" /> }]} />}
            {tab === 'requests' && <Merged id="requests" shop={<OwnerRequests supabase={supabase} />} booking={[{ id: 'apps', label: 'Applications', node: <Bookings supabase={supabase} view="apps" /> }]} />}
            {tab === 'businesses' && (
              openBusinessId
                ? <BusinessDetail supabase={supabase} businessId={openBusinessId} onBack={() => setOpenBusinessId(null)} />
                : <Merged id="businesses" shop={<Businesses supabase={supabase} onOpen={setOpenBusinessId} onNew={() => setTab('create')} />} booking={[{ id: 'biz', label: 'Businesses', node: <Bookings supabase={supabase} view="biz" /> }, { id: 'own', label: 'Owners & logins', node: <BookingAdmin supabase={supabase} view="owners" /> }, { id: 'cat', label: 'Services & chairs', node: <BookingAdmin supabase={supabase} view="catalog" /> }]} />
            )}
            {tab === 'create' && (
              <div className="space-y-3">
                <button onClick={() => setTab('businesses')} className="text-xs text-slate-400 hover:text-ink">← Back to Businesses</button>
                <CreateBusiness supabase={supabase} onCreated={openBusiness} />
              </div>
            )}
            {tab === 'branches' && <Branches supabase={supabase} onOpenBusiness={openBusiness} />}
            {tab === 'features' && <FeatureRequests supabase={supabase} />}
            {tab === 'reviews' && <Merged id="reviews" preferBooking={badges.bk_hide_requests > 0 && badges.reviews === 0} shop={<Reviews supabase={supabase} />} booking={[{ id: 'bkrev', label: 'Booking reviews', node: <BookingAdmin supabase={supabase} view="reviews" /> }]} />}
            {tab === 'audit' && <AuditLogs supabase={supabase} />}
            {tab === 'support' && <Support supabase={supabase} />}
            {tab === 'settings' && <PlatformSettingsPage supabase={supabase} />}
            {tab === 'permissions' && <RoleDefaultsPage supabase={supabase} />}
            {(tab === 'apps' || tab === 'releases' || tab === 'installers') && <AppsAndUpdates key={tab} supabase={supabase} start={tab === 'installers' ? 'installers' : 'updates'} badges={badges} />}
            {tab === 'analytics' && <Merged id="analytics" shop={<Analytics supabase={supabase} />} booking={[{ id: 'an', label: 'Analytics', node: <BookingAdmin supabase={supabase} view="analytics" /> }, { id: 'rep', label: 'Reports', node: <BookingInsights supabase={supabase} view="reports" /> }, { id: 'rev', label: 'Revenue', node: <BookingAdmin supabase={supabase} view="revenue" /> }]} />}
            {tab === 'monitor' && <Monitor supabase={supabase} />}
            {tab === 'mpesa' && <Mpesa supabase={supabase} />}
            {tab === 'assistant' && <Assistant />}
            {tab === 'packages' && <Merged id="packages" shop={<Packages supabase={supabase} />} booking={[{ id: 'plans', label: 'Booking plans & fees', node: <BookingAdmin supabase={supabase} view="plans" /> }]} />}
            {tab === 'businesstypes' && <BusinessTypes supabase={supabase} />}
            {tab === 'bookings' && <Merged id="bookings" shop={<p className="text-sm text-slate-400">Bookings belong to the Booking side.</p>} booking={[{ id: 'all', label: 'All bookings', node: <Bookings supabase={supabase} view="bookings" /> }, { id: 'today', label: 'Today & tomorrow', node: <BookingAdmin supabase={supabase} view="today" /> }, { id: 'cust', label: 'Customers', node: <BookingInsights supabase={supabase} view="customers" /> }, { id: 'q', label: 'Quotes', node: <BookingAdmin supabase={supabase} view="quotes" /> }, { id: 'rv', label: 'Reviews', node: <BookingAdmin supabase={supabase} view="reviews" /> }, { id: 'bc', label: 'Broadcast', node: <BookingAdmin supabase={supabase} view="broadcast" /> }, { id: 'bl', label: 'Blocked numbers', node: <BookingAdmin supabase={supabase} view="blocked" /> }]} />}
            {tab === 'database' && <DatabasePage supabase={supabase} />}
            {tab === 'softdelete' && <SoftDelete supabase={supabase} />}
          </div>
        </main>
      </div>
    </div>
  );
}
