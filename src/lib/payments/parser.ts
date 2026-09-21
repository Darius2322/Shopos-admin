/**
 * Best-effort parser for an M-Pesa confirmation that a person has PASTED or typed in.
 * ShopOS never reads SMS or notifications; this only helps a human enter a payment faster.
 * Anything it cannot find is left blank for the person to fill in, and they confirm before saving.
 */
export interface ParsedMpesa {
  transactionCode?: string;
  amount?: number;
  senderName?: string;
  senderPhone?: string;
  tillNumber?: string;
  receivedAt?: string; // ISO
}

const CODE_RE = /\b([A-Z0-9]{10})\b(?=\s+Confirmed)/i;
const CODE_FALLBACK_RE = /\b([A-Z]{2,3}[0-9][A-Z0-9]{6,8})\b/;

export function parseMpesaConfirmation(text: string): ParsedMpesa {
  const out: ParsedMpesa = {};
  const t = text.replace(/\s+/g, ' ').trim();
  if (!t) return out;

  const code = t.match(CODE_RE) ?? t.match(CODE_FALLBACK_RE);
  if (code) out.transactionCode = code[1].toUpperCase();

  const amt = t.match(/(?:Ksh|KES)\.?\s?([0-9][0-9,]*(?:\.[0-9]{1,2})?)/i);
  if (amt) out.amount = parseFloat(amt[1].replace(/,/g, ''));

  const from = t.match(/received (?:from|by)\s+(.+?)\s+((?:\+?254|0)[0-9*]{6,12})/i);
  if (from) { out.senderName = from[1].trim(); out.senderPhone = from[2]; }
  else {
    const nameOnly = t.match(/(?:received )?from\s+([A-Za-z][A-Za-z .'-]{2,40}?)(?:\s+on\b|\.|,|$)/i);
    if (nameOnly) out.senderName = nameOnly[1].trim();
  }

  const till = t.match(/(?:till|buy goods)(?: number| no\.?)?\s*:?\s*([0-9]{5,10})/i);
  if (till) out.tillNumber = till[1];

  const when = t.match(/on\s+([0-9]{1,2})\/([0-9]{1,2})\/([0-9]{2,4})\s+at\s+([0-9]{1,2}):([0-9]{2})\s*(AM|PM)?/i);
  if (when) {
    let [, d, m, y, hh, mm, ap] = when as unknown as string[];
    let hour = parseInt(hh, 10);
    if (ap) { const pm = ap.toUpperCase() === 'PM'; if (pm && hour < 12) hour += 12; if (!pm && hour === 12) hour = 0; }
    const year = y.length === 2 ? 2000 + parseInt(y, 10) : parseInt(y, 10);
    const dt = new Date(year, parseInt(m, 10) - 1, parseInt(d, 10), hour, parseInt(mm, 10));
    if (!Number.isNaN(dt.getTime())) out.receivedAt = dt.toISOString();
  }
  return out;
}

export const MPESA_CODE_PATTERN = /^[A-Z0-9]{8,12}$/;
export function normaliseCode(code: string): string { return code.trim().toUpperCase(); }
