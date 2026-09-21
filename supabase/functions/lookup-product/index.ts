// Supabase Edge Function: lookup-product (deployed, verify_jwt = true)
// Barcode -> product details via a configurable provider; keys stay in Supabase secrets.
//   PRODUCT_LOOKUP_PROVIDER = openfoodfacts (default, no key) | upcitemdb
//   PRODUCT_LOOKUP_API_KEY  = optional, for providers that need one
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

interface Found { found: true; provider: string; productName: string; brand?: string; quantity?: string; category?: string; packaging?: string; imageUrl?: string }

async function openFoodFacts(code: string): Promise<Found | null> {
  const url = `https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(code)}.json?fields=product_name,brands,quantity,categories,packaging,image_front_small_url`;
  const res = await fetch(url, { signal: AbortSignal.timeout(6000), headers: { 'User-Agent': 'ShopOS/1.0 (barcode lookup)' } });
  if (!res.ok) return null;
  const data = await res.json();
  if (data.status !== 1 || !data.product?.product_name) return null;
  const p = data.product;
  return { found: true, provider: 'openfoodfacts', productName: String(p.product_name).trim(),
    brand: (p.brands || '').split(',')[0]?.trim() || undefined, quantity: (p.quantity || '').trim() || undefined,
    category: (p.categories || '').split(',').pop()?.trim() || undefined, packaging: (p.packaging || '').split(',')[0]?.trim() || undefined,
    imageUrl: p.image_front_small_url || undefined };
}

async function upcItemDb(code: string): Promise<Found | null> {
  const key = Deno.env.get('PRODUCT_LOOKUP_API_KEY');
  const base = key ? 'https://api.upcitemdb.com/prod/v1/lookup' : 'https://api.upcitemdb.com/prod/trial/lookup';
  const res = await fetch(`${base}?upc=${encodeURIComponent(code)}`, { signal: AbortSignal.timeout(6000), headers: key ? { user_key: key, key_type: '3scale' } : {} });
  if (!res.ok) return null;
  const item = (await res.json()).items?.[0];
  if (!item?.title) return null;
  return { found: true, provider: 'upcitemdb', productName: String(item.title).trim(), brand: item.brand || undefined,
    quantity: item.size || undefined, category: (item.category || '').split('>').pop()?.trim() || undefined, imageUrl: item.images?.[0] || undefined };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const { barcode } = await req.json();
    const code = String(barcode ?? '').trim();
    if (!/^[0-9]{8,14}$/.test(code)) return json({ found: false, reason: 'invalid_barcode' }, 400);
    const provider = (Deno.env.get('PRODUCT_LOOKUP_PROVIDER') ?? 'openfoodfacts').toLowerCase();
    let result: Found | null = null;
    try { result = provider === 'upcitemdb' ? await upcItemDb(code) : await openFoodFacts(code); }
    catch { return json({ found: false, reason: 'provider_unavailable' }); }
    return json(result ?? { found: false, reason: 'not_found' });
  } catch (err) { return json({ found: false, reason: String(err) }, 500); }
});
