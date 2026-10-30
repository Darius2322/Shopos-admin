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
      <MaintenanceCard supabase={supabase} />
      <PublicFiguresCard supabase={supabase} />
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

interface PubSettings { show_businesses: boolean; show_sales: boolean; show_transactions: boolean; show_mpesa: boolean }
function PublicFiguresCard({ supabase }: { supabase: SupabaseClient }) {
  const [v, setV] = useState<PubSettings | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => { void supabase.rpc('admin_get_public_stats_settings').then(({ data }) => { if (data) setV(data as PubSettings); }); }, []);
  async function change(next: PubSettings) {
    setV(next); setMsg(null);
    const { error } = await supabase.rpc('admin_set_public_stats_settings', { p_businesses: next.show_businesses, p_sales: next.show_sales, p_transactions: next.show_transactions, p_mpesa: next.show_mpesa });
    setMsg(error ? 'Could not save. Please try again.' : 'Saved.');
  }
  if (!v) return null;
  const rows: [keyof PubSettings, string, string][] = [
    ['show_businesses', 'Number of businesses', 'How many active businesses use ShopOS.'],
    ['show_sales', 'Sales recorded', 'Total number of sales rung up on the platform.'],
    ['show_transactions', 'Receipts this month', 'How many sales were made this calendar month.'],
    ['show_mpesa', 'M-Pesa payments received', 'How many M-Pesa payments ShopOS has confirmed.'],
  ];
  return (
    <div>
      <h2 className="font-display font-semibold text-lg mb-1">Figures on the landing page</h2>
      <p className="text-xs text-slate-400 mb-3">Only counts are ever shown. No business names, no money amounts and no customer details. Switch any figure off here.</p>
      <Card className="space-y-2">
        {rows.map(([k, label, hint]) => (
          <label key={k} className="flex items-start gap-3 py-1 cursor-pointer">
            <input type="checkbox" className="mt-1" checked={v[k]} onChange={(e) => void change({ ...v, [k]: e.target.checked })} />
            <span><span className="block text-sm font-medium">{label}</span><span className="block text-xs text-slate-400">{hint}</span></span>
          </label>
        ))}
        {msg && <p className="text-xs text-slate-400" role="status">{msg}</p>}
      </Card>
    </div>
  );
}

const PARTS: [string, string][] = [['sales', 'Selling (POS and sales)'], ['payments', 'M-Pesa and payments'], ['reports', 'Reports and analytics'], ['stock', 'Stock and products'], ['packages', 'Packages and plans']];
/** Close the main app (or parts of it) for maintenance. Shops see a calm notice; nothing is lost. */
function MaintenanceCard({ supabase }: { supabase: SupabaseClient }) {
  const [closed, setClosed] = useState(false);
  const [parts, setParts] = useState<string[]>([]);
  const [message, setMessage] = useState('');
  const [backAt, setBackAt] = useState('');
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => {
    void supabase.rpc('app_status').then(({ data }) => {
      const d = data as { closed?: boolean; parts?: string[]; message?: string | null; back_at?: string | null } | null;
      if (d) { setClosed(!!d.closed); setParts(d.parts ?? []); setMessage(d.message ?? ''); setBackAt(d.back_at ? new Date(d.back_at).toISOString().slice(0, 16) : ''); }
      setLoaded(true);
    });
  }, []);
  async function save(nextClosed = closed) {
    setBusy(true); setMsg(null);
    const { error } = await supabase.rpc('admin_set_maintenance', { p_closed: nextClosed, p_parts: parts, p_message: message, p_back_at: backAt ? new Date(backAt).toISOString() : null });
    setBusy(false);
    if (error) { setMsg('Could not save. Please try again.'); return; }
    setClosed(nextClosed); setMsg(nextClosed ? 'The whole app is now closed for everyone.' : parts.length ? 'Saved. The ticked parts are closed.' : 'Saved. The app is open.');
  }
  if (!loaded) return null;
  return (
    <div>
      <h2 className="font-display font-semibold text-lg mb-1">Maintenance</h2>
      <p className="text-xs text-slate-400 mb-3">Close the whole app, or only some parts, while you update ShopOS. Shops see your message instead. It takes up to a minute to reach open devices. Shops with no internet keep their last known setting.</p>
      <Card className="space-y-3">
        <div className={`rounded-lg p-3 text-sm ${closed ? 'bg-rust-500/15 text-rust-500' : parts.length ? 'bg-amber-500/15 text-amber-500' : 'bg-field-600/15 text-field-600'}`}>
          {closed ? 'The whole app is CLOSED.' : parts.length ? `Open, with ${parts.length} part${parts.length === 1 ? '' : 's'} closed.` : 'The app is open.'}
        </div>
        <div>
          <p className="text-xs text-slate-400 mb-1">Close only these parts</p>
          {PARTS.map(([k, label]) => (
            <label key={k} className="flex items-center gap-2 py-1 text-sm cursor-pointer"><input type="checkbox" checked={parts.includes(k)} onChange={(e) => setParts(e.target.checked ? [...parts, k] : parts.filter((x) => x !== k))} /> {label}</label>
          ))}
        </div>
        <label className="block"><span className="block text-xs text-slate-400 mb-1">Message shown to shops (optional)</span><input className="input" maxLength={300} value={message} onChange={(e) => setMessage(e.target.value)} placeholder="We are updating ShopOS. Back shortly." /></label>
        <label className="block"><span className="block text-xs text-slate-400 mb-1">Back around (optional)</span><input className="input" type="datetime-local" value={backAt} onChange={(e) => setBackAt(e.target.value)} /></label>
        {msg && <p className="text-sm text-slate-300" role="status">{msg}</p>}
        <div className="flex flex-wrap gap-2">
          <button onClick={() => void save(closed)} disabled={busy} className="btn-secondary text-sm">Save parts and message</button>
          {closed
            ? <button onClick={() => void save(false)} disabled={busy} className="btn-primary text-sm">Open the app again</button>
            : <button onClick={() => { if (window.confirm('Close the WHOLE app for every business now?')) void save(true); }} disabled={busy} className="text-sm px-3 py-2 rounded-lg bg-rust-500 text-white">Close the whole app</button>}
        </div>
      </Card>
    </div>
  );
}
