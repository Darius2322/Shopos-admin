import { ReactNode, useEffect, useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useLocation, useNavigate } from 'react-router-dom';
import { Plus, X, ClipboardPaste, FlaskConical } from 'lucide-react';
import { db } from '../../lib/db';
import { useAuth } from '../../lib/auth';
import { ingestPayment, linkPaymentToSale, saveSource, syncPayments, discardRejectedPayment, deviceId } from '../../lib/payments/store';
import { smsChannelAvailable, getSmsPermission, requestSmsPermission, startSmsMonitoring, stopSmsMonitoring, PERMISSION_RATIONALE, type SmsPermission } from '../../lib/payments/smsChannel';
import { parseMpesaConfirmation } from '../../lib/payments/parser';
import type { PaymentSource, PaymentTransaction } from '../../lib/types';

function stateOf(t: PaymentTransaction): { label: string; cls: string } {
  if (t.localFlag === 'duplicate') return { label: 'Duplicate', cls: 'bg-rust-50 text-rust-600' };
  if (t.localFlag === 'wrong_till') return { label: 'Unmatched', cls: 'bg-rust-50 text-rust-600' };
  if (t.status === 'used') return { label: 'Used', cls: 'bg-slate-100 text-slate-600' };
  if (t.status === 'matched') return { label: 'Matched', cls: 'bg-field-50 text-field-700' };
  if (t.status === 'unmatched') return { label: 'Unmatched', cls: 'bg-amber-100 text-amber-600' };
  return { label: 'Received', cls: 'bg-field-50 text-field-700' };
}
function syncOf(t: PaymentTransaction): { label: string; cls: string } {
  if (t.syncStatus === 'synced') return { label: 'Synced', cls: 'text-field-700' };
  if (t.syncStatus === 'failed') return { label: 'Sync failed', cls: 'text-rust-600' };
  return { label: 'Sync pending', cls: 'text-amber-600' };
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-[55] flex items-center justify-center p-3">
      <div className="absolute inset-0 bg-ink/40" onClick={onClose} aria-hidden="true" />
      <div role="dialog" aria-modal="true" aria-label={title} className="relative w-full max-w-md max-h-[90vh] overflow-y-auto bg-paper-raised rounded-2xl p-5 space-y-3 shadow-xl">
        <div className="flex items-center justify-between"><h3 className="font-display font-semibold text-lg">{title}</h3>
          <button onClick={onClose} aria-label="Close" className="p-2 -m-2"><X className="w-5 h-5" /></button></div>
        {children}
      </div>
    </div>
  );
}
const Field = ({ label, children }: { label: string; children: ReactNode }) => (
  <label className="block"><span className="block text-sm font-medium text-slate-600 mb-1.5">{label}</span>{children}</label>
);

