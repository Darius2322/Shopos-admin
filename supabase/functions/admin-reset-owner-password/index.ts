// Supabase Edge Function: admin-reset-owner-password
//
// Deploy with: supabase functions deploy admin-reset-owner-password
// (or paste into the Supabase Dashboard's Edge Functions editor — CORS is
// inlined below so this file has no dependency on any other file.)
//
// Lets a platform admin set a new temporary password for a BUSINESS
// OWNER's account. This is the admin-portal counterpart to
// reset-employee-password (which only an owner/manager can call, for
// their own business's employees) — a platform admin has no business_id
// of their own to compare against, so authorization here checks
// is_platform_admin() instead.
//
// The admin never sees or chooses to view the existing password — this
// only sets a brand new one, which must be shared with the owner directly
// and changed by them afterward.

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

    // Same pattern every other admin-portal edge function in this project
    // uses (see approve-owner, admin-create-business): a direct lookup
    // against platform_admins for the CALLER's own id, using the
    // service-role client only to read that table — not to check identity
    // (identity came from callerClient.auth.getUser() above, which
    // resolves the caller's real JWT, not the service role's).
    const { data: isAdmin } = await admin.from('platform_admins').select('user_id').eq('user_id', user.id).maybeSingle();
    if (!isAdmin) {
      return json({ error: 'Not authorized' }, 403);
    }

    const { businessId, newPassword } = await req.json();
    if (!businessId || !newPassword) {
      return json({ error: 'businessId and newPassword are required' }, 400);
    }
    if (String(newPassword).length < 8) {
      return json({ error: 'Password must be at least 8 characters' }, 400);
    }

    const { data: business, error: bizError } = await admin.from('businesses').select('owner_id, name').eq('id', businessId).maybeSingle();
    if (bizError) return json({ error: bizError.message }, 500);
    if (!business) return json({ error: 'Business not found' }, 404);

    const { error: updateError } = await admin.auth.admin.updateUserById(business.owner_id, { password: newPassword, email_confirm: true });
    if (updateError) return json({ error: updateError.message }, 500);

    await admin.from('admin_actions').insert({
      admin_id: user.id, action: 'owner_password_reset', entity_type: 'business', entity_id: businessId
    });

    return json({ ok: true, businessName: business.name });
  } catch (err) {
    return json({ error: String(err) }, 500);
  }
});
