// Supabase Edge Function: send-activation-email
//
// Deploy with: supabase functions deploy send-activation-email
// (or paste into the Supabase Dashboard's Edge Functions editor)
//
// Sends the activation code by email, branded to match the app, as an
// alternative to the admin relaying it by hand. Requires SMTP secrets to
// be set for this FUNCTION specifically (separate from Supabase Auth's own
// SMTP settings, even if you point both at the same Gmail account):
//
//   supabase secrets set SMTP_HOST=smtp.gmail.com SMTP_PORT=465 \
//     SMTP_USER=shoposmodern@gmail.com SMTP_PASS=your-16-char-app-password \
//     SMTP_FROM="ShopOS <shoposmodern@gmail.com>"
//
// (Gmail requires an App Password — myaccount.google.com → Security →
// App Passwords — a regular Gmail password will not work for SMTP.)
// Or set the same four under Dashboard → Edge Functions → Manage secrets.
//
// Requires a platform-admin JWT, same as the other admin-only functions.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import { SMTPClient } from 'https://deno.land/x/denomailer@1.6.0/mod.ts';

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

function emailHtml(businessName: string, code: string) {
  // Matches the app's palette: field-600 (#16a34a-ish green) on a dark
  // paper background, same shape language as the in-app activation modal.
  return `
  <div style="background:#0b1210;padding:32px 16px;font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;">
    <div style="max-width:420px;margin:0 auto;background:#111a17;border-radius:16px;padding:32px 28px;color:#e6efe9;">
      <div style="width:48px;height:48px;border-radius:14px;background:#16a34a;display:flex;align-items:center;justify-content:center;color:#fff;font-weight:700;font-size:20px;margin-bottom:20px;">S</div>
      <h1 style="font-size:20px;margin:0 0 8px;color:#fff;">Activate ${businessName}</h1>
      <p style="font-size:14px;color:#9db3a8;margin:0 0 24px;line-height:1.5;">
        Enter this code in ShopOS to activate your business. It expires in 15 minutes.
      </p>
      <div style="background:#0b1210;border:1px solid #1f2e28;border-radius:12px;padding:20px;text-align:center;margin-bottom:24px;">
        <span style="font-size:32px;font-weight:700;letter-spacing:8px;color:#4ade80;font-family:monospace;">${code}</span>
      </div>
      <p style="font-size:12px;color:#6b8177;margin:0;">
        If you didn't request this, you can ignore this email.
      </p>
    </div>
  </div>`;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    if (!SMTP_HOST || !SMTP_PORT || !SMTP_USER || !SMTP_PASS || !SMTP_FROM) {
      return json({ error: 'Email sending isn\'t configured yet — set SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM as function secrets first.' }, 500);
    }

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
      return json({ error: `Not a platform admin (signed in as user ${user.id}, email ${user.email})` }, 403);
    }

    const { toEmail, businessName, code } = await req.json();
    if (!toEmail || !businessName || !code) {
      return json({ error: 'toEmail, businessName, and code are required' }, 400);
    }

    const client = new SMTPClient({
      connection: {
        hostname: SMTP_HOST,
        port: Number(SMTP_PORT),
        tls: true,
        auth: { username: SMTP_USER, password: SMTP_PASS }
      }
    });

    await client.send({
      from: SMTP_FROM,
      to: toEmail,
      subject: `Your ShopOS activation code for ${businessName}`,
      html: emailHtml(businessName, code)
    });
    await client.close();

    return json({ ok: true });
  } catch (err) {
    return json({ error: String(err) }, 500);
  }
});
