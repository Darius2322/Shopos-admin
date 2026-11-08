import { useCallback, useEffect, useState } from 'react';
import { SupabaseClient } from '@supabase/supabase-js';
import { Check, X, Copy, KeyRound, Plus, ExternalLink, Pause, Play } from 'lucide-react';
import { Card, ErrorText, Skeleton, EmptyState } from '../components/ui';
import { friendlyError } from '../lib/friendlyError';

const KINDS: [string, string][] = [['salon', 'Salon'], ['barbershop', 'Barbershop'], ['beauty', 'Beauty studio'], ['spa', 'Spa & massage'], ['bus', 'Bus & shuttle'], ['clinic', 'Clinic'], ['carwash', 'Car wash'], ['fitness', 'Fitness & classes'], ['custom', 'Custom']];
const DEFAULT_PASSWORD = 'Shopos 001';
const SITE = 'https://www.shopos.co.ke';
interface App { id: string; business_name: string; kind: string; contact_name: string; phone: string; email: string | null; city: string | null; message: string | null; status: string; created_at: string }
interface AllRow { id: string; code: string; customer_name: string; customer_phone: string; starts_at: string; status: string; price: number; paid: boolean; seats: number; bk_businesses: { name: string } | null }
interface Biz { id: string; slug: string; name: string; kind: string; status: string; city: string | null; phone: string | null; email: string | null; created_at: string; bookings: number }

