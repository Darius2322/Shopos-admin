import { useEffect, useState } from 'react';
import { SupabaseClient } from '@supabase/supabase-js';
import { Loader2, X } from 'lucide-react';
import { Card, EmptyState, ErrorText, Skeleton } from '../components/ui';
import { friendlyError } from '../lib/friendlyError';
import * as pay from '../lib/payAdmin';

interface Row {
  source_id: string; business_id: string; business_name: string; label: string; kind: string; number: string; mode: string; status: string;
  daraja_request: string; daraja_note: string | null; env: string | null; has_keys: boolean; c2b_registered: boolean; has_payout: boolean;
  tx_count: number; tx_total: number; last_tx: string | null; account_number: string | null; admin_disabled: boolean;
}
interface PkgPay { id: string; business_id: string; amount: number; period: string; status: string; receipt: string | null; payer_name: string; created_at: string; applied_at: string | null }
const KIND: Record<string, string> = { mpesa_till: 'Till', mpesa_paybill: 'Paybill', mpesa_pochi: 'Pochi la Biashara' };

function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-end sm:items-center justify-center p-0 sm:p-4" role="dialog" aria-modal="true" aria-label={title}>
      <div className="card w-full sm:max-w-md max-h-[92vh] overflow-y-auto p-4 space-y-3 rounded-b-none sm:rounded-b-card">
        <div className="flex items-center justify-between"><p className="font-medium">{title}</p><button onClick={onClose} aria-label="Close" className="p-1 text-slate-400"><X className="w-5 h-5" /></button></div>
        {children}
      </div>
    </div>
  );
}
const Lbl = ({ t, children }: { t: string; children: React.ReactNode }) => <label className="block"><span className="block text-xs text-slate-400 mb-1">{t}</span>{children}</label>;

