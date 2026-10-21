// Supabase Edge Function: admin-set-business-status
//
// Deploy with: supabase functions deploy admin-set-business-status
// (standalone — no dependency on any other file/folder, matching every
// other function in this project.)
//
// Wraps the existing admin_set_business_status(...) RPC — that RPC still
// does the actual write + audit log entry, unchanged, so this is additive
// on top of it, not a replacement. The one thing plain Postgres couldn't
// do on its own is send an email, so this function calls the RPC first
// and then emails the business owner, best-effort, using the same Gmail
// SMTP secrets as send-activation-email / send-password-reset (set once,
// shared by every outgoing email in this app):
//
//   supabase secrets set SMTP_HOST=smtp.gmail.com SMTP_PORT=465 \
//     SMTP_USER=shoposmodern@gmail.com SMTP_PASS=your-16-char-app-password \
//     SMTP_FROM="ShopOS <shoposmodern@gmail.com>"
//
// The admin app should call THIS function instead of the RPC directly for
// status changes going forward (see BusinessDetail.tsx). The RPC itself is
// left exactly as-is and still callable directly if needed — nothing here
// removes it, so nothing already depending on it breaks.
//
// Requires a platform-admin JWT, same as the other admin-only functions.

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

const STATUS_COPY: Record<string, { subject: (name: string) => string; heading: string; body: string; accent: string }> = {
  suspended: {
    subject: (name) => `${name} has been suspended on ShopOS`,
    heading: 'Your business has been suspended',
    body: 'Staff will not be able to sign in until this is resolved. If you believe this is a mistake, contact ShopOS support.',
    accent: '#dc2626'
  },
  paused: {
    subject: (name) => `${name} has been paused on ShopOS`,
    heading: 'Your business has been paused',
    body: 'This is usually temporary. Contact ShopOS support if you have questions or want to resume.',
    accent: '#d97706'
  },
  active: {
    subject: (name) => `${name} is active again on ShopOS`,
    heading: 'Your business is active again',
    body: 'Everything is back to normal — staff can sign in and use ShopOS as usual.',
    accent: '#16a34a'
  },
  pending_activation: {
    subject: (name) => `${name} needs activation on ShopOS`,
    heading: 'One more step to activate',
    body: 'Your business was moved back to pending activation. Use the activation code you were given (or ask an admin to resend one) to finish setup.',
    accent: '#16a34a'
  }
};

function emailHtml(businessName: string, status: string, reason: string | null) {
  const copy = STATUS_COPY[status];
  return `
  <div style="background:#0b1210;padding:32px 16px;font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;">
    <div style="max-width:420px;margin:0 auto;background:#111a17;border-radius:16px;padding:32px 28px;color:#e6efe9;">
      <div style="width:48px;height:48px;border-radius:14px;background:${copy.accent};display:flex;align-items:center;justify-content:center;color:#fff;font-weight:700;font-size:20px;margin-bottom:20px;">S</div>
      <h1 style="font-size:20px;margin:0 0 8px;color:#fff;">${copy.heading}</h1>
      <p style="font-size:14px;color:#9db3a8;margin:0 0 16px;line-height:1.5;">${businessName}: ${copy.body}</p>
      ${reason ? `<p style="font-size:13px;color:#6b8177;margin:0 0 24px;line-height:1.5;">Note from ShopOS: ${reason}</p>` : ''}
      <p style="font-size:12px;color:#6b8177;margin:0;">Questions? Reach ShopOS support directly.</p>
    </div>
  </div>`;
}

async function notifyOwner(admin: ReturnType<typeof createClient>, businessId: string, status: string, reason: string | null): Promise<boolean> {
  if (!SMTP_HOST || !SMTP_PORT || !SMTP_USER || !SMTP_PASS || !SMTP_FROM) return false;
  if (!STATUS_COPY[status]) return false; // no template for this status — nothing to send

  const { data: business } = await admin.from('businesses').select('name, owner_id').eq('id', businessId).maybeSingle();
  if (!business) return false;
  const { data: ownerUser } = await admin.auth.admin.getUserById(business.owner_id);
  const ownerEmail = ownerUser?.user?.email;
  if (!ownerEmail) return false;

  try {
    const { SMTPClient } = await import('https://deno.land/x/denomailer@1.6.0/mod.ts');
    const client = new SMTPClient({
      connection: { hostname: SMTP_HOST, port: Number(SMTP_PORT), tls: true, auth: { username: SMTP_USER, password: SMTP_PASS } }
    });
    await client.send({
      from: SMTP_FROM,
      to: ownerEmail,
      subject: STATUS_COPY[status].subject(business.name),
      html: emailHtml(business.name, status, reason)
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
    const { data: isAdmin } = await admin.from('platform_admins').select('user_id').eq('user_id', user.id).maybeSingle();
    if (!isAdmin) {
      return json({ error: 'Not a platform admin' }, 403);
    }

    const { businessId, status, reason } = await req.json();
    if (!businessId || !status) {
      return json({ error: 'businessId and status are required' }, 400);
    }
    if (!['pending_activation', 'active', 'paused', 'suspended'].includes(status)) {
      return json({ error: 'Invalid status' }, 400);
    }

    // The actual write + audit log entry is still done by the existing
    // RPC, called here with the caller's own JWT (not the service role)
    // so is_platform_admin() inside it evaluates against the real caller —
    // this function does not duplicate or bypass that authorization logic,
    // just adds the email step around it.
    const { error: rpcError } = await callerClient.rpc('admin_set_business_status', {
      p_business_id: businessId, p_status: status, p_reason: reason ?? null
    });
    if (rpcError) {
      return json({ error: rpcError.message }, 400);
    }

    const emailSent = await notifyOwner(admin, businessId, status, reason ?? null);

    return json({ ok: true, emailSent });
  } catch (err) {
    return json({ error: String(err) }, 500);
  }
});
