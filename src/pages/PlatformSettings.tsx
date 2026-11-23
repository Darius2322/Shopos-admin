import { useEffect, useState } from 'react';
import { SupabaseClient } from '@supabase/supabase-js';
import { Save, KeyRound } from 'lucide-react';
import { Card, ErrorText, Skeleton } from '../components/ui';
import { LegalEditor } from '../components/LegalEditor';
import { askConfirm } from '../lib/dialog';

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
  const [sub, setSub] = useState<'support' | 'maintenance' | 'landing' | 'legal' | 'security'>('support');

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
    <div className="max-w-md space-y-5">
      <div role="tablist" aria-label="Platform settings" className="flex gap-1.5 overflow-x-auto pb-1">
        {([['support', 'Support contacts'], ['maintenance', 'Maintenance'], ['landing', 'Landing page'], ['legal', 'Legal pages'], ['security', 'My account']] as const).map(([k, l]) => (
          <button key={k} role="tab" aria-selected={sub === k} onClick={() => setSub(k)} className={`whitespace-nowrap text-xs font-medium rounded-full px-3 py-1.5 border ${sub === k ? 'bg-field-600 border-field-600 text-white' : 'border-slate-700 text-slate-400 hover:text-ink'}`}>{l}</button>
        ))}
      </div>
      {sub === 'maintenance' && <MaintenanceCard supabase={supabase} />}
      {sub === 'legal' && <LegalEditor supabase={supabase} />}
      {sub === 'landing' && <PublicFiguresCard supabase={supabase} />}
      {sub === 'security' && <ChangePasswordCard supabase={supabase} />}
      {sub === 'support' && <div>
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
      </div>}
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

interface SchedRow { id: string; action: 'close' | 'open'; whole: boolean; parts: string[]; run_at: string; message: string | null; back_at: string | null; status: 'pending' | 'done' | 'cancelled'; done_at: string | null }

