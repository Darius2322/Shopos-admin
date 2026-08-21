import { useEffect, useState } from 'react';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { Users, Building2, LifeBuoy, LogOut, Check, X, Pause, Play } from 'lucide-react';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
const supabase: SupabaseClient | null = url && anonKey ? createClient(url, anonKey) : null;

type Tab = 'requests' | 'businesses' | 'support';

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
  if (loading) return <Centered><p className="text-sm text-slate-400">Loading…</p></Centered>;
  if (!session) {
    return <Login supabase={supabase} onSignedIn={async (uid) => { await checkAdmin(uid); setSession(await supabase.auth.getSession().then(r => r.data.session)); }} />;
  }
  if (isAdmin === false) {
    return (
      <Centered>
        <p className="text-sm text-rust-500 mb-3">This account isn't a platform admin.</p>
        <button className="btn-secondary text-sm" onClick={() => supabase.auth.signOut().then(() => setSession(null))}>Sign out</button>
      </Centered>
    );
  }
  if (isAdmin === null) return <Centered><p className="text-sm text-slate-400">Checking access…</p></Centered>;

  return <Dashboard supabase={supabase} onSignOut={() => { supabase.auth.signOut(); setSession(null); }} />;
}

function Centered({ children }: { children: React.ReactNode }) {
  return <div className="min-h-screen flex flex-col items-center justify-center p-4">{children}</div>;
}

function Login({ supabase, onSignedIn }: { supabase: SupabaseClient; onSignedIn: (uid: string) => void }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [showRequest, setShowRequest] = useState(false);

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

  if (showRequest) return <OwnerRequestForm supabase={supabase} onDone={() => setShowRequest(false)} />;

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
        <button onClick={() => setShowRequest(true)} className="text-xs text-slate-400 hover:text-ink mt-4 block mx-auto">
          Want to bring your business to ShopOS? Request access →
        </button>
      </div>
    </Centered>
  );
}

function OwnerRequestForm({ supabase, onDone }: { supabase: SupabaseClient; onDone: () => void }) {
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [businessName, setBusinessName] = useState('');
  const [message, setMessage] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError(null);
    try {
      const { error } = await supabase.from('owner_requests').insert({
        full_name: fullName, email, phone: phone || null, business_name: businessName, message: message || null
      });
      if (error) throw error;
      setSubmitted(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not submit request');
    } finally { setBusy(false); }
  }

  if (submitted) {
    return (
      <Centered>
        <p className="text-sm text-field-600 mb-3 text-center max-w-xs">Request submitted. We'll email you at {email} once it's reviewed.</p>
        <button onClick={onDone} className="btn-secondary text-sm">Back to sign in</button>
      </Centered>
    );
  }

  return (
    <Centered>
      <form onSubmit={submit} className="w-full max-w-xs card p-4 space-y-3">
        <h1 className="font-display font-semibold text-lg mb-1">Request access to ShopOS</h1>
        <input className="input" placeholder="Your name" value={fullName} onChange={(e) => setFullName(e.target.value)} required />
        <input className="input" type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        <input className="input" placeholder="Phone (optional)" value={phone} onChange={(e) => setPhone(e.target.value)} />
        <input className="input" placeholder="Business name" value={businessName} onChange={(e) => setBusinessName(e.target.value)} required />
        <textarea className="input min-h-16" placeholder="Anything else? (optional)" value={message} onChange={(e) => setMessage(e.target.value)} />
        {error && <p className="text-xs text-rust-500">{error}</p>}
        <button className="btn-primary w-full" disabled={busy}>{busy ? 'Submitting…' : 'Submit request'}</button>
        <button type="button" onClick={onDone} className="text-xs text-slate-400 hover:text-ink block mx-auto">Back to sign in</button>
      </form>
    </Centered>
  );
}

