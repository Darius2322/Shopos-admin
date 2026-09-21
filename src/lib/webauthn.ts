import { db } from './db';

/**
 * IMPORTANT SCOPE NOTE
 * ---------------------
 * This is a local device gate, not full passwordless authentication.
 * True WebAuthn login requires a server (a "relying party") that generates
 * challenges and cryptographically verifies the signed assertion against
 * the stored public key. This build only has Supabase (Postgres + client
 * SDK) with no custom backend to do that verification, so implementing a
 * "real" WebAuthn login here would be security theater — code that *looks*
 * secure but isn't actually checked by anything.
 *
 * What this DOES give you, honestly: the browser will only resolve
 * `navigator.credentials.get()` after the OS confirms the fingerprint/face/
 * device PIN succeeded, and it will never expose the biometric data itself
 * to this app or to Supabase. That's a legitimate way to gate a sensitive
 * in-app action (e.g. "confirm before approving this refund") behind the
 * device's own biometric hardware, same pattern many PWAs use for an
 * "app lock". It is NOT equivalent to a server verifying who you are.
 *
 * To upgrade this to real passwordless login, add a Supabase Edge Function
 * (or any small server) implementing a WebAuthn relying party — libraries
 * like `@simplewebauthn/server` do the challenge/verification server-side.
 */

const CRED_ID_KEY = 'webauthn:credentialId';

export function biometricsSupported(): boolean {
  return typeof window !== 'undefined' && !!window.PublicKeyCredential;
}

export async function isBiometricEnabled(): Promise<boolean> {
  const row = await db.appContext.get('current');
  return !!(row as any)?.biometricCredentialId;
}

export async function enableBiometric(userLabel: string): Promise<void> {
  if (!biometricsSupported()) throw new Error('Biometric authentication is not supported on this device/browser');

  const challenge = crypto.getRandomValues(new Uint8Array(32));
  const userId = crypto.getRandomValues(new Uint8Array(16));

  const credential = await navigator.credentials.create({
    publicKey: {
      challenge,
      rp: { name: 'ShopOS' },
      user: { id: userId, name: userLabel, displayName: userLabel },
      pubKeyCredParams: [{ alg: -7, type: 'public-key' }, { alg: -257, type: 'public-key' }],
      authenticatorSelection: { authenticatorAttachment: 'platform', userVerification: 'required' },
      timeout: 60000
    }
  }) as PublicKeyCredential | null;

  if (!credential) throw new Error('Biometric registration was cancelled');

  const credentialId = btoa(String.fromCharCode(...new Uint8Array(credential.rawId)));
  const ctx = (await db.appContext.get('current')) ?? { key: 'current' };
  await db.appContext.put({ ...ctx, biometricCredentialId: credentialId } as any);
  localStorage.setItem(CRED_ID_KEY, credentialId);
}

export async function disableBiometric(): Promise<void> {
  const ctx = await db.appContext.get('current');
  if (ctx) await db.appContext.put({ ...ctx, biometricCredentialId: undefined } as any);
  localStorage.removeItem(CRED_ID_KEY);
}

/** Prompts the device's biometric/PIN check. Resolves true only if the
 * platform authenticator succeeds; resolves false on cancel/failure. */
export async function verifyBiometric(): Promise<boolean> {
  const credentialId = localStorage.getItem(CRED_ID_KEY);
  if (!credentialId) return false;
  try {
    const challenge = crypto.getRandomValues(new Uint8Array(32));
    const rawId = Uint8Array.from(atob(credentialId), (c) => c.charCodeAt(0));
    const result = await navigator.credentials.get({
      publicKey: {
        challenge,
        allowCredentials: [{ id: rawId, type: 'public-key' }],
        userVerification: 'required',
        timeout: 60000
      }
    });
    return !!result;
  } catch {
    return false;
  }
}
