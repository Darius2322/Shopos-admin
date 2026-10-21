import { friendlyError } from './friendlyError';

/** Kept under its original name so every page that already calls describeError now shows a friendly, safe message. */
export function describeError(err: unknown, fallback = 'Something went wrong. Please try again.'): string {
  return friendlyError(err, fallback);
}
export { friendlyError };