/** M-Pesa for the whole platform: connect each business's own number, turn on automatic refunds, and set ShopOS's own number for package payments. */
export default function Mpesa({ supabase }: { supabase: SupabaseClient }) {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [pkgs, setPkgs] = useState<PkgPay[]>([]);
  const [names, setNames] = useState<Record<string, string>>({});
  const [err, setErr] = useState<string | null>(null);
  const [setup, setSetup] = useState<Row | null>(null);
  const [payoutFor, setPayoutFor] = useState<Row | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  async function load() {
    const { data, error } = await supabase.rpc('admin_mpesa_list');
    if (error) { setErr(friendlyError(error, 'Could not load M-Pesa numbers.')); setRows([]); return; }
    setRows((data ?? []) as Row[]);
    const { data: pp } = await supabase.from('package_payments').select('id, business_id, amount, period, status, receipt, payer_name, created_at, applied_at').order('created_at', { ascending: false }).limit(25);
    setPkgs((pp ?? []) as PkgPay[]);
    const ids = [...new Set((pp ?? []).map((x: { business_id: string }) => x.business_id))];
    if (ids.length) { const { data: b } = await supabase.from('businesses').select('id, name').in('id', ids); setNames(Object.fromEntries((b ?? []).map((x: { id: string; name: string }) => [x.id, x.name]))); }
  }
  useEffect(() => { void load(); }, []);

  async function act(r: Row, what: 'reject' | 'reset' | 'c2b' | 'off' | 'approve' | 'disable' | 'enable') {
    setErr(null); setMsg(null);
    if (what === 'off' && !window.confirm(`Disconnect ${r.business_name} from Safaricom? Their keys are deleted.`)) return;
    let note: string | null = null;
    if (what === 'reject') { note = window.prompt('Short reason to show the owner (optional):') ?? ''; }
    setBusy(r.source_id);
    if (what === 'reject' || what === 'reset' || what === 'disable' || what === 'enable') {
      const { error } = await supabase.rpc('admin_mpesa_decide', { p_source_id: r.source_id, p_decision: what, p_note: note });
      if (error) setErr(friendlyError(error, 'Could not save.')); else setMsg(what === 'disable' ? `M-Pesa switched off for ${r.business_name}.` : what === 'enable' ? `M-Pesa switched on for ${r.business_name}.` : 'Saved.');
    } else if (what === 'approve') {
      const res = await pay.approveSource(r.source_id);
      if (!res.ok) setErr(pay.why(res)); else setMsg(`Approved. M-Pesa now works for ${r.business_name}${res.shared ? ' using the shared Safaricom keys' : ''}.`);
    } else {
      const res = what === 'c2b' ? await pay.registerIncoming(r.source_id) : await pay.disconnect(r.source_id);
      if (!res.ok) setErr(pay.why(res)); else setMsg(what === 'c2b' ? 'Incoming payments linked.' : 'Disconnected.');
    }
    setBusy(null); await load();
  }

  const waiting = (rows ?? []).filter((r) => r.daraja_request === 'requested');
  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-display font-semibold text-lg">M-Pesa</h2>
        <p className="text-xs text-slate-400">A business asks to be connected from its own app. M-Pesa does not work for it until you press Approve. Save the Safaricom keys once below and every approved shop reuses them. Keys are encrypted and can never be read back, not even by you.</p>
      </div>
      <ErrorText>{err}</ErrorText>
      {msg && <p className="text-sm text-field-600" role="status">{msg}</p>}

      <SharedKeys />

      <PlatformNumber />

      <div className="space-y-2">
        <h3 className="font-medium text-sm">Businesses{waiting.length > 0 ? ` · ${waiting.length} waiting` : ''}</h3>
        {!rows ? <Skeleton /> : rows.length === 0 ? <Card><EmptyState message="No business has added an M-Pesa number yet." /></Card> : rows.map((r) => (
          <Card key={r.source_id} className="space-y-2">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-medium truncate">{r.business_name} <span className="text-slate-400 font-normal">· {r.label}</span></p>
                <p className="text-xs text-slate-400 tnum">{KIND[r.kind] ?? r.kind} {r.number}{r.kind === 'mpesa_paybill' && r.account_number ? ` · Account ${r.account_number}` : ''} · {r.admin_disabled ? 'switched off by you' : r.status === 'disabled' ? 'turned off by the owner' : r.mode === 'daraja' && r.daraja_request === 'approved' ? `approved and on (${r.env === 'production' ? 'live' : 'test'})` : r.daraja_request === 'requested' ? 'waiting for your approval' : r.daraja_request === 'rejected' ? 'rejected' : 'not approved'}</p>
                {r.has_keys && <p className="text-xs text-slate-500">{r.c2b_registered ? 'Incoming payments linked' : 'Incoming payments not linked'} · {r.has_payout ? 'automatic refunds on' : 'automatic refunds off'} · {r.tx_count} payments</p>}
                {r.daraja_note && <p className="text-xs text-slate-500">Note: {r.daraja_note}</p>}
              </div>
              {r.daraja_request === 'requested' && <span className="text-xs px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-500 whitespace-nowrap">new request</span>}
            </div>
            <div className="flex flex-wrap gap-2">
              {r.kind !== 'mpesa_pochi' && !(r.mode === 'daraja' && r.daraja_request === 'approved') && <button onClick={() => void act(r, 'approve')} disabled={busy === r.source_id} className="btn-primary text-xs !py-1.5">Approve</button>}
              {r.mode === 'daraja' && r.daraja_request === 'approved' && (r.admin_disabled
                ? <button onClick={() => void act(r, 'enable')} disabled={busy === r.source_id} className="btn-primary text-xs !py-1.5">Switch on</button>
                : <button onClick={() => void act(r, 'disable')} disabled={busy === r.source_id} className="btn-secondary text-xs !py-1.5">Switch off</button>)}
              {r.kind !== 'mpesa_pochi' && <button onClick={() => setSetup(r)} className="btn-secondary text-xs !py-1.5">{r.has_keys ? 'Replace keys for this shop' : 'Own keys for this shop'}</button>}
              {r.mode === 'daraja' && <button onClick={() => void act(r, 'c2b')} disabled={busy === r.source_id} className="btn-secondary text-xs !py-1.5">Link incoming payments</button>}
              {r.mode === 'daraja' && <button onClick={() => setPayoutFor(r)} className="btn-secondary text-xs !py-1.5">Automatic refunds</button>}
              {r.daraja_request === 'requested' && <button onClick={() => void act(r, 'reject')} disabled={busy === r.source_id} className="btn-secondary text-xs !py-1.5">Reject</button>}
              {r.daraja_request === 'rejected' && <button onClick={() => void act(r, 'reset')} disabled={busy === r.source_id} className="btn-secondary text-xs !py-1.5">Clear rejection</button>}
              {r.mode === 'daraja' && <button onClick={() => void act(r, 'off')} disabled={busy === r.source_id} className="text-xs text-rust-500 underline px-2">Disconnect</button>}
            </div>
          </Card>
        ))}
      </div>

      <div className="space-y-2">
        <h3 className="font-medium text-sm">Package payments</h3>
        {pkgs.length === 0 ? <Card><EmptyState message="No package payments yet." /></Card> : (
          <Card className="divide-y divide-slate-700 !p-0">
            {pkgs.map((p) => (
              <div key={p.id} className="p-3 flex justify-between gap-3 text-sm">
                <div className="min-w-0"><p className="truncate">{names[p.business_id] ?? 'Business'} <span className="text-slate-400">· {p.payer_name}</span></p>
                  <p className="text-xs text-slate-400">{new Date(p.created_at).toLocaleString()} · {p.period === 'year' ? '1 year' : 'standard'}{p.receipt ? ` · ${p.receipt}` : ''}</p></div>
                <div className="text-right shrink-0"><p className="tnum font-medium">KES {p.amount.toLocaleString()}</p><p className={`text-xs ${p.status === 'paid' ? 'text-field-600' : p.status === 'pending' ? 'text-amber-500' : 'text-rust-500'}`}>{p.status}{p.status === 'paid' && !p.applied_at ? ' · not applied' : ''}</p></div>
              </div>
            ))}
          </Card>
        )}
      </div>

      {setup && <KeysSheet row={setup} onClose={() => setSetup(null)} onDone={async () => { setSetup(null); setMsg('Keys saved for this shop. Press Approve to switch M-Pesa on.'); await load(); }} />}
      {payoutFor && <PayoutSheet row={payoutFor} onClose={() => setPayoutFor(null)} onDone={async () => { setPayoutFor(null); setMsg('Automatic refunds are on for this number.'); await load(); }} />}
    </div>
  );
}

