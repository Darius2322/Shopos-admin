import { supabase, backendConfigured } from './supabase';

/** Gets (or creates) the secure public link for a sale's receipt. Returns
 * null if offline or the sale hasn't synced to the server yet — a sale
 * only exists to link to once the server has seen it. */
export async function getReceiptLink(saleId: string, receiptNumber: string): Promise<string | null> {
  if (!backendConfigured() || !supabase || receiptNumber.startsWith('PENDING-')) return null;
  const { data: token, error } = await supabase.rpc('create_receipt_share', { p_sale_id: saleId });
  if (error || !token) return null;
  return `${window.location.origin}/r/${token}`;
}
