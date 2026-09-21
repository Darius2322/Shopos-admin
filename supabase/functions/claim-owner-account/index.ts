// Supabase Edge Function: claim-owner-account
//
// Deploy with: supabase functions deploy claim-owner-account
// Uses the SERVICE ROLE key — server-side only, never shipped to a browser.
//
// This is deliberately public (no Authorization header needed) — an
// applicant who was just approved doesn't have a session yet. Identity is
// proven by knowing BOTH the email they applied with AND their reference
// code (see schema_part10.sql's check_owner_request_status), which is
// enough for this app's threat model, but note it's weaker than an email
// link: someone who learns both values could hijack the account before
// the real owner claims it. That's why this can only be used ONCE
// (claimed_at gates it) — the window of exposure is only between approval
// and the real owner's first claim, not indefinitely.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const { email, referenceCode, newPassword } = await req.json();
    if (!email || !referenceCode || !newPassword) {
      return json({ error: 'email, referenceCode, and newPassword are required' }, 400);
    }
    if (String(newPassword).length < 8) {
      return json({ error: 'Password must be at least 8 characters' }, 400);
    }

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    // Checked before any lookup — 5 failed attempts locks this email's
    // most recent application for 15 minutes, the same shape as the OTP
    // activation flow's own attempt limit.
    const { data: lockedUntil } = await admin.rpc('check_claim_lock', { p_email: email });
    if (lockedUntil) {
      return json({ error: `Too many attempts. Try again after ${new Date(lockedUntil).toLocaleTimeString()}.` }, 429);
    }

    const { data: request, error: reqError } = await admin
      .from('owner_requests')
      .select('id, business_id, status, claimed_at')
      .ilike('email', email.trim())
      .eq('reference_code', referenceCode.trim().toUpperCase())
      .maybeSingle();

    if (reqError) {
      return json({ error: `Lookup failed: ${reqError.message}` }, 500);
    }
    if (!request) {
      // Wrong code (or wrong email) — this is exactly the guess being
      // rate-limited, so it counts, even though there's no row matching
      // this specific (email, code) pair to update directly.
      await admin.rpc('register_claim_attempt', { p_email: email, p_success: false });
      return json({ error: 'No matching application found' }, 404);
    }
    if (request.status !== 'approved' || !request.business_id) {
      await admin.rpc('register_claim_attempt', { p_email: email, p_success: false });
      return json({ error: 'This application has not been approved yet' }, 409);
    }
    if (request.claimed_at) {
      return json({ error: 'This account has already been set up. Sign in normally, or use "Forgot password".' }, 409);
    }

    const { data: business, error: bizError } = await admin
      .from('businesses').select('owner_id').eq('id', request.business_id).maybeSingle();
    if (bizError) {
      return json({ error: `Could not look up the business: ${bizError.message}` }, 500);
    }
    if (!business) {
      return json({ error: 'Could not find the business for this application' }, 500);
    }

    // An email that already belongs to an existing ShopOS account (e.g. the
    // same person owns/staffs another business) must NOT have its password
    // overwritten by someone who merely knows email + reference code.
    // That would be an account takeover. Such users keep their password.
    const { count: otherMemberships } = await admin
      .from('profiles').select('id', { count: 'exact', head: true })
      .eq('user_id', business.owner_id).neq('business_id', request.business_id);
    if ((otherMemberships ?? 0) > 0) {
      await admin.from('owner_requests').update({ claimed_at: new Date().toISOString() })
        .eq('id', request.id).is('claimed_at', null);
      return json({ ok: true, email: email.trim(), existingAccount: true,
        note: 'You already have a ShopOS account. Sign in with your existing password.' });
    }

    // Atomically claim the request FIRST (only one concurrent caller can win),
    // so a double-submit / refresh cannot set the password twice.
    const { data: claimed, error: claimError } = await admin
      .from('owner_requests').update({ claimed_at: new Date().toISOString() })
      .eq('id', request.id).is('claimed_at', null).select('id');
    if (claimError) return json({ error: `Could not claim account: ${claimError.message}` }, 500);
    if (!claimed || claimed.length === 0) {
      return json({ error: 'This account has already been set up. Sign in normally, or use "Forgot password".' }, 409);
    }

    // ROOT CAUSE FIX: owners are created via invite (inviteUserByEmail /
    // generateLink 'invite'), which leaves email_confirmed_at NULL until the
    // invite link is clicked. Setting a password alone does not confirm the
    // email, so signInWithPassword rejected the brand-new password.
    // email_confirm:true is what invite-employee already does for staff.
    const { error: updateError } = await admin.auth.admin.updateUserById(
      business.owner_id, { password: newPassword, email_confirm: true }
    );
    if (updateError) {
      // Roll the claim back so the owner can retry.
      await admin.from('owner_requests').update({ claimed_at: null }).eq('id', request.id);
      return json({ error: updateError.message }, 500);
    }

    await admin.rpc('register_claim_attempt', { p_email: email, p_success: true });

    return json({ ok: true, email: email.trim() });
  } catch (err) {
    return json({ error: String(err) }, 500);
  }
});
