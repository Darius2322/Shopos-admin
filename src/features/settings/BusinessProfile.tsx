import { useState } from 'react';
import { Copy, Check, Store, Landmark, ScrollText } from 'lucide-react';
import { useAuth } from '../../lib/auth';
import { db, enqueueSync } from '../../lib/db';
import { recordAuditEvent } from '../../lib/audit';

type Tab = 'general' | 'payments' | 'documents';
const TABS: { key: Tab; label: string; icon: typeof Store }[] = [
  { key: 'general', label: 'General', icon: Store },
  { key: 'payments', label: 'Payments', icon: Landmark },
  { key: 'documents', label: 'Receipts & Invoices', icon: ScrollText }
];

export function BusinessProfile() {
  const { business, profile } = useAuth();
  const canEdit = profile?.role === 'owner';
  const [tab, setTab] = useState<Tab>('general');
  const [form, setForm] = useState(() => ({
    name: business?.name ?? '',
    phone: business?.phone ?? '',
    email: business?.email ?? '',
    address: business?.address ?? '',
    currency: business?.currency ?? 'KES',
    taxRate: String(business?.taxRate ?? 0),
    taxPin: business?.taxPin ?? '',
    paymentInstructions: business?.paymentInstructions ?? '',
    receiptFooter: business?.receiptFooter ?? '',
    paybillNumber: business?.paybillNumber ?? '',
    paybillAccount: business?.paybillAccount ?? '',
    tillNumber: business?.tillNumber ?? '',
    sendTillNumber: business?.sendTillNumber ?? '',
    mpesaConfirmationName: business?.mpesaConfirmationName ?? ''
  }));
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  if (!business) return null;

  async function save() {
    setSaving(true); setSaved(false);
    try {
      const updated = {
        ...business,
        name: form.name,
        phone: form.phone || null,
        email: form.email || null,
        address: form.address || null,
        currency: form.currency,
        taxRate: parseFloat(form.taxRate) || 0,
        taxPin: form.taxPin || null,
        paymentInstructions: form.paymentInstructions || null,
        receiptFooter: form.receiptFooter || null,
        paybillNumber: form.paybillNumber || null,
        paybillAccount: form.paybillAccount || null,
        tillNumber: form.tillNumber || null,
        sendTillNumber: form.sendTillNumber || null,
        mpesaConfirmationName: form.mpesaConfirmationName || null,
        updatedAt: new Date().toISOString()
      };
      await db.businesses.put(updated as any);
      await enqueueSync('businesses', business!.id, 'update');
      await recordAuditEvent({
        businessId: business!.id, userId: profile?.userId ?? null, action: 'business_settings_updated', entityType: 'business', entityId: business!.id,
        previousValue: JSON.stringify({ name: business!.name, currency: business!.currency, taxRate: business!.taxRate }),
        newValue: JSON.stringify({ name: updated.name, currency: updated.currency, taxRate: updated.taxRate })
      });
      setSaved(true);
    } finally { setSaving(false); }
  }

  return (
    <div className="p-4 md:p-8 max-w-lg mx-auto">
      <div className="flex items-center gap-3 mb-1">
        <div className="w-11 h-11 rounded-2xl bg-field-600 text-white flex items-center justify-center font-display font-semibold text-lg shrink-0">
          {business.name?.[0]?.toUpperCase() ?? 'S'}
        </div>
        <div className="min-w-0">
          <h1 className="font-display text-xl font-semibold truncate">{business.name}</h1>
          <p className="text-xs text-slate-500">Business profile</p>
        </div>
      </div>
      {!canEdit && <p className="text-xs text-slate-500 mt-2 mb-4">Only the owner can edit these details.</p>}

      <div className="my-4">
        <StaffLoginLinkCard slug={business.slug} />
      </div>

      <div className="flex gap-1 p-1 bg-slate-100 rounded-xl mb-4">
        {TABS.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`flex-1 flex items-center justify-center gap-1.5 text-xs font-medium py-2 rounded-lg transition-colors ${
              tab === key ? 'bg-paper-raised text-field-600 shadow-sm' : 'text-slate-500'
            }`}
          >
            <Icon className="w-3.5 h-3.5" /> <span className="hidden sm:inline">{label}</span>
          </button>
        ))}
      </div>

      <div className="card p-4 space-y-3.5">
        {tab === 'general' && (
          <>
            <label className="block"><span className="block text-sm font-medium text-slate-600 mb-1.5">Business name</span>
              <input className="input" value={form.name} disabled={!canEdit} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label className="block"><span className="block text-sm font-medium text-slate-600 mb-1.5">Phone</span>
                <input className="input" value={form.phone} disabled={!canEdit} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} />
              </label>
              <label className="block"><span className="block text-sm font-medium text-slate-600 mb-1.5">Email</span>
                <input className="input" value={form.email} disabled={!canEdit} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} />
              </label>
            </div>
            <label className="block"><span className="block text-sm font-medium text-slate-600 mb-1.5">Address</span>
              <input className="input" value={form.address} disabled={!canEdit} onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))} />
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label className="block"><span className="block text-sm font-medium text-slate-600 mb-1.5">Currency</span>
                <input className="input" value={form.currency} disabled={!canEdit} onChange={(e) => setForm((f) => ({ ...f, currency: e.target.value }))} />
              </label>
              <label className="block"><span className="block text-sm font-medium text-slate-600 mb-1.5">Tax rate (%)</span>
                <input className="input tnum" type="number" value={form.taxRate} disabled={!canEdit} onChange={(e) => setForm((f) => ({ ...f, taxRate: e.target.value }))} />
              </label>
            </div>
            <label className="block"><span className="block text-sm font-medium text-slate-600 mb-1.5">Tax PIN</span>
              <input className="input" value={form.taxPin} disabled={!canEdit} onChange={(e) => setForm((f) => ({ ...f, taxPin: e.target.value }))} placeholder="e.g. P051120128E" />
            </label>
          </>
        )}

        {tab === 'payments' && (
          <>
            <p className="text-xs text-slate-500 -mt-1 mb-1">Shown on receipts so customers know where to pay.</p>
            <div className="grid grid-cols-2 gap-3">
              <label className="block"><span className="block text-sm font-medium text-slate-600 mb-1.5">Paybill number</span>
                <input className="input tnum" value={form.paybillNumber} disabled={!canEdit} onChange={(e) => setForm((f) => ({ ...f, paybillNumber: e.target.value }))} />
              </label>
              <label className="block"><span className="block text-sm font-medium text-slate-600 mb-1.5">Paybill account</span>
                <input className="input" value={form.paybillAccount} disabled={!canEdit} onChange={(e) => setForm((f) => ({ ...f, paybillAccount: e.target.value }))} />
              </label>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <label className="block"><span className="block text-sm font-medium text-slate-600 mb-1.5">Till number</span>
                <input className="input tnum" value={form.tillNumber} disabled={!canEdit} onChange={(e) => setForm((f) => ({ ...f, tillNumber: e.target.value }))} />
              </label>
              <label className="block"><span className="block text-sm font-medium text-slate-600 mb-1.5">Send Money / Pochi till</span>
                <input className="input tnum" value={form.sendTillNumber} disabled={!canEdit} onChange={(e) => setForm((f) => ({ ...f, sendTillNumber: e.target.value }))} />
              </label>
            </div>
            <label className="block"><span className="block text-sm font-medium text-slate-600 mb-1.5">Confirmation / registered name</span>
              <input className="input" value={form.mpesaConfirmationName} disabled={!canEdit} onChange={(e) => setForm((f) => ({ ...f, mpesaConfirmationName: e.target.value }))} placeholder="Name shown on the M-Pesa confirmation SMS" />
            </label>
          </>
        )}

        {tab === 'documents' && (
          <>
            <label className="block"><span className="block text-sm font-medium text-slate-600 mb-1.5">Payment instructions (shown on invoices)</span>
              <textarea className="input min-h-16" value={form.paymentInstructions} disabled={!canEdit} onChange={(e) => setForm((f) => ({ ...f, paymentInstructions: e.target.value }))} />
            </label>
            <label className="block"><span className="block text-sm font-medium text-slate-600 mb-1.5">Receipt footer</span>
              <textarea className="input min-h-16" value={form.receiptFooter} disabled={!canEdit} onChange={(e) => setForm((f) => ({ ...f, receiptFooter: e.target.value }))} />
            </label>
          </>
        )}

        {canEdit && (
          <button onClick={save} disabled={saving} className="btn-primary w-full">
            {saving ? 'Saving…' : saved ? 'Saved' : 'Save changes'}
          </button>
        )}
      </div>
    </div>
  );
}

function StaffLoginLinkCard({ slug }: { slug: string }) {
  const url = `${window.location.origin}/login/${slug}`;
  const [copied, setCopied] = useState(false);

  async function copy() {
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="card p-4 mb-4">
      <h2 className="text-sm font-medium mb-1">Staff sign-in link</h2>
      <p className="text-xs text-slate-500 mb-3">
        Share this with your staff — it opens a sign-in page branded with your shop's name, so it's clear it's theirs.
        Everyone (including you) signs in with their own email and password from here.
      </p>
      <div className="flex gap-2">
        <input className="input text-sm flex-1" readOnly value={url} onFocus={(e) => e.target.select()} />
        <button onClick={copy} className="btn-secondary text-sm shrink-0 flex items-center gap-1.5 px-3">
          {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />} {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
    </div>
  );
}