function KeysSheet({ row, onClose, onDone }: { row: Row; onClose: () => void; onDone: () => void | Promise<void> }) {
  const [env, setEnv] = useState<'sandbox' | 'production'>(row.env === 'production' ? 'production' : 'sandbox');
  const [key, setKey] = useState(''); const [secret, setSecret] = useState(''); const [passkey, setPasskey] = useState(''); const [head, setHead] = useState('');
  const [busy, setBusy] = useState(false); const [err, setErr] = useState<string | null>(null);
  async function save() {
    setErr(null); setBusy(true);
    const r = await pay.saveKeys({ sourceId: row.source_id, env, consumerKey: key, consumerSecret: secret, passkey: passkey || undefined, headOfficeNumber: head || undefined });
    setBusy(false);
    if (!r.ok) { setErr(pay.why(r)); return; }
    await onDone();
  }
  return (
    <Sheet title={`Keys for ${row.business_name}`} onClose={onClose}>
      <p className="text-xs text-slate-400">{KIND[row.kind]} {row.number}. The keys are checked with Safaricom, then stored encrypted. They are never shown again.</p>
      <Lbl t="Environment"><select className="input" value={env} onChange={(e) => setEnv(e.target.value as 'sandbox' | 'production')}><option value="sandbox">Test (sandbox)</option><option value="production">Live (real money)</option></select></Lbl>
      <Lbl t="Consumer key"><input className="input" autoComplete="off" value={key} onChange={(e) => setKey(e.target.value)} /></Lbl>
      <Lbl t="Consumer secret"><input className="input" type="password" autoComplete="new-password" value={secret} onChange={(e) => setSecret(e.target.value)} /></Lbl>
      <Lbl t="Lipa na M-Pesa passkey"><input className="input" type="password" autoComplete="new-password" value={passkey} onChange={(e) => setPasskey(e.target.value)} placeholder={row.has_keys ? 'Leave empty to keep the saved one' : 'Needed for payment prompts'} /></Lbl>
      {row.kind === 'mpesa_till' && <Lbl t="Head office number (only if different from the till)"><input className="input tnum" inputMode="numeric" value={head} onChange={(e) => setHead(e.target.value.replace(/\D/g, ''))} /></Lbl>}
      <ErrorText>{err}</ErrorText>
      <button onClick={save} disabled={busy || !key || !secret} className="btn-primary w-full inline-flex items-center justify-center gap-1.5">{busy && <Loader2 className="w-4 h-4 animate-spin" />} Save and check keys</button>
    </Sheet>
  );
}

