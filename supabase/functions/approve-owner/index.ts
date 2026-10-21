// Supabase Edge Function: approve-owner
//
// Deploy with: supabase functions deploy approve-owner
// Then set it to require a valid platform-admin JWT (see the auth check
// below) — this function uses the SERVICE ROLE key, which must never be
// shipped to any browser bundle. It only runs here, server-side.
//
// What it does, given an owner_requests.id:
//   1. Verifies the caller is a signed-in platform admin.
//   2. Creates the auth.users row for the new owner (via invite email).
//   3. Creates their businesses, branches (a default "Main Branch"), and
//      profiles (role='owner') rows.
//   4. Marks the owner_request as approved.
// This is the one part of onboarding that genuinely cannot be done safely
// from the browser, because creating auth users requires the service role.

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
    const authHeader = req.headers.get('Authorization') ?? '';
    const callerClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      global: { headers: { Authorization: authHeader } }
    });

    const { data: { user }, error: authError } = await callerClient.auth.getUser();
    if (authError || !user) {
      return json({ error: 'Not authenticated' }, 401);
    }

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
    const { data: isAdmin, error: adminCheckError } = await admin.from('platform_admins').select('user_id').eq('user_id', user.id).maybeSingle();
    if (adminCheckError) {
      // Surfaced instead of swallowed — a wrong/missing SERVICE_ROLE_KEY,
      // wrong project, or any other query failure would otherwise look
      // identical to "you're genuinely not an admin", which is exactly
      // the unhelpful dead end this was producing.
      return json({ error: `Admin check query failed: ${adminCheckError.message}` }, 500);
    }
    if (!isAdmin) {
      return json({ error: `Not a platform admin (signed in as user ${user.id}, email ${user.email}) — that id isn't in platform_admins` }, 403);
    }

    const { ownerRequestId, durationMonths, skipInviteEmail } = await req.json();
    const { data: request, error: reqError } = await admin
      .from('owner_requests').select('*').eq('id', ownerRequestId).single();
    if (reqError) {
      return json({ error: `Owner request lookup failed: ${reqError.message}` }, 500);
    }
    if (!request) {
      return json({ error: 'Owner request not found' }, 404);
    }
    if (request.status === 'approved') {
      return json({ error: 'Already approved' }, 409);
    }

    // 1. Invite the owner — they'll set their own password via the emailed
    // link. The same person can legitimately own more than one business
    // under one email (spec section 4/17), so a "this email is already
    // registered" response here isn't a failure — it means they already
    // have a ShopOS account (e.g. as an owner of another business, or as
    // staff somewhere) and this business becomes a second membership on
    // that same account rather than a new one.
    //
    // skipInviteEmail=true uses generateLink() instead of
    // inviteUserByEmail() — this creates the exact same secure, single-use,
    // expiring Supabase Auth invite link WITHOUT sending anything through
    // Supabase's built-in email delivery (whose free-tier rate limit is
    // separate from, and much lower than, this app's own Gmail SMTP —
    // this is what was actually being hit, not the custom-template
    // emails). The link comes back in the response as activationLink for
    // you to copy/share yourself (WhatsApp, SMS, etc).
    let newUserId: string;
    let activationLink: string | null = null;
    if (skipInviteEmail) {
      const { data: linkData, error: linkError } = await admin.auth.admin.generateLink({
        type: 'invite', email: request.email
      });
      if (linkData?.user) {
        newUserId = linkData.user.id;
        activationLink = linkData.properties?.action_link ?? null;
      } else if (linkError && /already.*registered|already.*exists/i.test(linkError.message)) {
        const maxPages = 20;
        let foundId: string | null = null;
        for (let page = 1; page <= maxPages && !foundId; page++) {
          const { data: pageData, error: listError } = await admin.auth.admin.listUsers({ page, perPage: 200 });
          if (listError || !pageData?.users?.length) break;
          const match = pageData.users.find((u) => u.email?.toLowerCase() === request.email.toLowerCase());
          if (match) foundId = match.id;
          if (pageData.users.length < 200) break;
        }
        if (!foundId) {
          return json({ error: 'That email is already registered, but the matching account could not be found' }, 500);
        }
        newUserId = foundId;
        // Existing account — no invite/link needed at all, they already
        // have a password and just get a second business membership.
      } else {
        return json({ error: linkError?.message ?? 'Could not generate activation link' }, 500);
      }
    } else {
      const { data: invited, error: inviteError } = await admin.auth.admin.inviteUserByEmail(request.email);
      if (invited?.user) {
        newUserId = invited.user.id;
      } else if (inviteError && /already.*registered|already.*exists/i.test(inviteError.message)) {
        const maxPages = 20;
        let foundId: string | null = null;
        for (let page = 1; page <= maxPages && !foundId; page++) {
          const { data: pageData, error: listError } = await admin.auth.admin.listUsers({ page, perPage: 200 });
          if (listError || !pageData?.users?.length) break;
          const match = pageData.users.find((u) => u.email?.toLowerCase() === request.email.toLowerCase());
          if (match) foundId = match.id;
          if (pageData.users.length < 200) break;
        }
        if (!foundId) {
          return json({ error: 'That email is already registered, but the matching account could not be found' }, 500);
        }
        newUserId = foundId;
      } else {
        return json({ error: inviteError?.message ?? 'Could not invite user' }, 500);
      }
    }

    // Defensive guard: every branch above either sets a real newUserId or
    // returns early. This should be unreachable — but a bad user_id
    // reaching the inserts below would otherwise surface as a confusing
    // raw Postgres "null value in column user_id" error instead of
    // something actionable, so it's worth failing loudly here instead.
    if (!newUserId) {
      return json({ error: 'Could not resolve a user id for this account — try again, and if this repeats, check that this Edge Function is actually deployed at its latest version' }, 500);
    }

    // 2. Business — activationExpiresAt is the ACCESS duration (how long
    // the business stays active once activated), separate from the OTP's
    // own 15-minute entry window below (otpExpiresAt).
    const activationExpiresAt = durationMonths
      ? new Date(Date.now() + durationMonths * 30 * 24 * 60 * 60 * 1000).toISOString()
      : null;
    const { data: business, error: bizError } = await admin.from('businesses').insert({
      owner_id: newUserId, name: request.business_name, email: request.email, phone: request.phone,
      activation_expires_at: activationExpiresAt
    }).select().single();
    if (bizError || !business) {
      return json({ error: bizError?.message ?? 'Could not create business' }, 500);
    }

    // 3. Default branch
    const { data: branch, error: branchError } = await admin.from('branches').insert({
      business_id: business.id, name: 'Main Branch', status: 'active'
    }).select().single();
    if (branchError || !branch) {
      return json({ error: branchError?.message ?? 'Could not create branch' }, 500);
    }

    // 4. Owner profile — starts 'pending': not usable until OTP activation.
    // user_id (not id) is what links this to their auth account — a
    // second business for the same email gets its own profile row with a
    // freshly generated id, not the account's original id.
    const { data: insertedProfile, error: profileError } = await admin.from('profiles').insert({
      user_id: newUserId, business_id: business.id, full_name: request.full_name,
      phone: request.phone, role: 'owner', status: 'pending'
    }).select('id').single();
    if (profileError || !insertedProfile) {
      return json({ error: profileError?.message ?? 'Could not create owner profile' }, 500);
    }

    // 5. Give the owner access to their own branch
    await admin.from('profile_branches').insert({ profile_id: insertedProfile.id, branch_id: branch.id });

    // 6. Business starts 'pending_activation' — the require_active_business
    // triggers (schema_part4.sql) block all financial writes until OTP
    // activation flips this to 'active'.
    await admin.from('businesses').update({ status: 'pending_activation' }).eq('id', business.id);

    // 7. Generate a 6-digit OTP. Only its SHA-256 hash is ever stored —
    // there is no email/SMS provider wired up in this build, so the
    // plaintext code is returned once, here, to you (the admin) to relay
    // to the owner by phone/WhatsApp. See README for how to wire real
    // delivery (e.g. Twilio, or a Supabase email template) later.
    const code = String(Math.floor(100000 + Math.random() * 900000));
    const codeHash = await sha256Hex(code);
    const otpExpiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();
    await admin.from('otp_codes').insert({
      business_id: business.id, purpose: 'activation', code_hash: codeHash, expires_at: otpExpiresAt
    });

    // 8. Mark the request approved, linking it to the business it created
    // (lets a later "claim your account" flow trace reference_code -> business/owner).
    await admin.from('owner_requests').update({
      status: 'approved', decided_by: user.id, decided_at: new Date().toISOString(), business_id: business.id
    }).eq('id', ownerRequestId);

    // 9. Audit trail
    await admin.from('admin_actions').insert({
      admin_id: user.id, action: 'owner_request_approved', entity_type: 'business', entity_id: business.id,
      reason: durationMonths ? `${durationMonths} month(s) access` : 'lifetime access'
    });

    return json({
      ok: true, businessId: business.id, activationCode: code, activationLink,
      note: 'Share this code with the owner directly — it will not be shown again and expires in 15 minutes.'
    });
  } catch (err) {
    return json({ error: String(err) }, 500);
  }
});

async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hashBuffer)).map((b) => b.toString(16).padStart(2, '0')).join('');
}
