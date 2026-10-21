# Branded Auth Email Templates

Paste these into **Supabase Dashboard → Authentication → Email Templates**
— one per template type. Supabase templates support these variables:
`{{ .ConfirmationURL }}`, `{{ .Email }}`, `{{ .Token }}` (varies by template
type — the dashboard shows which are available for each one).

This only controls the HTML/wording. The **sender address**
(shoposmodern@gmail.com) is set separately under
**Authentication → Settings → SMTP Settings** — both need to be done for
branded, correctly-addressed emails.

---

## Invite user (used by approve-owner / admin-create-business)

```html
<div style="background:#0b1210;padding:32px 16px;font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;">
  <div style="max-width:420px;margin:0 auto;background:#111a17;border-radius:16px;padding:32px 28px;color:#e6efe9;">
    <div style="width:48px;height:48px;border-radius:14px;background:#16a34a;display:flex;align-items:center;justify-content:center;color:#fff;font-weight:700;font-size:20px;margin-bottom:20px;">S</div>
    <h1 style="font-size:20px;margin:0 0 8px;color:#fff;">You've been invited to ShopOS</h1>
    <p style="font-size:14px;color:#9db3a8;margin:0 0 24px;line-height:1.5;">
      Follow the link below to set your password and sign in.
    </p>
    <a href="{{ .ConfirmationURL }}" style="display:block;text-align:center;background:#16a34a;color:#fff;text-decoration:none;font-weight:600;padding:14px;border-radius:10px;margin-bottom:20px;">
      Accept invitation
    </a>
    <p style="font-size:12px;color:#6b8177;margin:0;">
      If you weren't expecting this, you can ignore this email.
    </p>
  </div>
</div>
```

## Reset password

```html
<div style="background:#0b1210;padding:32px 16px;font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;">
  <div style="max-width:420px;margin:0 auto;background:#111a17;border-radius:16px;padding:32px 28px;color:#e6efe9;">
    <div style="width:48px;height:48px;border-radius:14px;background:#16a34a;display:flex;align-items:center;justify-content:center;color:#fff;font-weight:700;font-size:20px;margin-bottom:20px;">S</div>
    <h1 style="font-size:20px;margin:0 0 8px;color:#fff;">Reset your ShopOS password</h1>
    <p style="font-size:14px;color:#9db3a8;margin:0 0 24px;line-height:1.5;">
      Follow the link below to choose a new password.
    </p>
    <a href="{{ .ConfirmationURL }}" style="display:block;text-align:center;background:#16a34a;color:#fff;text-decoration:none;font-weight:600;padding:14px;border-radius:10px;margin-bottom:20px;">
      Reset password
    </a>
    <p style="font-size:12px;color:#6b8177;margin:0;">
      If you didn't request this, you can ignore this email.
    </p>
  </div>
</div>
```

## Confirm signup / Magic link

Same shape as above — swap the heading/button text ("Confirm your email" /
"Confirm email", or "Sign in to ShopOS" / "Sign in").

---

## Setting the Site URL (fixes the localhost:3000 redirect)

**Authentication → URL Configuration:**
- **Site URL:** `https://shopos-app.vercel.app`
- **Redirect URLs:** add `https://shopos-app.vercel.app/**`

This is what the invite/reset links actually redirect to after Supabase's
own confirmation step — without it, Supabase falls back to whatever was
there by default (localhost), even with the templates above styled
correctly.

## Setting up custom SMTP (for the shoposmodern@gmail.com sender)

**Authentication → Settings → SMTP Settings** → enable Custom SMTP:
- Host: `smtp.gmail.com`
- Port: `465`
- Username: `shoposmodern@gmail.com`
- Password: a Gmail **App Password** (not your normal password) —
  generate one at myaccount.google.com → Security → 2-Step Verification
  → App Passwords. Requires 2-Step Verification to be turned on first.
- Sender email: `shoposmodern@gmail.com`
- Sender name: `ShopOS`

Note: this SMTP config is only for Supabase's own **Auth** emails (invite,
reset password, etc.). The separate `send-activation-email` function
(for OTP delivery) needs its own copy of these same four values set as
*function secrets* — see that function's file header for the exact
command.
