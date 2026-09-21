import { useEffect, useState } from 'react';
import { Coffee, Lock, LogOut } from 'lucide-react';
import { useAuth } from '../../lib/auth';
import { useLock } from '../../lib/lock';
import { verifyPassword } from '../../lib/breaks';
import { biometricsSupported, isBiometricEnabled, verifyBiometric } from '../../lib/webauthn';
import { supabase } from '../../lib/supabase';

export function LockScreen() {
  const { profile, userId, business, signOut } = useAuth();
  const { locked, reason, resumeFromBreak, unlock } = useLock();
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [bioAvailable, setBioAvailable] = useState(false);
  const [confirmingSignOut, setConfirmingSignOut] = useState(false);

  useEffect(() => {
    if (locked && biometricsSupported()) isBiometricEnabled().then(setBioAvailable);
  }, [locked]);

  if (!locked) return null;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null); setBusy(true);
    try {
      // We don't have the email handy here without another lookup — the
      // password check re-authenticates the currently signed-in session,
      // so Supabase infers the account from the active session's email.
      const { data } = await supabase!.auth.getSession();
      const email = data.session?.user.email;
      if (!email) throw new Error('No active session');
      const ok = await verifyPassword(email, password);
      if (!ok) throw new Error('Incorrect password');
      if (reason === 'break') await resumeFromBreak(); else unlock();
      setPassword('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not unlock');
    } finally { setBusy(false); }
  }

  async function tryBiometric() {
    const ok = await verifyBiometric();
    if (ok) {
      if (reason === 'break') await resumeFromBreak(); else unlock();
    } else {
      setError('Biometric check failed or was cancelled');
    }
  }

  // A locked screen with no way out except entering the SAME password that
  // just failed (wrong device, forgotten password, handing the till to a
  // different staff member) used to be a dead end. This actually ends the
  // authenticated session — not just a screen swap that leaves it live —
  // so it needs its own confirmation, same as any other sign-out.
  async function confirmSignOut() {
    setBusy(true);
    try { await signOut(); } finally { setBusy(false); setConfirmingSignOut(false); }
  }

  return (
    <div className="fixed inset-0 z-[100] bg-paper text-ink flex flex-col items-center justify-center p-6">
      <div className="w-16 h-16 rounded-full bg-field-50 flex items-center justify-center mb-5">
        {business?.logoUrl ? (
          <img src={business.logoUrl} alt={business.name} className="w-16 h-16 rounded-full object-cover" />
        ) : reason === 'break' ? (
          <Coffee className="w-7 h-7 text-field-600" />
        ) : (
          <Lock className="w-7 h-7 text-field-600" />
        )}
      </div>
      <p className="text-xs font-medium text-slate-500 mb-1">ShopOS{business?.name ? ` · ${business.name}` : ''}</p>
      <h1 className="font-display font-semibold text-xl mb-1">
        {reason === 'break' ? 'POS Locked' : 'Session locked'}
      </h1>
      <p className="text-slate-500 text-sm mb-6 text-center max-w-xs">
        {reason === 'break'
          ? `${profile?.fullName ?? 'This device'} is on a break.`
          : 'Locked after inactivity. Enter your password to continue.'}
      </p>

      <form onSubmit={submit} className="w-full max-w-xs space-y-3">
        <input
          className="input"
          type="password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoFocus
        />
        {error && <p className="text-sm text-rust-600">{error}</p>}
        <button type="submit" disabled={busy || !password} className="btn-primary w-full">
          {busy ? 'Checking…' : 'Resume'}
        </button>
        {bioAvailable && (
          <button type="button" onClick={tryBiometric} className="w-full text-slate-500 text-sm py-1">
            Use biometrics instead
          </button>
        )}
      </form>

      <button
        onClick={() => setConfirmingSignOut(true)}
        className="mt-8 flex items-center gap-1.5 text-sm text-slate-400 hover:text-rust-600"
      >
        <LogOut className="w-4 h-4" /> Sign out
      </button>

      {confirmingSignOut && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-6">
          <div className="absolute inset-0 bg-black/50" onClick={() => setConfirmingSignOut(false)} />
          <div className="relative card p-5 max-w-xs w-full text-center">
            <p className="text-sm font-medium mb-1">Sign out of {profile?.fullName ?? 'this account'}?</p>
            <p className="text-xs text-slate-500 mb-4">This ends the session on this device completely — you'll need to log in again.</p>
            <div className="flex gap-2">
              <button onClick={() => setConfirmingSignOut(false)} className="btn-secondary flex-1">Cancel</button>
              <button onClick={confirmSignOut} disabled={busy} className="btn-primary flex-1 !bg-rust-600 hover:!bg-rust-600">
                {busy ? 'Signing out…' : 'Sign out'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
