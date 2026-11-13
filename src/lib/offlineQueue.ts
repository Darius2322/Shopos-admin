/** Changes made with no internet are kept on the phone and sent when the connection is back.
 * It wraps the network calls of the booking and admin screens (the POS has its own saved-changes queue). A change that cannot be sent
 * because the phone is offline is stored, the screen is told "saved", and it is replayed in order once the phone is online again. */
const KEY = 'shopos.queue.v1';
interface Item { id: number; method: string; url: string; headers: Record<string, string>; body: string | null; at: number }
type Getter = () => Promise<string | undefined>;

let getToken: Getter = async () => undefined;
let match: (url: string, method: string) => boolean = () => false;
let flushing = false;

const read = (): Item[] => { try { return JSON.parse(localStorage.getItem(KEY) || '[]'); } catch { return []; } };
const write = (q: Item[]) => { try { localStorage.setItem(KEY, JSON.stringify(q.slice(-300))); } catch { /* storage may be full */ } window.dispatchEvent(new Event('shopos:queue')); };
export const pendingCount = () => read().length;

function fake(item: { url: string; method: string; headers: Record<string, string> }): Response {
  const accept = Object.entries(item.headers).find(([k]) => k.toLowerCase() === 'accept')?.[1] ?? '';
  const body = /rpc\//.test(item.url) ? 'null' : /pgrst\.object/.test(accept) ? '{}' : '[]';
  return new Response(body, { status: item.method === 'POST' ? 201 : 200, headers: { 'content-type': 'application/json', 'x-shopos-queued': '1' } });
}

export async function flushQueue(): Promise<void> {
  if (flushing || navigator.onLine === false) return; flushing = true;
  try {
    let q = read();
    while (q.length) {
      const it = q[0];
      const headers = { ...it.headers }; const tok = await getToken();
      if (tok) { for (const k of Object.keys(headers)) if (k.toLowerCase() === 'authorization') delete headers[k]; headers.Authorization = `Bearer ${tok}`; }
      let res: Response;
      try { res = await fetch(it.url, { method: it.method, headers, body: it.body }); } catch { break; } // still offline: keep the rest
      if (res.status >= 500 || res.status === 401) break; // try again later
      q = read().filter((x) => x.id !== it.id); write(q); // sent, or refused for good: either way drop it
    }
    if (!read().length) window.dispatchEvent(new Event('shopos:back-online'));
  } finally { flushing = false; }
}

/** Use as supabase `global.fetch`. */
export function makeQueueingFetch(opts: { match: (url: string, method: string) => boolean; token: Getter }): typeof fetch {
  match = opts.match; getToken = opts.token;
  if (typeof window !== 'undefined') {
    window.addEventListener('online', () => { void flushQueue(); });
    window.setInterval(() => { if (read().length) void flushQueue(); }, 30000);
    window.setTimeout(() => { void flushQueue(); }, 3000);
  }
  return async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    const method = (init?.method ?? (typeof input === 'object' && 'method' in input ? input.method : 'GET')).toUpperCase();
    if (method === 'GET' || method === 'HEAD' || !match(url, method)) return fetch(input, init);
    const offline = navigator.onLine === false;
    try {
      if (offline) throw new TypeError('offline');
      return await fetch(input, init);
    } catch (e) {
      if (!(e instanceof TypeError)) throw e;
      const headers: Record<string, string> = {};
      new Headers(init?.headers ?? (typeof input === 'object' && 'headers' in input ? input.headers : undefined)).forEach((v, k) => { headers[k] = v; });
      const body = typeof init?.body === 'string' ? init.body : init?.body == null ? null : null;
      if (init?.body != null && body === null) throw e; // cannot keep files this way
      const item: Item = { id: Date.now() + Math.floor(Math.random() * 1000), method, url, headers, body, at: Date.now() };
      write([...read(), item]);
      return fake(item);
    }
  };
}
