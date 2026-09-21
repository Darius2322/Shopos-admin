// Supabase Edge Function: reset-employee-password
//
// Deploy with: supabase functions deploy reset-employee-password
// (or paste into the Supabase Dashboard's Edge Functions editor — CORS is
// inlined below so this file has no dependency on any other file.)
//
// Lets an owner or manager set a new temporary password for an employee
// in their own business. A manager can reset a cashier's or another
// manager's password, but NOT an owner's — that check is enforced here,
// server-side, not just hidden in the UI.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const SMTP_HOST = Deno.env.get('SMTP_HOST');
const SMTP_PORT = Deno.env.get('SMTP_PORT');
const SMTP_USER = Deno.env.get('SMTP_USER');
const SMTP_PASS = Deno.env.get('SMTP_PASS');
const SMTP_FROM = Deno.env.get('SMTP_FROM');

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

// Best-effort security notification to the person whose password just
// changed — not the person who changed it. Never blocks or fails the
// actual password reset if sending doesn't work; this is informational,
// not a confirmation step. Same SMTP secrets as every other email this
// app sends, so nothing new to configure if they're already set.
async function notifyPasswordChanged(admin: ReturnType<typeof createClient>, userId: string, businessName: string): Promise<void> {
  if (!SMTP_HOST || !SMTP_PORT || !SMTP_USER || !SMTP_PASS || !SMTP_FROM) return;
  const { data: userData } = await admin.auth.admin.getUserById(userId);
  const email = userData?.user?.email;
  if (!email) return;
  try {
    const { SMTPClient } = await import('https://deno.land/x/denomailer@1.6.0/mod.ts');
    const client = new SMTPClient({
      connection: { hostname: SMTP_HOST, port: Number(SMTP_PORT), tls: true, auth: { username: SMTP_USER, password: SMTP_PASS } }
    });
    await client.send({
      from: SMTP_FROM,
      to: email,
      subject: `Your ${businessName} password was changed`,
      html: `
      <div style="background:#0b1210;padding:32px 16px;font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;">
        <div style="max-width:420px;margin:0 auto;background:#111a17;border-radius:16px;padding:32px 28px;color:#e6efe9;">
          <div style="width:48px;height:48px;border-radius:14px;background:#dc2626;display:flex;align-items:center;justify-content:center;color:#fff;font-weight:700;font-size:20px;margin-bottom:20px;">S</div>
          <h1 style="font-size:20px;margin:0 0 8px;color:#fff;">Password changed</h1>
          <p style="font-size:14px;color:#9db3a8;margin:0;line-height:1.5;">
            Your ShopOS password for ${businessName} was just changed by someone with owner or manager access on your account.
            If this wasn't expected, contact ${businessName} directly.
          </p>
        </div>
      </div>`
    });
    await client.close();
  } catch { /* best-effort — never block the actual reset */ }
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
    // no longer a single unambiguous row keyed by their auth id — it's
    // whichever business is currently active for their session.
    const { data: activeBiz } = await admin.from('user_active_business').select('business_id, profile_id').eq('user_id', user.id).maybeSingle();
    if (!activeBiz) {
      return json({ error: 'No active business selected for this session' }, 409);
    }
    const { data: callerProfile } = await admin.from('profiles').select('business_id, role').eq('id', activeBiz.profile_id).maybeSingle();
    if (!callerProfile || !['owner', 'manager'].includes(callerProfile.role)) {
      return json({ error: 'Only owners and managers can reset passwords' }, 403);
    }

    // Despite the name, the frontend passes a profile id here (see
    // UsersList.tsx), not the person's auth user id — those could differ
    // now, so the actual auth id for updateUserById below is read from
    // the resolved profile row's user_id, never from this parameter.
    const { targetUserId: targetProfileId, newPassword } = await req.json();
    if (!targetProfileId || !newPassword) {
      return json({ error: 'targetUserId and newPassword are required' }, 400);
    }
    if (String(newPassword).length < 8) {
      return json({ error: 'Password must be at least 8 characters' }, 400);
    }

    const { data: target } = await admin.from('profiles').select('business_id, role, user_id').eq('id', targetProfileId).maybeSingle();
    if (!target || target.business_id !== callerProfile.business_id) {
      return json({ error: 'That person is not in your business' }, 403);
    }
    if (callerProfile.role === 'manager' && target.role === 'owner') {
      return json({ error: "Managers can't reset an owner's password" }, 403);
    }

    const { error: updateError } = await admin.auth.admin.updateUserById(target.user_id, { password: newPassword });
    if (updateError) {
      return json({ error: updateError.message }, 500);
    }

    await admin.from('audit_log').insert({
      business_id: callerProfile.business_id, user_id: user.id,
      action: 'password_reset', entity_type: 'profile', entity_id: targetProfileId
    });

    const { data: businessRow } = await admin.from('businesses').select('name').eq('id', callerProfile.business_id).maybeSingle();
    await notifyPasswordChanged(admin, target.user_id, businessRow?.name ?? 'ShopOS');

    return json({ ok: true });
  } catch (err) {
    return json({ error: String(err) }, 500);
  }
});
