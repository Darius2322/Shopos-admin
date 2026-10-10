import { useCallback, useEffect, useMemo, useState } from 'react';
import { SupabaseClient } from '@supabase/supabase-js';
import { Loader2, Plus, Star, Archive, ArchiveRestore, Pencil, X, Check, CalendarClock, Ban, Trash2 } from 'lucide-react';
import { PackageStats } from '../components/PackageStats';
import { Card, EmptyState, Skeleton, ErrorText } from '../components/ui';
import { friendlyError } from '../lib/friendlyError';

interface Service { key: string; label: string; description: string | null }
interface Pkg { id: string; name: string; tagline: string | null; description: string | null; price: number; currency: string; validity_months: number | null; validity_days: number | null; features: string[]; service_keys: string[]; highlighted: boolean; is_public: boolean; is_active: boolean; sort: number }
interface BizRow { business_id: string; name: string; status: string; package_id: string | null; package_name: string | null; price: number | null; currency: string | null; ends_at: string | null; days_left: number | null; state: string; pending_request: boolean }
interface Offer { id: string; name: string; message: string | null; starts_at: string; ends_at: string; service_keys: string[]; opens_app: boolean; ended_early_at: string | null }
interface Req { id: string; business_id: string; business_name: string; owner_email: string | null; package_id: string | null; package_name: string | null; kind: string; note: string | null; status: string; admin_note: string | null; created_at: string; current_ends_at: string | null }
interface Hist { id: string; package_name: string; price: number | null; currency: string | null; started_at: string; ends_at: string | null; source: string; note: string | null }

type Sub = 'packages' | 'businesses' | 'offers' | 'requests' | 'stats';
const SUBS: [Sub, string][] = [['packages', 'Packages'], ['businesses', 'Business plans'], ['offers', 'Offers'], ['requests', 'Requests'], ['stats', 'Popularity']];
const MONTHS: [string, number | null][] = [['1 month', 1], ['2 months', 2], ['3 months', 3], ['6 months', 6], ['1 year', 12], ['2 years', 24], ['Lifetime', null]];
const money = (n: number, c = 'KES') => `${c} ${Number(n).toLocaleString()}`;
const validity = (m: number | null, dd?: number | null) => (dd ? `${dd} day${dd === 1 ? '' : 's'}` : m === null ? 'Lifetime' : m % 12 === 0 ? `${m / 12} year${m === 12 ? '' : 's'}` : `${m} month${m === 1 ? '' : 's'}`);
const localInput = (iso: string | null) => { const t = iso ? new Date(iso) : new Date(Date.now() + 86400000); t.setMinutes(t.getMinutes() - t.getTimezoneOffset()); return t.toISOString().slice(0, 16); };
const d = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString() : '–');
const STATE_STYLE: Record<string, string> = { active: 'bg-emerald-500/15 text-emerald-400', lifetime: 'bg-teal-500/15 text-teal-300', expiring: 'bg-amber-500/20 text-amber-400', expired: 'bg-red-500/20 text-red-400', pending: 'bg-slate-700 text-slate-300' };

/** Packages: build plans, see which plan each business is on, run offers and answer renew/upgrade requests.
 * A package's validity sets the business's access end date, the same date the activation flow already uses. */
