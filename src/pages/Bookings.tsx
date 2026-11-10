import { useCallback, useEffect, useState } from 'react';
import { SupabaseClient } from '@supabase/supabase-js';
import { Check, X, Copy, KeyRound, Plus, ExternalLink, Pause, Play, Trash2, Pencil, Download } from 'lucide-react';
import { Card, ErrorText, Skeleton, EmptyState } from '../components/ui';
import { friendlyError } from '../lib/friendlyError';

const KINDS: [string, string][] = [['salon', 'Salon'], ['barbershop', 'Barbershop'], ['beauty', 'Beauty studio'], ['spa', 'Spa & massage'], ['bus', 'Bus & shuttle'], ['clinic', 'Clinic'], ['carwash', 'Car wash'], ['fitness', 'Fitness & classes'], ['custom', 'Custom']];
const DEFAULT_PASSWORD = 'Shopos 001';
const SITE = 'https://www.shopos.co.ke';
interface App { id: string; business_name: string; kind: string; contact_name: string; phone: string; email: string | null; city: string | null; message: string | null; status: string; created_at: string }
interface AllRow { created_at?: string; notes?: string | null; verified_at?: string | null; bk_services?: { name: string } | null; bk_staff?: { name: string } | null; id: string; code: string; customer_name: string; customer_phone: string; starts_at: string; status: string; price: number; paid: boolean; seats: number; bk_businesses: { name: string } | null }
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
  const [stF, setStF] = useState('all');
  const [sel, setSel] = useState<AllRow | null>(null);
  const [filter, setFilter] = useState<'all' | 'pending' | 'active' | 'suspended' | 'rejected'>('all');
  const [del, setDel] = useState<{ id: string; name: string; typed: string } | null>(null);
  const [edit, setEdit] = useState<{ id: string; name: string; phone: string; city: string; email: string } | null>(null);
  const [stats, setStats] = useState<Record<string, { revenue: number; upcoming: number }>>({});
  const [reset, setReset] = useState<{ id: string; name: string; pw: string } | null>(null);

  const load = useCallback(async () => {
    const [a, b, c] = await Promise.all([
      supabase.from('bk_applications').select('*').order('created_at', { ascending: false }).limit(200),
      supabase.from('bk_businesses').select('id, slug, name, kind, status, city, phone, email, created_at').order('created_at', { ascending: false }),
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

      {tab === 'biz' && (
        <>
          <div className="flex flex-wrap items-center gap-2">
            {(['all', 'pending', 'active', 'suspended', 'rejected'] as const).map((f) => <button key={f} onClick={() => setFilter(f)} className={`px-3 py-1 rounded-full text-xs border capitalize ${filter === f ? 'bg-field-600 text-white border-field-600' : 'border-slate-300 text-slate-600'}`}>{f}{f !== 'all' ? ` (${biz.filter((b) => b.status === f).length})` : ''}</button>)}
            <button onClick={exportCsv} className="btn-secondary text-xs !py-1 ml-auto inline-flex items-center gap-1"><Download className="w-3 h-3" />CSV</button>
          </div>
          <input className="input" placeholder="Search business, email or town" value={q} onChange={(e) => setQ(e.target.value)} />
          {biz.length === 0 ? <EmptyState message="No booking businesses yet." /> : biz.filter((b) => (filter === 'all' || b.status === filter) && (!q || `${b.name} ${b.email ?? ''} ${b.city ?? ''}`.toLowerCase().includes(q.toLowerCase()))).map((b) => (
            <Card key={b.id} className="p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0"><div className="font-medium">{b.name} <span className="text-xs text-slate-400">· {KINDS.find((k) => k[0] === b.kind)?.[1] ?? b.kind}</span></div>
                  <div className="text-sm text-slate-500">{b.email ?? ''}{b.city ? ` · ${b.city}` : ''}{b.phone ? ` · ${b.phone}` : ''}</div>
                  <a href={`${SITE}/book/${b.slug}`} target="_blank" rel="noreferrer" className="text-xs text-field-700 inline-flex items-center gap-1 mt-1">/book/{b.slug}<ExternalLink className="w-3 h-3" /></a></div>
                <span className={`text-xs px-2 py-0.5 rounded-full shrink-0 ${b.status === 'active' ? 'bg-field-50 text-field-700' : b.status === 'pending' ? 'bg-amber-100 text-amber-800' : 'bg-rust-500/10 text-rust-500'}`}>{b.status}</span>
              </div>
              <div className="grid grid-cols-3 gap-2 mt-3 text-center text-xs"><div className="rounded-lg bg-slate-100/60 py-2"><b className="block text-sm">{b.bookings}</b>Bookings</div><div className="rounded-lg bg-slate-100/60 py-2"><b className="block text-sm">{stats[b.id]?.upcoming ?? 0}</b>Upcoming</div><div className="rounded-lg bg-slate-100/60 py-2"><b className="block text-sm">{(stats[b.id]?.revenue ?? 0).toLocaleString()}</b>Paid (KES)</div></div>
              <div className="flex flex-wrap gap-2 mt-3">
                {(b.status === 'pending' || b.status === 'rejected') && <button onClick={() => setStatus(b.id, 'active')} className="btn-primary text-xs !py-1 inline-flex items-center gap-1"><Check className="w-3 h-3" />Approve</button>}
                {b.status === 'pending' && <button onClick={() => setStatus(b.id, 'rejected')} className="btn-secondary text-xs !py-1 inline-flex items-center gap-1"><X className="w-3 h-3" />Reject</button>}
                {b.status === 'active' && <button onClick={() => setStatus(b.id, 'suspended')} className="btn-secondary text-xs !py-1 inline-flex items-center gap-1"><Pause className="w-3 h-3" />Suspend</button>}
                {b.status === 'suspended' && <button onClick={() => setStatus(b.id, 'active')} className="btn-secondary text-xs !py-1 inline-flex items-center gap-1"><Play className="w-3 h-3" />Reactivate</button>}
                <button onClick={() => setEdit({ id: b.id, name: b.name, phone: b.phone ?? '', city: b.city ?? '', email: b.email ?? '' })} className="btn-secondary text-xs !py-1 inline-flex items-center gap-1"><Pencil className="w-3 h-3" />Edit</button>
                <button onClick={() => setReset({ id: b.id, name: b.name, pw: DEFAULT_PASSWORD })} className="btn-secondary text-xs !py-1 inline-flex items-center gap-1"><KeyRound className="w-3 h-3" />Reset password</button>
                <button onClick={() => setDel({ id: b.id, name: b.name, typed: '' })} className="text-xs !py-1 px-3 rounded-lg border border-rust-500/40 text-rust-500 inline-flex items-center gap-1"><Trash2 className="w-3 h-3" />Delete</button>
              </div>
            </Card>))}
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
