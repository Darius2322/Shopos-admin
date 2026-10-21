import { useEffect, useState } from 'react';
import { SupabaseClient } from '@supabase/supabase-js';
import { Save, KeyRound } from 'lucide-react';
import { Card, ErrorText, Skeleton } from '../components/ui';

interface PlatformSettings {
  id: string;
  support_email: string | null;
  support_whatsapp: string | null;
  support_phone: string | null;
}

export default function PlatformSettingsPage({ supabase }: { supabase: SupabaseClient }) {
  const [settings, setSettings] = useState<PlatformSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function load() {
    setLoading(true);
    const { data, error } = await supabase.from('platform_settings').select('*').eq('id', 'default').maybeSingle();
    if (error) setError(error.message);
    setSettings(data ?? { id: 'default', support_email: '', support_whatsapp: '', support_phone: '' });
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  async function save() {
    if (!settings) return;
    setSaving(true); setError(null); setSaved(false);
    try {
      const { error } = await supabase.from('platform_settings').update({
        support_email: settings.support_email || null,
        support_whatsapp: settings.support_whatsapp || null,
        support_phone: settings.support_phone || null
      }).eq('id', 'default');
      if (error) throw error;
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save — has schema_part12.sql been run?');
    } finally { setSaving(false); }
  }

  if (loading || !settings) return <Skeleton />;

  return (
    <div className="max-w-sm space-y-6">
      <ChangePasswordCard supabase={supabase} />
      <div>
      <h2 className="font-display font-semibold text-lg mb-1">Platform settings</h2>
      <p className="text-xs text-slate-400 mb-3">
        Shown on the sign-in, register, and check-status screens of the main app — so an applicant stuck waiting has a way to reach you.
      </p>
      <ErrorText>{error}</ErrorText>
      <Card className="space-y-3 mt-2">
        <label className="block">
          <span className="block text-xs font-medium text-slate-400 mb-1">Support email</span>
          <input className="input" type="email" value={settings.support_email ?? ''} onChange={(e) => setSettings({ ...settings, support_email: e.target.value })} placeholder="support@yourbusiness.com" />
        </label>
        <label className="block">
          <span className="block text-xs font-medium text-slate-400 mb-1">WhatsApp number</span>
          <input className="input" value={settings.support_whatsapp ?? ''} onChange={(e) => setSettings({ ...settings, support_whatsapp: e.target.value })} placeholder="254712345678 (no + or spaces)" />
        </label>
        <label className="block">
          <span className="block text-xs font-medium text-slate-400 mb-1">Phone number</span>
          <input className="input" value={settings.support_phone ?? ''} onChange={(e) => setSettings({ ...settings, support_phone: e.target.value })} placeholder="+254712345678" />
        </label>
        <button onClick={save} disabled={saving} className="btn-primary w-full flex items-center justify-center gap-1.5">
          <Save className="w-4 h-4" /> {saving ? 'Saving…' : saved ? 'Saved' : 'Save settings'}
        </button>
      </Card>
      </div>
    </div>
  );
}

function ChangePasswordCard({ supabase }: { supabase: SupabaseClient }) {
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
      // Verifies the CURRENT password by attempting a fresh sign-in with
      // it, before touching anything — the admin's own session being
      // active isn't proof they still know their password (a device left
      // unlocked, a long-lived session), and this is a platform-admin
      // account, not just any shop user's.
      const { data: { user } } = await supabase.auth.getUser();
      if (!user?.email) throw new Error('No active session');
      const { error: verifyError } = await supabase.auth.signInWithPassword({ email: user.email, password: currentPassword });
      if (verifyError) throw new Error('Current password is incorrect');

      const { error: updateError } = await supabase.auth.updateUser({ password: newPassword });
      if (updateError) throw updateError;

      setCurrentPassword(''); setNewPassword(''); setConfirmPassword('');
      setSuccess(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not change password');
    } finally { setBusy(false); }
  }

  return (
    <div>
      <h2 className="font-display font-semibold text-lg mb-1 flex items-center gap-1.5"><KeyRound className="w-4 h-4" /> Change password</h2>
      <p className="text-xs text-slate-400 mb-3">Your own admin account's sign-in password.</p>
      <Card className="space-y-3">
        <input className="input" type="password" placeholder="Current password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} autoComplete="current-password" />
        <input className="input" type="password" placeholder="New password (min 8 characters)" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} autoComplete="new-password" minLength={8} />
        <input className="input" type="password" placeholder="Confirm new password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} autoComplete="new-password" />
        {error && <p className="text-sm text-rust-500">{error}</p>}
        {success && <p className="text-sm text-field-600">Password changed.</p>}
        <button
          onClick={submit}
          disabled={busy || !currentPassword || newPassword.length < 8 || !confirmPassword}
          className="btn-primary w-full"
        >
          {busy ? 'Changing…' : 'Change password'}
        </button>
      </Card>
    </div>
  );
}