export function PaymentsPage() {
  const { business, profile, activeBranchId, branches } = useAuth();
  const businessId = business?.id;
  const currency = business?.currency ?? 'KES';
  const canManage = profile?.role === 'owner' || profile?.role === 'manager';
  const branchId = activeBranchId ?? branches[0]?.id ?? null;

  const sources = useLiveQuery(() => (businessId ? db.paymentSources.where('businessId').equals(businessId).toArray() : []), [businessId]) ?? [];
  const txs = useLiveQuery(async () => {
    if (!businessId) return [];
    const rows = await db.paymentTransactions.where('businessId').equals(businessId).toArray();
    return rows.sort((a, b) => b.receivedAt.localeCompare(a.receivedAt));
  }, [businessId]) ?? [];

  const [filter, setFilter] = useState<'all' | 'received' | 'used' | 'problem'>('all');
  const [addingSource, setAddingSource] = useState(false);
  const [recording, setRecording] = useState<PaymentSource | null>(null);
  const [matching, setMatching] = useState<PaymentTransaction | null>(null);
  const [sharedText, setSharedText] = useState<string | undefined>();
  const location = useLocation();
  const navigate = useNavigate();

  // A message shared from Android's Share sheet arrives as ?text=... — open the Record dialog with it.
  useEffect(() => {
    const shared = new URLSearchParams(location.search).get('text');
    if (!shared) return;
    const src = sources.find((x) => x.status === 'active' && x.mode === 'manual') ?? sources.find((x) => x.status === 'active' && x.mode === 'test');
    if (src) { setSharedText(shared); setRecording(src); navigate('/payments', { replace: true }); }
  }, [location.search, sources.length]);

  useEffect(() => { void syncPayments(); }, []);

  const activeSources = sources.filter((s) => s.status === 'active');
  const shown = useMemo(() => txs.filter((t) =>
    filter === 'all' ? true : filter === 'problem' ? !!t.localFlag || t.syncStatus === 'failed' : filter === 'used' ? t.status === 'used' : t.status === 'received' && !t.localFlag), [txs, filter]);
  const unusedTotal = txs.filter((t) => t.status === 'received' && !t.localFlag).reduce((s, t) => s + t.amount, 0);

  return (
    <div className="p-4 md:p-8 max-w-4xl mx-auto">
      <h1 className="font-display text-2xl font-semibold mb-1">M-Pesa payments</h1>
      <p className="text-sm text-slate-500 mb-5">Payments recorded for this business's till. Received but not yet used: <span className="tnum font-medium text-ink">{currency} {unusedTotal.toLocaleString()}</span></p>

      <section className="card p-4 mb-5">
        <div className="flex items-center justify-between gap-3 mb-2">
          <h2 className="font-medium">Payment sources</h2>
          {canManage && <button onClick={() => setAddingSource(true)} className="btn-secondary text-sm inline-flex items-center gap-1"><Plus className="w-4 h-4" /> Add till</button>}
        </div>
        {sources.length === 0 && <p className="text-sm text-slate-500">No till configured yet.{canManage ? ' Add your till number to start recording payments.' : ' Ask the owner to add one.'}</p>}
        <ul className="divide-y divide-slate-100">
          {sources.map((s) => (
            <li key={s.id} className="py-3 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="text-sm font-medium truncate">{s.label} <span className="text-slate-400 tnum font-normal">· till {s.tillNumber}</span></div>
                <div className="text-xs text-slate-500">{s.mode === 'test' ? 'Test mode (mock data only)' : s.mode === 'manual' ? 'Manual entry' : 'Automatic'} · {s.status}</div>
              </div>
              {s.status === 'active' && (
                <button onClick={() => setRecording(s)} className="btn-primary text-sm !py-2 shrink-0">{s.mode === 'test' ? 'Add test payment' : 'Record payment'}</button>
              )}
            </li>
          ))}
        </ul>
        <p className="text-xs text-slate-400 mt-3">ShopOS does not read your SMS messages or the M-Pesa app. Payments are entered by your team, or by an approved integration in future.</p>
      </section>

      {businessId && branchId && <AutoDetectCard businessId={businessId} branchId={branchId} sources={sources} lastTx={txs.find((t) => t.sourceType === 'api') ?? null} />}

      <div className="flex gap-1.5 mb-3 overflow-x-auto pb-1">
        {([['all', 'All'], ['received', 'Unused'], ['used', 'Used'], ['problem', 'Needs attention']] as const).map(([k, l]) => (
          <button key={k} onClick={() => setFilter(k)} className={`text-xs font-medium px-3 py-2 rounded-full whitespace-nowrap ${filter === k ? 'bg-field-600 text-white' : 'bg-slate-100 text-slate-600'}`}>{l}</button>
        ))}
      </div>

      <div className="card divide-y divide-slate-100">
        {shown.length === 0 && <p className="text-sm text-slate-500 py-8 text-center">No payments here yet.</p>}
        {shown.map((t) => {
          const st = stateOf(t); const sy = syncOf(t);
          return (
            <div key={t.id} className="p-4 flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="text-sm font-medium tnum">{t.transactionCode} {t.sourceType === 'test' && <span className="ml-1 text-[10px] uppercase tracking-wide text-amber-600">test</span>}</div>
                <div className="text-xs text-slate-500 truncate">{t.senderName ?? 'Unknown sender'} · till {t.tillNumber} · {new Date(t.receivedAt).toLocaleString()}</div>
                <div className="flex items-center gap-2 mt-1 text-xs">
                  <span className={`px-2 py-0.5 rounded-full font-medium ${st.cls}`}>{st.label}</span>
                  <span className={sy.cls}>{sy.label}</span>
                </div>
                {t.syncError && <div className="text-xs text-rust-600 mt-1">{t.syncError}</div>}
              </div>
              <div className="text-right shrink-0">
                <div className="tnum font-semibold">{currency} {t.amount.toLocaleString()}</div>
                {t.localFlag && <button onClick={() => discardRejectedPayment(t.id)} className="text-xs text-slate-400 underline mt-1">Discard</button>}
                {!t.localFlag && t.status === 'received' && !t.pendingMatchSaleId && <button onClick={() => setMatching(t)} className="btn-secondary text-xs !py-1.5 !px-3 mt-1.5">Match to sale</button>}
              </div>
            </div>
          );
        })}
      </div>

      {addingSource && businessId && <AddSource businessId={businessId} branchId={branchId} onClose={() => setAddingSource(false)} />}
      {recording && businessId && branchId && <RecordPayment source={recording} branchId={branchId} initialPaste={sharedText} onClose={() => { setRecording(null); setSharedText(undefined); }} />}
      {matching && businessId && <MatchToSale tx={matching} businessId={businessId} currency={currency} onClose={() => setMatching(null)} />}
      {activeSources.length === 0 && null}
    </div>
  );
}