/** Bookings: review applications, create a business with its owner's sign-in, pause or reset. Each owner runs the rest from /book-manage. */
export default function Bookings({ supabase, view }: { supabase: SupabaseClient; view: 'apps' | 'biz' | 'bookings' }) {
  const tab = view;
  const [all, setAll] = useState<AllRow[] | null>(null);
  const [q, setQ] = useState('');
  const [apps, setApps] = useState<App[] | null>(null);
  const [biz, setBiz] = useState<Biz[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [form, setForm] = useState<{ open: boolean; appId?: string; name: string; kind: string; email: string; phone: string; city: string; password: string }>({ open: false, name: '', kind: 'salon', email: '', phone: '', city: '', password: DEFAULT_PASSWORD });
  const [busy, setBusy] = useState(false);
  const [reset, setReset] = useState<{ id: string; name: string; pw: string } | null>(null);

  const load = useCallback(async () => {
    const [a, b, c] = await Promise.all([
      supabase.from('bk_applications').select('*').order('created_at', { ascending: false }).limit(200),
      supabase.from('bk_businesses').select('id, slug, name, kind, status, city, phone, email, created_at').order('created_at', { ascending: false }),
      supabase.from('bk_bookings').select('business_id').limit(20000),
    ]);
    if (a.error || b.error) { setErr(friendlyError(a.error ?? b.error, 'Could not load bookings. Has the phase34 SQL been applied?')); return; }
    const counts: Record<string, number> = {};
    for (const r of (c.data ?? []) as { business_id: string }[]) counts[r.business_id] = (counts[r.business_id] ?? 0) + 1;
    setApps((a.data ?? []) as App[]); setBiz(((b.data ?? []) as Omit<Biz, 'bookings'>[]).map((x) => ({ ...x, bookings: counts[x.id] ?? 0 })));
  }, [supabase]);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    if (view !== 'bookings') return;
    void supabase.from('bk_bookings').select('id, code, customer_name, customer_phone, starts_at, status, price, paid, seats, bk_businesses(name)').order('starts_at', { ascending: false }).limit(300).then(({ data }) => setAll((data ?? []) as unknown as AllRow[]));
  }, [supabase, view]);

  async function call(body: Record<string, unknown>) {
    const { data, error } = await supabase.functions.invoke('bk-admin-owner', { body });
    if (error) {
      let m = 'Request failed';
      try { m = (await (error as { context?: Response }).context?.json())?.error ?? m; } catch { /* keep default */ }
      throw new Error(m);
    }
    return data as Record<string, string>;
  }

  async function create() {
    setBusy(true); setMsg(null); setErr(null);
    try {
      const r = await call({ action: 'create', name: form.name, kind: form.kind, ownerEmail: form.email, password: form.password, phone: form.phone, city: form.city, applicationId: form.appId });
      setMsg(r.existing ? `Created. Page: ${SITE}/book/${r.slug} · ${r.email} already had a ShopOS account, so the booking business was added to it. They sign in with their usual password and open ${SITE}/book-manage` : `Created. Page: ${SITE}/book/${r.slug} · Owner sign-in: ${r.email} / ${form.password} · Dashboard: ${SITE}/book-manage`);
      setForm({ ...form, open: false, appId: undefined, name: '', email: '', phone: '', city: '', password: DEFAULT_PASSWORD });
      await load();
    } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  }
  async function doReset() {
    if (!reset) return; setBusy(true); setErr(null);
    try { await call({ action: 'reset', businessId: reset.id, password: reset.pw }); setMsg(`Password for ${reset.name} is now “${reset.pw}”. Share it with the owner.`); setReset(null); } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  }
  async function setStatus(id: string, status: string) { await supabase.from('bk_businesses').update({ status }).eq('id', id); await load(); }
  async function rejectApp(id: string) { await supabase.from('bk_applications').update({ status: 'rejected' }).eq('id', id); await load(); }
  const approve = (a: App) => setForm({ open: true, appId: a.id, name: a.business_name, kind: a.kind, email: a.email ?? '', phone: a.phone, city: a.city ?? '', password: DEFAULT_PASSWORD });

  if (!apps || !biz) return err ? <ErrorText>{err}</ErrorText> : <Skeleton rows={4} />;
  const pending = apps.filter((a) => a.status === 'pending');
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <button onClick={() => setForm({ ...form, open: true, appId: undefined })} className="btn-primary text-sm ml-auto inline-flex items-center gap-1"><Plus className="w-4 h-4" />New booking business</button>
      </div>
      {err && <ErrorText>{err}</ErrorText>}
      {msg && <Card className="p-3 text-sm break-words flex items-start gap-2"><span className="flex-1">{msg}</span><button onClick={() => navigator.clipboard?.writeText(msg)} className="text-slate-400" aria-label="Copy"><Copy className="w-4 h-4" /></button></Card>}

      {tab === 'apps' && (apps.length === 0 ? <EmptyState message="No applications yet. People apply from the Bookings page on the website." /> : apps.map((a) => (
        <Card key={a.id} className="p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0"><div className="font-medium">{a.business_name} <span className="text-xs text-slate-400">· {KINDS.find((k) => k[0] === a.kind)?.[1] ?? a.kind}</span></div>
              <div className="text-sm text-slate-500">{a.contact_name} · <a href={`tel:${a.phone}`} className="underline">{a.phone}</a>{a.email ? ` · ${a.email}` : ''}{a.city ? ` · ${a.city}` : ''}</div>
              {a.message && <p className="text-sm mt-1">“{a.message}”</p>}<div className="text-xs text-slate-400 mt-1">{new Date(a.created_at).toLocaleString()}</div></div>
            <span className={`text-xs px-2 py-0.5 rounded-full shrink-0 ${a.status === 'pending' ? 'bg-amber-100 text-amber-800' : a.status === 'approved' ? 'bg-field-50 text-field-700' : 'bg-slate-100 text-slate-500'}`}>{a.status}</span>
          </div>
          {a.status === 'pending' && <div className="flex gap-2 mt-3"><button onClick={() => approve(a)} className="btn-primary text-xs !py-1 inline-flex items-center gap-1"><Check className="w-3 h-3" />Approve & create</button><button onClick={() => rejectApp(a.id)} className="btn-secondary text-xs !py-1 inline-flex items-center gap-1"><X className="w-3 h-3" />Reject</button></div>}
        </Card>)))}

      {tab === 'bookings' && (
        <>
          <div className="grid grid-cols-3 gap-2 text-center">
            <Card className="p-3"><div className="text-2xl font-semibold">{(all ?? []).filter((r) => ['pending', 'confirmed'].includes(r.status) && new Date(r.starts_at) > new Date()).length}</div><div className="text-xs text-slate-500">Upcoming</div></Card>
            <Card className="p-3"><div className="text-2xl font-semibold">{(all ?? []).length}</div><div className="text-xs text-slate-500">Recent total</div></Card>
            <Card className="p-3"><div className="text-2xl font-semibold">{biz.filter((b) => b.status === 'active').length}</div><div className="text-xs text-slate-500">Live businesses</div></Card>
          </div>
          <input className="input" placeholder="Search name, phone, code or business" value={q} onChange={(e) => setQ(e.target.value)} />
          {all === null ? <Skeleton rows={4} /> : all.length === 0 ? <EmptyState message="No bookings yet." /> : all.filter((r) => !q || `${r.customer_name} ${r.customer_phone} ${r.code} ${r.bk_businesses?.name ?? ''}`.toLowerCase().includes(q.toLowerCase())).map((r) => (
            <Card key={r.id} className="p-3 flex items-center justify-between gap-3">
              <div className="min-w-0"><div className="text-sm font-medium">{r.customer_name} <span className="text-slate-400 font-normal">· {r.customer_phone}</span></div><div className="text-xs text-slate-500">{r.bk_businesses?.name ?? 'Business'} · {new Date(r.starts_at).toLocaleString('en-KE', { timeZone: 'Africa/Nairobi' })}{r.seats > 1 ? ` · ${r.seats} seats` : ''}</div></div>
              <div className="text-right shrink-0"><div className="text-xs">{r.status.replace('_', ' ')}</div><div className="text-xs text-slate-400">KES {Number(r.price).toLocaleString()}{r.paid ? ' · paid' : ''}</div></div>
            </Card>))}
        </>
      )}

      {tab === 'biz' && (biz.length === 0 ? <EmptyState message="No booking businesses yet." /> : biz.map((b) => (
        <Card key={b.id} className="p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0"><div className="font-medium">{b.name} <span className="text-xs text-slate-400">· {KINDS.find((k) => k[0] === b.kind)?.[1] ?? b.kind}</span></div>
              <div className="text-sm text-slate-500">{b.email ?? ''}{b.city ? ` · ${b.city}` : ''} · {b.bookings} booking{b.bookings === 1 ? '' : 's'}</div>
              <a href={`${SITE}/book/${b.slug}`} target="_blank" rel="noreferrer" className="text-xs text-field-700 inline-flex items-center gap-1 mt-1">/book/{b.slug}<ExternalLink className="w-3 h-3" /></a></div>
            <span className={`text-xs px-2 py-0.5 rounded-full shrink-0 ${b.status === 'active' ? 'bg-field-50 text-field-700' : 'bg-rust-500/10 text-rust-500'}`}>{b.status}</span>
          </div>
          <div className="flex flex-wrap gap-2 mt-3">
            {b.status === 'active' ? <button onClick={() => setStatus(b.id, 'suspended')} className="btn-secondary text-xs !py-1 inline-flex items-center gap-1"><Pause className="w-3 h-3" />Suspend</button> : <button onClick={() => setStatus(b.id, 'active')} className="btn-secondary text-xs !py-1 inline-flex items-center gap-1"><Play className="w-3 h-3" />Activate</button>}
            <button onClick={() => setReset({ id: b.id, name: b.name, pw: DEFAULT_PASSWORD })} className="btn-secondary text-xs !py-1 inline-flex items-center gap-1"><KeyRound className="w-3 h-3" />Reset password</button>
          </div>
        </Card>)))}

      {form.open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4"><div className="absolute inset-0 bg-black/60" onClick={() => setForm({ ...form, open: false })} />
          <div className="relative card p-5 max-w-md w-full max-h-[90vh] overflow-y-auto space-y-2">
            <h3 className="font-display font-semibold text-lg">New booking business</h3>
            <input className="input" placeholder="Business name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            <select className="input" value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value })}>{KINDS.map(([id, l]) => <option key={id} value={id}>{l}</option>)}</select>
            <input className="input" type="email" placeholder="Owner email (their sign-in)" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            <div className="grid grid-cols-2 gap-2"><input className="input" placeholder="Phone" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /><input className="input" placeholder="Town" value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} /></div>
            <div className="flex gap-2">
              <button type="button" onClick={() => setForm({ ...form, password: DEFAULT_PASSWORD })} className={`flex-1 text-sm rounded-lg border px-3 py-2 ${form.password === DEFAULT_PASSWORD ? 'border-field-600 text-field-600 font-medium' : 'border-slate-300 text-slate-500'}`}>Default ({DEFAULT_PASSWORD})</button>
              <button type="button" onClick={() => setForm({ ...form, password: '' })} className={`flex-1 text-sm rounded-lg border px-3 py-2 ${form.password !== DEFAULT_PASSWORD ? 'border-field-600 text-field-600 font-medium' : 'border-slate-300 text-slate-500'}`}>Custom</button>
            </div>
            <input className="input" placeholder="Password (min 8 characters)" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
            <p className="text-xs text-slate-400">Creates their page at /book/&lt;name&gt; and a sign-in for /book-manage. Share the details with them yourself.</p>
            <div className="flex gap-2"><button onClick={create} disabled={busy || form.name.trim().length < 2 || !form.email || form.password.length < 8} className="btn-primary flex-1">{busy ? 'Creating…' : 'Create'}</button><button onClick={() => setForm({ ...form, open: false })} className="btn-secondary flex-1">Cancel</button></div>
          </div></div>)}

      {reset && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4"><div className="absolute inset-0 bg-black/60" onClick={() => setReset(null)} />
          <div className="relative card p-5 max-w-sm w-full space-y-2">
            <h3 className="font-display font-semibold text-lg">Reset {reset.name}'s password</h3>
            <p className="text-xs text-slate-400">If this owner also has a ShopOS account on the same email, this changes the password for both.</p>
            <div className="flex gap-2">
              <button type="button" onClick={() => setReset({ ...reset, pw: DEFAULT_PASSWORD })} className={`flex-1 text-sm rounded-lg border px-3 py-2 ${reset.pw === DEFAULT_PASSWORD ? 'border-field-600 text-field-600 font-medium' : 'border-slate-300 text-slate-500'}`}>Default</button>
              <button type="button" onClick={() => setReset({ ...reset, pw: '' })} className={`flex-1 text-sm rounded-lg border px-3 py-2 ${reset.pw !== DEFAULT_PASSWORD ? 'border-field-600 text-field-600 font-medium' : 'border-slate-300 text-slate-500'}`}>Custom</button>
            </div>
            <input className="input" value={reset.pw} onChange={(e) => setReset({ ...reset, pw: e.target.value })} placeholder="Password (min 8 characters)" />
            <div className="flex gap-2"><button onClick={doReset} disabled={busy || reset.pw.length < 8} className="btn-primary flex-1">{busy ? 'Resetting…' : 'Reset'}</button><button onClick={() => setReset(null)} className="btn-secondary flex-1">Cancel</button></div>
          </div></div>)}
    </div>
  );
}
