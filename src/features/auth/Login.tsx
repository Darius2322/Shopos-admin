import { BrandMark } from '../../components/BrandMark';
import { BrandLogo } from '../../components/BrandLogo';
import { useEffect, useState } from 'react';
import { useParams, useLocation } from 'react-router-dom';
import { Building2, Search, CheckCircle2, Copy, Check, Smile, Frown, Clock3, ArrowRight, Mail } from 'lucide-react';
import { useAuth } from '../../lib/auth';
import { backendConfigured, supabase, supabaseUrl } from '../../lib/supabase';
import { SupportContact } from '../../components/SupportContact';
import { PasswordInput } from '../../components/PasswordInput';
import { ThemeSwitch } from '../../components/ThemeSwitch';

export function Login() {
  const { signIn } = useAuth();
  const { slug } = useParams<{ slug?: string }>();
  const location = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [showRegister, setShowRegister] = useState(false);
  const [showStatusCheck, setShowStatusCheck] = useState(false);
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [statusCheckPrefill, setStatusCheckPrefill] = useState<{ email: string; referenceCode: string } | null>(null);

  // The landing page's CTAs link here with ?view=register / ?view=status
  // instead of duplicating the register/status-check forms on the
  // landing page itself — this is the one place that logic already
  // lives, so the landing page just deep-links into it.
  useEffect(() => {
    const view = new URLSearchParams(location.search).get('view');
    if (view === 'register') setShowRegister(true);
    if (view === 'status') setShowStatusCheck(true);
  }, []);

  // /login/:slug is the URL an owner shares with their own staff — this
  // looks that business up (name + logo only, via a narrow public RPC)
  // so THIS login page is unmistakably theirs, not a generic ShopOS
  // screen. Falls back to the device-remembered business below when
  // there's no slug (the plain /login route).
  const [slugBusiness, setSlugBusiness] = useState<{ name: string; logoUrl: string | null } | null>(null);
  const [slugNotFound, setSlugNotFound] = useState(false);
  useEffect(() => {
    if (!slug || !supabase) return;
    supabase.rpc('get_business_by_slug', { p_slug: slug }).then(({ data }) => {
      const row = Array.isArray(data) ? data[0] : data;
      if (row) setSlugBusiness({ name: row.name, logoUrl: row.logo_url });
      else setSlugNotFound(true);
    });
  }, [slug]);


  // Which shop last logged in on THIS device, purely for display — lets a
  // dedicated till/tablet greet staff by name ("ShopOS · Sam's Kiosk")
  // instead of a generic screen indistinguishable from any other install.
  const [lastBusiness] = useState<{ name: string; logoUrl: string | null } | null>(() => {
    try {
      const raw = localStorage.getItem('shopos-last-business');
      return raw ? JSON.parse(raw) : null;
    } catch { return null; }
  });

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await signIn(email, password);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not sign in');
    } finally {
      setLoading(false);
    }
  }

  if (showRegister) {
    return (
      <RegisterBusiness
        onDone={() => setShowRegister(false)}
        onRegistered={(email, referenceCode) => {
          setStatusCheckPrefill({ email, referenceCode });
          setShowRegister(false);
          setShowStatusCheck(true);
        }}
      />
    );
  }
  if (showStatusCheck) {
    return (
      <CheckApplicationStatus
        onDone={() => { setShowStatusCheck(false); setStatusCheckPrefill(null); }}
        initialEmail={statusCheckPrefill?.email}
        initialReferenceCode={statusCheckPrefill?.referenceCode}
      />
    );
  }
  if (showForgotPassword) {
    return <ForgotPassword onDone={() => setShowForgotPassword(false)} />;
  }

  // A slug present in the URL takes priority over the device-remembered
  // business — an explicit shared link is a stronger signal than "the
  // last shop that happened to log in here."
  const displayBusiness = slugBusiness ?? lastBusiness;

  return (
    <div className="min-h-screen flex items-center justify-center bg-paper p-4 relative">
      <div className="absolute top-3 right-3"><ThemeSwitch compact /></div>
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center mb-8">
          {displayBusiness?.logoUrl
            ? <div className="w-14 h-14 rounded-2xl overflow-hidden mb-3"><img src={displayBusiness.logoUrl} alt={displayBusiness.name} className="w-full h-full object-cover" /></div>
            : <BrandLogo stacked slogan size="lg" className="mb-1" />}
          <h1 className="font-display font-semibold text-3xl text-center leading-tight">
            {displayBusiness?.name ? `Welcome to ${displayBusiness.name}` : 'ShopOS'}
          </h1>
          {displayBusiness?.name && <p className="text-xs font-medium text-slate-400 mt-1 tracking-wide uppercase">ShopOS</p>}
          {slug && slugNotFound && <p className="text-sm text-rust-600 mt-1">No shop found for this link.</p>}
          <p className="text-sm text-slate-500 mt-2">Sign in to your business</p>
          {displayBusiness?.name && (
            <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-1.5 mt-3 text-center">
              This page is strictly for staff of {displayBusiness.name}.
            </p>
          )}
        </div>

        {!backendConfigured() && (
          <div className="card p-3.5 mb-4 bg-amber-50 border-amber-200 text-sm text-amber-700">
            No backend configured. Set <code className="font-mono text-xs">VITE_SUPABASE_URL</code> and{' '}
            <code className="font-mono text-xs">VITE_SUPABASE_ANON_KEY</code> in <code className="font-mono text-xs">.env</code>.
          </div>
        )}

        <form onSubmit={handleSubmit} className="card p-5 space-y-3.5">
          <label className="block">
            <span className="block text-sm font-medium text-slate-600 mb-1.5">Email</span>
            <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus />
          </label>
          <label className="block">
            <span className="block text-sm font-medium text-slate-600 mb-1.5">Password</span>
            <PasswordInput value={password} onChange={setPassword} required />
          </label>
          {error && <p className="text-sm text-rust-600">{error}</p>}
          <button type="submit" disabled={loading} className="btn-primary w-full">
            {loading ? 'Signing in…' : 'Sign in'}
          </button>
          <button type="button" onClick={() => setShowForgotPassword(true)} className="w-full text-center text-sm text-slate-500 hover:text-field-600">
            Forgot password?
          </button>
        </form>
        <p className="text-center text-xs text-slate-400 mt-4">
          <a href="/legal" className="underline">Legal</a> · <a href="/terms" className="underline">Terms</a> · <a href="/privacy" className="underline">Privacy Policy</a>
        </p>

        <div className="mt-5 space-y-2">
          <button onClick={() => setShowRegister(true)} className="btn-secondary w-full flex items-center justify-center gap-1.5">
            <Building2 className="w-4 h-4" /> New business? Register for ShopOS
          </button>
          <button onClick={() => setShowStatusCheck(true)} className="btn-secondary w-full flex items-center justify-center gap-1.5">
            <Search className="w-4 h-4" /> Already applied? Check your status
          </button>
        </div>
        <SupportContact />
      </div>
    </div>
  );
}