export default function Packages({ supabase }: { supabase: SupabaseClient }) {
  const [sub, setSub] = useState<Sub>('packages');
  const [services, setServices] = useState<Service[]>([]);
  const [pkgs, setPkgs] = useState<Pkg[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(0);

  const loadBase = useCallback(async () => {
    const [s, p, r] = await Promise.all([
      supabase.from('package_services').select('key, label, description').order('sort'),
      supabase.from('packages').select('*').order('sort').order('price'),
      supabase.rpc('admin_package_requests', { p_status: 'pending' }),
    ]);
    if (s.error || p.error) setError(friendlyError(s.error ?? p.error, 'Could not load packages.'));
    setServices((s.data ?? []) as Service[]); setPkgs((p.data ?? []) as Pkg[]); setPending(((r.data ?? []) as Req[]).length);
  }, [supabase]);
  useEffect(() => { void loadBase(); }, [loadBase]);

  return (
    <div className="space-y-4">
      <div>
        <h2 className="font-display font-semibold text-lg">Packages</h2>
        <p className="text-xs text-slate-400">Create plans, choose which services each includes, and see every business's plan. Owners pick from active, public packages on the website and in the app.</p>
      </div>
      <div className="flex gap-1 overflow-x-auto pb-1" role="tablist">
        {SUBS.map(([k, l]) => (
          <button key={k} role="tab" aria-selected={sub === k} onClick={() => setSub(k)} className={`text-sm px-3.5 min-h-[36px] rounded-full whitespace-nowrap inline-flex items-center gap-1.5 ${sub === k ? 'bg-field-600 text-white' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'}`}>
            {l}{k === 'requests' && pending > 0 && <span className="text-[10px] bg-rust-500 text-white rounded-full min-w-[16px] h-4 px-1 flex items-center justify-center">{pending}</span>}
          </button>
        ))}
      </div>
      <ErrorText>{error}</ErrorText>
      {!pkgs ? <Skeleton /> : (
        <>
          {sub === 'packages' && <PackagesTab supabase={supabase} pkgs={pkgs} services={services} reload={loadBase} />}
          {sub === 'businesses' && <BusinessesTab supabase={supabase} pkgs={pkgs} />}
          {sub === 'offers' && <OffersTab supabase={supabase} services={services} />}
          {sub === 'requests' && <RequestsTab supabase={supabase} onChanged={loadBase} />}
          {sub === 'stats' && <PackageStats supabase={supabase} />}
        </>
      )}
    </div>
  );
}

function PackagesTab({ supabase, pkgs, services, reload }: { supabase: SupabaseClient; pkgs: Pkg[]; services: Service[]; reload: () => Promise<void> }) {
  const blank: Pkg = { id: '', name: '', tagline: '', description: '', price: 0, currency: 'KES', validity_months: 1, validity_days: null, features: [], service_keys: [], highlighted: false, is_public: true, is_active: true, sort: 0 };
  const [edit, setEdit] = useState<Pkg | null>(null);
  const [featText, setFeatText] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  function open(p: Pkg) { setEdit({ ...p }); setFeatText((p.features ?? []).join('\n')); setErr(null); }
  async function save() {
    if (!edit) return;
    if (edit.name.trim().length < 2) { setErr('Give the package a name.'); return; }
    setBusy('save'); setErr(null);
    const { error } = await supabase.rpc('admin_save_package', { p: { ...edit, id: edit.id || null, features: featText.split('\n').map((s) => s.trim()).filter(Boolean) } });
    if (error) setErr(friendlyError(error, 'Could not save this package.')); else { setEdit(null); await reload(); }
    setBusy(null);
  }
  async function archive(p: Pkg) {
    setBusy(p.id);
    const { error } = await supabase.rpc('admin_archive_package', { p_id: p.id, p_active: !p.is_active });
    if (error) setErr(friendlyError(error)); else await reload();
    setBusy(null);
  }
  const toggle = (k: string) => edit && setEdit({ ...edit, service_keys: edit.service_keys.includes(k) ? edit.service_keys.filter((x) => x !== k) : [...edit.service_keys, k] });

  return (
    <div className="space-y-3">
      <button onClick={() => open(blank)} className="btn-primary inline-flex items-center gap-1.5 min-h-[40px] px-4 text-sm"><Plus className="w-4 h-4" /> New package</button>
      <ErrorText>{err && !edit ? err : null}</ErrorText>
      {pkgs.length === 0 && <Card><EmptyState message="No packages yet. Create the first one." /></Card>}
      {pkgs.map((p) => (
        <Card key={p.id} className={`space-y-2 ${p.is_active ? '' : 'opacity-60'}`}>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="font-medium flex items-center gap-1.5">{p.name}{p.highlighted && <Star className="w-3.5 h-3.5 text-amber-400 fill-amber-400" aria-label="Highlighted" />}</p>
              {p.tagline && <p className="text-xs text-slate-400">{p.tagline}</p>}
            </div>
            <div className="text-right shrink-0"><p className="font-semibold tnum">{money(p.price, p.currency)}</p><p className="text-xs text-slate-400">{validity(p.validity_months, p.validity_days)}</p></div>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {p.service_keys.length === 0 ? <span className="text-xs text-slate-500">Core features only</span> : p.service_keys.map((k) => <span key={k} className="text-[11px] px-2 py-0.5 rounded-full bg-slate-800 text-slate-300">{services.find((s) => s.key === k)?.label ?? k}</span>)}
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className={`px-2 py-0.5 rounded-full ${p.is_active ? 'bg-emerald-500/15 text-emerald-400' : 'bg-slate-700 text-slate-300'}`}>{p.is_active ? 'Active' : 'Archived'}</span>
            <span className={`px-2 py-0.5 rounded-full ${p.is_public ? 'bg-slate-800 text-slate-300' : 'bg-slate-800 text-slate-500'}`}>{p.is_public ? 'Shown on website' : 'Hidden from website'}</span>
            <span className="flex-1" />
            <button onClick={() => open(p)} className="btn-secondary inline-flex items-center gap-1 min-h-[34px] px-3"><Pencil className="w-3.5 h-3.5" /> Edit</button>
            <button onClick={() => void archive(p)} disabled={busy === p.id} className="btn-secondary inline-flex items-center gap-1 min-h-[34px] px-3">{p.is_active ? <><Archive className="w-3.5 h-3.5" /> Archive</> : <><ArchiveRestore className="w-3.5 h-3.5" /> Restore</>}</button>
          </div>
        </Card>
      ))}

      {edit && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-end sm:items-center justify-center p-0 sm:p-4" role="dialog" aria-modal="true" aria-label="Package editor">
          <div className="card w-full sm:max-w-lg max-h-[92vh] overflow-y-auto p-4 space-y-3 rounded-b-none sm:rounded-b-card">
            <div className="flex items-center justify-between"><p className="font-medium">{edit.id ? 'Edit package' : 'New package'}</p><button onClick={() => setEdit(null)} aria-label="Close" className="p-1 text-slate-400"><X className="w-5 h-5" /></button></div>
            <label className="block"><span className="block text-xs text-slate-400 mb-1">Name</span><input className="input" value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} maxLength={60} /></label>
            <label className="block"><span className="block text-xs text-slate-400 mb-1">Short line (shown under the name)</span><input className="input" value={edit.tagline ?? ''} onChange={(e) => setEdit({ ...edit, tagline: e.target.value })} maxLength={140} /></label>
            <div className="grid grid-cols-2 gap-3">
              <label className="block"><span className="block text-xs text-slate-400 mb-1">Cost ({edit.currency})</span><input className="input" type="number" min={0} step="0.01" value={edit.price} onChange={(e) => setEdit({ ...edit, price: Number(e.target.value) })} /></label>
              <div className="block"><span className="block text-xs text-slate-400 mb-1">Valid for</span>
                <div className="flex gap-1.5">
                  <select className="input !w-auto" aria-label="Unit" value={edit.validity_days ? 'days' : edit.validity_months === null ? 'life' : 'months'}
                    onChange={(e) => setEdit({ ...edit, validity_days: e.target.value === 'days' ? (edit.validity_days ?? 7) : null, validity_months: e.target.value === 'months' ? (edit.validity_months ?? 1) : null })}>
                    <option value="days">Days</option><option value="months">Months</option><option value="life">Lifetime</option>
                  </select>
                  {edit.validity_days ? <input className="input min-w-0" type="number" min={1} max={3650} aria-label="Number of days" value={edit.validity_days} onChange={(e) => setEdit({ ...edit, validity_days: Math.max(1, Math.min(3650, Number(e.target.value) || 1)) })} />
                    : edit.validity_months !== null ? <input className="input min-w-0" type="number" min={1} max={120} aria-label="Number of months" value={edit.validity_months} onChange={(e) => setEdit({ ...edit, validity_months: Math.max(1, Math.min(120, Number(e.target.value) || 1)) })} /> : null}
                </div>
              </div>
            </div>
            <label className="block"><span className="block text-xs text-slate-400 mb-1">What it includes (one per line)</span><textarea className="input min-h-[96px]" value={featText} onChange={(e) => setFeatText(e.target.value)} placeholder={'Unlimited sales\n2 staff accounts'} /></label>
            <label className="block"><span className="block text-xs text-slate-400 mb-1">More details</span><textarea className="input min-h-[72px]" value={edit.description ?? ''} onChange={(e) => setEdit({ ...edit, description: e.target.value })} maxLength={1500} /></label>
            <div>
              <span className="block text-xs text-slate-400 mb-1.5">Services included</span>
              <p className="text-[11px] text-slate-500 mb-2">Selling, stock, customers, debts and support are in every package. Tick the extra services this one unlocks.</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                {services.map((s) => { const on = edit.service_keys.includes(s.key); return (
                  <button type="button" key={s.key} onClick={() => toggle(s.key)} aria-pressed={on} className={`text-left text-sm rounded-xl px-3 py-2 flex items-center gap-2 border ${on ? 'border-teal-500 bg-teal-500/10' : 'border-slate-700'}`}>
                    <span className={`w-4 h-4 rounded flex items-center justify-center shrink-0 ${on ? 'bg-teal-500 text-slate-900' : 'bg-slate-800'}`}>{on && <Check className="w-3 h-3" />}</span>{s.label}
                  </button>); })}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2 text-sm">
              {([['is_public', 'Show on website'], ['highlighted', 'Highlight as recommended'], ['is_active', 'Active']] as [keyof Pkg, string][]).map(([k, l]) => (
                <label key={k} className="flex items-center gap-2"><input type="checkbox" checked={!!edit[k]} onChange={(e) => setEdit({ ...edit, [k]: e.target.checked })} /> {l}</label>
              ))}
              <label className="flex items-center gap-2">Order <input className="input w-16 py-1" type="number" value={edit.sort} onChange={(e) => setEdit({ ...edit, sort: Number(e.target.value) })} /></label>
            </div>
            <ErrorText>{err}</ErrorText>
            <div className="flex gap-2 justify-end"><button onClick={() => setEdit(null)} className="btn-secondary min-h-[40px] px-4">Cancel</button><button onClick={() => void save()} disabled={busy === 'save'} className="btn-primary min-h-[40px] px-4 inline-flex items-center gap-1.5">{busy === 'save' && <Loader2 className="w-4 h-4 animate-spin" />} Save</button></div>
          </div>
        </div>
      )}
    </div>
  );
}

