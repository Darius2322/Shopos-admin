/**
 * Recognises ONE thing: an incoming-payment confirmation from M-Pesa. Anything else —
 * personal messages, OTPs, "you have sent…", airtime, balance notices, other senders —
 * returns null and must be discarded immediately by the caller (never stored, never uploaded).
 *
 * Only the minimum needed for payment processing is extracted: code, amount, payer name/phone,
 * time, and (when the text has them) a till or paybill account reference.
 *
 * Real M-Pesa wording varies by product (Till / Paybill / personal) and over time, so the
 * patterns are deliberately tolerant and several are optional. A message that is a payment
 * confirmation but yields no code or amount is rejected rather than guessed at.
 */
export interface ParsedMpesaPayment {
  transactionCode: string;
  amount: number;
  senderName?: string;
  senderPhone?: string;
  receivedAt?: string;   // ISO
  tillNumber?: string;   // only if the message itself states it (many don't)
  reference?: string;    // paybill account / details, if present
}

const SENDER_OK = /^\s*m[-\s]?pesa\s*$/i;

/** Cheap pre-filter run BEFORE any parsing, so irrelevant messages are dropped at once. */
export function isMpesaSender(address: string | null | undefined): boolean {
  return !!address && SENDER_OK.test(address);
}

export function parseMpesaPaymentSms(address: string | null | undefined, body: string | null | undefined): ParsedMpesaPayment | null {
  if (!isMpesaSender(address) || !body) return null;
  const t = body.replace(/\s+/g, ' ').trim();

  // Must be a completed transaction that CREDITS the business.
  const code = t.match(/^\s*([A-Z0-9]{10})\s+Confirmed/i)?.[1]?.toUpperCase();
  if (!code) return null;
  if (!/\b(you have received|received\s+(?:ksh|kes)|(?:ksh|kes)\.?\s?[\d.,]+\s+received|payment of\s+(?:ksh|kes)[\d.,\s]+\s+received|paid to you)/i.test(t)) return null;
  if (/\b(you have sent|sent to|withdraw|airtime|you bought|paid to\s+[A-Z]|reversal|balance is\s+ksh[\d.,]+\s*$)/i.test(t) && !/received/i.test(t)) return null;

  const amount = parseFloat((t.match(/(?:ksh|kes)\.?\s?([0-9][0-9,]*(?:\.[0-9]{1,2})?)/i)?.[1] ?? '').replace(/,/g, ''));
  if (!(amount > 0)) return null;

  let senderName: string | undefined;
  let senderPhone: string | undefined;
  const withPhone = t.match(/\bfrom\s+([A-Za-z][A-Za-z .'-]{1,60}?)\s+((?:\+?254|0)[0-9*]{6,12})/i);
  if (withPhone) { senderName = withPhone[1].trim(); senderPhone = withPhone[2]; }
  else {
    const nameOnly = t.match(/\bfrom\s+([A-Za-z][A-Za-z .'-]{1,60}?)(?=\s+on\s+\d|\s+at\s+\d|\.)/i);
    if (nameOnly) senderName = nameOnly[1].trim();
  }

  let receivedAt: string | undefined;
  const w = t.match(/\bon\s+(\d{1,2})\/(\d{1,2})\/(\d{2,4})\s+at\s+(\d{1,2}):(\d{2})\s*(AM|PM)?/i);
  if (w) {
    let hour = parseInt(w[4], 10);
    if (w[6]) { const pm = w[6].toUpperCase() === 'PM'; if (pm && hour < 12) hour += 12; if (!pm && hour === 12) hour = 0; }
    const year = w[3].length === 2 ? 2000 + parseInt(w[3], 10) : parseInt(w[3], 10);
    const d = new Date(year, parseInt(w[2], 10) - 1, parseInt(w[1], 10), hour, parseInt(w[5], 10));
    if (!Number.isNaN(d.getTime())) receivedAt = d.toISOString();
  }

  const tillNumber = t.match(/\btill\s*(?:no\.?|number)?\s*:?\s*([0-9]{5,10})\b/i)?.[1];
  const reference = t.match(/\baccount\s*(?:number|no\.?)?\s*:?\s*([A-Za-z0-9-]{2,30})/i)?.[1];

  return { transactionCode: code, amount, senderName, senderPhone, receivedAt, tillNumber, reference };
}
