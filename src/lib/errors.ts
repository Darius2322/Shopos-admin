/**
 * Supabase RPC/query errors (PostgrestError) carry message/details/hint/code
 * fields but aren't always a plain `Error` instance depending on the code
 * path that produced them. Places in this app used to do
 * `err instanceof Error ? err.message : 'Some generic fallback'`, which
 * silently threw away the real reason (e.g. a database exception's message)
 * any time that check didn't hold — that's why failures like the OTP
 * "Could not generate code" case showed no useful detail. This normalizes
 * every shape into one readable string.
 */
export function describeError(err: unknown, fallback: string): string {
  if (err && typeof err === 'object') {
    const e = err as { message?: unknown; details?: unknown; hint?: unknown; code?: unknown };
    if (typeof e.message === 'string' && e.message.trim()) {
      const extra = [e.details, e.hint].filter((v) => typeof v === 'string' && v.trim()).join(' — ');
      const code = typeof e.code === 'string' && e.code.trim() ? ` [${e.code}]` : '';
      return extra ? `${e.message} — ${extra}${code}` : `${e.message}${code}`;
    }
  }
  if (typeof err === 'string' && err.trim()) return err;
  return fallback;
}