function ForgotPassword({ onDone }: { onDone: () => void }) {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null); setBusy(true);
    try {
      const res = await fetch(`${supabaseUrl}/functions/v1/send-password-reset`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), redirectTo: `${window.location.origin}/reset-password` })
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? 'Could not send reset email');
      setSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send reset email');
    } finally { setBusy(false); }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-paper p-4">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center mb-8">
          <div className="w-12 h-12 rounded-2xl bg-field-600 flex items-center justify-center text-white mb-3"><Mail className="w-5 h-5" /></div>
          <h1 className="font-display font-semibold text-2xl text-center">Reset your password</h1>
          <p className="text-sm text-slate-500 mt-1 text-center">Enter your account email and we'll send you a link to set a new one.</p>
        </div>

        {sent ? (
          <div className="card p-5 text-center space-y-3">
            <CheckCircle2 className="w-8 h-8 text-field-600 mx-auto" />
            <p className="text-sm">If an account exists for that email, a reset link is on its way. Tap the link in the email to set a new password directly — no extra steps.</p>
            <button onClick={onDone} className="btn-secondary w-full">Back to sign in</button>
          </div>
        ) : (
          <form onSubmit={submit} className="card p-5 space-y-3.5">
            <label className="block">
              <span className="block text-sm font-medium text-slate-600 mb-1.5">Email</span>
              <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus />
            </label>
            {error && <p className="text-sm text-rust-600">{error}</p>}
            <button type="submit" disabled={busy || !email} className="btn-primary w-full">{busy ? 'Sending…' : 'Send reset link'}</button>
            <button type="button" onClick={onDone} className="w-full text-center text-sm text-slate-500">Back to sign in</button>
          </form>
        )}
      </div>
    </div>
  );
}

// Supabase/PostgREST errors are plain objects, NOT Error instances, so
// `err instanceof Error` was hiding the real server message behind a generic one.
function errorMessage(err: unknown, fallback: string): string {
  if (err instanceof Error && err.message) return err.message;
  if (err && typeof err === 'object' && 'message' in err && typeof (err as { message: unknown }).message === 'string') {
    return (err as { message: string }).message;
  }
  return fallback;
}