function AddSource({ businessId, branchId, onClose }: { businessId: string; branchId: string | null; onClose: () => void }) {
  const [label, setLabel] = useState('');
  const [till, setTill] = useState('');
  const [mode, setMode] = useState<'test' | 'manual' | 'api'>('test');
  const native = smsChannelAvailable();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function submit() {
    setError(null); setBusy(true);
    try { await saveSource({ businessId, branchId, label, tillNumber: till, mode, deviceId: mode === 'api' ? deviceId() : null }); void syncPayments(); onClose(); }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not save'); } finally { setBusy(false); }
  }
  return (
    <Modal title="Add M-Pesa till" onClose={onClose}>
      <Field label="Name"><input className="input" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. Main shop till" autoFocus /></Field>
      <Field label="Till number"><input className="input tnum" inputMode="numeric" value={till} onChange={(e) => setTill(e.target.value.replace(/\D/g, ''))} placeholder="e.g. 123456" /></Field>
      <Field label="Mode">
        <select className="input" value={mode} onChange={(e) => setMode(e.target.value as 'test' | 'manual' | 'api')}>
          <option value="test">Test — mock payments only</option>
          <option value="manual">Manual — staff record real payments</option>
          {native && <option value="api">Automatic — detect payments on this Android phone</option>}
        </select>
      </Field>
      <p className="text-xs text-slate-500">A till can belong to only one business. Start in test mode to try things out.</p>
      {error && <p className="text-sm text-rust-600">{error}</p>}
      <button onClick={submit} disabled={busy} className="btn-primary w-full">{busy ? 'Saving…' : 'Save till'}</button>
    </Modal>
  );
}