function BusinessesTab({ supabase, pkgs, focusId, onCloseFocus }: { supabase: SupabaseClient; pkgs: Pkg[]; focusId?: string; onCloseFocus?: () => void }) {
  const [rows, setRows] = useState<BizRow[] | null>(null);
  const [q, setQ] = useState('');
  const [sel, setSel] = useState<BizRow | null>(null);
  const [hist, setHist] = useState<Hist[]>([]);
  const [pkgId, setPkgId] = useState('');
  const [period, setPeriod] = useState<'pkg' | 'days' | 'date' | 'life'>('pkg');
  const [days, setDays] = useState(1);
  const [until, setUntil] = useState(() => localInput(null));
  const [extend, setExtend] = useState(false);
  const [filter, setFilter] = useState<'all' | 'active' | 'expiring' | 'expired' | 'none'>('all');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const load = useCallback(async () => {
    const { data, error } = await supabase.rpc('admin_business_packages');
    if (error) setMsg({ ok: false, text: friendlyError(error, 'Could not load business plans.') }); else setRows((data ?? []) as BizRow[]);
  }, [supabase]);
  useEffect(() => { void load(); }, [load]);
  const [focused, setFocused] = useState(false);
  useEffect(() => { if (focusId && rows && !focused) { const r = rows.find((x) => x.business_id === focusId); setFocused(true); if (r) void pick(r); } }, [focusId, rows, focused]);

  async function pick(r: BizRow) {
    setSel(r); setMsg(null); setPkgId(r.package_id ?? ''); setPeriod('pkg'); setDays(1); setUntil(localInput(r.ends_at)); setExtend(false); setNote('');
    const { data } = await supabase.rpc('admin_business_package_history', { p_business_id: r.business_id });
    setHist((data ?? []) as Hist[]);
  }
  async function assign() {
    if (!sel || !pkgId) { setMsg({ ok: false, text: 'Choose a package first.' }); return; }
    setBusy(true); setMsg(null);
    if (period === 'date' && new Date(until).getTime() <= Date.now()) { setBusy(false); setMsg({ ok: false, text: 'Choose an expiry date and time in the future.' }); return; }
    const { error } = await supabase.rpc('admin_assign_package2', { p_business_id: sel.business_id, p_package_id: pkgId, p_days: period === 'days' ? days : null, p_expires_at: period === 'date' ? new Date(until).toISOString() : null, p_lifetime: period === 'life', p_extend: extend && period !== 'date', p_note: note || null, p_source: 'admin' });
    if (error) setMsg({ ok: false, text: friendlyError(error, 'Could not apply the package.') });
    else { setMsg({ ok: true, text: 'Package applied.' }); await load(); await pick({ ...sel, package_id: pkgId }); }
    setBusy(false);
  }
  async function setExpiryOnly() {
    if (!sel) return;
    if (new Date(until).getTime() <= Date.now()) { setMsg({ ok: false, text: 'Choose an expiry date and time in the future.' }); return; }
    setBusy(true); setMsg(null);
    const { error } = await supabase.rpc('admin_set_business_expiry', { p_business_id: sel.business_id, p_expires_at: new Date(until).toISOString(), p_note: note || null });
    if (error) setMsg({ ok: false, text: friendlyError(error, 'Could not change the expiry date.') }); else { setMsg({ ok: true, text: 'Expiry date changed.' }); await load(); await pick({ ...sel, ends_at: new Date(until).toISOString() }); }
    setBusy(false);
  }
  async function removePlan(endNow: boolean) {
    if (!sel) return;
    if (!window.confirm(endNow ? `End ${sel.name}'s plan now? The business will be switched off until you apply a package again.` : `Remove ${sel.name}'s package? It goes back to having no package, with full access, and keeps its end date.`)) return;
    setBusy(true); setMsg(null);
    const { error } = await supabase.rpc('admin_remove_business_package', { p_business_id: sel.business_id, p_end_now: endNow, p_note: note || null });
    if (error) setMsg({ ok: false, text: friendlyError(error, 'Could not change this plan.') }); else { setMsg({ ok: true, text: endNow ? 'Plan ended.' : 'Package removed.' }); await load(); await pick({ ...sel, package_id: endNow ? sel.package_id : null, package_name: endNow ? sel.package_name : null }); }
    setBusy(false);
  }
  const counts = useMemo(() => { const r = rows ?? []; return { all: r.length, active: r.filter((x) => x.state === 'active' || x.state === 'lifetime').length, expiring: r.filter((x) => x.state === 'expiring').length, expired: r.filter((x) => x.state === 'expired').length, none: r.filter((x) => !x.package_id).length }; }, [rows]);
  const shown = useMemo(() => (rows ?? []).filter((r) => r.name.toLowerCase().includes(q.trim().toLowerCase()) && (filter === 'all' || (filter === 'active' ? r.state === 'active' || r.state === 'lifetime' : filter === 'none' ? !r.package_id : r.state === filter))), [rows, q, filter]);
  if (!rows) return <Skeleton />;

  return (
    <div className="space-y-3">
      {!focusId && <>
      <input className="input w-full" placeholder="Find a business" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Find a business" />
      <div className="flex gap-1.5 overflow-x-auto pb-1">
        {([['all', 'All'], ['active', 'Active'], ['expiring', 'Ending soon'], ['expired', 'Expired'], ['none', 'No package']] as const).map(([k, l]) => (
          <button key={k} onClick={() => setFilter(k)} className={`text-xs px-3 min-h-[32px] rounded-full whitespace-nowrap ${filter === k ? 'bg-field-600 text-white' : 'bg-slate-800 text-slate-300'}`}>{l} <span className="opacity-70">{counts[k]}</span></button>
        ))}
      </div>
      {shown.length === 0 && <Card><EmptyState message="No businesses match." /></Card>}
      {shown.map((r) => (
        <button key={r.business_id} onClick={() => void pick(r)} className="card p-3 w-full text-left flex items-center justify-between gap-3 hover:border-slate-500">
          <span className="min-w-0"><span className="block font-medium truncate">{r.name}{r.pending_request && <span className="ml-2 text-[10px] bg-rust-500 text-white rounded-full px-1.5 py-0.5">request</span>}</span>
            <span className="block text-xs text-slate-400 truncate">{r.package_name ?? 'No package (full access)'} · {r.ends_at ? `ends ${d(r.ends_at)}` : r.state === 'pending' ? 'not activated' : 'no end date'}</span></span>
          <span className={`text-xs px-2 py-0.5 rounded-full whitespace-nowrap ${STATE_STYLE[r.state] ?? STATE_STYLE.pending}`}>{r.state === 'expiring' ? `${r.days_left} day${r.days_left === 1 ? '' : 's'} left` : r.state}</span>
        </button>
      ))}
      </>}

      {sel && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-end sm:items-center justify-center p-0 sm:p-4" role="dialog" aria-modal="true" aria-label="Business package">
          <div className="card w-full sm:max-w-lg max-h-[92vh] overflow-y-auto p-4 space-y-3 rounded-b-none sm:rounded-b-card">
            <div className="flex items-center justify-between"><p className="font-medium truncate">{sel.name}</p><button onClick={() => { setSel(null); onCloseFocus?.(); }} aria-label="Close" className="p-1 text-slate-400"><X className="w-5 h-5" /></button></div>
            <p className="text-xs text-slate-400">Now: {sel.package_name ?? 'No package (full access)'} · {sel.ends_at ? `${sel.state === 'expired' ? 'ended' : 'ends'} ${d(sel.ends_at)}` : 'no end date'}</p>
            <label className="block"><span className="block text-xs text-slate-400 mb-1">Package</span>
              <select className="input" value={pkgId} onChange={(e) => setPkgId(e.target.value)}><option value="">Choose…</option>{pkgs.filter((p) => p.is_active || p.id === sel.package_id).map((p) => <option key={p.id} value={p.id}>{p.name} · {money(p.price, p.currency)}</option>)}</select></label>
            <div><span className="block text-xs text-slate-400 mb-1">Period</span>
              <div className="flex flex-wrap gap-1.5 mb-2">
                {([['pkg', "Package's own"], ['days', 'Number of days'], ['date', 'Exact expiry date'], ['life', 'Lifetime']] as const).map(([k, l]) => (
                  <button type="button" key={k} onClick={() => setPeriod(k)} aria-pressed={period === k} className={`text-xs px-3 min-h-[34px] rounded-full ${period === k ? 'bg-field-600 text-white' : 'bg-slate-800 text-slate-300'}`}>{l}</button>
                ))}
              </div>
              {period === 'days' && <div className="flex items-center gap-2"><input className="input !w-24" type="number" min={1} max={3650} value={days} onChange={(e) => setDays(Math.max(1, Math.min(3650, Number(e.target.value) || 1)))} aria-label="Days" /><span className="text-sm text-slate-400">day{days === 1 ? '' : 's'} (as low as 1)</span>
                <span className="flex gap-1">{[1, 3, 7, 14, 30].map((n) => <button type="button" key={n} onClick={() => setDays(n)} className="text-[11px] px-2 py-1 rounded-full bg-slate-800 text-slate-300">{n}d</button>)}</span></div>}
              {period === 'date' && <input className="input" type="datetime-local" value={until} min={localInput(new Date(Date.now() + 60000).toISOString())} onChange={(e) => setUntil(e.target.value)} aria-label="Expiry date and time" />}
            </div>
            {period !== 'date' && <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={extend} onChange={(e) => setExtend(e.target.checked)} /> Add to the current end date (renewal) instead of starting today</label>}
            <label className="block"><span className="block text-xs text-slate-400 mb-1">Note (optional, shown in history)</span><input className="input" value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} /></label>
            {msg && <p className={`text-sm ${msg.ok ? 'text-emerald-400' : 'text-rust-500'}`} role="status">{msg.text}</p>}
            <button onClick={() => void assign()} disabled={busy} className="btn-primary w-full min-h-[44px] inline-flex items-center justify-center gap-1.5">{busy && <Loader2 className="w-4 h-4 animate-spin" />} Apply package</button>
            <p className="text-[11px] text-slate-500">An expired business is switched back on when you apply a package or a new expiry date.</p>
            <div className="border-t border-slate-800 pt-3 space-y-2">
              <p className="text-xs font-medium text-slate-400">Manage this plan</p>
              <div className="flex flex-wrap items-center gap-2">
                <input className="input !w-auto text-sm" type="datetime-local" value={until} onChange={(e) => setUntil(e.target.value)} aria-label="New expiry date and time" />
                <button onClick={() => void setExpiryOnly()} disabled={busy} className="btn-secondary min-h-[38px] px-3 text-sm inline-flex items-center gap-1.5"><CalendarClock className="w-4 h-4" /> Change expiry only</button>
              </div>
              <div className="flex flex-wrap gap-2">
                <button onClick={() => void removePlan(true)} disabled={busy} className="btn-secondary min-h-[38px] px-3 text-sm inline-flex items-center gap-1.5 !text-amber-400"><Ban className="w-4 h-4" /> End plan now</button>
                <button onClick={() => void removePlan(false)} disabled={busy || !sel.package_id} className="btn-secondary min-h-[38px] px-3 text-sm inline-flex items-center gap-1.5 !text-rust-500"><Trash2 className="w-4 h-4" /> Remove package</button>
              </div>
            </div>
            <div>
              <p className="text-xs font-medium text-slate-400 mb-1.5">History</p>
              {hist.length === 0 ? <p className="text-xs text-slate-500">No package history yet.</p> : (
                <ul className="divide-y divide-slate-800 text-xs">
                  {hist.map((h) => <li key={h.id} className="py-2 flex justify-between gap-3"><span><b>{h.package_name}</b>{h.price != null && ` · ${money(h.price, h.currency ?? 'KES')}`}<span className="block text-slate-500">{h.source}{h.note ? ` · ${h.note}` : ''}</span></span><span className="text-right text-slate-400 shrink-0">{d(h.started_at)} → {h.ends_at ? d(h.ends_at) : 'lifetime'}</span></li>)}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function OffersTab({ supabase, services }: { supabase: SupabaseClient; services: Service[] }) {
  const [offers, setOffers] = useState<Offer[] | null>(null);
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ name: '', message: '', days: 14, opens_app: false, service_keys: [] as string[] });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const load = useCallback(async () => {
    const { data } = await supabase.from('package_offers').select('*').order('created_at', { ascending: false }).limit(30);
    setOffers((data ?? []) as Offer[]);
  }, [supabase]);
  useEffect(() => { void load(); }, [load]);

  async function create() {
    if (f.name.trim().length < 2) { setErr('Give the offer a name.'); return; }
    if (!f.opens_app && f.service_keys.length === 0) { setErr('Open the app for everyone, or tick at least one service.'); return; }
    setBusy(true); setErr(null);
    const { error } = await supabase.rpc('admin_save_offer', { p: { name: f.name, message: f.message, ends_at: new Date(Date.now() + f.days * 86400000).toISOString(), opens_app: f.opens_app, service_keys: f.service_keys } });
    if (error) setErr(friendlyError(error, 'Could not start the offer.')); else { setOpen(false); setF({ name: '', message: '', days: 14, opens_app: false, service_keys: [] }); await load(); }
    setBusy(false);
  }
  async function end(o: Offer) {
    if (!window.confirm(`End "${o.name}" now? Businesses lose the access it gave.`)) return;
    const { error } = await supabase.rpc('admin_end_offer', { p_id: o.id });
    if (error) setErr(friendlyError(error)); else await load();
  }
  const status = (o: Offer) => o.ended_early_at ? 'Ended early' : new Date(o.ends_at) < new Date() ? 'Finished' : new Date(o.starts_at) > new Date() ? 'Scheduled' : 'Running';
  if (!offers) return <Skeleton />;
  return (
    <div className="space-y-3">
      <p className="text-xs text-slate-400">An offer opens services (or the whole app, even for businesses whose plan has ended) for every business, for a period you choose. Nothing about their own plan or end date changes.</p>
      <button onClick={() => setOpen((v) => !v)} className="btn-primary inline-flex items-center gap-1.5 min-h-[40px] px-4 text-sm"><Plus className="w-4 h-4" /> New offer</button>
      <ErrorText>{err}</ErrorText>
      {open && (
        <Card className="space-y-3">
          <label className="block"><span className="block text-xs text-slate-400 mb-1">Offer name</span><input className="input" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} maxLength={80} placeholder="e.g. Festive season free access" /></label>
          <label className="block"><span className="block text-xs text-slate-400 mb-1">Message shown to owners</span><input className="input" value={f.message} onChange={(e) => setF({ ...f, message: e.target.value })} maxLength={300} /></label>
          <label className="block"><span className="block text-xs text-slate-400 mb-1">Period</span>
            <select className="input w-auto" value={f.days} onChange={(e) => setF({ ...f, days: Number(e.target.value) })}>{[3, 7, 14, 30, 60, 90].map((n) => <option key={n} value={n}>{n} days</option>)}</select></label>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={f.opens_app} onChange={(e) => setF({ ...f, opens_app: e.target.checked })} /> Open the app for everyone, including businesses whose plan has ended</label>
          <div><span className="block text-xs text-slate-400 mb-1.5">Open these services for everyone</span>
            <div className="grid sm:grid-cols-2 gap-1.5">{services.map((s) => { const on = f.service_keys.includes(s.key); return (
              <button type="button" key={s.key} aria-pressed={on} onClick={() => setF({ ...f, service_keys: on ? f.service_keys.filter((k) => k !== s.key) : [...f.service_keys, s.key] })} className={`text-left text-sm rounded-xl px-3 py-2 border ${on ? 'border-teal-500 bg-teal-500/10' : 'border-slate-700'}`}>{s.label}</button>); })}</div></div>
          <button onClick={() => void create()} disabled={busy} className="btn-primary min-h-[40px] px-4 inline-flex items-center gap-1.5">{busy && <Loader2 className="w-4 h-4 animate-spin" />} Start offer now</button>
        </Card>
      )}
      {offers.length === 0 ? <Card><EmptyState message="No offers yet." /></Card> : offers.map((o) => (
        <Card key={o.id} className="space-y-1.5">
          <div className="flex items-start justify-between gap-3"><p className="font-medium">{o.name}</p><span className={`text-xs px-2 py-0.5 rounded-full ${status(o) === 'Running' ? 'bg-emerald-500/15 text-emerald-400' : 'bg-slate-700 text-slate-300'}`}>{status(o)}</span></div>
          <p className="text-xs text-slate-400">{d(o.starts_at)} → {d(o.ends_at)}{o.opens_app ? ' · opens the whole app' : ''}{o.service_keys.length ? ` · ${o.service_keys.map((k) => services.find((s) => s.key === k)?.label ?? k).join(', ')}` : ''}</p>
          {status(o) === 'Running' && <button onClick={() => void end(o)} className="btn-secondary text-xs min-h-[34px] px-3">End now</button>}
        </Card>
      ))}
    </div>
  );
}

function RequestsTab({ supabase, onChanged }: { supabase: SupabaseClient; onChanged: () => Promise<void> }) {
  const [rows, setRows] = useState<Req[] | null>(null);
  const [filter, setFilter] = useState<'pending' | 'all'>('pending');
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const load = useCallback(async () => {
    const { data, error } = await supabase.rpc('admin_package_requests', { p_status: filter });
    if (error) setErr(friendlyError(error, 'Could not load requests.')); else setRows((data ?? []) as Req[]);
  }, [supabase, filter]);
  useEffect(() => { void load(); }, [load]);
  async function resolve(r: Req, approve: boolean) {
    setBusy(r.id); setErr(null);
    const { error } = await supabase.rpc('admin_resolve_package_request', { p_id: r.id, p_approve: approve, p_months: null, p_note: notes[r.id] || null });
    if (error) setErr(friendlyError(error, 'Could not update the request.')); else { await load(); await onChanged(); }
    setBusy(null);
  }
  if (!rows) return <Skeleton />;
  return (
    <div className="space-y-3">
      <p className="text-xs text-slate-400">Owners ask to renew or change plan from the app. Approving applies the package (a renewal adds to the current end date). Payment is arranged with the owner outside the app.</p>
      <div className="flex gap-1.5">{(['pending', 'all'] as const).map((k) => <button key={k} onClick={() => setFilter(k)} className={`text-xs px-3 min-h-[32px] rounded-full ${filter === k ? 'bg-field-600 text-white' : 'bg-slate-800 text-slate-300'}`}>{k === 'pending' ? 'Waiting' : 'All'}</button>)}</div>
      <ErrorText>{err}</ErrorText>
      {rows.length === 0 ? <Card><EmptyState message={filter === 'pending' ? 'No requests waiting.' : 'No requests yet.'} /></Card> : rows.map((r) => (
        <Card key={r.id} className="space-y-2">
          <div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="font-medium truncate">{r.business_name}</p><p className="text-xs text-slate-400 truncate">{r.owner_email ?? ''} · {d(r.created_at)}</p></div>
            <span className={`text-xs px-2 py-0.5 rounded-full capitalize ${r.status === 'pending' ? 'bg-amber-500/20 text-amber-400' : r.status === 'approved' ? 'bg-emerald-500/15 text-emerald-400' : 'bg-slate-700 text-slate-300'}`}>{r.status}</span></div>
          <p className="text-sm"><b className="capitalize">{r.kind}</b> to {r.package_name ?? 'a removed package'}<span className="text-xs text-slate-400"> · current end {r.current_ends_at ? d(r.current_ends_at) : 'none'}</span></p>
          {r.note && <p className="text-xs text-slate-300 bg-slate-800/60 rounded-lg p-2">“{r.note}”</p>}
          {r.admin_note && r.status !== 'pending' && <p className="text-xs text-slate-400">Your note: {r.admin_note}</p>}
          {r.status === 'pending' && (<>
            <input className="input w-full text-sm" placeholder="Note to the owner (optional)" value={notes[r.id] ?? ''} onChange={(e) => setNotes({ ...notes, [r.id]: e.target.value })} maxLength={300} />
            <div className="flex gap-2"><button onClick={() => void resolve(r, true)} disabled={busy === r.id} className="btn-primary min-h-[40px] px-4 inline-flex items-center gap-1.5">{busy === r.id && <Loader2 className="w-4 h-4 animate-spin" />} Approve</button><button onClick={() => void resolve(r, false)} disabled={busy === r.id} className="btn-secondary min-h-[40px] px-4">Decline</button></div>
          </>)}
        </Card>
      ))}
    </div>
  );
}

/** On a business's own page: its current plan and a button to edit the plan, change the expiry, end it or remove the package. */
export function BusinessPlanPanel({ supabase, businessId, onChanged }: { supabase: SupabaseClient; businessId: string; onChanged?: () => void }) {
  const [pkgs, setPkgs] = useState<Pkg[] | null>(null);
  const [row, setRow] = useState<BizRow | null>(null);
  const [open, setOpen] = useState(false);
  const load = useCallback(async () => {
    const [p, r] = await Promise.all([supabase.from('packages').select('*').order('sort').order('price'), supabase.rpc('admin_business_packages')]);
    setPkgs((p.data ?? []) as Pkg[]); setRow(((r.data ?? []) as BizRow[]).find((x) => x.business_id === businessId) ?? null);
  }, [supabase, businessId]);
  useEffect(() => { void load(); }, [load]);
  if (!pkgs) return <Skeleton rows={1} />;
  return (
    <Card className="space-y-2">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-medium">{row?.package_name ?? 'No package (full access)'}</p>
          <p className="text-xs text-slate-400">{row?.ends_at ? `${row.state === 'expired' ? 'Ended' : 'Ends'} ${new Date(row.ends_at).toLocaleString()}` : row?.state === 'pending' ? 'Not activated yet' : 'No end date'}</p>
        </div>
        {row && <span className={`text-xs px-2 py-0.5 rounded-full whitespace-nowrap ${STATE_STYLE[row.state] ?? STATE_STYLE.pending}`}>{row.state === 'expiring' ? `${row.days_left} day${row.days_left === 1 ? '' : 's'} left` : row.state}</span>}
      </div>
      <button onClick={() => setOpen(true)} className="btn-secondary min-h-[38px] px-3 text-sm inline-flex items-center gap-1.5"><Pencil className="w-4 h-4" /> Edit or remove plan</button>
      {open && <BusinessesTab supabase={supabase} pkgs={pkgs} focusId={businessId} onCloseFocus={() => { setOpen(false); void load(); onChanged?.(); }} />}
    </Card>
  );
}
