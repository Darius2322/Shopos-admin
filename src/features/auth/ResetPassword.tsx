import { useEffect, useState } from 'react';
import { CheckCircle2, KeyRound } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { PasswordInput } from '../../components/PasswordInput';

/** Reached only via the link in the password-reset email (see
 * send-password-reset) — Supabase's client automatically reads the
 * recovery token out of the URL on load and establishes a temporary
 * session, which is what authorizes the updateUser() call below. There is
 * no separate "confirm your identity" step here on purpose — clicking the
 * emailed link IS the confirmation. */
export function ResetPassword() {
  const [ready, setReady] = useState(false);
  const [invalid, setInvalid] = useState(false);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!supabase) { setInvalid(true); return; }
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) setReady(true); else setInvalid(true);
    });
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password.length < 8) { setError('Password must be at least 8 characters'); return; }
    if (password !== confirmPassword) { setError("Passwords don't match"); return; }
    setBusy(true);
    try {
      const { error: updateError } = await supabase!.auth.updateUser({ password });
      if (updateError) throw updateError;
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not set new password');
    } finally { setBusy(false); }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-paper p-4">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center mb-8">
          <div className="w-12 h-12 rounded-2xl bg-field-600 flex items-center justify-center text-white mb-3"><KeyRound className="w-5 h-5" /></div>
          <h1 className="font-display font-semibold text-2xl text-center">Set a new password</h1>
        </div>

        {invalid && (
          <div className="card p-5 text-center space-y-2">
            <p className="text-sm text-rust-600">This reset link is invalid or has expired.</p>
            <p className="text-xs text-slate-500">Request a new one from the sign-in screen.</p>
            <a href="/" className="btn-secondary w-full inline-block mt-2">Back to sign in</a>
          </div>
        )}

        {ready && !done && (
          <form onSubmit={submit} className="card p-5 space-y-3.5">
            <label className="block">
              <span className="block text-sm font-medium text-slate-600 mb-1.5">New password</span>
              <PasswordInput value={password} onChange={setPassword} required />
            </label>
            <label className="block">
              <span className="block text-sm font-medium text-slate-600 mb-1.5">Confirm password</span>
              <PasswordInput value={confirmPassword} onChange={setConfirmPassword} required />
            </label>
            {error && <p className="text-sm text-rust-600">{error}</p>}
            <button type="submit" disabled={busy} className="btn-primary w-full">{busy ? 'Saving…' : 'Set password & continue'}</button>
          </form>
        )}

        {done && (
          <div className="card p-5 text-center space-y-3">
            <CheckCircle2 className="w-8 h-8 text-field-600 mx-auto" />
            <p className="text-sm">Password updated.</p>
            <a href="/" className="btn-primary w-full inline-block">Continue to ShopOS</a>
          </div>
        )}
      </div>
    </div>
  );
}