function RecordPayment({ source, branchId, initialPaste, onClose }: { source: PaymentSource; branchId: string; initialPaste?: string; onClose: () => void }) {
  const isTest = source.mode === 'test';
  const [paste, setPaste] = useState('');
  const [code, setCode] = useState('');
  const [amount, setAmount] = useState('');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [reportedTill, setReportedTill] = useState<string | undefined>();
  const [receivedAt, setReceivedAt] = useState<string | undefined>();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => { if (initialPaste) applyPaste(initialPaste); }, []);

  async function pasteFromClipboard() {
    try { applyPaste(await navigator.clipboard.readText()); }
    catch { setError('Could not read the clipboard. Long-press in the box below and choose Paste.'); }
  }

  function applyPaste(text: string) {
    setPaste(text);
    const p = parseMpesaConfirmation(text);
    if (p.transactionCode) setCode(p.transactionCode);
    if (p.amount) setAmount(String(p.amount));
    if (p.senderName) setName(p.senderName);
    if (p.senderPhone) setPhone(p.senderPhone);
    setReportedTill(p.tillNumber); setReceivedAt(p.receivedAt);
  }
  function fillMock() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ0123456789';
    setCode('TST' + Array.from({ length: 7 }, () => chars[Math.floor(Math.random() * chars.length)]).join(''));
    setAmount(String(100 * (1 + Math.floor(Math.random() * 20)))); setName('Test Customer'); setPhone('2547****000');
  }
  async function submit() {
    setError(null); setBusy(true);
    try {
      const out = await ingestPayment(source, branchId, { transactionCode: code, amount: parseFloat(amount), senderName: name, senderPhone: phone, receivedAt, reportedTill });
      if (!out.ok) setError(out.message); else onClose();
    } finally { setBusy(false); }
  }
  return (
    <Modal title={isTest ? 'Add test payment' : 'Record M-Pesa payment'} onClose={onClose}>
      <p className="text-xs text-slate-500">Till {source.tillNumber} · {source.label}</p>
      {isTest ? (
        <button onClick={fillMock} className="btn-secondary text-sm inline-flex items-center gap-1.5"><FlaskConical className="w-4 h-4" /> Fill with mock data</button>
      ) : (
        <button type="button" onClick={pasteFromClipboard} className="btn-secondary text-sm inline-flex items-center justify-center gap-1.5 w-full min-h-[44px]"><ClipboardPaste className="w-4 h-4" /> Paste M-Pesa message from clipboard</button>
      )}
      {!isTest && (
        <Field label="Or paste the confirmation here">
          <div className="relative">
            <textarea className="input" rows={3} value={paste} onChange={(e) => applyPaste(e.target.value)} placeholder="Paste the M-Pesa confirmation message you received" />
            <ClipboardPaste className="w-4 h-4 text-slate-300 absolute right-3 top-3" aria-hidden="true" />
          </div>
        </Field>
      )}
      <Field label="M-Pesa code"><input className="input tnum uppercase" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="e.g. ABC123XYZ9" /></Field>
      <Field label="Amount"><input className="input tnum" type="number" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} /></Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Sender (optional)"><input className="input" value={name} onChange={(e) => setName(e.target.value)} /></Field>
        <Field label="Phone (optional)"><input className="input" value={phone} onChange={(e) => setPhone(e.target.value)} /></Field>
      </div>
      {error && <p className="text-sm text-rust-600">{error}</p>}
      <button onClick={submit} disabled={busy} className="btn-primary w-full">{busy ? 'Saving…' : 'Save payment'}</button>
    </Modal>
  );
}


