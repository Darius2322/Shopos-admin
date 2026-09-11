import { useEffect, useState } from 'react';
import { SupabaseClient } from '@supabase/supabase-js';
import { Menu } from 'lucide-react';
import { supabase } from './lib/supabase';
import { Centered } from './components/ui';
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
      setError(err instanceof Error ? err.message : 'Sign in failed');
    } finally { setBusy(false); }
  }

  return (
    <Centered>
      <div className="w-full max-w-xs">
        <h1 className="font-display font-semibold text-xl mb-1">ShopOS Admin</h1>
        <p className="text-sm text-slate-400 mb-5">Platform administrator sign-in</p>
        <form onSubmit={submit} className="card p-4 space-y-3">
          <input className="input" type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          <input className="input" type="password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          {error && <p className="text-xs text-rust-500">{error}</p>}
          <button className="btn-primary w-full" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
        </form>
        <p className="text-xs text-slate-500 mt-5 text-center max-w-xs mx-auto">
          This portal is for the ShopOS platform administrator only. There is no self-service access here —
          admin accounts are created directly in the database.
        </p>
      </div>
    </Centered>
  );
}

const TAB_LABELS: Record<Tab, string> = {
  dashboard: 'Dashboard', requests: 'Owner Requests', businesses: 'Businesses', create: 'New Business',
  branches: 'Branches', features: 'Feature Requests', permissions: 'Role Defaults', audit: 'Audit Logs', support: 'Support', settings: 'Platform Settings',
};

function Shell({ supabase, onSignOut }: { supabase: SupabaseClient; onSignOut: () => void }) {
  const [tab, setTab] = useState<Tab>('dashboard');
  const [openBusinessId, setOpenBusinessId] = useState<string | null>(null);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [theme, toggleTheme] = useTheme();

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
    <div className="h-screen flex overflow-hidden bg-paper text-ink">
      <Sidebar tab={tab} onSelect={selectTab} onSignOut={onSignOut} mobileOpen={mobileNavOpen} onCloseMobile={() => setMobileNavOpen(false)} />

      <div className="flex-1 min-w-0 flex flex-col h-screen">
        <header className="shrink-0 border-b border-slate-700 bg-paper">
          <div className="flex items-center gap-3 px-4 py-3 lg:hidden">
            <button aria-label="Open menu" onClick={() => setMobileNavOpen(true)} className="p-1.5 -ml-1.5 text-slate-400 hover:text-ink">
              <Menu className="w-5 h-5" />
            </button>
            <span className="font-display font-semibold text-sm">{TAB_LABELS[tab]}</span>
          </div>

          {/* This utility bar (theme / notifications / search) is rendered
              once, identically on mobile and desktop, so it's never the
              thing that goes missing when the viewport shrinks. */}
          <div className="flex items-center gap-2 px-4 py-2.5 border-t border-slate-700 lg:border-t-0">
            <GlobalSearch supabase={supabase} onOpenBusiness={openBusiness} />
            <div className="flex items-center gap-1 ml-auto">
              <ThemeToggle theme={theme} onToggle={toggleTheme} />
              <NotificationsMenu supabase={supabase} onGoToRequests={() => selectTab('requests')} />
            </div>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto p-5">
          <div className="max-w-3xl mx-auto">
            {tab === 'dashboard' && <Dashboard supabase={supabase} onOpenBusiness={openBusiness} />}
            {tab === 'requests' && <OwnerRequests supabase={supabase} />}
            {tab === 'businesses' && (
              openBusinessId
                ? <BusinessDetail supabase={supabase} businessId={openBusinessId} onBack={() => setOpenBusinessId(null)} />
                : <Businesses supabase={supabase} onOpen={setOpenBusinessId} />
            )}
            {tab === 'create' && <CreateBusiness supabase={supabase} onCreated={openBusiness} />}
            {tab === 'branches' && <Branches supabase={supabase} onOpenBusiness={openBusiness} />}
            {tab === 'features' && <FeatureRequests supabase={supabase} />}
            {tab === 'audit' && <AuditLogs supabase={supabase} />}
            {tab === 'support' && <Support supabase={supabase} />}
            {tab === 'settings' && <PlatformSettingsPage supabase={supabase} />}
            {tab === 'permissions' && <RoleDefaultsPage supabase={supabase} />}
          </div>
        </main>
      </div>
    </div>
  );
}
