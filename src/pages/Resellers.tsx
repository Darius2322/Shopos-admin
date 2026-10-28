import { useEffect, useState } from 'react';
import { SupabaseClient } from '@supabase/supabase-js';
import { Plus, Search, Link2, Wallet, Save, Copy } from 'lucide-react';
import { Card, ErrorText, Skeleton } from '../components/ui';

interface Reseller { id: string; name: string; phone: string | null; code: string; commission_pct: number; status: string; shops: number; owed: number; paid: number }
interface App { id: string; name: string; phone: string; email: string | null; area: string | null; note: string | null; created_at: string }
interface Found { key: string; label: string; sub: string }

const money = (n: number) => `KES ${Number(n || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;

/** Resellers (partners): people who bring shops to ShopOS and earn a percentage of every paid package those shops buy. */
export default function ResellersPage({ supabase }: { supabase: SupabaseClient }) {
  const [rows, setRows] = useState<Reseller[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [edit, setEdit] = useState<Record<string, { pct: string; status: string }>>({});
  const [adding, setAdding] = useState(false);
  const [q, setQ] = useState('');
  const [found, setFound] = useState<Found[]>([]);
  const [pick, setPick] = useState<Found | null>(null);
  const [phone, setPhone] = useState('');
  const [pct, setPct] = useState('10');
  const [bq, setBq] = useState('');
  const [bfound, setBfound] = useState<Found[]>([]);
  const [mode, setMode] = useState<'new' | 'existing'>('new');
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [creds, setCreds] = useState<{ email: string; password: string; code: string; name: string } | null>(null);
  const [apps, setApps] = useState<App[]>([]);
  const [appId, setAppId] = useState<string | null>(null);

  async function load() {
    const { data, error } = await supabase.rpc('admin_list_resellers');
    if (error) { setError(error.message); setRows([]); return; }
    const list = ((data ?? []) as any[]).map((r) => ({ id: r.id, name: r.name, phone: r.phone, code: r.code, commission_pct: Number(r.commission_pct), status: r.status, shops: Number(r.shops ?? 0), owed: Number(r.owed ?? 0), paid: Number(r.paid ?? 0) }));
    setRows(list);
    setEdit(Object.fromEntries(list.map((r) => [r.id, { pct: String(r.commission_pct), status: r.status }])));
  }
  async function loadApps() {
    const { data } = await supabase.from('reseller_applications').select('id,name,phone,email,area,note,created_at').eq('status', 'pending').order('created_at');
    setApps((data ?? []) as App[]);
  }
  useEffect(() => { void load(); void loadApps(); }, []);
  function startApproval(a: App) { setAppId(a.id); setAdding(true); setMode('new'); setName(a.name); setEmail(a.email ?? ''); setPhone(a.phone); setPick(null); setFound([]); setCreds(null); window.scrollTo({ top: 0, behavior: 'smooth' }); }
  async function reject(a: App) {
    if (!window.confirm(`Reject the application from ${a.name}?`)) return;
    const { error } = await supabase.rpc('admin_decide_reseller_application', { p_id: a.id, p_status: 'rejected', p_reseller: null });
    if (error) setError(error.message); else await loadApps();
  }

  async function searchPeople() { await searchPeopleFor(q); }
  async function searchPeopleFor(text: string) {
    setError(null);
    const term = text.trim();
    if (term.length < 2) { setFound([]); return; }
    const { data, error } = await supabase.from('profiles').select('id,user_id,full_name,phone,role').ilike('full_name', `%${term}%`).is('deleted_at', null).limit(8);
    if (error) { setError(error.message); return; }
    setFound((data ?? []).map((p: any) => ({ key: p.user_id ?? p.id, label: p.full_name || 'No name', sub: `${p.role ?? ''}${p.phone ? ' · ' + p.phone : ''}` })));
  }
  async function createNew() {
    setBusy('create'); setError(null); setNote(null); setCreds(null);
    const p = Number(pct);
    if (!(p >= 0 && p <= 100)) { setError('The commission must be between 0 and 100.'); setBusy(null); return; }
    const { data, error } = await supabase.functions.invoke('admin-create-reseller', { body: { name, phone, email, pct: p, application_id: appId } });
    setBusy(null);
    let msg = (data as any)?.error as string | undefined;
    if (error && !msg) { try { msg = (await (error as any).context?.json?.())?.error; } catch { /* ignore */ } }
    if (error || msg || !(data as any)?.password) { setError(msg || 'Could not create the partner. Try again.'); return; }
    setCreds({ email: (data as any).email, password: (data as any).password, code: (data as any).code, name });
    setAppId(null); setAdding(false); setName(''); setEmail(''); setPhone(''); setPct('10');
    await load(); await loadApps();
  }
  async function create() {
    if (!pick) return;
    setBusy('create'); setError(null); setNote(null);
    const p = Number(pct);
    if (!(p >= 0 && p <= 100)) { setError('The commission must be between 0 and 100.'); setBusy(null); return; }
    const { error } = await supabase.rpc('admin_create_reseller', { p_user_id: pick.key, p_name: pick.label, p_phone: phone.trim() || null, p_pct: p });
    setBusy(null);
    if (error) { setError(error.message); return; }
    if (appId) { await supabase.rpc('admin_decide_reseller_application', { p_id: appId, p_status: 'approved', p_reseller: null }); setAppId(null); await loadApps(); }
    setNote(`${pick.label} is now a reseller.`); setAdding(false); setPick(null); setQ(''); setFound([]); setPhone(''); setPct('10');
    await load();
  }
  async function save(r: Reseller) {
    const e = edit[r.id]; const p = Number(e.pct);
    if (!(p >= 0 && p <= 100)) { setError('The commission must be between 0 and 100.'); return; }
    setBusy(r.id); setError(null); setNote(null);
    const { error } = await supabase.rpc('admin_update_reseller', { p_id: r.id, p_pct: p, p_status: e.status });
    setBusy(null);
    if (error) setError(error.message); else { setNote('Saved. A new percentage applies to future packages only.'); await load(); }
  }
  async function searchShops() {
    const term = bq.trim();
    if (term.length < 2) { setBfound([]); return; }
    const { data, error } = await supabase.from('businesses').select('id,name,phone').ilike('name', `%${term}%`).limit(8);
    if (error) { setError(error.message); return; }
    setBfound((data ?? []).map((b: any) => ({ key: b.id, label: b.name, sub: b.phone ?? '' })));
  }
  async function link(r: Reseller, b: Found) {
    setBusy(r.id); setError(null); setNote(null);
    const { error } = await supabase.rpc('admin_link_referral', { p_business: b.key, p_reseller: r.id });
    setBusy(null);
    if (error) setError(error.message); else { setNote(`${b.label} is linked to ${r.name}.`); setBq(''); setBfound([]); await load(); }
  }
  async function pay(r: Reseller) {
    if (!window.confirm(`Mark ${money(r.owed)} as paid to ${r.name}? Do this only after you have sent the money.`)) return;
    setBusy(r.id); setError(null); setNote(null);
    const { error } = await supabase.rpc('admin_mark_commissions_paid', { p_reseller: r.id, p_note: `Paid ${new Date().toLocaleDateString()}` });
    setBusy(null);
    if (error) setError(error.message); else { setNote('Marked as paid.'); await load(); }
  }

  if (!rows) return <Skeleton />;
  const owedTotal = rows.reduce((s, r) => s + r.owed, 0);

  return (
    <div className="space-y-3 max-w-3xl">
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm text-slate-500">Resellers bring shops to ShopOS and earn a percentage of every paid package those shops buy. You pay them yourself, then mark it paid here.</p>
        <button onClick={() => setAdding((a) => !a)} className="btn-primary inline-flex items-center gap-1.5 text-sm shrink-0"><Plus className="w-4 h-4" /> New reseller</button>
      </div>
      {error && <ErrorText>{error}</ErrorText>}
      {note && <p className="text-sm text-emerald-400">{note}</p>}
      <div className="grid grid-cols-3 gap-2">
        <Card><div className="text-xs text-slate-400">Resellers</div><div className="text-xl font-semibold">{rows.length}</div></Card>
        <Card><div className="text-xs text-slate-400">Owed now</div><div className="text-xl font-semibold">{money(owedTotal)}</div></Card>
        <Card><div className="text-xs text-slate-400">Paid out</div><div className="text-xl font-semibold">{money(rows.reduce((s, r) => s + r.paid, 0))}</div></Card>
      </div>

      {apps.length > 0 && (
        <Card>
          <h3 className="font-medium mb-2">Applications waiting ({apps.length})</h3>
          <ul className="divide-y divide-slate-800">
            {apps.map((a) => (
              <li key={a.id} className="py-2.5 space-y-1">
                <div className="flex items-center justify-between gap-2"><span className="font-medium">{a.name}</span><span className="text-xs text-slate-400">{new Date(a.created_at).toLocaleDateString()}</span></div>
                <div className="text-xs text-slate-400">{a.phone}{a.email ? ` · ${a.email}` : ''}{a.area ? ` · ${a.area}` : ''}</div>
                {a.note && <p className="text-sm text-slate-300">{a.note}</p>}
                <div className="flex gap-2 pt-1">
                  <button onClick={() => startApproval(a)} className="btn-primary text-sm">Approve</button>
                  <button onClick={() => void reject(a)} className="btn-secondary text-sm">Reject</button>
                </div>
              </li>
            ))}
          </ul>
          <p className="text-[11px] text-slate-500 mt-2">Approve opens a form with their details filled in. You create their partner sign-in and send them the password.</p>
        </Card>
      )}

      {creds && (
        <Card className="border border-emerald-500/40">
          <h3 className="font-medium mb-1">{creds.name} can now sign in</h3>
          <p className="text-xs text-slate-400 mb-2">Send them these details now. The password is shown only once. They sign in at the ShopOS app and can change it with "Forgot password".</p>
          <div className="text-sm space-y-1">
            <div>Email: <b>{creds.email}</b></div>
            <div>Temporary password: <code className="px-2 py-0.5 rounded bg-slate-800">{creds.password}</code></div>
            <div>Partner code: <b>{creds.code}</b></div>
          </div>
          <div className="flex gap-2 mt-3">
            <button onClick={() => void navigator.clipboard?.writeText(`ShopOS partner account\nSign in: https://shopos-app.vercel.app/login\nEmail: ${creds.email}\nPassword: ${creds.password}\nYour partner code: ${creds.code}`)} className="btn-secondary text-sm inline-flex items-center gap-1.5"><Copy className="w-4 h-4" /> Copy message</button>
            <button onClick={() => setCreds(null)} className="btn-secondary text-sm">Done</button>
          </div>
        </Card>
      )}

      {adding && (
        <Card>
          <h3 className="font-medium mb-2">Add a reseller</h3>
          <div className="flex gap-2 mb-3">
            <button onClick={() => setMode('new')} className={`text-sm px-3 py-1.5 rounded-full border ${mode === 'new' ? 'bg-field-600 border-field-600 text-white' : 'border-slate-700 text-slate-300'}`}>New partner account</button>
            <button onClick={() => setMode('existing')} className={`text-sm px-3 py-1.5 rounded-full border ${mode === 'existing' ? 'bg-field-600 border-field-600 text-white' : 'border-slate-700 text-slate-300'}`}>Existing ShopOS account</button>
          </div>
          {mode === 'new' ? (
            <div className="space-y-2">
              <p className="text-xs text-slate-400">Creates their own sign-in. They do not need a shop. They sign in with the email below and see only their partner dashboard.</p>
              <div className="grid grid-cols-2 gap-2">
                <input className="input" placeholder="Full name" value={name} onChange={(e) => setName(e.target.value)} />
                <input className="input" placeholder="Phone (for payouts)" value={phone} onChange={(e) => setPhone(e.target.value)} />
                <input className="input" type="email" placeholder="Email (their sign-in)" value={email} onChange={(e) => setEmail(e.target.value)} />
                <input className="input" type="number" min={0} max={100} placeholder="Commission %" value={pct} onChange={(e) => setPct(e.target.value)} />
              </div>
              <button onClick={() => void createNew()} disabled={busy === 'create' || !name.trim() || !email.trim()} className="btn-primary text-sm disabled:opacity-60">{busy === 'create' ? 'Creating…' : 'Create partner account'}</button>
            </div>
          ) : (
            <div>
              <p className="text-xs text-slate-400 mb-2">For someone who already uses ShopOS. Search by their name.</p>
              <div className="flex gap-2">
                <input className="input flex-1" placeholder="Search a name" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') void searchPeople(); }} />
                <button onClick={() => void searchPeople()} className="btn-secondary inline-flex items-center gap-1.5 text-sm"><Search className="w-4 h-4" /> Search</button>
              </div>
              {found.length > 0 && !pick && (
                <ul className="mt-2 divide-y divide-slate-800 border border-slate-800 rounded-card">
                  {found.map((f) => <li key={f.key}><button onClick={() => { setPick(f); setFound([]); }} className="w-full text-left px-3 py-2 hover:bg-slate-800/60"><div className="text-sm font-medium">{f.label}</div><div className="text-xs text-slate-400">{f.sub}</div></button></li>)}
                </ul>
              )}
              {pick && (
                <div className="mt-3 space-y-2">
                  <div className="text-sm">Selected: <b>{pick.label}</b> <button className="text-xs text-field-500 ml-1" onClick={() => setPick(null)}>change</button></div>
                  <div className="grid grid-cols-2 gap-2">
                    <input className="input" placeholder="Phone (for payouts)" value={phone} onChange={(e) => setPhone(e.target.value)} />
                    <input className="input" type="number" min={0} max={100} placeholder="Commission %" value={pct} onChange={(e) => setPct(e.target.value)} />
                  </div>
                  <button onClick={() => void create()} disabled={busy === 'create'} className="btn-primary text-sm disabled:opacity-60">{busy === 'create' ? 'Saving…' : 'Create reseller'}</button>
                </div>
              )}
            </div>
          )}
        </Card>
      )}

      {rows.length === 0 && !adding && <Card><p className="text-sm text-slate-400 text-center py-4">No resellers yet.</p></Card>}
      {rows.map((r) => (
        <Card key={r.id}>
          <button onClick={() => setOpen(open === r.id ? null : r.id)} className="w-full flex items-center justify-between gap-2 text-left">
            <span className="min-w-0"><span className="font-medium">{r.name}</span> <span className="text-xs text-slate-400">· code {r.code} · {r.commission_pct}% · {r.shops} shop{r.shops === 1 ? '' : 's'}</span></span>
            <span className="text-right shrink-0"><span className="block text-sm font-semibold">{money(r.owed)}</span><span className={`text-[11px] ${r.status === 'active' ? 'text-emerald-400' : 'text-amber-400'}`}>{r.status === 'active' ? 'owed' : 'paused'}</span></span>
          </button>
          {open === r.id && (
            <div className="mt-3 space-y-3">
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <span className="text-slate-400">Referral code</span><code className="px-2 py-0.5 rounded bg-slate-800">{r.code}</code>
                <button onClick={() => void navigator.clipboard?.writeText(r.code)} className="text-xs text-field-500 inline-flex items-center gap-1"><Copy className="w-3 h-3" /> Copy</button>
                {r.phone && <span className="text-slate-400">· {r.phone}</span>}
              </div>
              <div className="grid grid-cols-2 gap-2">
                <label className="text-xs text-slate-400">Commission %<input className="input w-full mt-1" type="number" min={0} max={100} value={edit[r.id]?.pct ?? ''} onChange={(e) => setEdit({ ...edit, [r.id]: { ...edit[r.id], pct: e.target.value } })} /></label>
                <label className="text-xs text-slate-400">Status<select className="input w-full mt-1" value={edit[r.id]?.status ?? 'active'} onChange={(e) => setEdit({ ...edit, [r.id]: { ...edit[r.id], status: e.target.value } })}><option value="active">Active</option><option value="paused">Paused</option></select></label>
              </div>
              <div className="flex flex-wrap gap-2">
                <button onClick={() => void save(r)} disabled={busy === r.id} className="btn-secondary text-sm inline-flex items-center gap-1.5 disabled:opacity-60"><Save className="w-4 h-4" /> Save</button>
                <button onClick={() => void pay(r)} disabled={busy === r.id || r.owed <= 0} className="btn-primary text-sm inline-flex items-center gap-1.5 disabled:opacity-50"><Wallet className="w-4 h-4" /> Mark {money(r.owed)} as paid</button>
              </div>
              <div>
                <div className="text-xs text-slate-400 mb-1 flex items-center gap-1"><Link2 className="w-3.5 h-3.5" /> Link a shop to this reseller (for example one that registered before the code existed)</div>
                <div className="flex gap-2">
                  <input className="input flex-1" placeholder="Search a shop name" value={bq} onChange={(e) => setBq(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') void searchShops(); }} />
                  <button onClick={() => void searchShops()} className="btn-secondary text-sm">Search</button>
                </div>
                {bfound.length > 0 && <ul className="mt-2 divide-y divide-slate-800 border border-slate-800 rounded-card">{bfound.map((b) => <li key={b.key}><button onClick={() => void link(r, b)} className="w-full text-left px-3 py-2 hover:bg-slate-800/60"><span className="text-sm font-medium">{b.label}</span> <span className="text-xs text-slate-400">{b.sub}</span></button></li>)}</ul>}
                <p className="text-[11px] text-slate-500 mt-1">Commission counts from the day a shop is linked, on packages bought after that.</p>
              </div>
            </div>
          )}
        </Card>
      ))}
    </div>
  );
}