function PayoutSheet({ row, onClose, onDone }: { row: Row; onClose: () => void; onDone: () => void | Promise<void> }) {
  const [initiator, setInitiator] = useState(''); const [cred, setCred] = useState('');
  const [busy, setBusy] = useState(false); const [err, setErr] = useState<string | null>(null);
  async function save() {
    setErr(null); setBusy(true);
    const r = await pay.savePayout(row.source_id, initiator, cred);
    setBusy(false);
    if (!r.ok) { setErr(pay.why(r)); return; }
    await onDone();
  }
  return (
    <Sheet title={`Automatic refunds: ${row.business_name}`} onClose={onClose}>
      <p className="text-xs text-slate-400">Needs Safaricom to approve B2C payments for this number first. Enter the API initiator name and the security credential Safaricom generated for it. Both are stored encrypted. Refunds only go to the number that paid, and never more than they paid.</p>
      <Lbl t="Initiator name"><input className="input" autoComplete="off" value={initiator} onChange={(e) => setInitiator(e.target.value)} /></Lbl>
      <Lbl t="Security credential"><input className="input" type="password" autoComplete="new-password" value={cred} onChange={(e) => setCred(e.target.value)} /></Lbl>
      <ErrorText>{err}</ErrorText>
      <button onClick={save} disabled={busy || !initiator || !cred} className="btn-primary w-full inline-flex items-center justify-center gap-1.5">{busy && <Loader2 className="w-4 h-4 animate-spin" />} Turn on automatic refunds</button>
    </Sheet>
  );
}

