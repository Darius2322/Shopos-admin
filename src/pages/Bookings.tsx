import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { SupabaseClient } from '@supabase/supabase-js';
import { Check, X, Copy, KeyRound, Plus, ExternalLink, Pause, Play, Trash2, Pencil, Download, ChevronRight, ArrowLeft, Phone, Mail, MessageCircle, Star, Eye, EyeOff } from 'lucide-react';
import { Card, ErrorText, Skeleton, EmptyState } from '../components/ui';
import { friendlyError } from '../lib/friendlyError';
import { useBackClose } from '../lib/backStack';

const KINDS: [string, string][] = [['salon', 'Salon'], ['barbershop', 'Barbershop'], ['beauty', 'Beauty studio'], ['spa', 'Spa & massage'], ['bus', 'Bus & shuttle'], ['clinic', 'Clinic'], ['carwash', 'Car wash'], ['fitness', 'Fitness & classes'], ['custom', 'Custom']];
const DEFAULT_PASSWORD = 'Shopos 001';
const SITE = 'https://www.shopos.co.ke';
interface App { id: string; business_name: string; kind: string; contact_name: string; phone: string; email: string | null; city: string | null; message: string | null; status: string; created_at: string }
interface AllRow { created_at?: string; notes?: string | null; verified_at?: string | null; bk_services?: { name: string } | null; bk_staff?: { name: string } | null; id: string; code: string; customer_name: string; customer_phone: string; starts_at: string; status: string; price: number; paid: boolean; seats: number; bk_businesses: { name: string } | null }
interface Biz { id: string; slug: string; name: string; kind: string; status: string; city: string | null; phone: string | null; email: string | null; created_at: string; bookings: number; is_test?: boolean }

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
  const [stF, setStF] = useState('all');
  const [sel, setSel] = useState<AllRow | null>(null);
  const [filter, setFilter] = useState<'all' | 'pending' | 'active' | 'suspended' | 'rejected'>('all');
  const [del, setDel] = useState<{ id: string; name: string; typed: string } | null>(null);
  const [edit, setEdit] = useState<{ id: string; name: string; phone: string; city: string; email: string } | null>(null);
  const [stats, setStats] = useState<Record<string, { revenue: number; upcoming: number }>>({});
  const [openBiz, setOpenBiz] = useState<Biz | null>(null); useBackClose(!!openBiz, () => setOpenBiz(null)); const [bTab, setBTab] = useState('overview');
  const [reset, setReset] = useState<{ id: string; name: string; pw: string } | null>(null);

  const load = useCallback(async () => {
    const [a, b, c] = await Promise.all([
      supabase.from('bk_applications').select('*').order('created_at', { ascending: false }).limit(200),
      supabase.from('bk_businesses').select('id, slug, name, kind, status, city, phone, email, created_at, is_test').order('created_at', { ascending: false }),
      supabase.from('bk_bookings').select('business_id, price, paid, status, starts_at').limit(20000),
    ]);
    if (a.error || b.error) { setErr(friendlyError(a.error ?? b.error, 'Could not load bookings. Has the phase34 SQL been applied?')); return; }
    const counts: Record<string, number> = {};
    const st: Record<string, { revenue: number; upcoming: number }> = {};
    for (const r of (c.data ?? []) as { business_id: string; price: number; paid: boolean; status: string; starts_at: string }[]) {
      counts[r.business_id] = (counts[r.business_id] ?? 0) + 1;
      const o = (st[r.business_id] ??= { revenue: 0, upcoming: 0 });
      if (r.paid && r.status !== 'cancelled') o.revenue += Number(r.price);
      if (['pending', 'confirmed'].includes(r.status) && new Date(r.starts_at) > new Date()) o.upcoming++;
    }
    setStats(st);
    setApps((a.data ?? []) as App[]); setBiz(((b.data ?? []) as Omit<Biz, 'bookings'>[]).map((x) => ({ ...x, bookings: counts[x.id] ?? 0 })));
  }, [supabase]);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    if (view !== 'bookings') return;
    void supabase.from('bk_bookings').select('id, code, customer_name, customer_phone, starts_at, created_at, status, price, paid, seats, notes, verified_at, bk_businesses(name), bk_services(name), bk_staff(name)').order('starts_at', { ascending: false }).limit(300).then(({ data }) => setAll((data ?? []) as unknown as AllRow[]));
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
  async function patchBooking(id: string, p: Record<string, unknown>) {
    const { error } = await supabase.from('bk_bookings').update(p).eq('id', id);
    if (error) { setErr(friendlyError(error, 'Could not update the booking.')); return; }
    setAll((a) => (a ?? []).map((r) => (r.id === id ? { ...r, ...p } as AllRow : r))); setSel(null);
  }
  async function removeBiz() {
    if (!del) return; setBusy(true); setErr(null);
    const { error } = await supabase.from('bk_businesses').delete().eq('id', del.id);
    setBusy(false); if (error) { setErr(friendlyError(error, 'Could not delete the business.')); return; }
    setMsg(`${del.name} and all its bookings were deleted.`); setDel(null); await load();
  }
  async function saveEdit() {
    if (!edit) return; setBusy(true); setErr(null);
    const { error } = await supabase.from('bk_businesses').update({ name: edit.name.trim(), phone: edit.phone.trim() || null, city: edit.city.trim() || null, email: edit.email.trim() || null }).eq('id', edit.id);
    setBusy(false); if (error) { setErr(friendlyError(error, 'Could not save.')); return; } setEdit(null); await load();
  }
  function exportCsv() {
    const rows = [['Name', 'Type', 'Status', 'City', 'Phone', 'Email', 'Bookings', 'Paid revenue', 'Link'], ...(biz ?? []).map((b) => [b.name, b.kind, b.status, b.city ?? '', b.phone ?? '', b.email ?? '', String(b.bookings), String(stats[b.id]?.revenue ?? 0), `${SITE}/book/${b.slug}`])];
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([rows.map((r) => r.map((c) => `"${c.replace(/"/g, '""')}"`).join(',')).join('\n')], { type: 'text/csv' })); a.download = 'booking-businesses.csv'; a.click();
  }
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
          <div className="flex flex-wrap gap-2">{['all', 'pending', 'confirmed', 'completed', 'cancelled', 'no_show'].map((f) => <button key={f} onClick={() => setStF(f)} className={`px-3 py-1 rounded-full text-xs border capitalize ${stF === f ? 'bg-field-600 text-white border-field-600' : 'border-slate-300 text-slate-600'}`}>{f.replace('_', ' ')}</button>)}</div>
          <input className="input" placeholder="Search name, phone, code or business" value={q} onChange={(e) => setQ(e.target.value)} />
          {all === null ? <Skeleton rows={4} /> : all.length === 0 ? <EmptyState message="No bookings yet." /> : all.filter((r) => (stF === 'all' || r.status === stF) && (!q || `${r.customer_name} ${r.customer_phone} ${r.code} ${r.bk_businesses?.name ?? ''}`.toLowerCase().includes(q.toLowerCase()))).map((r) => (
            <Card key={r.id} className="p-0">
            <div role="button" tabIndex={0} onClick={() => setSel(r)} onKeyDown={(e) => { if (e.key === 'Enter') setSel(r); }} className="p-3 flex items-center justify-between gap-3 cursor-pointer">
              <div className="min-w-0"><div className="text-sm font-medium">{r.customer_name} <span className="text-slate-400 font-normal">· {r.customer_phone}</span></div><div className="text-xs text-slate-500">{r.bk_businesses?.name ?? 'Business'} · {new Date(r.starts_at).toLocaleString('en-KE', { timeZone: 'Africa/Nairobi' })}{r.seats > 1 ? ` · ${r.seats} seats` : ''}</div></div>
              <div className="text-right shrink-0"><div className="text-xs">{r.status.replace('_', ' ')}</div><div className="text-xs text-slate-400">KES {Number(r.price).toLocaleString()}{r.paid ? ' · paid' : ''}</div></div>
            </div>
            </Card>))}
        </>
      )}

      {tab === 'biz' && openBiz && <BizDetail b={openBiz} supabase={supabase} stats={stats[openBiz.id]} tab={bTab} onTab={setBTab} onBack={() => setOpenBiz(null)}
        onStatus={(st) => { void setStatus(openBiz.id, st).then(() => setOpenBiz((o) => (o ? { ...o, status: st } : o))); }}
        onEdit={() => setEdit({ id: openBiz.id, name: openBiz.name, phone: openBiz.phone ?? '', city: openBiz.city ?? '', email: openBiz.email ?? '' })}
        onReset={() => setReset({ id: openBiz.id, name: openBiz.name, pw: DEFAULT_PASSWORD })} onDelete={() => setDel({ id: openBiz.id, name: openBiz.name, typed: '' })} />}
      {tab === 'biz' && !openBiz && (
        <>
          <div className="flex flex-wrap items-center gap-2">
            {(['all', 'pending', 'active', 'suspended', 'rejected'] as const).map((f) => <button key={f} onClick={() => setFilter(f)} className={`px-3 py-1 rounded-full text-xs border capitalize ${filter === f ? 'bg-field-600 text-white border-field-600' : 'border-slate-300 text-slate-600'}`}>{f}{f !== 'all' ? ` (${biz.filter((b) => b.status === f).length})` : ''}</button>)}
            <button onClick={exportCsv} className="btn-secondary text-xs !py-1 ml-auto inline-flex items-center gap-1"><Download className="w-3 h-3" />CSV</button>
          </div>
          <input className="input" placeholder="Search business, email or town" value={q} onChange={(e) => setQ(e.target.value)} />
          {biz.length === 0 ? <EmptyState message="No booking businesses yet." /> : biz.filter((b) => (filter === 'all' || b.status === filter) && (!q || `${b.name} ${b.email ?? ''} ${b.city ?? ''}`.toLowerCase().includes(q.toLowerCase()))).map((b) => (
            <Card key={b.id} className="p-0"><div role="button" tabIndex={0} onClick={() => { setOpenBiz(b); setBTab('overview'); }} onKeyDown={(e) => { if (e.key === 'Enter') { setOpenBiz(b); setBTab('overview'); } }} className="p-4 cursor-pointer hover:bg-slate-800/20 rounded-xl">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0"><div className="font-medium">{b.name}{b.is_test && <span className="ml-1.5 text-[10px] px-1.5 py-0.5 rounded-full bg-sky-100 text-sky-800 align-middle">Test</span>} <span className="text-xs text-slate-400">· {KINDS.find((k) => k[0] === b.kind)?.[1] ?? b.kind}</span></div>
                  <div className="text-sm text-slate-500">{b.email ?? ''}{b.city ? ` · ${b.city}` : ''}{b.phone ? ` · ${b.phone}` : ''}</div>
                  <a href={`${SITE}/book/${b.slug}`} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} className="text-xs text-field-700 inline-flex items-center gap-1 mt-1">/book/{b.slug}<ExternalLink className="w-3 h-3" /></a></div>
                <span className={`text-xs px-2 py-0.5 rounded-full shrink-0 ${b.status === 'active' ? 'bg-field-50 text-field-700' : b.status === 'pending' ? 'bg-amber-100 text-amber-800' : 'bg-rust-500/10 text-rust-500'}`}>{b.status}</span>
              </div>
              <div className="grid grid-cols-3 gap-2 mt-3 text-center text-xs"><div className="rounded-lg bg-slate-100/60 py-2"><b className="block text-sm">{b.bookings}</b>Bookings</div><div className="rounded-lg bg-slate-100/60 py-2"><b className="block text-sm">{stats[b.id]?.upcoming ?? 0}</b>Upcoming</div><div className="rounded-lg bg-slate-100/60 py-2"><b className="block text-sm">{(stats[b.id]?.revenue ?? 0).toLocaleString()}</b>Paid (KES)</div></div>
              {(b.status === 'pending' || b.status === 'rejected') && <div className="flex gap-2 mt-3" onClick={(e) => e.stopPropagation()}>
                <button onClick={() => setStatus(b.id, 'active')} className="btn-primary text-xs !py-1 inline-flex items-center gap-1"><Check className="w-3 h-3" />Approve</button>
                {b.status === 'pending' && <button onClick={() => setStatus(b.id, 'rejected')} className="btn-secondary text-xs !py-1 inline-flex items-center gap-1"><X className="w-3 h-3" />Reject</button>}</div>}
              <div className="flex items-center justify-end text-xs text-slate-400 mt-2">Open details <ChevronRight className="w-3.5 h-3.5" /></div>
            </div></Card>))}
        </>
      )}

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

      {edit && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4"><div className="absolute inset-0 bg-black/60" onClick={() => setEdit(null)} />
          <div className="relative card p-5 max-w-sm w-full space-y-2">
            <h3 className="font-display font-semibold text-lg">Edit business</h3>
            <input className="input" placeholder="Name" value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} />
            <input className="input" placeholder="Contact email" value={edit.email} onChange={(e) => setEdit({ ...edit, email: e.target.value })} />
            <div className="grid grid-cols-2 gap-2"><input className="input" placeholder="Phone" value={edit.phone} onChange={(e) => setEdit({ ...edit, phone: e.target.value })} /><input className="input" placeholder="Town" value={edit.city} onChange={(e) => setEdit({ ...edit, city: e.target.value })} /></div>
            <div className="flex gap-2"><button onClick={saveEdit} disabled={busy || edit.name.trim().length < 2} className="btn-primary flex-1">{busy ? 'Saving…' : 'Save'}</button><button onClick={() => setEdit(null)} className="btn-secondary flex-1">Cancel</button></div>
          </div></div>)}

      {del && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4"><div className="absolute inset-0 bg-black/60" onClick={() => setDel(null)} />
          <div className="relative card p-5 max-w-sm w-full space-y-2">
            <h3 className="font-display font-semibold text-lg text-rust-500">Delete {del.name}?</h3>
            <p className="text-sm text-slate-500">This permanently deletes the business, its services, team, quotes and every booking. It cannot be undone. To stop it quietly, suspend it instead. Type the business name to confirm.</p>
            <input className="input" value={del.typed} onChange={(e) => setDel({ ...del, typed: e.target.value })} placeholder={del.name} />
            <div className="flex gap-2"><button onClick={removeBiz} disabled={busy || del.typed.trim() !== del.name} className="flex-1 rounded-lg bg-rust-500 text-white py-2 text-sm disabled:opacity-40">{busy ? 'Deleting…' : 'Delete forever'}</button><button onClick={() => setDel(null)} className="btn-secondary flex-1">Cancel</button></div>
          </div></div>)}

      {sel && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4"><div className="absolute inset-0 bg-black/60" onClick={() => setSel(null)} />
          <div className="relative card p-5 max-w-sm w-full space-y-2 text-sm">
            <h3 className="font-display font-semibold text-lg">{sel.customer_name}</h3>
            <div className="text-slate-500"><a href={`tel:${sel.customer_phone}`} className="underline">{sel.customer_phone}</a></div>
            <div className="rounded-lg bg-slate-800/30 p-3 space-y-0.5">
              <div className="font-medium">{sel.bk_businesses?.name} · {sel.bk_services?.name ?? 'Trip'}{sel.bk_staff?.name ? ` · ${sel.bk_staff.name}` : ''}</div>
              <div>{new Date(sel.starts_at).toLocaleString('en-KE', { timeZone: 'Africa/Nairobi' })}{sel.seats > 1 ? ` · ${sel.seats} seats` : ''}</div>
              <div>KES {Number(sel.price).toLocaleString()} · {sel.paid ? 'paid' : 'not paid'} · <span className="capitalize">{sel.status.replace('_', ' ')}</span></div>
              <div>Code <b className="font-mono tracking-wider">{sel.code}</b>{sel.verified_at ? ' · verified on the day ✓' : ''}</div>
              {sel.created_at && <div className="text-xs text-slate-400">Booked {new Date(sel.created_at).toLocaleString('en-KE', { timeZone: 'Africa/Nairobi' })}</div>}
              {sel.notes && <div className="italic text-slate-400">“{sel.notes}”</div>}
            </div>
            <div className="flex flex-wrap gap-2">
              {['pending', 'confirmed'].includes(sel.status) && <button onClick={() => patchBooking(sel.id, { status: 'cancelled' })} className="btn-secondary text-xs !py-1">Cancel booking</button>}
              {['pending', 'confirmed'].includes(sel.status) && <button onClick={() => patchBooking(sel.id, { status: 'completed' })} className="btn-secondary text-xs !py-1">Mark done</button>}
              {!sel.paid && <button onClick={() => patchBooking(sel.id, { paid: true })} className="btn-secondary text-xs !py-1">Mark paid</button>}
            </div>
            <button onClick={() => setSel(null)} className="btn-secondary w-full">Close</button>
          </div></div>)}
    </div>
  );
}


