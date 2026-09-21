// Supabase Edge Function: invite-employee
//
// Deploy with: supabase functions deploy invite-employee
// (or paste this file's full contents into the Supabase Dashboard's
// Edge Functions editor for this function and click Deploy — CORS is
// handled inline below, on purpose, so this file has no dependency on
// any other file/folder and can be deployed by itself either way.)
//
// Creates an employee account with a temporary password set directly by
// the owner/manager adding them (no invite email, no dependency on the
// new hire checking a specific inbox) — the employee can change it later
// from their own Security settings.

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

// Sends a branded ShopOS welcome/notification email after adding an
// employee — reusedExistingAccount decides which of two messages goes out
// (new account vs. added to a second business). Deliberately never
// includes the actual password: the owner/manager already shares that
// directly (see UsersList.tsx's post-invite screen) — an email is not a
// secure channel to also be carrying a plaintext credential through.
// Best-effort: if SMTP secrets aren't set or sending fails, the invite
// itself has already succeeded and must not be undone by this — emailSent
// in the response just tells the frontend whether to remind the owner to
// pass on the sign-in details some other way.
async function sendEmployeeEmail(businessName: string, toEmail: string, fullName: string, role: string, reusedExistingAccount: boolean): Promise<boolean> {
  const SMTP_HOST = Deno.env.get('SMTP_HOST');
  const SMTP_PORT = Deno.env.get('SMTP_PORT');
  const SMTP_USER = Deno.env.get('SMTP_USER');
  const SMTP_PASS = Deno.env.get('SMTP_PASS');
  const SMTP_FROM = Deno.env.get('SMTP_FROM');
  if (!SMTP_HOST || !SMTP_PORT || !SMTP_USER || !SMTP_PASS || !SMTP_FROM) return false;

  const heading = reusedExistingAccount ? `You've been added to ${businessName}` : `Welcome to ${businessName} on ShopOS`;
  const body = reusedExistingAccount
    ? `You now have ${role} access to ${businessName} on ShopOS, in addition to any other business you already work with. Sign in with your existing ShopOS password and switch businesses from inside the app.`
    : `${businessName} has set up a ShopOS account for you as ${role}. Ask them for your sign-in details, or use "Forgot password" on the sign-in screen once you know your email is on file.`;

  try {
    const { SMTPClient } = await import('https://deno.land/x/denomailer@1.6.0/mod.ts');
    const client = new SMTPClient({
      connection: { hostname: SMTP_HOST, port: Number(SMTP_PORT), tls: true, auth: { username: SMTP_USER, password: SMTP_PASS } }
    });
    await client.send({
      from: SMTP_FROM,
      to: toEmail,
      subject: heading,
      html: `
      <div style="background:#0b1210;padding:32px 16px;font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;">
        <div style="max-width:420px;margin:0 auto;background:#111a17;border-radius:16px;padding:32px 28px;color:#e6efe9;">
          <div style="width:48px;height:48px;border-radius:14px;background:#16a34a;display:flex;align-items:center;justify-content:center;color:#fff;font-weight:700;font-size:20px;margin-bottom:20px;">S</div>
          <h1 style="font-size:20px;margin:0 0 8px;color:#fff;">${heading}</h1>
          <p style="font-size:14px;color:#9db3a8;margin:0 0 4px;line-height:1.5;">Hi ${fullName},</p>
          <p style="font-size:14px;color:#9db3a8;margin:0 0 24px;line-height:1.5;">${body}</p>
          <p style="font-size:12px;color:#6b8177;margin:0;">If this doesn't look right, contact ${businessName} directly.</p>
        </div>
      </div>`
    });
    await client.close();
    return true;
  } catch {
    return false;
  }
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

    // A user can now hold multiple profile rows (one per business — see the
    // phase1 business_memberships migration), so "the caller's profile" is
    // whichever business is currently active for their session, not a
    // single row keyed by their auth id.
    const { data: activeBiz } = await admin.from('user_active_business').select('business_id, profile_id').eq('user_id', user.id).maybeSingle();
    if (!activeBiz) {
      return json({ error: 'No active business selected for this session' }, 409);
    }
    const { data: callerProfile } = await admin.from('profiles').select('business_id, role').eq('id', activeBiz.profile_id).maybeSingle();
    if (!callerProfile || !['owner', 'manager'].includes(callerProfile.role)) {
      return json({ error: 'Only owners and managers can add employees' }, 403);
    }

    const { data: business } = await admin.from('businesses').select('status').eq('id', callerProfile.business_id).maybeSingle();
    if (!business || business.status !== 'active') {
      return json({ error: 'Business must be active to add employees' }, 409);
    }

    const { fullName, email, phone, role, branchId, temporaryPassword, skipEmail } = await req.json();
    if (!fullName || !email || !role || !branchId || !temporaryPassword) {
      return json({ error: 'Missing required fields' }, 400);
    }
    if (String(temporaryPassword).length < 8) {
      return json({ error: 'Password must be at least 8 characters' }, 400);
    }
    if (role === 'owner') {
      return json({ error: 'Cannot add another owner this way' }, 400);
    }

    const { data: branch } = await admin.from('branches').select('business_id').eq('id', branchId).maybeSingle();
    if (!branch || branch.business_id !== callerProfile.business_id) {
      return json({ error: 'Branch does not belong to your business' }, 403);
    }

    // The same email can now belong to more than one business (spec
    // section 4) — it just can't have two memberships in the SAME
    // business. So: try creating a brand-new account first; if that email
    // already has one (this person already works at another ShopOS
    // business), reuse their existing auth user id and just add a new
    // membership row for THIS business, rather than failing outright.
    //
    // email_confirm: true on the create path — no confirmation email
    // round-trip needed, since the owner/manager is vouching for this
    // employee and email delivery to them isn't assumed to be reliable in
    // the first place.
    let newUserId: string;
    let reusedExistingAccount = false;
    const { data: created, error: createError } = await admin.auth.admin.createUser({
      email, password: temporaryPassword, email_confirm: true
    });
    if (created?.user) {
      newUserId = created.user.id;
    } else if (createError && /already.*registered|already.*exists/i.test(createError.message)) {
      // NOTE: the admin SDK has no direct getUserByEmail — listUsers() is
      // the documented way to look one up. Fine at today's user counts;
      // if the platform-wide user base grows large enough for this to be
      // slow, add a small public.user_email_index(email, user_id) table
      // maintained by a trigger on auth.users instead of paging through
      // this. maxPages caps the search rather than looping unbounded.
      const maxPages = 20;
      let foundId: string | null = null;
      for (let page = 1; page <= maxPages && !foundId; page++) {
        const { data: pageData, error: listError } = await admin.auth.admin.listUsers({ page, perPage: 200 });
        if (listError || !pageData?.users?.length) break;
        const match = pageData.users.find((u) => u.email?.toLowerCase() === String(email).toLowerCase());
        if (match) foundId = match.id;
        if (pageData.users.length < 200) break; // last page
      }
      if (!foundId) {
        return json({ error: 'That email is already registered, but the matching account could not be found' }, 500);
      }
      const { data: existingMembership } = await admin.from('profiles')
        .select('id').eq('business_id', callerProfile.business_id).eq('user_id', foundId).maybeSingle();
      if (existingMembership) {
        return json({ error: 'This email is already registered to this business' }, 409);
      }
      newUserId = foundId;
      reusedExistingAccount = true;
    } else {
      return json({ error: createError?.message ?? 'Could not create account' }, 500);
    }

    // Defensive guard — same reasoning as approve-owner/admin-create-business.
    if (!newUserId) {
      return json({ error: 'Could not resolve a user id for this account — try again, and if this repeats, check that this Edge Function is actually deployed at its latest version' }, 500);
    }

    const { data: insertedProfile, error: profileError } = await admin.from('profiles').insert({
      user_id: newUserId, business_id: callerProfile.business_id, full_name: fullName,
      phone: phone ?? null, role, status: 'active'
    }).select('id').single();
    if (profileError || !insertedProfile) {
      return json({ error: profileError?.message ?? 'Could not create membership' }, 500);
    }

    await admin.from('profile_branches').insert({ profile_id: insertedProfile.id, branch_id: branchId });

    await admin.from('audit_log').insert({
      business_id: callerProfile.business_id, user_id: user.id,
      action: 'employee_added', entity_type: 'profile', entity_id: insertedProfile.id,
      new_value: JSON.stringify({ email, role, branchId, reusedExistingAccount })
    });

    // reusedExistingAccount tells the frontend this person already has a
    // ShopOS password from their other business — the temporary password
    // just submitted was NOT applied to their account, so don't tell them
    // to use it. They sign in with what they already use and switch
    // business from inside the app.
    const { data: businessRow } = await admin.from('businesses').select('name').eq('id', callerProfile.business_id).maybeSingle();
    // skipEmail lets the owner skip this notification entirely when
    // they're adding several staff in a row and don't want to spend more
    // of the shared Gmail SMTP daily sending limit than necessary — the
    // employee still gets their account either way, they just aren't
    // emailed about it.
    const emailSent = skipEmail ? false : await sendEmployeeEmail(businessRow?.name ?? 'your business', email, fullName, role, reusedExistingAccount);

    return json({ ok: true, userId: newUserId, reusedExistingAccount, emailSent });
  } catch (err) {
    return json({ error: String(err) }, 500);
  }
});
