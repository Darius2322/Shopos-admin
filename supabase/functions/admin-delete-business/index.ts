// Supabase Edge Function: admin-delete-business
//
// Deploy with: supabase functions deploy admin-delete-business
//
// PERMANENTLY deletes a business: every branch, product, sale, customer,
// financial record — everything with a business_id — via the existing
// cascading foreign keys (see schema.sql), plus the owner's and every
// employee's Supabase Auth account. This is the one operation in the
// whole system that is NOT designed to be reversible or auditable after
// the fact — the audit_log entry is written BEFORE deletion for exactly
// that reason, since after this runs there is nothing left to look up.
//
// Requires a platform-admin JWT (checked the same way every other
// admin-portal function in this project checks it: a direct
// platform_admins lookup on the caller's own id).

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
    if (authError || !user) return json({ error: 'Not authenticated' }, 401);

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
    const { data: isAdmin } = await admin.from('platform_admins').select('user_id').eq('user_id', user.id).maybeSingle();
    if (!isAdmin) return json({ error: 'Not authorized' }, 403);

    const { businessId, confirmName } = await req.json();
    if (!businessId || !confirmName) {
      return json({ error: 'businessId and confirmName are required' }, 400);
    }

    const { data: business, error: bizError } = await admin.from('businesses').select('id, name, owner_id').eq('id', businessId).maybeSingle();
    if (bizError) return json({ error: bizError.message }, 500);
    if (!business) return json({ error: 'Business not found' }, 404);

    // Requires the admin to have typed the exact current name, not just
    // clicked a button twice — the one deliberately slow step in an
    // otherwise irreversible action.
    if (confirmName.trim().toLowerCase() !== business.name.trim().toLowerCase()) {
      return json({ error: 'Business name did not match — nothing was deleted.' }, 400);
    }

    // Every profile (owner AND every employee) tied to this business, so
    // their Auth accounts can be removed too. Fetched BEFORE the business
    // row is deleted below — profiles cascade-delete with it, so this is
    // the last moment these ids are queryable together.
    const { data: profiles } = await admin.from('profiles').select('id').eq('business_id', businessId);
    const userIds = new Set([business.owner_id, ...(profiles ?? []).map((p) => p.id)]);

    // Written BEFORE deletion — see the file header for why.
    await admin.from('admin_actions').insert({
      admin_id: user.id, action: 'business_deleted', entity_type: 'business', entity_id: businessId,
      reason: `Deleted "${business.name}" (${userIds.size} account(s) removed)`
    });

    // Deletes the business row — cascades to branches, products, sales,
    // customers, every financial record, via the foreign keys already in
    // place (see schema.sql and schema_part21.sql for the one that used to
    // block this).
    const { error: deleteError } = await admin.from('businesses').delete().eq('id', businessId);
    if (deleteError) return json({ error: deleteError.message }, 500);

    // Auth accounts are separate from the database rows above — deleting
    // the business row does not remove these on its own. Best-effort: one
    // failing to delete (e.g. already gone) doesn't block the others.
    const authErrors: string[] = [];
    for (const id of userIds) {
      const { error } = await admin.auth.admin.deleteUser(id);
      if (error) authErrors.push(`${id}: ${error.message}`);
    }

    return json({ ok: true, deletedAccounts: userIds.size, authErrors: authErrors.length ? authErrors : undefined });
  } catch (err) {
    return json({ error: String(err) }, 500);
  }
});
