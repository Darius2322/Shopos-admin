/** Turns whatever format a phone number was entered in (070..., 011..., +254..., with spaces or
 * dashes) into the digits-only, country-code-first format wa.me requires. Assumes Kenya (254) for
 * a local-style number starting with 0 — this admin panel is Kenya-only for now; if ShopOS ever
 * serves other countries, this needs a real country field instead of a guess. */
export function toWhatsAppNumber(phone: string): string {
  const digits = phone.replace(/[^\d+]/g, '');
  return digits.startsWith('+') ? digits.slice(1)
    : digits.startsWith('254') ? digits
    : digits.startsWith('0') ? `254${digits.slice(1)}`
    : digits;
}
