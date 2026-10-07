/**
 * Turns any error into a short, friendly sentence that is safe to show on screen.
 * Raw database / server / network messages (table names, SQL codes, stack traces, URLs, tokens) are never returned.
 * Messages we wrote ourselves in plain language are allowed through.
 */
const NETWORK = /failed to fetch|networkerror|network request failed|load failed|fetch failed|timed? ?out|econn|enotfound|offline|err_internet/i;
const BAD_LOGIN = /invalid login credentials|invalid credentials|invalid_grant|email not confirmed/i;
const SESSION = /jwt|token.*expired|refresh token|not authenticated|auth session missing|session.*(expired|missing|not found)/i;
const RATE = /too many (requests|attempts)|rate.?limit|p0429|\b429\b/i;
const PERM = /permission denied|row-level security|not authorized|not authorised|forbidden|violates row-level|\bpolicy\b|42501/i;
const DUP = /duplicate key|already (exists|registered)|23505|unique constraint/i;
const LINKED = /foreign key|23503|still referenced/i;
const INVALID = /null value|not-null|23502|check constraint|23514|invalid input syntax|22p02|value too long|22001/i;
const TECHNICAL = /relation |column |function |schema|syntax error|postgres|supabase|pgrst|sqlstate|\bpg_|uuid|stack|undefined|cannot read|is not a function|typeerror|referenceerror|\brpc\b|edge function|non-2xx|0x[0-9a-f]+|at \S+ \(|https?:\/\/|select |insert |update |delete from/i;

export const GENERIC = 'Something went wrong. Please try again.';

function rawText(e: unknown): string {
  if (!e) return '';
  if (typeof e === 'string') return e;
  if (e instanceof Error) return e.message || '';
  if (typeof e === 'object') {
    const o = e as Record<string, unknown>;
    for (const k of ['message', 'error_description', 'msg', 'error']) if (typeof o[k] === 'string') return o[k] as string;
  }
  return '';
}

export function friendlyError(e: unknown, fallback: string = GENERIC): string {
  const raw = rawText(e).trim();
  if (!raw) return fallback;
  if (NETWORK.test(raw)) return "Can't reach ShopOS right now. Check your internet connection and try again.";
  if (BAD_LOGIN.test(raw)) return 'Incorrect email or password.';
  if (SESSION.test(raw)) return 'Your session has expired. Please sign in again.';
  if (RATE.test(raw)) return 'Too many attempts. Please wait a moment and try again.';
  if (PERM.test(raw)) return "You don't have permission to do that.";
  if (DUP.test(raw)) return 'That already exists.';
  if (LINKED.test(raw)) return 'This is still in use somewhere else, so it cannot be changed.';
  if (INVALID.test(raw)) return 'Some required information is missing or not valid. Please check and try again.';
  if (TECHNICAL.test(raw) || raw.length > 140) return fallback;
  return raw;
}