function Dashboard({ supabase, onSignOut }: { supabase: SupabaseClient; onSignOut: () => void }) {
  const [tab, setTab] = useState<Tab>('requests');

  return (
    <div className="min-h-screen">
      <header className="flex items-center justify-between px-5 py-3 border-b border-slate-800">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-field-600 flex items-center justify-center text-paper font-display font-semibold text-sm">S</div>
          <span className="font-display font-semibold">ShopOS Admin</span>
        </div>
        <button onClick={onSignOut} className="flex items-center gap-1.5 text-sm text-slate-400 hover:text-ink">
          <LogOut className="w-4 h-4" /> Sign out
        </button>
      </header>

      <nav className="flex gap-1 px-5 py-3 border-b border-slate-800">
        {([
          ['requests', 'Owner Requests', Users],
          ['businesses', 'Businesses', Building2],
          ['support', 'Support', LifeBuoy]
        ] as [Tab, string, any][]).map(([key, label, Icon]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-card text-sm font-medium ${tab === key ? 'bg-field-600 text-paper' : 'text-slate-400 hover:bg-slate-800'}`}
          >
            <Icon className="w-4 h-4" /> {label}
          </button>
        ))}
      </nav>

      <main className="p-5 max-w-3xl mx-auto">
        {tab === 'requests' && <OwnerRequests supabase={supabase} />}
        {tab === 'businesses' && <Businesses supabase={supabase} />}
        {tab === 'support' && <SupportTickets supabase={supabase} />}
      </main>
    </div>
  );
}

function OwnerRequests({ supabase }: { supabase: SupabaseClient }) {
  const [requests, setRequests] = useState<any[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    const { data } = await supabase.from('owner_requests').select('*').order('created_at', { ascending: false });
    setRequests(data ?? []);
  }
  useEffect(() => { load(); }, []);

  async function approve(id: string) {
    setBusy(id); setError(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(`${url}/functions/v1/approve-owner`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
        body: JSON.stringify({ ownerRequestId: id })
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? 'Approval failed');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Approval failed — is the approve-owner Edge Function deployed?');
    } finally { setBusy(null); }
  }

  async function reject(id: string) {
    setBusy(id);
    await supabase.from('owner_requests').update({ status: 'rejected', decided_at: new Date().toISOString() }).eq('id', id);
    await load();
    setBusy(null);
  }

  return (
    <div className="space-y-3">
      <h2 className="font-display font-semibold text-lg mb-1">Owner sign-up requests</h2>
      {error && <p className="text-sm text-rust-500">{error}</p>}
      {requests.length === 0 && <p className="text-sm text-slate-400">No requests.</p>}
      {requests.map((r) => (
        <div key={r.id} className="card p-4 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="text-sm font-medium">{r.business_name}</div>
            <div className="text-xs text-slate-400">{r.full_name} · {r.email}{r.phone ? ` · ${r.phone}` : ''}</div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <span className="text-xs px-2 py-0.5 rounded-full bg-slate-800 text-slate-400">{r.status}</span>
            {r.status === 'pending' && (
              <>
                <button onClick={() => approve(r.id)} disabled={busy === r.id} className="btn-primary text-xs px-2.5 py-1 flex items-center gap-1">
                  <Check className="w-3.5 h-3.5" /> Approve
                </button>
                <button onClick={() => reject(r.id)} disabled={busy === r.id} className="btn-secondary text-xs px-2.5 py-1 flex items-center gap-1">
                  <X className="w-3.5 h-3.5" /> Reject
                </button>
              </>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

function Businesses({ supabase }: { supabase: SupabaseClient }) {
  const [businesses, setBusinesses] = useState<any[]>([]);

  async function load() {
    const { data } = await supabase.from('businesses').select('*').order('created_at', { ascending: false });
    setBusinesses(data ?? []);
  }
  useEffect(() => { load(); }, []);

  async function setStatus(id: string, status: string) {
    await supabase.from('businesses').update({ status }).eq('id', id);
    await load();
  }

  return (
    <div className="space-y-3">
      <h2 className="font-display font-semibold text-lg mb-1">Businesses</h2>
      {businesses.length === 0 && <p className="text-sm text-slate-400">No businesses yet.</p>}
      {businesses.map((b) => (
        <div key={b.id} className="card p-4 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="text-sm font-medium">{b.name}</div>
            <div className="text-xs text-slate-400">{b.email ?? 'No email'} · {new Date(b.created_at).toLocaleDateString()}</div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <span className={`text-xs px-2 py-0.5 rounded-full ${b.status === 'active' ? 'bg-field-600/20 text-field-600' : 'bg-amber-500/20 text-amber-500'}`}>{b.status}</span>
            {b.status === 'active' ? (
              <button onClick={() => setStatus(b.id, 'paused')} className="btn-secondary text-xs px-2.5 py-1 flex items-center gap-1"><Pause className="w-3.5 h-3.5" /> Pause</button>
            ) : (
              <button onClick={() => setStatus(b.id, 'active')} className="btn-primary text-xs px-2.5 py-1 flex items-center gap-1"><Play className="w-3.5 h-3.5" /> Activate</button>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

function SupportTickets({ supabase }: { supabase: SupabaseClient }) {
  const [tickets, setTickets] = useState<any[]>([]);

  async function load() {
    const { data } = await supabase.from('support_tickets').select('*').order('created_at', { ascending: false });
    setTickets(data ?? []);
  }
  useEffect(() => { load(); }, []);

  async function setStatus(id: string, status: string) {
    await supabase.from('support_tickets').update({ status }).eq('id', id);
    await load();
  }

  return (
    <div className="space-y-3">
      <h2 className="font-display font-semibold text-lg mb-1">Support tickets</h2>
      {tickets.length === 0 && <p className="text-sm text-slate-400">No tickets.</p>}
      {tickets.map((t) => (
        <div key={t.id} className="card p-4">
          <div className="flex items-center justify-between gap-3">
            <div className="text-sm font-medium">{t.subject}</div>
            <select className="input w-auto text-xs py-1" value={t.status} onChange={(e) => setStatus(t.id, e.target.value)}>
              {['open', 'in_progress', 'waiting_for_user', 'resolved', 'closed'].map((s) => <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>)}
            </select>
          </div>
          <p className="text-xs text-slate-400 mt-1">{t.category} · {new Date(t.created_at).toLocaleString()}</p>
          <p className="text-sm text-slate-300 mt-2">{t.description}</p>
        </div>
      ))}
    </div>
  );
}
