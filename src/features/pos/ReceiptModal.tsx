import { useEffect, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import QRCode from 'qrcode';
import { X, Printer, Share2, Bluetooth, Download } from 'lucide-react';
import { db } from '../../lib/db';
import { useAuth } from '../../lib/auth';
import { supabase, backendConfigured } from '../../lib/supabase';
import { printReceiptThermally, currentPrinterName } from '../../lib/thermalPrinter';
import { buildReceiptLines, mpesaRefFrom } from '../../lib/receiptFormat';
import { downloadReceiptPdf } from '../../lib/downloads';

function money(n: number) {
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** Prints only the receipt: the class is on <body> just for the duration of the print dialog. */
function printReceiptPage() {
  const cls = 'print-receipt';
  document.body.classList.add(cls);
  const done = () => { document.body.classList.remove(cls); window.removeEventListener('afterprint', done); };
  window.addEventListener('afterprint', done);
  window.print();
  window.setTimeout(done, 60_000); // safety net if afterprint never fires
}

export function ReceiptModal({ saleId, pointsEarned, onClose }: { saleId: string; pointsEarned?: number; onClose: () => void }) {
  const { business, profile } = useAuth();
  const currency = business?.currency ?? 'KES';
  const sale = useLiveQuery(() => db.sales.get(saleId), [saleId]);
  const items = useLiveQuery(() => db.saleItems.where('saleId').equals(saleId).toArray(), [saleId]) ?? [];
  const customer = useLiveQuery(
    () => (sale?.customerId ? db.customers.get(sale.customerId) : undefined),
    [sale?.customerId]
  );
  const branch = useLiveQuery(() => (sale?.branchId ? db.branches.get(sale.branchId) : undefined), [sale?.branchId]);
  // "Served by" must be whoever actually made the sale, not whoever is
  // currently viewing/reprinting the receipt. sale.userId is the AUTH
  // user id (see lib/sales.ts), not a profile row id — those differ for
  // anyone whose profile.id was freshly generated (any employee added
  // since the phase1 migration, e.g. via invite-employee), so this has
  // to look up by the userId+businessId compound index, not db.profiles.get().
  const cashier = useLiveQuery(
    async () => (sale?.userId && sale?.businessId
      ? db.profiles.where('[userId+businessId]').equals([sale.userId, sale.businessId]).first()
      : undefined),
    [sale?.userId, sale?.businessId]
  );

  // The M-Pesa payment that was used for this sale (if any) — its code goes on the receipt.
  const linkedPayment = useLiveQuery(
    async () => (await db.paymentTransactions.toArray()).find((t) => t.matchedSaleId === saleId || t.pendingMatchSaleId === saleId) ?? null,
    [saleId]
  );
  const mpesaRef = sale ? mpesaRefFrom(sale, linkedPayment) : null;

  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [thermalStatus, setThermalStatus] = useState<string | null>(null);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const autoPrintedRef = useRef(false);

  // The QR code and Share button both need a real public link, which only
  // exists once this sale has actually synced to Supabase — a sale made
  // offline still has its real id locally, but create_receipt_share can't
  // do anything with an id the server hasn't seen yet. Falls back to
  // sharing plain text (the old behavior) until that sync happens.
  useEffect(() => {
    // A public link can only exist once the sale is on the server (sync state, not the receipt text).
    if (!sale || !backendConfigured() || !supabase || sale.syncStatus !== 'synced') {
      setShareUrl(null);
      return;
    }
    let cancelled = false;
    const create = () => {
      supabase!.rpc('create_receipt_share', { p_sale_id: sale.id }).then(({ data: token, error }) => {
        if (cancelled || error || !token) return;
        setShareUrl(`${window.location.origin}/r/${token}`);
      });
    };
    create();
    window.addEventListener('online', create);
    return () => { cancelled = true; window.removeEventListener('online', create); };
  }, [sale?.id, sale?.syncStatus]);

  useEffect(() => {
    if (!sale) return;
    const qrContent = shareUrl ?? `${business?.name ?? 'ShopOS'} | Receipt ${sale.receiptNumber} | ${money(sale.total)} ${currency}`;
    QRCode.toDataURL(qrContent, { margin: 0, width: 120 })
      .then(setQrDataUrl)
      .catch(() => setQrDataUrl(null));
  }, [sale?.id, shareUrl]);

  async function printThermal() {
    if (!sale || !business) return false;
    setThermalStatus('Sending to printer…');
    const ok = await printReceiptThermally(business, sale, items, cashier?.fullName ?? '—', { branch, customer, mpesaRef, qrContent: shareUrl });
    setThermalStatus(ok ? null : 'No connected printer — showing the print dialog instead.');
    return ok;
  }

  // Auto-print, once, right when the receipt for a completed sale first
  // renders — but only if the owner has actually turned this on. Manual
  // mode (the default) leaves printing entirely to the Print button below.
  useEffect(() => {
    if (autoPrintedRef.current || !sale || !business) return;
    if (business.receiptPrintMode !== 'auto') return;
    autoPrintedRef.current = true;
    (async () => {
      const printedThermally = await printThermal();
      if (!printedThermally) printReceiptPage();
    })();
  }, [sale?.id, business?.receiptPrintMode]);

  if (!sale || !business) return null;

  async function handleDownloadPdf() {
    if (!sale || !business) return;
    await downloadReceiptPdf({ business, branch, sale, items, customer, servedBy: cashier?.fullName ?? null, mpesaRef, qrContent: shareUrl });
  }

  async function handlePrint() {
    const printedThermally = await printThermal();
    if (!printedThermally) printReceiptPage();
  }

  async function handleShare() {
    if (shareUrl) {
      if (navigator.share) {
        try { await navigator.share({ title: `Receipt ${sale!.receiptNumber}`, text: `Your receipt from ${business?.name ?? 'ShopOS'}`, url: shareUrl }); }
        catch { /* user cancelled */ }
      } else {
        await navigator.clipboard.writeText(shareUrl);
      }
      return;
    }
    // No link yet (offline, or hasn't synced) — fall back to sharing the
    // receipt as plain text, same as before this feature existed.
    const text = buildShareText();
    if (navigator.share) {
      try { await navigator.share({ title: `Receipt ${sale!.receiptNumber}`, text }); } catch { /* user cancelled */ }
    } else {
      await navigator.clipboard.writeText(text);
    }
  }

  function buildShareText() {
    if (!sale || !business) return '';
    return buildReceiptLines({ business, branch, sale, items, customer, servedBy: cashier?.fullName ?? null, mpesaRef }).map((l) => l.text).join('\n');
  }


  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-3 print:static print:block print:p-0">
      <div className="absolute inset-0 bg-ink/40 print:hidden" onClick={onClose} />
      <div className="relative w-full max-w-sm bg-paper-raised rounded-2xl overflow-hidden shadow-xl print:rounded-none print:shadow-none print:max-w-full">
        <div className="flex items-center justify-between px-5 py-3 border-b border-slate-100 print:hidden">
          <h3 className="font-display font-semibold">Receipt</h3>
          <button onClick={onClose}><X className="w-5 h-5" /></button>
        </div>

        <div className="p-4 max-h-[70vh] overflow-y-auto print:max-h-none print:overflow-visible" id="receipt-content">
          {/* Monospace, fixed-width lines from lib/receiptFormat.ts: identical to what the thermal printer prints. */}
          <pre className="font-mono text-[11px] leading-[1.35] text-ink mx-auto w-fit whitespace-pre m-0">
            {buildReceiptLines({ business, branch, sale, items, customer, servedBy: cashier?.fullName ?? null, mpesaRef }).map((l, i) => (
              <div key={i} className={l.bold ? 'font-bold' : undefined}>{l.text || '\u00A0'}</div>
            ))}
          </pre>
          {qrDataUrl && (
            <div className="flex flex-col items-center pt-3 gap-1">
              <img src={qrDataUrl} alt="Receipt QR code" width={100} height={100} />
              {shareUrl && <div className="text-[10px] text-slate-400">Scan to view this receipt online</div>}
            </div>
          )}
          {customer && customer.loyaltyRegistered && (pointsEarned ?? 0) > 0 && (
            <div className="text-center font-mono text-[11px] pt-3">
              <div>Loyalty points earned: {pointsEarned}</div>
              <div>Points balance: {customer.loyaltyPoints}</div>
            </div>
          )}
        </div>

        <div className="p-4 border-t border-slate-100 print:hidden">
          {currentPrinterName() && (
            <p className="text-xs text-slate-400 flex items-center gap-1 mb-2"><Bluetooth className="w-3 h-3" /> Connected: {currentPrinterName()}</p>
          )}
          {thermalStatus && <p className="text-xs text-slate-500 mb-2">{thermalStatus}</p>}
          <div className="grid grid-cols-3 gap-2">
            <button onClick={handlePrint} className="btn-secondary flex items-center justify-center gap-1.5 text-sm min-h-[44px]">
              <Printer className="w-4 h-4" /> Print
            </button>
            <button onClick={handleDownloadPdf} className="btn-secondary flex items-center justify-center gap-1.5 text-sm min-h-[44px]">
              <Download className="w-4 h-4" /> PDF
            </button>
            <button onClick={handleShare} className="btn-primary flex items-center justify-center gap-1.5 text-sm min-h-[44px]">
              <Share2 className="w-4 h-4" /> Share
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