/** Plan a closing or opening for a chosen time. The database applies it automatically within a minute of that time. */
function ScheduleTab({ supabase, PartList }: { supabase: SupabaseClient; PartList: (p: { value: string[]; onChange: (v: string[]) => void; disabled?: boolean }) => JSX.Element }) {
  const [rows, setRows] = useState<SchedRow[] | null>(null);
  const [action, setAction] = useState<'close' | 'open'>('close');
  const [whole, setWhole] = useState(false);
  const [parts, setParts] = useState<string[]>([]);
  const [at, setAt] = useState('');
  const [msg, setMsg] = useState('');
  const [back, setBack] = useState('');
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  async function load() {
    const { data } = await supabase.rpc('admin_maint_schedule_list');
    setRows((data ?? []) as SchedRow[]);
  }
  useEffect(() => { void load(); const t = setInterval(() => void load(), 30_000); return () => clearInterval(t); }, []);
  async function add() {
    setNote(null);
    if (!at) { setNote('Pick the date and time.'); return; }
    if (!whole && parts.length === 0) { setNote('Switch on the whole app or at least one part.'); return; }
    setBusy(true);
    const { error } = await supabase.rpc('admin_maint_schedule_add', { p_action: action, p_whole: whole, p_parts: parts, p_run_at: new Date(at).toISOString(), p_message: action === 'close' ? msg : '', p_back_at: action === 'close' && back ? new Date(back).toISOString() : null });
    setBusy(false);
    if (error) { setNote(error.message.includes('future') ? 'Pick a time in the future.' : 'Could not schedule that. Please try again.'); return; }
    setNote('Scheduled. It will apply by itself at that time.'); setWhole(false); setParts([]); setAt(''); setMsg(''); setBack(''); void load();
  }
  async function cancel(id: string) {
    if (!(await askConfirm('Cancel this scheduled change?'))) return;
    await supabase.rpc('admin_maint_schedule_cancel', { p_id: id }); void load();
  }
  const label = (r: SchedRow) => `${r.action === 'close' ? 'Close' : 'Open'} ${r.whole ? 'the whole app' : r.parts.map((k) => PARTS.find(([x]) => x === k)?.[1] ?? k).join(', ')}`;
  const pending = (rows ?? []).filter((r) => r.status === 'pending').sort((a, b) => a.run_at.localeCompare(b.run_at));
  const past = (rows ?? []).filter((r) => r.status !== 'pending').slice(0, 10);
  return (
    <div className="space-y-3">
      <Card className="space-y-3">
        <p className="font-medium text-sm">Schedule a change</p>
        <div className="flex gap-2">
          {(['close', 'open'] as const).map((k) => <button key={k} onClick={() => setAction(k)} className={`px-4 py-1.5 rounded-lg text-sm border ${action === k ? 'bg-field-600 border-field-600 text-paper' : 'border-slate-600 text-slate-400'}`}>{k === 'close' ? 'Close' : 'Open'}</button>)}
        </div>
        <div className="flex items-center justify-between gap-3 py-1 border-b border-slate-800/60">
          <span className="text-sm">The whole app<span className="block text-[11px] text-slate-500">{action === 'close' ? 'Closes everything for everyone.' : 'Opens everything again, including all closed parts.'}</span></span>
          <button role="switch" aria-checked={whole} aria-label="The whole app" onClick={() => setWhole(!whole)} className={`relative inline-flex h-7 w-12 shrink-0 rounded-full transition-colors ${whole ? 'bg-amber-600' : 'bg-slate-600'}`}><span className={`absolute top-0.5 left-0.5 h-6 w-6 rounded-full bg-white transition-transform ${whole ? 'translate-x-5' : ''}`} /></button>
        </div>
        {!whole && <div><p className="text-xs text-slate-400 mb-1">Or only these parts (switch on the ones to {action})</p><PartList value={parts} onChange={setParts} /></div>}
        <label className="block"><span className="block text-xs text-slate-400 mb-1">When</span><input className="input" type="datetime-local" value={at} onChange={(e) => setAt(e.target.value)} /></label>
        {action === 'close' && <>
          <label className="block"><span className="block text-xs text-slate-400 mb-1">Message shown to shops (optional)</span><input className="input" maxLength={300} value={msg} onChange={(e) => setMsg(e.target.value)} placeholder="We are updating ShopOS. Back shortly." /></label>
          <label className="block"><span className="block text-xs text-slate-400 mb-1">Back around (optional)</span><input className="input" type="datetime-local" value={back} onChange={(e) => setBack(e.target.value)} /></label>
        </>}
        {note && <p className="text-sm text-slate-300" role="status">{note}</p>}
        <button onClick={() => void add()} disabled={busy} className="btn-primary text-sm">{busy ? 'Scheduling…' : 'Schedule it'}</button>
      </Card>
      <Card className="space-y-2">
        <p className="font-medium text-sm">Coming up</p>
        {rows === null ? <Skeleton /> : pending.length === 0 ? <p className="text-xs text-slate-400">Nothing is scheduled.</p> : (
          <ul className="divide-y divide-slate-800">{pending.map((r) => (
            <li key={r.id} className="py-2 flex items-center justify-between gap-3 text-sm">
              <div><p>{label(r)}</p><p className="text-xs text-slate-400">{new Date(r.run_at).toLocaleString()}{r.message ? ` · "${r.message}"` : ''}</p></div>
              <button onClick={() => void cancel(r.id)} className="btn-secondary text-xs shrink-0">Cancel</button>
            </li>))}</ul>
        )}
      </Card>
      {past.length > 0 && <Card className="space-y-2">
        <p className="font-medium text-sm">Done or cancelled</p>
        <ul className="divide-y divide-slate-800">{past.map((r) => <li key={r.id} className="py-2 text-sm flex items-center justify-between gap-3"><span>{label(r)}</span><span className={`text-xs ${r.status === 'done' ? 'text-emerald-400' : 'text-slate-500'}`}>{r.status === 'done' ? 'Done' : 'Cancelled'} · {new Date(r.done_at ?? r.run_at).toLocaleString()}</span></li>)}</ul>
      </Card>}
    </div>
  );
}

const PARTS: [string, string][] = [
  ['sales', 'Selling (POS and sales)'], ['payments', 'M-Pesa and payments'], ['reports', 'Reports and analytics'], ['stock', 'Stock and products'],
  ['packages', 'Packages and plans'], ['customers', 'Customers and debts'], ['documents', 'Quotations and invoices'], ['suppliers', 'Suppliers and expenses'],
  ['staff', 'Staff and users'], ['partners', 'Reseller / partner programme'], ['support', 'Support and help'], ['loyalty', 'Loyalty and rewards'], ['kra', 'KRA and tax (PIN)'], ['demo', 'Demo (practice shop)'],
];
const partLabel = (k: string) => PARTS.find(([p]) => p === k)?.[1] ?? k;
const when = (s: string | null) => (s ? new Date(s).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }) : '');
// A "back around" time is only worth showing while it is still ahead of us.
const futureLocal = (s: string | null | undefined) => (s && new Date(s).getTime() > Date.now() ? new Date(new Date(s).getTime() - new Date(s).getTimezoneOffset() * 60000).toISOString().slice(0, 16) : '');

