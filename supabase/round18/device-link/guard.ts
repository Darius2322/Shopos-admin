// ShopOS edge guard (Round 17). Loaded first by every public function's index.ts.
// 1) Per-IP rate limit, enforced in the database (rl_check) so it holds across all function instances.
// 2) Any 5xx response is replaced with a friendly message; the real reason is scrubbed and logged to app_events (admin Monitor).
// 3) `detail` / `stack` fields are never returned to callers.
// It wraps Deno.serve, so the original function code stays exactly as it was.
import { createClient } from 'jsr:@supabase/supabase-js@2';

interface Opts { name: string; limit: number; windowSec: number }

const FRIENDLY = 'Something went wrong on our side. Please try again in a moment.';
const SAFE_REASON = /^[a-z][a-z0-9_]{1,40}$/;

const scrub = (s: unknown) =>
  String(s ?? '')
    .replace(/eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{5,}/g, '[token]')
    .replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, '[email]')
    .replace(/(\+?254|0)[17][0-9]{8}/g, '[phone]')
    .replace(/[A-Za-z0-9_-]{32,}/g, '[secret]')
    .slice(0, 300);

export function install(o: Opts) {
  const realServe = Deno.serve.bind(Deno);
  const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
  const lastLogged = new Map<string, number>();

  const log = (level: 'warn' | 'error' | 'security', kind: string, message: string, throttleKey?: string) => {
    const now = Date.now();
    if (throttleKey) {
      if ((lastLogged.get(throttleKey) ?? 0) > now - 60_000) return;
      lastLogged.set(throttleKey, now);
      if (lastLogged.size > 500) lastLogged.clear();
    }
    void sb.from('app_events').insert({ level, source: 'edge', kind, message: scrub(message) }).then(() => {}, () => {});
  };

  const headersFor = (src?: Headers) => {
    const h = new Headers(src);
    h.delete('content-length');
    h.set('Content-Type', 'application/json');
    h.set('Cache-Control', 'no-store');
    if (!h.has('Access-Control-Allow-Origin')) h.set('Access-Control-Allow-Origin', '*');
    return h;
  };

  const friendly = (status: number, extra: Record<string, unknown> = {}, src?: Headers) =>
    new Response(JSON.stringify({ ok: false, error: FRIENDLY, ...extra }), { status, headers: headersFor(src) });

  const wrap = (handler: (req: Request, info?: unknown) => Response | Promise<Response>) =>
    async (req: Request, info?: unknown): Promise<Response> => {
      if (req.method === 'OPTIONS') return handler(req, info);

      const ip = (req.headers.get('cf-connecting-ip') ?? req.headers.get('x-forwarded-for') ?? '').split(',')[0].trim() || 'unknown';
      try {
        const { error } = await sb.rpc('rl_check', { p_scope: `edge:${o.name}`, p_limit: o.limit, p_window_seconds: o.windowSec, p_key: ip });
        if (error && (error.code === 'P0429' || /too many requests/i.test(error.message ?? ''))) {
          log('security', `rate_limited.${o.name}`, `Blocked a burst of requests (limit ${o.limit}/${o.windowSec}s)`, `rl:${o.name}:${ip}`);
          const h = headersFor();
          h.set('Retry-After', String(Math.min(o.windowSec, 60)));
          return new Response(JSON.stringify({ ok: false, error: 'Too many requests. Please wait a moment and try again.', reason: 'rate_limited' }), { status: 429, headers: h });
        }
      } catch { /* never block real users because the limiter itself had a problem */ }

      try {
        const res = await handler(req, info);
        if (res.status < 400) return res;
        const ct = res.headers.get('content-type') ?? '';
        if (!ct.includes('json')) return res.status >= 500 ? friendly(res.status, {}, res.headers) : res;
        let body: Record<string, unknown> | null = null;
        const raw = await res.clone().text();
        try { body = JSON.parse(raw); } catch { /* not json */ }
        if (!body || typeof body !== 'object') return res.status >= 500 ? friendly(res.status, {}, res.headers) : res;
        delete body.detail; delete body.stack;
        if (res.status >= 500) {
          log('error', `edge.${o.name}`, `${res.status} ${String(body.error ?? body.message ?? body.reason ?? '')}`, `err:${o.name}`);
          const extra: Record<string, unknown> = {};
          if (typeof body.reason === 'string' && SAFE_REASON.test(body.reason)) extra.reason = body.reason;
          if (body.found === false) extra.found = false;
          return friendly(res.status, extra, res.headers);
        }
        return new Response(JSON.stringify(body), { status: res.status, headers: headersFor(res.headers) });
      } catch (e) {
        log('error', `edge.${o.name}`, e instanceof Error ? e.message : String(e), `err:${o.name}`);
        return friendly(500);
      }
    };

  // deno-lint-ignore no-explicit-any
  const patched = (a: any, b?: any) => {
    if (typeof a === 'function') return realServe(wrap(a));
    if (typeof b === 'function') return realServe(a, wrap(b));
    return realServe({ ...a, handler: wrap(a.handler) });
  };
  try {
    Object.defineProperty(Deno, 'serve', { value: patched, writable: true, configurable: true });
  } catch {
    try { (Deno as unknown as { serve: unknown }).serve = patched; } catch { /* leave the function running unguarded rather than break it */ }
  }
}