function AutoDetectCard({ businessId, branchId, sources, lastTx }: { businessId: string; branchId: string; sources: PaymentSource[]; lastTx: PaymentTransaction | null }) {
  const [perm, setPerm] = useState<SmsPermission | 'unavailable'>('unavailable');
  const [state, setState] = useState<'idle' | 'monitoring' | 'no_permission' | 'no_source' | 'unavailable'>('idle');
  const [busy, setBusy] = useState(false);
  const source = sources.find((s) => s.mode === 'api' && s.status === 'active' && (!s.deviceId || s.deviceId === deviceId()));

  useEffect(() => {
    let alive = true;
    (async () => {
      const p = await getSmsPermission();
      if (!alive) return;
      setPerm(p);
      if (p === 'granted') { const r = await startSmsMonitoring(businessId, branchId); if (alive) setState(r); }
    })();
    return () => { alive = false; };
  }, [businessId, branchId, sources.length]);

  async function enable() {
    setBusy(true);
    const p = await requestSmsPermission();
    setPerm(p);
    if (p === 'granted') setState(await startSmsMonitoring(businessId, branchId));
    setBusy(false);
  }
  async function disable() { await stopSmsMonitoring(); setState('idle'); }

  if (!smsChannelAvailable()) {
    return (
      <section className="card p-4 mb-5">
        <h2 className="font-medium mb-1">Automatic detection</h2>
        <p className="text-sm text-slate-500">Automatic M-Pesa detection is available in the ShopOS Android app. In the web app, payments are recorded above. ShopOS on the web cannot read text messages.</p>
      </section>
    );
  }

  const dot = state === 'monitoring' ? 'bg-field-600' : 'bg-slate-300';
  return (
    <section className="card p-4 mb-5 space-y-3">
      <h2 className="font-medium">Automatic detection</h2>
      {perm !== 'granted' && <p className="text-sm text-slate-600">{PERMISSION_RATIONALE}</p>}
      <dl className="grid grid-cols-2 gap-y-2 text-sm">
        <dt className="text-slate-500">Till number</dt><dd className="text-right tnum">{source?.tillNumber ?? '—'}</dd>
        <dt className="text-slate-500">Notification phone</dt><dd className="text-right">{source ? 'This device' : 'Not configured'}</dd>
        <dt className="text-slate-500">Status</dt>
        <dd className="text-right inline-flex items-center justify-end gap-1.5"><span className={`w-2 h-2 rounded-full ${dot}`} />{state === 'monitoring' ? 'Monitoring' : perm === 'denied' ? 'Permission denied' : state === 'no_source' ? 'Add an automatic till' : 'Off'}</dd>
        <dt className="text-slate-500">Last transaction</dt><dd className="text-right">{lastTx ? new Date(lastTx.receivedAt).toLocaleString() : '—'}</dd>
      </dl>
      {perm === 'denied' && <p className="text-xs text-rust-600">Permission was denied. You can allow it in Android Settings → Apps → ShopOS → Permissions.</p>}
      {state === 'no_source' && <p className="text-xs text-slate-500">Add a till with mode “Automatic” above, then monitoring starts.</p>}
      <p className="text-xs text-slate-400">Only messages from M-Pesa that confirm a payment are used. All other messages are ignored and never stored or uploaded.</p>
      {state === 'monitoring'
        ? <button onClick={disable} className="btn-secondary w-full">Stop monitoring</button>
        : <button onClick={enable} disabled={busy || perm === 'denied'} className="btn-primary w-full">{busy ? 'Working…' : 'Turn on automatic detection'}</button>}
    </section>
  );
}


/** Lets a cashier attach an already-received payment to a sale that was rung up earlier. */
function MatchToSale({ tx, businessId, currency, onClose }: { tx: PaymentTransaction; businessId: string; currency: string; onClose: () => void }) {
  const sales = useLiveQuery(async () => {
    const rows = await db.sales.where('businessId').equals(businessId).toArray();
    return rows.filter((x) => x.status === 'completed').sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 25);
  }, [businessId]) ?? [];
  const [error, setError] = useState<string | null>(null);
  async function pick(saleId: string) {
    setError(null);
    try { await linkPaymentToSale(tx.id, saleId); onClose(); }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not match'); }
  }
  return (
    <Modal title="Match to a sale" onClose={onClose}>
      <p className="text-sm text-slate-500">Payment <span className="tnum font-medium text-ink">{tx.transactionCode}</span> · {currency} {tx.amount.toLocaleString()}</p>
      {error && <p className="text-sm text-rust-600">{error}</p>}
      <ul className="divide-y divide-slate-100 max-h-72 overflow-y-auto">
        {sales.length === 0 && <li className="py-6 text-sm text-slate-500 text-center">No recent sales.</li>}
        {sales.map((x) => {
          const same = Math.abs(x.total - tx.amount) < 0.005;
          return (
            <li key={x.id}>
              <button onClick={() => pick(x.id)} className="w-full flex items-center justify-between gap-3 py-3 text-left min-h-[56px]">
                <span className="min-w-0"><span className="block text-sm font-medium truncate">{x.receiptNumber}</span>
                  <span className="block text-xs text-slate-500">{new Date(x.createdAt).toLocaleString()} · {x.paymentMethod}</span></span>
                <span className="text-right shrink-0"><span className="block tnum font-semibold">{currency} {x.total.toLocaleString()}</span>
                  {same && <span className="block text-[10px] uppercase tracking-wide text-field-700">same amount</span>}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </Modal>
  );
}
