// Supabase Edge Function: admin-create-business
//
// Deploy with: supabase functions deploy admin-create-business
// Uses the SERVICE ROLE key — server-side only, never shipped to a browser.
//
// Lets a platform admin create a business + owner account directly,
// without an owner_request first. Mirrors approve-owner's steps almost
// exactly — same invite-email + OTP-activation pattern — just without a
// request record behind it.

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
      return json({ error: `Admin check query failed: ${adminCheckError.message}` }, 500);
    }
    if (!isAdmin) {
      return json({ error: `Not a platform admin (signed in as user ${user.id}, email ${user.email}) — that id isn't in platform_admins` }, 403);
    }

    const { fullName, email, phone, businessName, durationMonths, skipInviteEmail } = await req.json();
    if (!fullName || !email || !businessName) {
      return json({ error: 'fullName, email, and businessName are required' }, 400);
    }

    // 1. Invite the owner — they'll set their own password via the emailed
    // link. Same email can legitimately own more than one business (spec
    // section 4/17) — "already registered" here means a second membership
    // on their existing account, not a failure.
    //
    // skipInviteEmail=true generates the same secure invite link WITHOUT
    // sending it through Supabase's built-in email delivery (separate,
    // much lower rate limit than this app's own Gmail SMTP — this is what
    // was actually being exceeded). The link comes back as
    // activationLink for you to copy/share yourself.
    let newUserId: string;
    let activationLink: string | null = null;
    if (skipInviteEmail) {
      const { data: linkData, error: linkError } = await admin.auth.admin.generateLink({ type: 'invite', email });
      if (linkData?.user) {
        newUserId = linkData.user.id;
        activationLink = linkData.properties?.action_link ?? null;
      } else if (linkError && /already.*registered|already.*exists/i.test(linkError.message)) {
        const maxPages = 20;
        let foundId: string | null = null;
        for (let page = 1; page <= maxPages && !foundId; page++) {
          const { data: pageData, error: listError } = await admin.auth.admin.listUsers({ page, perPage: 200 });
          if (listError || !pageData?.users?.length) break;
          const match = pageData.users.find((u) => u.email?.toLowerCase() === String(email).toLowerCase());
          if (match) foundId = match.id;
          if (pageData.users.length < 200) break;
        }
        if (!foundId) {
          return json({ error: 'That email is already registered, but the matching account could not be found' }, 500);
        }
        newUserId = foundId;
      } else {
        return json({ error: linkError?.message ?? 'Could not generate activation link' }, 500);
      }
    } else {
      const { data: invited, error: inviteError } = await admin.auth.admin.inviteUserByEmail(email);
      if (invited?.user) {
        newUserId = invited.user.id;
      } else if (inviteError && /already.*registered|already.*exists/i.test(inviteError.message)) {
        const maxPages = 20;
        let foundId: string | null = null;
        for (let page = 1; page <= maxPages && !foundId; page++) {
          const { data: pageData, error: listError } = await admin.auth.admin.listUsers({ page, perPage: 200 });
          if (listError || !pageData?.users?.length) break;
          const match = pageData.users.find((u) => u.email?.toLowerCase() === String(email).toLowerCase());
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

    // Defensive guard — see approve-owner for why this should be
    // unreachable but is worth failing loudly on anyway.
    if (!newUserId) {
      return json({ error: 'Could not resolve a user id for this account — try again, and if this repeats, check that this Edge Function is actually deployed at its latest version' }, 500);
    }

    // 2. Business — starts pending_activation, same as the approval flow,
    // so it goes through the same OTP gate rather than skipping straight
    // to active (an admin-created business is still a real tenant that
    // should prove activation before touching real data).
    const activationExpiresAt = durationMonths
      ? new Date(Date.now() + durationMonths * 30 * 24 * 60 * 60 * 1000).toISOString()
      : null;
    const { data: business, error: bizError } = await admin.from('businesses').insert({
      owner_id: newUserId, name: businessName, email, phone: phone || null,
      status: 'pending_activation', activation_expires_at: activationExpiresAt
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

    // 4. Owner profile — starts 'pending' until OTP activation. user_id
    // (not id) links this to their auth account, since a second business
    // under the same email gets its own freshly generated profile id.
    const { data: insertedProfile, error: profileError } = await admin.from('profiles').insert({
      user_id: newUserId, business_id: business.id, full_name: fullName, phone: phone || null,
      role: 'owner', status: 'pending'
    }).select('id').single();
    if (profileError || !insertedProfile) {
      return json({ error: profileError?.message ?? 'Could not create owner profile' }, 500);
    }

    // 5. Owner gets access to their own branch
    await admin.from('profile_branches').insert({ profile_id: insertedProfile.id, branch_id: branch.id });

    // 6. OTP — plaintext returned once, here, for the admin to relay directly.
    const code = String(Math.floor(100000 + Math.random() * 900000));
    const codeHash = await sha256Hex(code);
    const otpExpiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();
    await admin.from('otp_codes').insert({
      business_id: business.id, purpose: 'activation', code_hash: codeHash, expires_at: otpExpiresAt
    });

    // 7. Audit trail
    await admin.from('admin_actions').insert({
      admin_id: user.id, action: 'business_created_directly', entity_type: 'business', entity_id: business.id,
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
