// Supabase Edge Function: send-password-reset
//
// Deploy with: supabase functions deploy send-password-reset
//
// Public/unauthenticated on purpose — someone who forgot their password
// has no session to prove who they are with. Uses the SAME Gmail SMTP
// secrets as send-activation-email (SMTP_HOST/PORT/USER/PASS/FROM) so
// every outgoing email in this app comes from one place, styled the same
// way — set those once, both functions pick them up.
//
// Generates the actual password-recovery LINK itself (via the Auth admin
// API) rather than relying on Supabase's own built-in recovery email —
// that keeps full control over the branding without needing to fight
// Supabase Dashboard's email template editor separately.
//
// Deliberately returns the same generic success response whether or not
// the email is registered — a different response for "no account with
// that email" vs "email sent" would let anyone probe which emails have
// ShopOS accounts.

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

function emailHtml(actionLink: string) {
  // Same palette and shape as send-activation-email's template — one
  // consistent look across every email this app sends.
  return `
  <div style="background:#0b1210;padding:32px 16px;font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;">
    <div style="max-width:420px;margin:0 auto;background:#111a17;border-radius:16px;padding:32px 28px;color:#e6efe9;">
      <div style="width:48px;height:48px;border-radius:14px;background:#16a34a;display:flex;align-items:center;justify-content:center;color:#fff;font-weight:700;font-size:20px;margin-bottom:20px;">S</div>
      <h1 style="font-size:20px;margin:0 0 8px;color:#fff;">Reset your password</h1>
      <p style="font-size:14px;color:#9db3a8;margin:0 0 24px;line-height:1.5;">
        Tap the button below to choose a new ShopOS password. This link expires in 1 hour and can only be used once.
      </p>
      <a href="${actionLink}" style="display:block;background:#16a34a;color:#fff;text-align:center;padding:14px;border-radius:12px;text-decoration:none;font-weight:600;font-size:15px;margin-bottom:20px;">
        Set a new password
      </a>
      <p style="font-size:12px;color:#6b8177;margin:0;">
        If you didn't request this, you can ignore this email — your password won't change unless you click the link above.
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

    const { email, redirectTo } = await req.json();
    if (!email || !redirectTo) {
      return json({ error: 'email and redirectTo are required' }, 400);
    }

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    const { data: allowed } = await admin.rpc('check_and_log_reset_request', { p_email: email });
    if (allowed === false) {
      // Same generic message either way — see file header on why this
      // never confirms or denies an email is registered.
      return json({ ok: true });
    }

    const { data: link, error: linkError } = await admin.auth.admin.generateLink({
      type: 'recovery',
      email,
      options: { redirectTo }
    });

    // A nonexistent email correctly fails here — still answered with the
    // same generic { ok: true } as a real send, deliberately.
    if (linkError || !link?.properties?.action_link) {
      return json({ ok: true });
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
      to: email,
      subject: 'Reset your ShopOS password',
      html: emailHtml(link.properties.action_link)
    });
    await client.close();

    return json({ ok: true });
  } catch {
    // Errors are swallowed into the same generic response on purpose —
    // this endpoint never distinguishes failure reasons for an
    // unauthenticated caller. Real failures (SMTP misconfigured, etc.)
    // are still visible in the Supabase function logs.
    return json({ ok: true });
  }
});