type RR = Record<string, any>;
const initials = (n: string) => n.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join('') || '?';
/** One business, on its own page: profile, quick actions and sub menus. */
function BizDetail({ b, supabase, stats, tab, onTab, onBack, onStatus, onEdit, onReset, onDelete }: {
  b: Biz; supabase: SupabaseClient; stats?: { revenue: number; upcoming: number }; tab: string; onTab: (t: string) => void; onBack: () => void;
  onStatus: (s: string) => void; onEdit: () => void; onReset: () => void; onDelete: () => void;
}) {
  const [data, setData] = useState<Record<string, RR[] | null>>({});
  const [full, setFull] = useState<RR | null>(null);
  useEffect(() => { void supabase.from('bk_businesses').select('*').eq('id', b.id).maybeSingle().then((r) => setFull((r.data as RR) ?? null)); }, [supabase, b.id]);
  const loadTab = useCallback(async (t: string) => {
    const tbl: Record<string, [string, string]> = { bookings: ['bk_bookings', 'starts_at'], services: ['bk_services', 'created_at'], team: ['bk_staff', 'created_at'], reviews: ['bk_reviews', 'created_at'] };
    const x = tbl[t]; if (!x) return;
    const { data: d } = await supabase.from(x[0]).select('*').eq('business_id', b.id).order(x[1], { ascending: false }).limit(100);
    setData((o) => ({ ...o, [t]: (d ?? []) as RR[] }));
  }, [supabase, b.id]);
  useEffect(() => { void loadTab(tab); }, [tab, loadTab]);
  async function hideReview(id: string, hidden: boolean) { await supabase.from('bk_reviews').update({ hidden, ...(hidden ? { hide_requested: false } : {}) }).eq('id', id); void loadTab('reviews'); }
  const phone = (b.phone ?? '').replace(/[^\d+]/g, '');
  const wa = phone.replace(/^\+/, '').replace(/^0/, '254');
  const reviews = data.reviews ?? [];
  const reqs = reviews.filter((r) => r.hide_requested && !r.hidden).length;
  const tabs: [string, string][] = [['overview', 'Overview'], ['bookings', 'Bookings'], ['services', 'Services & chairs'], ['team', 'Team'], ['reviews', reqs ? `Reviews (${reqs} to review)` : 'Reviews'], ['manage', 'Manage']];
  const col = b.status === 'active' ? 'bg-field-50 text-field-700' : b.status === 'pending' ? 'bg-amber-100 text-amber-800' : 'bg-rust-500/10 text-rust-500';
  const Row = ({ k, v }: { k: string; v: ReactNode }) => <div className="flex justify-between gap-3 text-sm py-1.5 border-b border-slate-700/20"><span className="text-slate-500">{k}</span><span className="text-right break-all">{v ?? '—'}</span></div>;
  const Act = ({ icon, label, href, onClick, danger }: { icon: ReactNode; label: string; href?: string; onClick?: () => void; danger?: boolean }) => {
    const cls = `flex flex-col items-center gap-1 rounded-xl border px-2 py-2.5 text-xs min-w-[64px] ${danger ? 'border-rust-500/40 text-rust-500' : 'border-slate-600/40'}`;
    return href ? <a href={href} target={href.startsWith('http') ? '_blank' : undefined} rel="noreferrer" className={cls}>{icon}{label}</a> : <button type="button" onClick={onClick} className={cls}>{icon}{label}</button>;
  };
  return (
    <div className="space-y-4">
      <button onClick={onBack} className="inline-flex items-center gap-1 text-sm text-slate-500"><ArrowLeft className="w-4 h-4" />All businesses</button>
      <Card className="p-4 flex items-center gap-3">
        <div className="w-14 h-14 rounded-full bg-field-600 text-white flex items-center justify-center text-lg font-semibold shrink-0 overflow-hidden">{full?.logo_url ? <img src={full.logo_url} alt="" className="w-full h-full object-cover" /> : initials(b.name)}</div>
        <div className="min-w-0 flex-1"><div className="font-display font-semibold text-lg truncate">{b.name}</div><div className="text-xs text-slate-500">{KINDS.find((k) => k[0] === b.kind)?.[1] ?? b.kind}{b.city ? ` · ${b.city}` : ''}</div></div>
        <span className={`text-xs px-2 py-0.5 rounded-full shrink-0 ${col}`}>{b.status}</span>
      </Card>
      <div className="flex gap-2 overflow-x-auto pb-1">
        <Act icon={<ExternalLink className="w-5 h-5" />} label="Open page" href={`${SITE}/book/${b.slug}`} />
        {phone && <Act icon={<Phone className="w-5 h-5" />} label="Call" href={`tel:${phone}`} />}
        {phone && <Act icon={<MessageCircle className="w-5 h-5" />} label="WhatsApp" href={`https://wa.me/${wa}`} />}
        {b.email && <Act icon={<Mail className="w-5 h-5" />} label="Email" href={`mailto:${b.email}`} />}
        <Act icon={<Pencil className="w-5 h-5" />} label="Edit" onClick={onEdit} />
        <Act icon={<KeyRound className="w-5 h-5" />} label="Reset login" onClick={onReset} />
        {b.status === 'active' ? <Act icon={<Pause className="w-5 h-5" />} label="Suspend" onClick={() => onStatus('suspended')} /> : <Act icon={<Play className="w-5 h-5" />} label={b.status === 'suspended' ? 'Reactivate' : 'Approve'} onClick={() => onStatus('active')} />}
      </div>
      <div className="flex gap-2 overflow-x-auto border-b border-slate-700/30">{tabs.map(([id, l]) => <button key={id} onClick={() => onTab(id)} className={`px-3 py-2 text-sm whitespace-nowrap border-b-2 ${tab === id ? 'border-field-600 text-field-600 font-medium' : 'border-transparent text-slate-500'}`}>{l}</button>)}</div>

      {tab === 'overview' && <>
        <div className="grid grid-cols-3 gap-2 text-center"><Card className="p-3"><div className="text-xl font-semibold">{b.bookings}</div><div className="text-xs text-slate-500">Bookings</div></Card><Card className="p-3"><div className="text-xl font-semibold">{stats?.upcoming ?? 0}</div><div className="text-xs text-slate-500">Upcoming</div></Card><Card className="p-3"><div className="text-xl font-semibold">{Math.round(stats?.revenue ?? 0).toLocaleString()}</div><div className="text-xs text-slate-500">Paid (KES)</div></Card></div>
        <Card className="p-4"><Row k="Owner sign-in" v={b.email} /><Row k="Phone" v={b.phone} /><Row k="Town" v={b.city} /><Row k="Booking page" v={`/book/${b.slug}`} /><Row k="Plan" v={full?.plan} /><Row k="Paused by owner" v={full?.paused ? 'Yes' : 'No'} /><Row k="Website" v={full?.website} /><Row k="Created" v={new Date(b.created_at).toLocaleDateString('en-KE', { timeZone: 'Africa/Nairobi' })} /></Card>
      </>}

      {tab === 'bookings' && (data.bookings == null ? <Skeleton rows={3} /> : data.bookings.length === 0 ? <EmptyState message="No bookings yet." /> : data.bookings.map((r) => (
        <Card key={r.id} className="p-3 flex items-center justify-between gap-3"><div className="min-w-0"><div className="text-sm font-medium">{r.customer_name} <span className="text-slate-400 font-normal">· {r.customer_phone}</span></div><div className="text-xs text-slate-500">{new Date(r.starts_at).toLocaleString('en-KE', { timeZone: 'Africa/Nairobi', dateStyle: 'medium', timeStyle: 'short' })} · {r.code}</div></div><div className="text-right text-xs shrink-0"><div className="capitalize">{String(r.status).replace('_', ' ')}</div><div className="text-slate-400">KES {Number(r.price).toLocaleString()}{r.paid ? ' · paid' : ''}</div></div></Card>)))}

      {tab === 'services' && (data.services == null ? <Skeleton rows={3} /> : data.services.length === 0 ? <EmptyState message="No services yet." /> : data.services.map((r) => (
        <Card key={r.id} className="p-3 flex items-center justify-between gap-3"><div className="min-w-0"><div className="text-sm font-medium">{r.name}</div><div className="text-xs text-slate-500">{r.duration_min ? `${r.duration_min} min` : ''}{r.active === false ? ' · hidden' : ''}</div></div><div className="text-sm shrink-0">KES {Number(r.price ?? 0).toLocaleString()}</div></Card>)))}

      {tab === 'team' && (data.team == null ? <Skeleton rows={3} /> : data.team.length === 0 ? <EmptyState message="No team or chairs yet." /> : data.team.map((r) => (
        <Card key={r.id} className="p-3 flex items-center justify-between gap-3"><div className="text-sm font-medium">{r.name}</div><div className="text-xs text-slate-500">{r.active === false ? 'inactive' : 'active'}</div></Card>)))}

      {tab === 'reviews' && (data.reviews == null ? <Skeleton rows={3} /> : reviews.length === 0 ? <EmptyState message="No reviews yet." /> : [...reviews].sort((a, c) => Number(!!c.hide_requested && !c.hidden) - Number(!!a.hide_requested && !a.hidden)).map((r) => (
        <Card key={r.id} className={`p-3 space-y-1 ${r.hide_requested && !r.hidden ? 'border-amber-500/50' : ''}`}>
          <div className="flex items-center justify-between"><span className="inline-flex gap-0.5">{[1, 2, 3, 4, 5].map((n) => <Star key={n} className={`w-3.5 h-3.5 ${n <= r.rating ? 'fill-current text-amber-500' : 'text-slate-500'}`} />)}</span><span className="text-xs text-slate-400">{r.hidden ? 'hidden' : r.hide_requested ? 'owner asked to hide' : 'public'}</span></div>
          {r.comment && <p className="text-sm">{r.comment}</p>}
          {r.hide_requested && !r.hidden && <p className="text-xs text-amber-600">Owner's reason: {r.hide_reason || '—'}</p>}
          <div className="flex gap-2 pt-1">
            {!r.hidden && <button onClick={() => hideReview(r.id, true)} className="btn-secondary text-xs !py-1 inline-flex items-center gap-1"><EyeOff className="w-3 h-3" />{r.hide_requested ? 'Approve & hide' : 'Hide'}</button>}
            {r.hidden && <button onClick={() => hideReview(r.id, false)} className="btn-secondary text-xs !py-1 inline-flex items-center gap-1"><Eye className="w-3 h-3" />Show again</button>}
            {r.hide_requested && !r.hidden && <button onClick={() => { void supabase.from('bk_reviews').update({ hide_requested: false }).eq('id', r.id).then(() => loadTab('reviews')); }} className="btn-secondary text-xs !py-1">Decline</button>}
          </div></Card>)))}

      {tab === 'manage' && <Card className="p-4 space-y-3">
        <p className="text-sm text-slate-500">Login, suspension and removal for this business.</p>
        <div className="flex flex-wrap gap-2"><button onClick={onEdit} className="btn-secondary text-xs inline-flex items-center gap-1"><Pencil className="w-3 h-3" />Edit details</button><button onClick={onReset} className="btn-secondary text-xs inline-flex items-center gap-1"><KeyRound className="w-3 h-3" />Reset password</button></div>
        <label className="flex items-start gap-2 text-sm"><input type="checkbox" className="mt-1" checked={!!full?.is_test} onChange={async (e) => { const v = e.target.checked; await supabase.from('bk_businesses').update({ is_test: v }).eq('id', b.id); setFull((o) => (o ? { ...o, is_test: v } : o)); }} /><span><b>Test business</b><span className="block text-xs text-slate-500">Hidden from the public list of businesses in the booker app. Its own link still works, so you can keep testing.</span></span></label>
        <button onClick={onDelete} className="text-xs py-1.5 px-3 rounded-lg border border-rust-500/40 text-rust-500 inline-flex items-center gap-1"><Trash2 className="w-3 h-3" />Delete this business</button>
      </Card>}
    </div>
  );
}