/** Configure once: the Safaricom keys every approved shop reuses, so nothing is typed again when a new business joins. */
function SharedKeys() {
  const [st, setSt] = useState<{ saved: boolean; env: string | null; hasPasskey: boolean; headOfficeNumber: string | null } | null>(null);
  const [env, setEnv] = useState<'sandbox' | 'production'>('production');
  const [key, setKey] = useState(''); const [secret, setSecret] = useState(''); const [passkey, setPasskey] = useState(''); const [head, setHead] = useState('');
  const [busy, setBusy] = useState(false); const [err, setErr] = useState<string | null>(null); const [ok, setOk] = useState(false);
  async function load() {
    const r = await pay.defaultsStatus();
    if (r.ok) { setSt({ saved: !!r.saved, env: (r.env as string) ?? null, hasPasskey: !!r.hasPasskey, headOfficeNumber: (r.headOfficeNumber as string) ?? null }); if (r.env) setEnv(r.env as 'sandbox' | 'production'); if (r.headOfficeNumber) setHead(String(r.headOfficeNumber)); }
  }
  useEffect(() => { void load(); }, []);
  async function save() {
    setErr(null); setOk(false); setBusy(true);
    const r = await pay.defaultsSave({ env, consumerKey: key, consumerSecret: secret, passkey: passkey || undefined, headOfficeNumber: head || undefined });
    setBusy(false);
    if (!r.ok) { setErr(pay.why(r)); return; }
    setKey(''); setSecret(''); setPasskey(''); setOk(true); await load();
  }
  return (
    <div className="space-y-2">
      <h3 className="font-medium text-sm">Safaricom keys for all shops (set once)</h3>
      <Card className="space-y-3">
        <p className="text-xs text-slate-400">Save these once. When you press Approve on a new shop that has no keys of its own, it reuses these, still encrypted, and you type nothing more. Use this when your Daraja app and head office number cover the shops. A shop whose till belongs to a different Safaricom account needs its own keys ("Own keys for this shop"). Customers who pay by hand are only matched automatically for a shop that has linked its own incoming payments.</p>
        <p className="text-xs text-slate-500">{st?.saved ? `Saved (${st.env === 'production' ? 'live' : 'test'}${st.hasPasskey ? ', passkey saved' : ', no passkey yet'}${st.headOfficeNumber ? `, head office ${st.headOfficeNumber}` : ''}).` : 'Nothing saved yet.'}</p>
        <Lbl t="Environment"><select className="input" value={env} onChange={(e) => setEnv(e.target.value as typeof env)}><option value="sandbox">Test (sandbox)</option><option value="production">Live (real money)</option></select></Lbl>
        <Lbl t="Consumer key"><input className="input" autoComplete="off" value={key} onChange={(e) => setKey(e.target.value)} /></Lbl>
        <Lbl t="Consumer secret"><input className="input" type="password" autoComplete="new-password" value={secret} onChange={(e) => setSecret(e.target.value)} /></Lbl>
        <Lbl t="Lipa na M-Pesa passkey"><input className="input" type="password" autoComplete="new-password" value={passkey} onChange={(e) => setPasskey(e.target.value)} placeholder="Needed for payment prompts" /></Lbl>
        <Lbl t="Head office number (shops' tills sit under it)"><input className="input tnum" inputMode="numeric" value={head} onChange={(e) => setHead(e.target.value.replace(/\D/g, ''))} /></Lbl>
        <ErrorText>{err}</ErrorText>
        {ok && <p className="text-sm text-field-600" role="status">Saved. New shops reuse these when you approve them.</p>}
        <button onClick={save} disabled={busy || !key || !secret} className="btn-primary w-full inline-flex items-center justify-center gap-1.5">{busy && <Loader2 className="w-4 h-4 animate-spin" />} Save and check keys</button>
      </Card>
    </div>
  );
}

