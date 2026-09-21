import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { supabase, backendConfigured } from '../../lib/supabase';
import { buildReceiptLines } from '../../lib/receiptFormat';

// Turns whatever format a phone number was entered in (070..., 011...,
// +254..., with spaces or dashes) into the digits-only, country-code-first
// format wa.me requires. Assumes Kenya (254) for a local-style number
// starting with 0, since that's this app's context — if ShopOS ever
// serves other countries, this needs a real country field instead of a
// guess.
function toWhatsAppLink(phone: string): string {
  const digits = phone.replace(/[^\d+]/g, '');
  const normalized = digits.startsWith('+') ? digits.slice(1)
    : digits.startsWith('0') ? `254${digits.slice(1)}`
    : digits;
  return `https://wa.me/${normalized}`;
}

function money(n: number) {
  return Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

interface PublicReceiptData {
  businessName: string; businessPhone: string | null; businessEmail: string | null; businessAddress: string | null;
  taxPin: string | null; receiptFooter: string | null; tillNumber: string | null; paybillNumber: string | null;
  paybillAccount: string | null; sendTillNumber: string | null; mpesaConfirmationName: string | null;
  branchName: string | null; branchLocation: string | null; branchPhone: string | null;
  receiptNumber: string; createdAt: string;
  items: { productName: string; quantity: number; unitPrice: number; discount: number; lineTotal: number }[];
  subtotal: number; discount: number; tax: number; total: number; amountPaid: number;
  paymentMethod: string; balanceDue: number; mpesaRef: string | null;
}

export function PublicReceipt() {
  const location = useLocation();
  const token = location.pathname.split('/')[2] ?? '';
  const [data, setData] = useState<PublicReceiptData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!backendConfigured() || !supabase) {
      setError('This link is not available right now.');
      setLoading(false);
      return;
    }
    supabase.rpc('get_public_receipt', { p_token: token }).then(({ data: result, error: rpcError }) => {
      if (rpcError || !result) {
        setError("This receipt link is invalid or has expired.");
      } else {
        setData(result as PublicReceiptData);
      }
      setLoading(false);
    });
  }, [token]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-paper">
        <p className="text-sm text-slate-400">Loading receipt…</p>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-paper p-6 text-center">
        <p className="text-sm font-medium mb-1">Receipt not found</p>
        <p className="text-sm text-slate-500 max-w-xs">{error ?? 'This link may be invalid.'}</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-paper flex flex-col items-center px-4 py-10">
      <div className="w-full max-w-sm bg-paper-raised rounded-2xl shadow-sm border border-slate-100 overflow-hidden p-4">
        {/* Same fixed-width layout as the printed receipt (lib/receiptFormat.ts). */}
        <pre className="font-mono text-[11px] leading-[1.35] text-ink mx-auto w-fit max-w-full overflow-x-auto whitespace-pre m-0">
          {buildReceiptLines({
            business: {
              name: data.businessName, address: data.businessAddress, phone: data.businessPhone, email: data.businessEmail,
              taxPin: data.taxPin, receiptFooter: data.receiptFooter, tillNumber: data.tillNumber, paybillNumber: data.paybillNumber,
              paybillAccount: data.paybillAccount, sendTillNumber: data.sendTillNumber, mpesaConfirmationName: data.mpesaConfirmationName
            },
            branch: { name: data.branchName ?? '', location: data.branchLocation ?? null } as never,
            sale: {
              receiptNumber: data.receiptNumber, createdAt: data.createdAt, subtotal: Number(data.subtotal), discount: Number(data.discount),
              tax: Number(data.tax), total: Number(data.total), amountPaid: Number(data.amountPaid), balanceDue: Number(data.balanceDue),
              paymentMethod: data.paymentMethod as never, note: null
            },
            items: data.items.map((i) => ({ productName: i.productName, quantity: Number(i.quantity), unitPrice: Number(i.unitPrice), lineTotal: Number(i.lineTotal), discount: Number(i.discount) })),
            servedBy: null, mpesaRef: data.mpesaRef
          }).map((l, i) => <div key={i} className={l.bold ? 'font-bold' : undefined}>{l.text || '\u00A0'}</div>)}
        </pre>
      </div>

      {(() => {
        const contactPhone = data.branchPhone || data.businessPhone;
        return contactPhone ? (
          <a
            href={toWhatsAppLink(contactPhone)}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-6 w-full max-w-sm btn-primary text-center text-sm py-3 rounded-xl"
          >
            Contact {data.businessName} on WhatsApp
          </a>
        ) : null;
      })()}
      <p className="text-xs text-slate-400 mt-3">Powered by ShopOS</p>
    </div>
  );
}
