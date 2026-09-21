/**
 * Barcode -> product details, in this order:
 *   1. this device's own products      (instant, offline)   — barcode already stocked
 *   2. the local lookup cache          (instant, offline)   — scanned/looked-up before
 *   3. the configured provider, via the `lookup-product` edge function (online only)
 * Nothing is invented: if no source knows the barcode the caller keeps the barcode and the person
 * types the rest. Successful provider hits are cached for next time. Provider choice and any API
 * key live server-side (Supabase function secrets), never in this bundle.
 */
import { db } from './db';
import { supabase, backendConfigured } from './supabase';

export interface BarcodeLookupResult {
  name: string;
  brand?: string;
  unit?: string;
  size?: string;
  category?: string;
  packaging?: string;
  imageUrl?: string;
  source?: 'cache' | 'network';
}

export type LookupOutcome =
  | { status: 'found'; result: BarcodeLookupResult }
  | { status: 'exists'; productName: string }   // already in this business's inventory
  | { status: 'offline' }                       // never seen before and there is no connection
  | { status: 'unavailable' }                   // online, but the provider could not be reached
  | { status: 'not_found' };

const UNIT_ALIASES: Record<string, string> = {
  g: 'g', gram: 'g', grams: 'g', gramme: 'g', grammes: 'g',
  kg: 'kg', kilogram: 'kg', kilograms: 'kg',
  ml: 'ml', millilitre: 'ml', millilitres: 'ml', milliliter: 'ml',
  l: 'litre', litre: 'litre', litres: 'litre', liter: 'litre', liters: 'litre', cl: 'ml',
  pc: 'piece', pcs: 'piece', piece: 'piece', pieces: 'piece',
  pack: 'pack', box: 'box', carton: 'carton', bottle: 'bottle', dozen: 'dozen',
  m: 'metre', metre: 'metre', metres: 'metre', meter: 'metre',
};

/** Maps free-text packaging ("PET bottle", "Cardboard box") onto the app's unit list, when it clearly matches. */
export function unitFromPackaging(packaging?: string): string | undefined {
  const p = (packaging ?? '').toLowerCase();
  for (const u of ['bottle', 'carton', 'box', 'pack']) if (p.includes(u)) return u;
  return undefined;
}

function shape(raw: { productName: string; brand?: string; quantity?: string; category?: string; packaging?: string; imageUrl?: string }): BarcodeLookupResult {
  const quantity = (raw.quantity ?? '').trim();
  const unitWord = quantity.match(/([a-zA-Z]+)\s*$/)?.[1]?.toLowerCase();
  const unit = (unitWord && UNIT_ALIASES[unitWord]) || unitFromPackaging(raw.packaging);
  // Keep the size in the name so "Coca-Cola 2 L" is not silently reduced to "Coca-Cola".
  const name = quantity && !raw.productName.toLowerCase().includes(quantity.toLowerCase()) ? `${raw.productName} ${quantity}` : raw.productName;
  return { name, brand: raw.brand, unit, size: quantity || undefined, category: raw.category, packaging: raw.packaging, imageUrl: raw.imageUrl };
}

async function fromProvider(code: string): Promise<{ productName: string; brand?: string; quantity?: string; category?: string; packaging?: string; imageUrl?: string } | 'not_found' | 'unavailable'> {
  // Preferred: the server-side function (configurable provider, keys stay server-side).
  if (backendConfigured() && supabase) {
    try {
      const { data, error } = await supabase.functions.invoke('lookup-product', { body: { barcode: code } });
      if (!error && data) {
        if (data.found) return data;
        if (data.reason === 'not_found') return 'not_found';
      }
    } catch { /* fall through to the public endpoint */ }
  }
  // Fallback when the function is not deployed/reachable: the same public, key-free database directly.
  try {
    const res = await fetch(`https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(code)}.json?fields=product_name,brands,quantity,categories,packaging,image_front_small_url`, { signal: AbortSignal.timeout(6000) });
    if (!res.ok) return 'unavailable';
    const data = await res.json();
    if (data.status !== 1 || !data.product?.product_name) return 'not_found';
    const p = data.product;
    return {
      productName: String(p.product_name).trim(), brand: (p.brands || '').split(',')[0]?.trim() || undefined,
      quantity: (p.quantity || '').trim() || undefined, category: (p.categories || '').split(',').pop()?.trim() || undefined,
      packaging: (p.packaging || '').split(',')[0]?.trim() || undefined, imageUrl: p.image_front_small_url || undefined,
    };
  } catch { return 'unavailable'; }
}

export async function lookupBarcodeDetailed(barcode: string, businessId?: string): Promise<LookupOutcome> {
  const code = barcode.trim();
  if (!code) return { status: 'not_found' };

  if (businessId) {
    const own = await db.products.where('businessId').equals(businessId).filter((p) => p.barcode === code).first();
    if (own) return { status: 'exists', productName: own.name };
  }

  const cached = await db.barcodeCache.get(code);
  if (cached) {
    return { status: 'found', result: { name: cached.name, brand: cached.brand, unit: cached.unit, size: cached.size, category: cached.category, packaging: cached.packaging, imageUrl: cached.imageUrl, source: 'cache' } };
  }

  if (typeof navigator !== 'undefined' && navigator.onLine === false) return { status: 'offline' };

  const r = await fromProvider(code);
  if (r === 'not_found' || r === 'unavailable') return { status: r };
  const shaped = shape(r);
  await db.barcodeCache.put({
    barcode: code, name: shaped.name, brand: shaped.brand, unit: shaped.unit, size: shaped.size,
    category: shaped.category, packaging: shaped.packaging, imageUrl: shaped.imageUrl, cachedAt: new Date().toISOString(),
  }).catch(() => undefined);
  return { status: 'found', result: { ...shaped, source: 'network' } };
}

/** Back-compatible helper: the found result, or null for anything else. */
export async function lookupBarcode(barcode: string): Promise<BarcodeLookupResult | null> {
  const out = await lookupBarcodeDetailed(barcode);
  return out.status === 'found' ? out.result : null;
}