function RegisterBusiness({ onDone, onRegistered }: { onDone: () => void; onRegistered: (email: string, referenceCode: string) => void }) {
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [businessName, setBusinessName] = useState('');
  const [message, setMessage] = useState('');
  const [referenceCode, setReferenceCode] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!supabase) { setError('No backend configured'); return; }
    setBusy(true); setError(null);
    try {
      // A plain .insert().select() here would silently fail the read-back
      // (anon has no SELECT policy on owner_requests) even though the
      // insert itself succeeded — see schema_part11.sql. This RPC avoids
      // that entirely: its return value isn't a table read subject to RLS.
      const { data, error } = await supabase.rpc('submit_owner_request', {
        p_full_name: fullName, p_email: email, p_phone: phone || null,
        p_business_name: businessName, p_message: message || null
      });
      if (error) throw error;
      setReferenceCode(data as string);
    } catch (err) {
      setError(errorMessage(err, 'Could not submit request'));
    } finally { setBusy(false); }
  }

  async function copyReferenceCode() {
    if (!referenceCode) return;
    try {
      await navigator.clipboard.writeText(referenceCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard access can be denied/unavailable — the code is still
      // shown on screen either way, so this is a nice-to-have, not
      // essential.
    }
  }

  if (referenceCode) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-paper p-6 text-center">
        <div className="w-14 h-14 rounded-full bg-field-50 flex items-center justify-center text-field-600 mb-4 animate-success-pop">
          <CheckCircle2 className="w-8 h-8" />
        </div>
        <p className="font-display font-semibold text-lg mb-1">Request submitted</p>
        <p className="text-sm text-slate-500 max-w-xs mb-4">
          Save your reference number below — use it to check your status anytime, whether or not you're able to check {email}.
        </p>
        <div className="text-2xl font-mono font-semibold tracking-widest text-center py-3 px-6 bg-field-50 text-field-700 rounded-card mb-3">
          {referenceCode}
        </div>
        <button onClick={copyReferenceCode} className="btn-secondary text-sm flex items-center gap-1.5 mb-4">
          {copied ? <Check className="w-4 h-4 text-field-600" /> : <Copy className="w-4 h-4" />}
          {copied ? 'Copied!' : 'Copy reference number'}
        </button>
        <p className="text-xs text-slate-400 max-w-xs mb-5">
          Keep checking back with this reference number — approval can take a day or two.
        </p>
        <button onClick={() => onRegistered(email, referenceCode)} className="btn-primary text-sm mb-2 flex items-center gap-1.5">
          Check my status now <ArrowRight className="w-4 h-4" />
        </button>
        <button onClick={onDone} className="text-xs text-slate-500 hover:text-ink">Back to sign in</button>
        <SupportContact label="Questions before you hear back?" />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-paper p-4">
      <form onSubmit={submit} className="w-full max-w-sm">
        <div className="flex flex-col items-center mb-6">
          <div className="w-12 h-12 rounded-2xl bg-field-600 flex items-center justify-center text-white mb-3">
            <Building2 className="w-6 h-6" />
          </div>
          <h1 className="font-display font-semibold text-2xl text-center">Bring your business to ShopOS</h1>
          <p className="text-sm text-slate-500 mt-1 text-center">Tell us a bit about your business — we'll review and get back to you.</p>
        </div>
        <div className="card p-5 space-y-3.5">
          <label className="block"><span className="block text-sm font-medium text-slate-600 mb-1.5">Your name</span>
            <input className="input" value={fullName} onChange={(e) => setFullName(e.target.value)} required autoFocus />
          </label>
          <label className="block"><span className="block text-sm font-medium text-slate-600 mb-1.5">Email</span>
            <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </label>
          <label className="block"><span className="block text-sm font-medium text-slate-600 mb-1.5">Phone</span>
            <input className="input" value={phone} onChange={(e) => setPhone(e.target.value)} />
          </label>
          <label className="block"><span className="block text-sm font-medium text-slate-600 mb-1.5">Business name</span>
            <input className="input" value={businessName} onChange={(e) => setBusinessName(e.target.value)} required />
          </label>
          <label className="block"><span className="block text-sm font-medium text-slate-600 mb-1.5">Anything else? (optional)</span>
            <textarea className="input min-h-16" value={message} onChange={(e) => setMessage(e.target.value)} />
          </label>
          {error && <p className="text-sm text-rust-600">{error}</p>}
          <p className="text-xs text-slate-400">By submitting you agree to our <a href="/terms" target="_blank" rel="noreferrer" className="underline">Terms</a> and <a href="/privacy" target="_blank" rel="noreferrer" className="underline">Privacy Policy</a>.</p>
          <button type="submit" disabled={busy} className="btn-primary w-full">{busy ? 'Submitting…' : 'Submit application'}</button>
          <button type="button" onClick={onDone} className="text-xs text-slate-500 hover:text-ink block mx-auto">Back to sign in</button>
        </div>
        <SupportContact />
      </form>
    </div>
  );
}

