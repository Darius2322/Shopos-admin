import { useEffect, useState } from 'react';
import { Fingerprint, Timer, KeyRound, Trash2 } from 'lucide-react';
import { useAuth } from '../../lib/auth';
import { biometricsSupported, isBiometricEnabled, enableBiometric, disableBiometric } from '../../lib/webauthn';
import { getAutoLockMinutes, setAutoLockMinutes, verifyPassword } from '../../lib/breaks';
import { supabase } from '../../lib/supabase';
import { db, clearLocalBusinessDataIfSynced } from '../../lib/db';

const AUTO_LOCK_OPTIONS = [
  { minutes: 0, label: 'Never' },
  { minutes: 5, label: '5 minutes' },
  { minutes: 10, label: '10 minutes' },
  { minutes: 15, label: '15 minutes' },
  { minutes: 30, label: '30 minutes' }
];

export function Security() {
  const { profile } = useAuth();
  const [enabled, setEnabled] = useState(false);
  const [supported] = useState(biometricsSupported());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [autoLock, setAutoLock] = useState(getAutoLockMinutes());

  useEffect(() => { isBiometricEnabled().then(setEnabled); }, []);

  async function toggle() {
    setError(null); setBusy(true);
    try {
      if (enabled) {
        await disableBiometric();
        setEnabled(false);
      } else {
        await enableBiometric(profile?.fullName ?? 'ShopOS user');
        setEnabled(true);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update biometric setting');
    } finally { setBusy(false); }
  }

  function changeAutoLock(minutes: number) {
    setAutoLockMinutes(minutes);
    setAutoLock(minutes);
  }

  return (
    <div className="p-4 md:p-8 max-w-lg mx-auto space-y-4">
      <h1 className="font-display text-2xl font-semibold">Security</h1>

      <ChangePasswordCard />
      {profile?.role === 'owner' && <DeviceDataCard />}

      <div className="card p-4">
        <div className="flex items-start gap-3">
          <div className="w-9 h-9 rounded-full bg-field-50 text-field-600 flex items-center justify-center shrink-0">
            <Fingerprint className="w-4.5 h-4.5" />
          </div>
          <div className="flex-1">
            <div className="text-sm font-medium">Biometric confirmation</div>
            <p className="text-xs text-slate-500 mt-0.5">
              Use your device's fingerprint or face unlock to confirm sensitive actions like refund approvals.
              This is a device-level check, not a replacement for your password sign-in.
            </p>
            {!supported && <p className="text-xs text-amber-600 mt-2">Not supported on this device or browser.</p>}
            {error && <p className="text-xs text-rust-600 mt-2">{error}</p>}
            <button onClick={toggle} disabled={!supported || busy} className={enabled ? 'btn-secondary text-sm mt-3' : 'btn-primary text-sm mt-3'}>
              {busy ? 'Please wait…' : enabled ? 'Disable' : 'Enable biometric confirmation'}
            </button>
          </div>
        </div>
      </div>

      <div className="card p-4">
        <div className="flex items-start gap-3 mb-3">
          <div className="w-9 h-9 rounded-full bg-field-50 text-field-600 flex items-center justify-center shrink-0">
            <Timer className="w-4.5 h-4.5" />
          </div>
          <div className="flex-1">
            <div className="text-sm font-medium">Auto-lock</div>
            <p className="text-xs text-slate-500 mt-0.5">Lock this device after a period of inactivity — applies to this device only.</p>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          {AUTO_LOCK_OPTIONS.map((opt) => (
            <button
              key={opt.minutes}
              onClick={() => changeAutoLock(opt.minutes)}
              className={`text-sm py-2 rounded-card border ${autoLock === opt.minutes ? 'border-field-500 bg-field-50 text-field-700' : 'border-slate-200 text-slate-600'}`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function ChangePasswordCard() {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit() {
    setError(null); setSuccess(false);
    if (newPassword.length < 8) { setError('New password must be at least 8 characters'); return; }
    if (newPassword !== confirmPassword) { setError("New passwords don't match"); return; }
    setBusy(true);
    try {
      const { data } = await supabase!.auth.getSession();
      const email = data.session?.user.email;
      if (!email) throw new Error('No active session');
      const ok = await verifyPassword(email, currentPassword);
      if (!ok) throw new Error('Current password is incorrect');

      const { error: updateError } = await supabase!.auth.updateUser({ password: newPassword });
      if (updateError) throw updateError;

      setCurrentPassword(''); setNewPassword(''); setConfirmPassword('');
      setSuccess(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not change password');
    } finally { setBusy(false); }
  }

  return (
    <div className="card p-4">
      <div className="flex items-start gap-3 mb-3">
        <div className="w-9 h-9 rounded-full bg-field-50 text-field-600 flex items-center justify-center shrink-0">
          <KeyRound className="w-4.5 h-4.5" />
        </div>
        <div className="flex-1">
          <div className="text-sm font-medium">Change password</div>
          <p className="text-xs text-slate-500 mt-0.5">Update your own sign-in password.</p>
        </div>
      </div>
      <div className="space-y-2.5">
        <input className="input" type="password" placeholder="Current password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} autoComplete="current-password" />
        <input className="input" type="password" placeholder="New password (min 8 characters)" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} autoComplete="new-password" minLength={8} />
        <input className="input" type="password" placeholder="Confirm new password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} autoComplete="new-password" />
        {error && <p className="text-xs text-rust-600">{error}</p>}
        {success && <p className="text-xs text-field-600">Password changed.</p>}
        <button onClick={submit} disabled={busy || !currentPassword || newPassword.length < 8 || !confirmPassword} className="btn-primary text-sm w-full">
          {busy ? 'Changing…' : 'Change password'}
        </button>
      </div>
    </div>
  );
}

function DeviceDataCard() {
  const { signOut } = useAuth();
  const [pendingCount, setPendingCount] = useState<number | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => { db.syncQueue.count().then(setPendingCount); }, []);

  async function clear() {
    setBusy(true); setStatus(null);
    try {
      const cleared = await clearLocalBusinessDataIfSynced();
      if (!cleared) {
        setStatus("Couldn't clear — this device still has unsynced changes. Connect to the internet and let it finish syncing first.");
        setPendingCount(await db.syncQueue.count());
        return;
      }
      // Clearing the tables out from under a still-active session would
      // leave every list on screen suddenly empty while the app still
      // thinks it's logged in — a broken, confusing half-state. Signing
      // out immediately (signOut() itself just no-ops its own redundant
      // clear-attempt, since the queue is already empty) sends the app
      // back to a normal, correct login screen instead.
      await signOut();
    } finally { setBusy(false); }
  }

  return (
    <div className="card p-4">
      <div className="flex items-start gap-3 mb-3">
        <div className="w-9 h-9 rounded-full bg-slate-100 text-slate-500 flex items-center justify-center shrink-0">
          <Trash2 className="w-4.5 h-4.5" />
        </div>
        <div className="flex-1">
          <div className="text-sm font-medium">Clear cached data on this device</div>
          <p className="text-xs text-slate-500 mt-0.5">
            Removes this shop's sales, customers, and other cached records from THIS device's storage,
            and signs you out. Use this when a shared till or tablet is being handed to a different
            shop or retired — not something to run on a device this business keeps using day to day.
          </p>
        </div>
      </div>
      {pendingCount !== null && pendingCount > 0 && (
        <p className="text-xs text-amber-600 mb-2">{pendingCount} change{pendingCount === 1 ? '' : 's'} on this device haven't synced yet — clearing is blocked until they do, so nothing is lost.</p>
      )}
      {status && <p className="text-xs text-slate-600 mb-2">{status}</p>}
      <button onClick={clear} disabled={busy || pendingCount === null || pendingCount > 0} className="btn-secondary text-sm w-full">
        {busy ? 'Clearing…' : 'Clear this device\u2019s data'}
      </button>
    </div>
  );
}