interface BizRow { business_id: string; name: string; closed: boolean; parts: string[]; message: string | null; back_at: string | null; updated_at: string }
interface HistRow { id: number; scope: 'app' | 'business'; action: string; closed: boolean; parts: string[]; message: string | null; back_at: string | null; created_at: string; business_name: string | null }
interface Overview { businesses: BizRow[]; history: HistRow[] }

/** Close the main app, or one business, or parts of either, for maintenance. Shops see a calm notice; nothing is lost. */
function MaintenanceCard({ supabase }: { supabase: SupabaseClient }) {
  const [tab, setTab] = useState<'app' | 'business' | 'schedule' | 'history'>('app');
  const [ov, setOv] = useState<Overview>({ businesses: [], history: [] });
  const [shops, setShops] = useState<{ id: string; name: string }[]>([]);
  const [demoOpen, setDemoOpen] = useState(true);
  const [app, setApp] = useState<{ closed: boolean; parts: string[]; message: string; backAt: string }>({ closed: false, parts: [], message: '', backAt: '' });
  const [bk, setBk] = useState<{ open: boolean; message: string; backAt: string }>({ open: true, message: '', backAt: '' });
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  // "A business" form
  const [bizId, setBizId] = useState('');
  const [wholeBiz, setWholeBiz] = useState(false);
  const [bParts, setBParts] = useState<string[]>([]);
  const [bMsg, setBMsg] = useState('');
  const [bBack, setBBack] = useState('');

  async function load() {
    const [{ data: s }, { data: o }] = await Promise.all([supabase.rpc('app_status'), supabase.rpc('admin_maintenance_overview')]);
    const d = s as { closed?: boolean; parts?: string[]; message?: string | null; back_at?: string | null; demo_open?: boolean; bookings_open?: boolean; bookings_message?: string | null; bookings_back_at?: string | null } | null;
    if (d) { setBk({ open: d.bookings_open !== false, message: d.bookings_message ?? '', backAt: futureLocal(d.bookings_back_at) }); setDemoOpen(d.demo_open !== false); setApp({ closed: !!d.closed, parts: d.parts ?? [], message: d.message ?? '', backAt: futureLocal(d.back_at) }); }
    if (o) setOv(o as Overview);
    setLoaded(true);
  }
  useEffect(() => {
    void load();
    void supabase.from('businesses').select('id, name').is('deleted_at', null).order('name').limit(1000).then(({ data }) => setShops((data ?? []) as { id: string; name: string }[]));
  }, []);

  const touched = () => window.dispatchEvent(new Event('shopos-status'));
  async function saveApp(nextClosed: boolean, nextParts = app.parts) {
    setBusy(true); setMsg(null);
    const { error } = await supabase.rpc('admin_set_maintenance', { p_closed: nextClosed, p_parts: nextParts, p_message: app.message, p_back_at: app.backAt ? new Date(app.backAt).toISOString() : null });
    setBusy(false);
    if (error) { setMsg('Could not save. Please try again.'); return; }
    touched();
    const open = !nextClosed && nextParts.length === 0;
    // Once everything is open the old message and time are cleared, so the next closing starts clean.
    setApp({ closed: nextClosed, parts: nextParts, message: open ? '' : app.message, backAt: open ? '' : app.backAt });
    setMsg(nextClosed ? 'The whole app is now closed for everyone.' : nextParts.length ? 'Saved. The parts switched to Closed are now closed.' : 'Saved. The app is open.');
    void load();
  }
  async function saveBiz(closed: boolean, parts: string[]) {
    if (!bizId) { setMsg('Pick a business first.'); return; }
    setBusy(true); setMsg(null);
    const { error } = await supabase.rpc('admin_set_business_maintenance', { p_business_id: bizId, p_closed: closed, p_parts: parts, p_message: bMsg, p_back_at: bBack ? new Date(bBack).toISOString() : null });
    setBusy(false);
    if (error) { setMsg('Could not save. Please try again.'); return; }
    touched();
    setMsg(closed || parts.length ? 'Saved. That business now sees the notice.' : 'Saved. That business is open.');
    if (!closed && !parts.length) { setWholeBiz(false); setBParts([]); setBMsg(''); setBBack(''); }
    void load();
  }
  async function openBiz(id: string) {
    setBusy(true); setMsg(null);
    const { error } = await supabase.rpc('admin_set_business_maintenance', { p_business_id: id, p_closed: false, p_parts: [], p_message: '', p_back_at: null });
    setBusy(false);
    if (error) { setMsg('Could not open it. Please try again.'); return; }
    touched(); setMsg('That business is open again.');
    if (id === bizId) { setWholeBiz(false); setBParts([]); setBMsg(''); setBBack(''); }
    void load();
  }
  function pickBiz(id: string) {
    setBizId(id);
    const r = ov.businesses.find((b) => b.business_id === id);
    setWholeBiz(!!r?.closed); setBParts(r?.parts ?? []); setBMsg(r?.message ?? ''); setBBack(futureLocal(r?.back_at));
  }
  async function saveBookings(open: boolean) {
    setBusy(true); setMsg(null);
    const { error } = await supabase.rpc('admin_set_bookings_open', { p_open: open, p_message: bk.message, p_back_at: bk.backAt ? new Date(bk.backAt).toISOString() : null });
    setBusy(false);
    if (error) { setMsg('Could not change the booking app. Please try again.'); return; }
    touched(); setBk({ open, message: open ? '' : bk.message, backAt: open ? '' : bk.backAt });
    setMsg(open ? 'The booking app is open.' : 'The booking app is closed. Customers see your message and cannot book.');
  }
  async function toggleDemo(next: boolean) {
    setBusy(true); setMsg(null);
    const { error } = await supabase.rpc('admin_set_demo', { p_open: next });
    setBusy(false);
    if (error) { setMsg('Could not change the demo. Please try again.'); return; }
    setDemoOpen(next); touched(); setMsg(next ? 'The demo is open.' : 'The demo is closed. Visitors cannot start it.');
  }
  if (!loaded) return null;

  const PartList = ({ value, onChange, disabled }: { value: string[]; onChange: (v: string[]) => void; disabled?: boolean }) => (
    <div className="grid sm:grid-cols-2 gap-x-6">
      {PARTS.map(([k, label]) => {
        const closed = value.includes(k);
        return (
          <div key={k} className="flex items-center justify-between gap-3 py-2 border-b border-slate-800/60">
            <span className="text-sm">{label}<span className={`block text-[11px] ${closed ? 'text-amber-500' : 'text-slate-500'}`}>{closed ? 'Closed' : 'Open'}</span></span>
            <button role="switch" aria-checked={closed} disabled={disabled} aria-label={`${label}: ${closed ? 'closed' : 'open'}`} onClick={() => onChange(closed ? value.filter((x) => x !== k) : [...value, k])}
              className={`relative inline-flex h-7 w-12 shrink-0 rounded-full transition-colors disabled:opacity-60 ${closed ? 'bg-amber-600' : 'bg-slate-600'}`}><span className={`absolute top-0.5 left-0.5 h-6 w-6 rounded-full bg-white transition-transform ${closed ? 'translate-x-5' : ''}`} /></button>
          </div>
        );
      })}
    </div>
  );
  const tabs: ['app' | 'business' | 'schedule' | 'history', string][] = [['app', 'Whole app'], ['business', `A business${ov.businesses.length ? ` (${ov.businesses.length})` : ''}`], ['schedule', 'Schedule'], ['history', 'History']];

  return (
    <div>
      <h2 className="font-display font-semibold text-lg mb-1">Maintenance</h2>
      <p className="text-xs text-slate-400 mb-3">Close the whole app, one business, or only some parts, while you update ShopOS. Shops see your message instead. It takes up to a minute to reach open devices. Shops with no internet keep their last known setting.</p>
      <div className="flex gap-1 mb-3 overflow-x-auto">
        {tabs.map(([k, label]) => (
          <button key={k} onClick={() => { setTab(k); setMsg(null); }} className={`px-3 py-1.5 rounded-lg text-sm whitespace-nowrap ${tab === k ? 'bg-field-600 text-paper' : 'text-slate-400 hover:bg-slate-800'}`}>{label}</button>
        ))}
      </div>

      {tab === 'app' && (
        <Card className="space-y-3">
          <div className={`rounded-lg p-3 text-sm ${app.closed ? 'bg-rust-500/15 text-rust-500' : app.parts.length ? 'bg-amber-500/15 text-amber-500' : 'bg-field-600/15 text-field-600'}`}>
            {app.closed ? 'The whole app is CLOSED.' : app.parts.length ? `Open, with ${app.parts.length} part${app.parts.length === 1 ? '' : 's'} closed.` : 'The app is open.'}
            {!app.closed && app.parts.length > 0 && <div className="flex flex-wrap gap-1.5 mt-2">{app.parts.map((k) => <span key={k} className="text-xs rounded-full bg-amber-500/20 px-2.5 py-0.5">{PARTS.find(([x]) => x === k)?.[1] ?? k}</span>)}</div>}
          </div>
          <div><p className="text-xs text-slate-400 mb-1">Close only these parts, for everyone</p><PartList value={app.parts} disabled={busy} onChange={(v) => { setApp({ ...app, parts: v }); void saveApp(app.closed, v); }} /></div>
          <label className="block"><span className="block text-xs text-slate-400 mb-1">Message shown to shops (optional, saved when you leave the box)</span><input className="input" maxLength={300} value={app.message} onBlur={() => { if (app.closed || app.parts.length) void saveApp(app.closed); }} onChange={(e) => setApp({ ...app, message: e.target.value })} placeholder="We are updating ShopOS. Back shortly." /></label>
          <label className="block"><span className="block text-xs text-slate-400 mb-1">Back around (optional)</span><input className="input" type="datetime-local" value={app.backAt} onBlur={() => { if (app.closed || app.parts.length) void saveApp(app.closed); }} onChange={(e) => setApp({ ...app, backAt: e.target.value })} /></label>
          <div className="flex items-center justify-between gap-3 rounded-lg border border-slate-700 p-3">
            <div className="min-w-0"><p className="text-sm font-medium">Demo</p><p className="text-xs text-slate-400">{demoOpen ? 'Open: anyone can try the practice shop.' : 'Closed: the Try the demo buttons stop working.'}</p></div>
            {demoOpen
              ? <button onClick={() => void toggleDemo(false)} disabled={busy} className="btn-secondary text-xs shrink-0">Close the demo</button>
              : <button onClick={() => void toggleDemo(true)} disabled={busy} className="btn-primary text-xs shrink-0">Open the demo</button>}
          </div>
          <div className="rounded-lg border border-slate-700 p-3 space-y-2">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0"><p className="text-sm font-medium">Booking app (ShopOS Book)</p><p className="text-xs text-slate-400">{bk.open ? 'Open: customers can see business pages and book.' : 'Closed: booking pages show your notice and nobody can make a booking. Owners keep their data.'}</p></div>
              <button role="switch" aria-checked={bk.open} aria-label="Booking app on or off" disabled={busy} onClick={() => { if (bk.open) { void (async () => { if (await askConfirm('Close the booking app for every business and customer now?')) void saveBookings(false); })(); } else void saveBookings(true); }} className={`relative inline-flex h-7 w-12 shrink-0 rounded-full transition-colors disabled:opacity-50 ${bk.open ? 'bg-emerald-600' : 'bg-slate-600'}`}><span className={`absolute top-0.5 left-0.5 h-6 w-6 rounded-full bg-white transition-transform ${bk.open ? 'translate-x-5' : ''}`} /></button>
            </div>
            {!bk.open && <>
              <input className="input" maxLength={300} value={bk.message} onChange={(e) => setBk({ ...bk, message: e.target.value })} placeholder="Message customers see (optional)" />
              <input className="input" type="datetime-local" value={bk.backAt} onChange={(e) => setBk({ ...bk, backAt: e.target.value })} aria-label="Back around" />
              <button onClick={() => void saveBookings(false)} disabled={busy} className="btn-secondary text-xs">Save message</button>
            </>}
          </div>
          {msg && <p className="text-sm text-slate-300" role="status">{msg}</p>}
          <div className="flex flex-wrap gap-2">
            {app.closed || app.parts.length > 0
              ? <button onClick={() => void saveApp(false, [])} disabled={busy} className="btn-primary text-sm">Open everything again</button>
              : null}
            {!app.closed && <button onClick={async () => { if (await askConfirm('Close the WHOLE app for every business now?')) void saveApp(true); }} disabled={busy} className="text-sm px-3 py-2 rounded-lg bg-rust-500 text-white">Close the whole app</button>}
          </div>
        </Card>
      )}

      {tab === 'schedule' && <ScheduleTab supabase={supabase} PartList={PartList} />}

      {tab === 'business' && (
        <div className="space-y-3">
          <Card className="space-y-3">
            <label className="block"><span className="block text-xs text-slate-400 mb-1">Business</span>
              <select className="input" value={bizId} onChange={(e) => pickBiz(e.target.value)}>
                <option value="">Choose a business…</option>
                {shops.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </label>
            {bizId && (<>
              <div className="flex items-center justify-between gap-3 py-1"><span className="text-sm">Close the whole business<span className={`block text-[11px] ${wholeBiz ? 'text-amber-500' : 'text-slate-500'}`}>{wholeBiz ? 'Closed' : 'Open'}</span></span><button role="switch" aria-checked={wholeBiz} aria-label="Close the whole business" onClick={() => setWholeBiz(!wholeBiz)} className={`relative inline-flex h-7 w-12 shrink-0 rounded-full transition-colors ${wholeBiz ? 'bg-amber-600' : 'bg-slate-600'}`}><span className={`absolute top-0.5 left-0.5 h-6 w-6 rounded-full bg-white transition-transform ${wholeBiz ? 'translate-x-5' : ''}`} /></button></div>
              {!wholeBiz && <div><p className="text-xs text-slate-400 mb-1">Or close only these parts, for this business</p><PartList value={bParts} onChange={setBParts} /></div>}
              <label className="block"><span className="block text-xs text-slate-400 mb-1">Message to this business (optional)</span><input className="input" maxLength={300} value={bMsg} onChange={(e) => setBMsg(e.target.value)} placeholder="We are fixing something on your account." /></label>
              <label className="block"><span className="block text-xs text-slate-400 mb-1">Back around (optional)</span><input className="input" type="datetime-local" value={bBack} onChange={(e) => setBBack(e.target.value)} /></label>
              <div className="flex flex-wrap gap-2">
                <button onClick={() => void saveBiz(wholeBiz, wholeBiz ? [] : bParts)} disabled={busy || (!wholeBiz && bParts.length === 0)} className="btn-primary text-sm">Save for this business</button>
                <button onClick={() => void openBiz(bizId)} disabled={busy} className="btn-secondary text-sm">Open this business</button>
              </div>
            </>)}
            {msg && <p className="text-sm text-slate-300" role="status">{msg}</p>}
          </Card>
          <Card className="space-y-2">
            <p className="text-sm font-medium">Closed right now</p>
            {ov.businesses.length === 0 && <p className="text-xs text-slate-400">No single business is closed.</p>}
            {ov.businesses.map((b) => (
              <div key={b.business_id} className="flex items-start justify-between gap-3 rounded-lg border border-slate-700 p-3">
                <button className="min-w-0 text-left" onClick={() => { setBizId(b.business_id); pickBiz(b.business_id); }}>
                  <p className="text-sm font-medium truncate">{b.name}</p>
                  <p className="text-xs text-slate-400">{b.closed ? 'Whole business closed' : `Closed: ${b.parts.map(partLabel).join(', ')}`}</p>
                  {b.message && <p className="text-xs text-slate-500 truncate">“{b.message}”</p>}
                </button>
                <button onClick={() => void openBiz(b.business_id)} disabled={busy} className="btn-secondary text-xs shrink-0">Open</button>
              </div>
            ))}
          </Card>
        </div>
      )}

      {tab === 'history' && (
        <Card className="space-y-2">
          {ov.history.length === 0 && <p className="text-xs text-slate-400">Nothing yet. Every closing and opening will be listed here.</p>}
          {ov.history.map((h) => {
            const what = h.action === 'opened' ? 'Opened' : h.action === 'partial' ? 'Parts closed' : h.action === 'closed' ? 'Closed' : 'Updated';
            const tone = h.action === 'opened' ? 'text-field-600' : h.action === 'updated' ? 'text-slate-300' : 'text-rust-500';
            return (
              <div key={h.id} className="rounded-lg border border-slate-700 p-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm"><span className={`font-medium ${tone}`}>{what}</span> · {h.scope === 'app' ? 'Whole app' : h.business_name ?? 'A business'}</p>
                  <p className="text-xs text-slate-400 shrink-0">{when(h.created_at)}</p>
                </div>
                {h.parts?.length > 0 && <p className="text-xs text-slate-400 mt-0.5">{h.parts.map(partLabel).join(', ')}</p>}
                {h.message && <p className="text-xs text-slate-500 mt-0.5">“{h.message}”</p>}
                {h.back_at && <p className="text-xs text-slate-500">Back around {when(h.back_at)}</p>}
              </div>
            );
          })}
        </Card>
      )}
    </div>
  );
}