const STATUS_COPY: Record<string, { label: string; detail: (reason: string | null) => string }> = {
  pending: { label: 'Pending review', detail: () => "We haven't made a decision yet — check back soon." },
  info_requested: { label: 'More information needed', detail: (r) => r ?? 'The ShopOS team needs a bit more detail from you — they should be in touch.' },
  approved: { label: 'Approved', detail: () => 'You can set up your account right here — no need to wait for email.' },
  rejected: { label: "Wasn't approved", detail: (r) => r ?? 'This application was not approved this time.' }
};

function CheckApplicationStatus({ onDone, initialEmail, initialReferenceCode }: { onDone: () => void; initialEmail?: string; initialReferenceCode?: string }) {
  const { signIn } = useAuth();
  const [checkEmail, setCheckEmail] = useState(initialEmail ?? '');
  const [referenceCode, setReferenceCode] = useState(initialReferenceCode ?? '');
  const [result, setResult] = useState<{ business_name: string; status: string; submitted_at: string; decision_reason: string | null; can_claim: boolean; slug: string | null } | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [claiming, setClaiming] = useState(false);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [claimBusy, setClaimBusy] = useState(false);
  const [claimError, setClaimError] = useState<string | null>(null);

  async function check(e: React.FormEvent) {
    e.preventDefault();
    if (!supabase) { setError('No backend configured'); return; }
    setBusy(true); setError(null); setResult(undefined);
    try {
      const { data, error } = await supabase.rpc('check_owner_request_status', {
        p_email: checkEmail.trim(), p_reference_code: referenceCode.trim()
      });
      if (error) throw error;
      setResult(data && data.length > 0 ? data[0] : null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not check status');
    } finally { setBusy(false); }
  }

  // Coming straight from "Check my status now" right after registering —
  // both fields are already known, so just check immediately instead of
  // making them press the button on data they just typed.
  useEffect(() => {
    if (initialEmail && initialReferenceCode) {
      check({ preventDefault() {} } as React.FormEvent);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function claim(e: React.FormEvent) {
    e.preventDefault();
    if (!supabase) { setClaimError('No backend configured'); return; }
    if (password.length < 8) { setClaimError('Password must be at least 8 characters'); return; }
    if (password !== confirmPassword) { setClaimError("Passwords don't match"); return; }
    setClaimBusy(true); setClaimError(null);
    try {
      const res = await fetch(`${supabaseUrl}/functions/v1/claim-owner-account`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: checkEmail.trim(), referenceCode: referenceCode.trim(), newPassword: password })
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? 'Could not set up your account');
      // Sign in immediately with the password just set — takes over into
      // Activation (App.tsx routes pending_activation businesses there).
      await signIn(checkEmail.trim(), password);
    } catch (err) {
      setClaimError(err instanceof Error ? err.message : 'Could not set up your account');
    } finally { setClaimBusy(false); }
  }

  const moodIcon = (status: string) => {
    if (status === 'approved') return <Smile className="w-8 h-8" />;
    if (status === 'rejected') return <Frown className="w-8 h-8" />;
    return <Clock3 className="w-8 h-8" />;
  };
  const moodColor = (status: string) => {
    if (status === 'approved') return 'bg-field-600 text-white';
    if (status === 'rejected') return 'bg-rust-600 text-white';
    return 'bg-amber-500 text-white';
  };

  if (claiming && result?.can_claim) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-paper p-4">
        <div className="w-full max-w-sm">
          <div className="flex flex-col items-center mb-6">
            <BrandMark className="w-14 h-14 rounded-2xl mb-3" />
            <h1 className="font-display font-semibold text-2xl text-center">Set up {result.business_name}</h1>
            <p className="text-sm text-slate-500 mt-1 text-center">Choose a password to finish setting up your account.</p>
          </div>
          <form onSubmit={claim} className="card p-5 space-y-3.5">
            <label className="block">
              <span className="block text-sm font-medium text-slate-600 mb-1.5">New password</span>
              <PasswordInput value={password} onChange={setPassword} minLength={8} required autoFocus />
            </label>
            <label className="block">
              <span className="block text-sm font-medium text-slate-600 mb-1.5">Confirm password</span>
              <PasswordInput value={confirmPassword} onChange={setConfirmPassword} minLength={8} required />
            </label>
            {claimError && <p className="text-sm text-rust-600">{claimError}</p>}
            <button type="submit" disabled={claimBusy} className="btn-primary w-full">
              {claimBusy ? 'Setting up…' : 'Set password & continue'}
            </button>
          </form>
          <button onClick={() => setClaiming(false)} className="text-sm text-slate-500 hover:text-ink mt-5 block mx-auto">Back</button>
        </div>
      </div>
    );
  }

  // A result was found — its own dedicated screen (mood icon, reference,
  // support contact, and a direct path forward) rather than a small card
  // tacked under the lookup form.
  if (result) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-paper p-6 text-center">
        <div className={`w-16 h-16 rounded-full flex items-center justify-center mb-4 animate-success-pop ${moodColor(result.status)}`}>
          {moodIcon(result.status)}
        </div>
        <p className="font-display font-semibold text-xl mb-1">{result.business_name}</p>
        <p className="text-xs text-slate-400 mb-4">{checkEmail} · {referenceCode.toUpperCase()}</p>

        <p className="text-base font-medium text-ink mb-1">{STATUS_COPY[result.status]?.label ?? result.status}</p>
        <p className="text-sm text-slate-500 max-w-xs mb-6">{STATUS_COPY[result.status]?.detail(result.decision_reason) ?? ''}</p>

        {result.slug && (
          <ShopLoginLink slug={result.slug} />
        )}

        {result.can_claim && (
          <button onClick={() => setClaiming(true)} className="btn-primary w-full max-w-xs mb-3 flex items-center justify-center gap-1.5">
            Continue to set up your shop <ArrowRight className="w-4 h-4" />
          </button>
        )}
        {result.status === 'approved' && !result.can_claim && (
          <p className="text-xs text-slate-500 max-w-xs mb-3">This account has already been set up — sign in normally.</p>
        )}

        <button onClick={() => setResult(undefined)} className="text-sm text-slate-500 hover:text-ink mb-1">Check a different application</button>
        <button onClick={onDone} className="text-xs text-slate-400 hover:text-ink">Back to sign in</button>

        <SupportContact label="Taking longer than expected? Reach us:" />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-paper p-4">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center mb-6">
          <div className="w-12 h-12 rounded-2xl bg-field-600 flex items-center justify-center text-white mb-3">
            <Search className="w-6 h-6" />
          </div>
          <h1 className="font-display font-semibold text-2xl text-center">Check your application</h1>
          <p className="text-sm text-slate-500 mt-1 text-center">Enter the email you applied with and your reference number.</p>
        </div>

        <form onSubmit={check} className="card p-5 space-y-3.5">
          <label className="block">
            <span className="block text-sm font-medium text-slate-600 mb-1.5">Email</span>
            <input className="input" type="email" value={checkEmail} onChange={(e) => setCheckEmail(e.target.value)} autoFocus required />
          </label>
          <label className="block">
            <span className="block text-sm font-medium text-slate-600 mb-1.5">Reference number</span>
            <input
              className="input tnum text-center tracking-widest uppercase"
              value={referenceCode}
              onChange={(e) => setReferenceCode(e.target.value)}
              placeholder="SR-XXXXXX"
              required
            />
          </label>
          {error && <p className="text-sm text-rust-600">{error}</p>}
          <button type="submit" disabled={busy || !referenceCode.trim() || !checkEmail.trim()} className="btn-primary w-full">
            {busy ? 'Checking…' : 'Check status'}
          </button>
        </form>

        {result === null && (
          <p className="text-sm text-rust-600 text-center mt-4">No application found with that email and reference number.</p>
        )}

        <button onClick={onDone} className="text-sm text-slate-500 hover:text-ink mt-5 block mx-auto">Back to sign in</button>
        <SupportContact />
      </div>
    </div>
  );
}

// Shown on the approved-status screen so the owner doesn't have to dig
// through email or ask an admin for their shop's actual sign-in link —
// it's right here the moment their business exists, first login or not.
function ShopLoginLink({ slug }: { slug: string }) {
  const url = `${window.location.origin}/login/${slug}`;
  const [copied, setCopied] = useState(false);

  async function copy() {
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="w-full max-w-xs mb-4">
      <p className="text-xs text-slate-400 mb-1.5">Your shop's sign-in link — bookmark it, or share it with staff:</p>
      <div className="flex gap-2">
        <input className="input text-xs flex-1" readOnly value={url} onFocus={(e) => e.target.select()} />
        <button onClick={copy} className="btn-secondary text-xs shrink-0 flex items-center gap-1 px-2.5">
          {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
        </button>
      </div>
    </div>
  );
}
