import { supabase, supabaseUrl } from './supabase';

export interface InviteEmployeeInput {
  fullName: string;
  email: string;
  phone?: string;
  role: string;
  branchId: string;
  temporaryPassword: string;
  /** Skip the branded notification email this normally sends — useful
   * when adding several staff in a row and you'd rather not spend more of
   * the shared Gmail SMTP daily sending limit than necessary. The account
   * is created either way; only the email is skipped. */
  skipEmail?: boolean;
}

/** Calls the invite-employee Edge Function — creating an auth user requires
 * the service-role key, which never touches the browser, so this has to
 * go through a server-side function rather than the Supabase client
 * directly. Requires being online. The owner/manager sets a temporary
 * password directly (rather than an emailed invite link) so a new hire
 * can sign in immediately regardless of whether they reliably check a
 * specific inbox. */
export interface InviteEmployeeResult {
  /** True when this email already had a ShopOS account (from another
   * business) and was just added as a new membership here — the
   * temporary password submitted was NOT applied, since they already
   * have their own password. False for a genuinely new account, where
   * the temporary password does apply. The UI should tell the person
   * adding the employee which case happened rather than assuming the
   * temporary password always works. */
  reusedExistingAccount: boolean;
  /** Whether a branded notification email was actually sent to the new
   * employee — false if SMTP secrets aren't configured yet or delivery
   * failed. The invite itself still succeeds either way; this only tells
   * the UI whether to remind the owner/manager to pass on sign-in details
   * through some other channel. */
  emailSent: boolean;
}

export async function inviteEmployee(input: InviteEmployeeInput): Promise<InviteEmployeeResult> {
  if (!supabase) throw new Error('No backend configured');
  if (!navigator.onLine) throw new Error('You need to be online to add an employee');
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Not signed in');

  const res = await fetch(`${supabaseUrl}/functions/v1/invite-employee`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
    body: JSON.stringify(input)
  });
  const body = await res.json();
  if (!res.ok) throw new Error(body.error ?? 'Could not add employee — is the invite-employee Edge Function deployed?');
  return { reusedExistingAccount: !!body.reusedExistingAccount, emailSent: !!body.emailSent };
}

/** Calls reset-employee-password — an owner/manager sets a new temporary
 * password for someone in their business. Managers cannot reset an
 * owner's password; that's enforced server-side, not just hidden here. */
export async function resetEmployeePassword(targetUserId: string, newPassword: string): Promise<void> {
  if (!supabase) throw new Error('No backend configured');
  if (!navigator.onLine) throw new Error('You need to be online to reset a password');
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Not signed in');

  const res = await fetch(`${supabaseUrl}/functions/v1/reset-employee-password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
    body: JSON.stringify({ targetUserId, newPassword })
  });
  const body = await res.json();
  if (!res.ok) throw new Error(body.error ?? 'Could not reset password — is the reset-employee-password Edge Function deployed?');
}