/** ShopOS's own till or paybill: where package payments go. */
function PlatformNumber() {
  const [st, setSt] = useState<pay.PlatformPay | null>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [kind, setKind] = useState<'mpesa_till' | 'mpesa_paybill'>('mpesa_till');
  const [number, setNumber] = useState(''); const [name, setName] = useState(''); const [account, setAccount] = useState('');
  const [env, setEnv] = useState<'sandbox' | 'production'>('production');
  const [key, setKey] = useState(''); const [secret, setSecret] = useState(''); const [passkey, setPasskey] = useState(''); const [head, setHead] = useState('');
  const [enabled, setEnabled] = useState(false);
  const [busy, setBusy] = useState(false); const [err, setErr] = useState<string | null>(null); const [ok, setOk] = useState(false);
  async function load() {
    const r = await pay.platformStatus();
    if ('error' in r) { setLoadErr(r.error); return; }
    setSt(r); if (r.kind) setKind(r.kind); if (r.number) setNumber(r.number); if (r.displayName) setName(r.displayName); if (r.accountNumber) setAccount(r.accountNumber); if (r.env) setEnv(r.env); if (r.headOfficeNumber) setHead(r.headOfficeNumber); setEnabled(r.enabled);
  }
  useEffect(() => { void load(); }, []);
  async function save() {
    setErr(null); setOk(false); setBusy(true);
    const r = await pay.platformSave({ enabled, kind, number, displayName: name, accountNumber: account, env, consumerKey: key || undefined, consumerSecret: secret || undefined, passkey: passkey || undefined, headOfficeNumber: head || undefined });
    setBusy(false);
    if (!r.ok) { setErr(pay.why(r)); return; }
    setKey(''); setSecret(''); setPasskey(''); setOk(true); await load();
  }
  return (
    <div className="space-y-2">
      <h3 className="font-medium text-sm">ShopOS number for package payments</h3>
      <Card className="space-y-3">
        <p className="text-xs text-slate-400">When an owner pays for a package by M-Pesa, the money goes straight to this till or paybill. It needs its own Daraja app and passkey. Pochi la Biashara and plain phone numbers cannot receive payment prompts.</p>
        <ErrorText>{loadErr}</ErrorText>
        <div className="grid grid-cols-2 gap-3">
          <Lbl t="Type"><select className="input" value={kind} onChange={(e) => setKind(e.target.value as typeof kind)}><option value="mpesa_till">Till (Buy Goods)</option><option value="mpesa_paybill">Paybill</option></select></Lbl>
          <Lbl t="Number"><input className="input tnum" inputMode="numeric" value={number} onChange={(e) => setNumber(e.target.value.replace(/\D/g, ''))} placeholder="5 to 10 digits" /></Lbl>
        </div>
        {kind === 'mpesa_paybill' && <Lbl t="Account number (what customers pay to)"><input className="input" value={account} onChange={(e) => setAccount(e.target.value.replace(/[^A-Za-z0-9 ._-]/g, '').slice(0, 20))} placeholder="e.g. SHOPOS" /></Lbl>}
        <Lbl t="Name shown to the customer (optional)"><input className="input" value={name} onChange={(e) => setName(e.target.value)} /></Lbl>
        <Lbl t="Environment"><select className="input" value={env} onChange={(e) => setEnv(e.target.value as typeof env)}><option value="sandbox">Test (sandbox)</option><option value="production">Live (real money)</option></select></Lbl>
        <Lbl t="Consumer key"><input className="input" autoComplete="off" value={key} onChange={(e) => setKey(e.target.value)} placeholder={st?.hasKeys ? 'Saved. Leave empty to keep it.' : ''} /></Lbl>
        <Lbl t="Consumer secret"><input className="input" type="password" autoComplete="new-password" value={secret} onChange={(e) => setSecret(e.target.value)} placeholder={st?.hasKeys ? 'Saved. Leave empty to keep it.' : ''} /></Lbl>
        <Lbl t="Lipa na M-Pesa passkey"><input className="input" type="password" autoComplete="new-password" value={passkey} onChange={(e) => setPasskey(e.target.value)} placeholder={st?.hasPasskey ? 'Saved. Leave empty to keep it.' : ''} /></Lbl>
        {kind === 'mpesa_till' && <Lbl t="Head office number (only if different from the till)"><input className="input tnum" inputMode="numeric" value={head} onChange={(e) => setHead(e.target.value.replace(/\D/g, ''))} /></Lbl>}
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} /> Let owners pay for packages by M-Pesa</label>
        <ErrorText>{err}</ErrorText>
        {ok && <p className="text-sm text-field-600" role="status">Saved.</p>}
        <button onClick={save} disabled={busy || !number || (kind === 'mpesa_paybill' && !account.trim())} className="btn-primary w-full inline-flex items-center justify-center gap-1.5">{busy && <Loader2 className="w-4 h-4 animate-spin" />} Save</button>
      </Card>
    </div>
  );
}
