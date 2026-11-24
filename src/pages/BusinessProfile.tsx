import { useEffect, useMemo, useState } from 'react';
import { SupabaseClient } from '@supabase/supabase-js';
import { Phone, MessageCircle, Mail, Settings2, Copy, ArrowLeft, Search, ChevronRight } from 'lucide-react';
import { Card, EmptyState, ErrorText, Skeleton, StatusBadge } from '../components/ui';
import { describeError } from '../lib/errors';

interface Biz { id: string; name: string; logo_url: string | null; phone: string | null; email: string | null; address: string | null; status: string; created_at: string; last_active_at: string | null; business_type: string | null; currency: string | null; slug: string | null; tax_pin: string | null; paybill_number: string | null; paybill_account: string | null; till_number: string | null; send_till_number: string | null; activation_expires_at: string | null; branches_enabled: boolean | null; onboarding_completed: boolean | null; deleted_at: string | null; pause_reason: string | null }
interface Prof {
  package: { name: string; price: number; currency: string } | null; owner: { name: string | null; phone: string | null; last_login: string | null } | null;
  staff: { name: string | null; phone: string | null; role: string; status: string | null; last_login: string | null }[];
  branches: { name: string; location: string | null; status: string | null; is_main: boolean }[];
  sales: { count: number; revenue: number; last: string | null; last30_count: number; last30_revenue: number; unpaid: number };
  products: { count: number; low_stock: number }; customers: number; suppliers: number; expenses_total: number; debts: { open: number; owed: number };
  tickets: { subject: string; status: string; at: string }[]; features: { feature: string; status: string; at: string }[]; reviews: { rating: number; body: string | null; status: string; at: string }[]; nudges: { at: string; days: number }[];
}
const SUBS = [['overview', 'Overview'], ['contact', 'Contact & setup'], ['sales', 'Sales & stock'], ['team', 'Team & branches'], ['feedback', 'Support & feedback'], ['payments', 'Payments'], ['reminders', 'Reminders']] as const;
type Sub = (typeof SUBS)[number][0];
const dt = (d?: string | null) => (d ? new Date(d).toLocaleString('en-KE', { timeZone: 'Africa/Nairobi', day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—');
const dOnly = (d?: string | null) => (d ? new Date(d).toLocaleDateString('en-KE', { timeZone: 'Africa/Nairobi', day: 'numeric', month: 'short', year: 'numeric' }) : '—');
const waNumber = (p: string | null) => { const x = (p ?? '').replace(/\D/g, ''); return x.startsWith('0') ? `254${x.slice(1)}` : x.startsWith('7') || x.startsWith('1') ? `254${x}` : x; };
const initials = (n: string) => n.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join('') || '?';
const HUES = [152, 200, 262, 24, 340, 48];
const hue = (s: string) => HUES[[...s].reduce((a, c) => a + c.charCodeAt(0), 0) % HUES.length];

export function Avatar({ name, url, size = 56 }: { name: string; url?: string | null; size?: number }) {
  const [bad, setBad] = useState(false);
  if (url && !bad) return <img src={url} alt="" onError={() => setBad(true)} style={{ width: size, height: size }} className="rounded-full object-cover bg-slate-700 shrink-0" />;
  return <span style={{ width: size, height: size, background: `hsl(${hue(name)} 45% 32%)`, fontSize: size * 0.36 }} className="rounded-full grid place-items-center font-semibold text-white shrink-0">{initials(name)}</span>;
}

const Row = ({ k, v }: { k: string; v: React.ReactNode }) => <><dt className="text-slate-400">{k}</dt><dd className="break-words">{v ?? '—'}</dd></>;

/** One business, everything about it: avatar, quick actions and sub-menus. Pick a business, or arrive from a notification. */
export default function BusinessProfile({ supabase, initialId, onManage }: { supabase: SupabaseClient; initialId?: string | null; onManage: (id: string) => void }) {
  const [list, setList] = useState<Biz[] | null>(null); const [q, setQ] = useState(''); const [id, setId] = useState<string | null>(initialId ?? null);
  const [prof, setProf] = useState<Prof | null>(null); const [err, setErr] = useState<string | null>(null); const [sub, setSub] = useState<Sub>('overview'); const [copied, setCopied] = useState(false);
  useEffect(() => { setId(initialId ?? null); }, [initialId]);
  useEffect(() => { void supabase.from('businesses').select('*').is('deleted_at', null).order('created_at', { ascending: false }).then(({ data, error }) => { if (error) setErr(describeError(error, 'Could not load businesses')); setList((data ?? []) as Biz[]); }); }, [supabase]);
  useEffect(() => {
    if (!id) return; let off = false; setProf(null); setErr(null); setSub('overview');
    void supabase.rpc('admin_business_profile', { p_business_id: id }).then(({ data, error }) => { if (off) return; if (error) setErr(describeError(error, 'Could not load this business')); else setProf(data as Prof); });
    return () => { off = true; };
  }, [supabase, id]);

  const b = useMemo(() => (list ?? []).find((x) => x.id === id) ?? null, [list, id]);
  const results = useMemo(() => (list ?? []).filter((x) => !q.trim() || [x.name, x.email, x.phone].some((v) => (v ?? '').toLowerCase().includes(q.toLowerCase()))), [list, q]);
  const money = (n: number) => `${b?.currency || 'KES'} ${Math.round(n).toLocaleString('en-KE')}`;

  if (!id) {
    return (
      <div className="space-y-4">
        <div><h1 className="text-xl font-semibold">Business profile</h1><p className="text-xs text-slate-400">Pick a business to see everything about it in one place.</p></div>
        <div className="relative"><Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" /><input className="w-full rounded-xl border border-slate-600 bg-transparent pl-9 pr-3 py-2 text-sm" placeholder="Search name, email or phone" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search businesses" /></div>
        {err && <ErrorText>{err}</ErrorText>}
        {list === null ? <Skeleton /> : results.length === 0 ? <EmptyState message="No businesses found." /> : (
          <Card className="p-0"><ul className="divide-y divide-slate-700/60">{results.map((x) => (
            <li key={x.id}><button className="w-full flex items-center gap-3 px-3 py-3 text-left hover:bg-slate-800/60" onClick={() => setId(x.id)}>
              <Avatar name={x.name} url={x.logo_url} size={40} /><span className="min-w-0 flex-1"><span className="block text-sm font-medium truncate">{x.name}</span><span className="block text-xs text-slate-400 truncate">{x.business_type ?? 'Shop'} · {x.phone ?? x.email ?? 'no contact'}</span></span><ChevronRight className="w-4 h-4 text-slate-500" />
            </button></li>))}</ul></Card>
        )}
      </div>
    );
  }

  const msg = b ? `Hi ${b.name},\n\n` : '';
  return (
    <div className="space-y-4">
      <button className="text-xs text-slate-400 inline-flex items-center gap-1 hover:text-slate-200" onClick={() => setId(null)}><ArrowLeft className="w-3.5 h-3.5" /> All businesses</button>
      {err && <ErrorText>{err}</ErrorText>}
      {!b ? <Skeleton /> : (
        <>
          <Card>
            <div className="flex items-center gap-3">
              <Avatar name={b.name} url={b.logo_url} />
              <div className="min-w-0 flex-1">
                <h1 className="text-lg font-semibold truncate">{b.name}</h1>
                <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400"><StatusBadge status={b.status} /><span>{b.business_type ?? 'Shop'}</span><span>· joined {dOnly(b.created_at)}</span></div>
              </div>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {b.phone && <a className="btn-secondary text-xs inline-flex items-center gap-1" href={`tel:${b.phone}`}><Phone className="w-3.5 h-3.5" /> Call</a>}
              {b.phone && <a className="btn-secondary text-xs inline-flex items-center gap-1" target="_blank" rel="noopener noreferrer" href={`https://wa.me/${waNumber(b.phone)}?text=${encodeURIComponent(msg)}`}><MessageCircle className="w-3.5 h-3.5" /> WhatsApp</a>}
              {b.email && <a className="btn-secondary text-xs inline-flex items-center gap-1" href={`mailto:${b.email}`}><Mail className="w-3.5 h-3.5" /> Email</a>}
              <button className="btn-secondary text-xs inline-flex items-center gap-1" onClick={() => onManage(b.id)}><Settings2 className="w-3.5 h-3.5" /> Manage (access, plan, suspend)</button>
              <button className="btn-secondary text-xs inline-flex items-center gap-1" onClick={() => { void navigator.clipboard?.writeText(b.id).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); }).catch(() => undefined); }}><Copy className="w-3.5 h-3.5" /> {copied ? 'Copied ✓' : 'Copy ID'}</button>
            </div>
          </Card>
          <div className="flex flex-wrap gap-2">{SUBS.map(([k, l]) => <button key={k} onClick={() => setSub(k)} className={`rounded-full border px-3 py-1 text-xs ${sub === k ? 'bg-emerald-600 border-emerald-600 text-white' : 'border-slate-600 text-slate-300'}`}>{l}</button>)}</div>
          {!prof ? <Skeleton /> : (
            <Card>
              {sub === 'overview' && (<>
                <div className="grid grid-cols-2 gap-2 mb-3">
                  {[['Sales (all time)', prof.sales.count], ['Revenue', money(prof.sales.revenue)], ['Last 30 days', money(prof.sales.last30_revenue)], ['Products', prof.products.count], ['Customers', prof.customers], ['Open debts', `${prof.debts.open} · ${money(prof.debts.owed)}`]].map(([l, v]) => <div key={String(l)} className="rounded-lg bg-slate-900/50 p-2"><div className="text-[11px] text-slate-400">{l}</div><div className="text-sm font-semibold">{v}</div></div>)}
                </div>
                <dl className="grid grid-cols-[9rem_1fr] gap-x-3 gap-y-1.5 text-sm">
                  <Row k="Owner" v={prof.owner?.name} /><Row k="Last activity" v={dt(b.last_active_at)} /><Row k="Last sale" v={dt(prof.sales.last)} /><Row k="Plan" v={prof.package ? `${prof.package.name}` : 'None'} /><Row k="Access until" v={dt(b.activation_expires_at)} /><Row k="Setup" v={b.onboarding_completed ? 'Finished' : 'Not finished'} />
                  {b.pause_reason && <Row k="Pause reason" v={b.pause_reason} />}
                </dl></>)}
              {sub === 'contact' && <dl className="grid grid-cols-[9rem_1fr] gap-x-3 gap-y-1.5 text-sm"><Row k="Phone" v={b.phone} /><Row k="Email" v={b.email} /><Row k="Address" v={b.address} /><Row k="KRA PIN" v={b.tax_pin} /><Row k="Currency" v={b.currency} /><Row k="Business type" v={b.business_type} /><Row k="Web address" v={b.slug} /><Row k="Branches enabled" v={b.branches_enabled ? 'Yes' : 'No'} /><Row k="Registered" v={dt(b.created_at)} /><Row k="Owner phone" v={prof.owner?.phone} /><Row k="Owner last sign-in" v={dt(prof.owner?.last_login)} /></dl>}
              {sub === 'sales' && <dl className="grid grid-cols-[10rem_1fr] gap-x-3 gap-y-1.5 text-sm"><Row k="Total sales" v={prof.sales.count} /><Row k="Total revenue" v={money(prof.sales.revenue)} /><Row k="Last 30 days" v={`${prof.sales.last30_count} sales · ${money(prof.sales.last30_revenue)}`} /><Row k="Unpaid balances" v={money(prof.sales.unpaid)} /><Row k="Products" v={prof.products.count} /><Row k="Low stock items" v={prof.products.low_stock} /><Row k="Customers" v={prof.customers} /><Row k="Suppliers" v={prof.suppliers} /><Row k="Expenses recorded" v={money(prof.expenses_total)} /><Row k="Debts owed to them" v={`${prof.debts.open} open · ${money(prof.debts.owed)}`} /></dl>}
              {sub === 'team' && (<div className="space-y-3">
                <div><h3 className="text-xs font-semibold text-slate-300 mb-1">Staff ({prof.staff.length})</h3><ul className="divide-y divide-slate-700/60">{prof.staff.map((s, i) => <li key={i} className="py-2 text-sm flex items-center gap-3"><Avatar name={s.name ?? '?'} size={32} /><span className="min-w-0 flex-1"><span className="block truncate">{s.name ?? 'Unnamed'} <span className="text-[11px] text-slate-400">· {s.role}{s.status && s.status !== 'active' ? ` · ${s.status}` : ''}</span></span><span className="block text-[11px] text-slate-500">{s.phone ?? 'no phone'} · last sign-in {dt(s.last_login)}</span></span></li>)}</ul></div>
                <div><h3 className="text-xs font-semibold text-slate-300 mb-1">Branches ({prof.branches.length})</h3>{prof.branches.length === 0 ? <p className="text-xs text-slate-500">No branches.</p> : <ul className="text-sm space-y-1">{prof.branches.map((x, i) => <li key={i}>{x.name}{x.is_main ? ' (main)' : ''} <span className="text-[11px] text-slate-400">{x.location ?? ''} {x.status ? `· ${x.status}` : ''}</span></li>)}</ul>}</div></div>)}
              {sub === 'feedback' && (<div className="space-y-3 text-sm">
                <div><h3 className="text-xs font-semibold text-slate-300 mb-1">Support tickets</h3>{prof.tickets.length === 0 ? <p className="text-xs text-slate-500">None.</p> : <ul className="space-y-1">{prof.tickets.map((t, i) => <li key={i}>{t.subject} <span className="text-[11px] text-slate-400">· {t.status} · {dOnly(t.at)}</span></li>)}</ul>}</div>
                <div><h3 className="text-xs font-semibold text-slate-300 mb-1">Feature requests</h3>{prof.features.length === 0 ? <p className="text-xs text-slate-500">None.</p> : <ul className="space-y-1">{prof.features.map((t, i) => <li key={i}>{t.feature} <span className="text-[11px] text-slate-400">· {t.status} · {dOnly(t.at)}</span></li>)}</ul>}</div>
                <div><h3 className="text-xs font-semibold text-slate-300 mb-1">Reviews</h3>{prof.reviews.length === 0 ? <p className="text-xs text-slate-500">None.</p> : <ul className="space-y-1">{prof.reviews.map((t, i) => <li key={i}>{t.rating}★ {t.body ?? ''} <span className="text-[11px] text-slate-400">· {t.status} · {dOnly(t.at)}</span></li>)}</ul>}</div></div>)}
              {sub === 'payments' && <dl className="grid grid-cols-[9rem_1fr] gap-x-3 gap-y-1.5 text-sm"><Row k="Plan" v={prof.package ? `${prof.package.name} · ${prof.package.currency} ${prof.package.price}` : 'None'} /><Row k="Access until" v={dt(b.activation_expires_at)} /><Row k="Paybill" v={b.paybill_number ? `${b.paybill_number}${b.paybill_account ? ` (acc ${b.paybill_account})` : ''}` : null} /><Row k="Till number" v={b.till_number} /><Row k="Send-money till" v={b.send_till_number} /></dl>}
              {sub === 'reminders' && (prof.nudges.length === 0 ? <p className="text-sm text-slate-400">No automatic inactivity reminders sent to this business yet.</p> : <ul className="text-sm space-y-1">{prof.nudges.map((n, i) => <li key={i}>{dt(n.at)} <span className="text-[11px] text-slate-400">· after {n.days} days quiet</span></li>)}</ul>)}
            </Card>
          )}
        </>
      )}
    </div>
  );
}
