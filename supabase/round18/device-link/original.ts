// device-link v3: sign a new device in by approving it from a device that is already signed in (like WhatsApp Web).
// Two directions, both approved by the signed-in device:
//  A) The NEW device shows a code/QR (usually a computer) and a signed-in device (usually a phone) scans and approves it.
//       create  (no sign-in)  new device asks for a code        -> { id, code, secret, expiresAt }
//       lookup  (signed in)   approver checks what the code is   -> { label, ageSeconds }
//       approve (signed in)   approver confirms                  -> { ok }
//       poll    (no sign-in)  new device waits, proves it holds the secret -> { status, tokenHash? }
//       cancel  (no sign-in)  new device gives up
//  B) The SIGNED-IN device shows the QR (a computer) and the NEW device (a phone) scans it.
//       offer         (signed in)  show a code/QR                 -> { id, code, secret, expiresAt }
//       claim         (no sign-in) new device scans the code      -> { id, claimSecret, expiresAt }
//       offer_poll    (secret)     signed-in device waits for a scan -> { status, claimLabel?, ageSeconds? }
//       offer_approve (signed in)  owner of the offer confirms the scan -> { ok }
//       offer_cancel  (secret)     signed-in device cancels / declines
//       claim_poll    (claimSecret) new device waits for approval -> { status, tokenHash? } (handed out once)
// Codes last 2 minutes, work once, secrets never leave the device that made them (only hashes are stored), requests are
// rate-limited, and only an active member of an active business can approve. The new device gets a normal Supabase session by
// exchanging a one-time token_hash (verifyOtp), so every existing rule (roles, permissions, forced sign-out, device log) applies.
import { createClient } from 'jsr:@supabase/supabase-js@2';

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O/1/I
const TTL_MS = 120_000;

const enc = new TextEncoder();
async function sha256(s: string) { const d = await crypto.subtle.digest('SHA-256', enc.encode(s)); return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, '0')).join(''); }
function randomCode(n: number) { const a = new Uint8Array(n); crypto.getRandomValues(a); return [...a].map((b) => ALPHABET[b % ALPHABET.length]).join(''); }
function randomSecret() { const a = new Uint8Array(32); crypto.getRandomValues(a); return btoa(String.fromCharCode(...a)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); }
const normCode = (c: unknown) => String(c ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);
const clean = (v: unknown, n: number) => String(v ?? '').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, n);
const timingEq = (a: string, b: string) => { if (a.length !== b.length) return false; let r = 0; for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i); return r === 0; };
const isId = (v: string) => /^[0-9a-f-]{36}$/.test(v);

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ ok: false, reason: 'method_not_allowed' }, 405);
  try {
    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const body = await req.json().catch(() => ({}));
    const action = String(body?.action ?? '');
    const ua = clean(req.headers.get('user-agent'), 300);
    const now = Date.now();
    const ip = (req.headers.get('x-forwarded-for') ?? '').split(',')[0].trim() || 'unknown';
    const ipHash = await sha256('shopos-link:' + ip);

    // The signed-in caller, who must be an active member of an active business.
    // deno-lint-ignore no-explicit-any
    async function member(): Promise<{ err?: Response; user?: any; mine?: any }> {
      const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
      const { data: u } = token ? await admin.auth.getUser(token) : { data: { user: null } };
      const user = u?.user;
      if (!user) return { err: json({ ok: false, reason: 'unauthorized' }, 401) };
      const { data: profs } = await admin.from('profiles').select('business_id, full_name, role, status').eq('user_id', user.id).is('deleted_at', null).eq('status', 'active');
      const { data: active } = await admin.from('user_active_business').select('business_id').eq('user_id', user.id).maybeSingle();
      const mine = (profs ?? []).find((p) => p.business_id === active?.business_id) ?? (profs ?? [])[0];
      if (!mine) return { err: json({ ok: false, reason: 'not_allowed' }, 403) };
      const { data: biz } = await admin.from('businesses').select('status, deleted_at').eq('id', mine.business_id).maybeSingle();
      if (!biz || biz.deleted_at || biz.status !== 'active') return { err: json({ ok: false, reason: 'business_inactive' }, 403) };
      return { user, mine };
    }
    // One-time sign-in token for an account, parked on a row for the waiting device.
    async function mintToken(userId: string): Promise<{ err?: Response; hashed?: string }> {
      const { data: au } = await admin.auth.admin.getUserById(userId);
      const email = au?.user?.email;
      if (!email) return { err: json({ ok: false, reason: 'no_email' }, 400) };
      const { data: link, error: lerr } = await admin.auth.admin.generateLink({ type: 'magiclink', email });
      const hashed = link?.properties?.hashed_token;
      if (lerr || !hashed) return { err: json({ ok: false, reason: 'link_failed' }, 500) };
      return { hashed };
    }

    if (action === 'create') {
      const since = new Date(now - 60_000).toISOString();
      const { count } = await admin.from('device_link_requests').select('id', { count: 'exact', head: true }).eq('ip_hash', ipHash).gt('created_at', since);
      if ((count ?? 0) >= 8) return json({ ok: false, reason: 'too_many' }, 429);
      const { count: all } = await admin.from('device_link_requests').select('id', { count: 'exact', head: true }).gt('created_at', since);
      if ((all ?? 0) >= 120) return json({ ok: false, reason: 'busy' }, 429);
      void admin.from('device_link_requests').delete().lt('created_at', new Date(now - 86_400_000).toISOString());
      const secret = randomSecret();
      const label = clean(body?.label, 60) || 'New device';
      for (let i = 0; i < 4; i++) {
        const code = randomCode(8);
        const expiresAt = new Date(now + TTL_MS).toISOString();
        const { data, error } = await admin.from('device_link_requests').insert({ code, secret_hash: await sha256(secret), device_label: label, user_agent: ua, ip_hash: ipHash, expires_at: expiresAt }).select('id').single();
        if (!error && data) return json({ ok: true, id: data.id, code, secret, expiresAt });
      }
      return json({ ok: false, reason: 'error' }, 500);
    }

    if (action === 'poll' || action === 'cancel') {
      const id = String(body?.id ?? ''); const secret = String(body?.secret ?? '');
      if (!isId(id) || secret.length < 20) return json({ ok: false, reason: 'invalid' }, 400);
      const { data: row } = await admin.from('device_link_requests').select('id, secret_hash, status, token_hash, expires_at').eq('id', id).maybeSingle();
      if (!row || !timingEq(row.secret_hash, await sha256(secret))) return json({ ok: false, reason: 'invalid' }, 404);
      if (action === 'cancel') { await admin.from('device_link_requests').update({ status: 'cancelled', token_hash: null }).eq('id', id).in('status', ['pending', 'approved']); return json({ ok: true }); }
      if (row.status === 'approved' && row.token_hash) {
        const { data: taken } = await admin.from('device_link_requests').update({ status: 'used', token_hash: null }).eq('id', id).eq('status', 'approved').select('id');
        if (taken && taken.length) return json({ ok: true, status: 'approved', tokenHash: row.token_hash });
        return json({ ok: true, status: 'used' });
      }
      if (row.status === 'pending' && new Date(row.expires_at).getTime() < now) return json({ ok: true, status: 'expired' });
      return json({ ok: true, status: row.status === 'pending' ? 'pending' : row.status === 'used' ? 'used' : 'cancelled' });
    }

    if (action === 'lookup' || action === 'approve') {
      const m = await member(); if (m.err) return m.err;
      const { user, mine } = m;
      const code = normCode(body?.code);
      if (code.length !== 8) return json({ ok: false, reason: 'invalid_code' }, 400);
      const { data: row } = await admin.from('device_link_requests').select('id, device_label, user_agent, status, created_at, expires_at').eq('code', code).maybeSingle();
      if (!row || row.status !== 'pending' || new Date(row.expires_at).getTime() < now) return json({ ok: false, reason: 'code_not_found' }, 404);
      if (action === 'lookup') return json({ ok: true, label: row.device_label, ageSeconds: Math.max(0, Math.round((now - new Date(row.created_at).getTime()) / 1000)), asName: mine.full_name ?? null });
      const t = await mintToken(user!.id); if (t.err) return t.err;
      const { data: upd } = await admin.from('device_link_requests').update({ status: 'approved', approved_by: user!.id, approved_at: new Date().toISOString(), token_hash: t.hashed }).eq('id', row.id).eq('status', 'pending').select('id');
      if (!upd || !upd.length) return json({ ok: false, reason: 'code_not_found' }, 404);
      await admin.from('security_events').insert({ business_id: mine.business_id, user_id: user!.id, event_type: 'device_linked', detail: `Linked "${row.device_label}" by scanning a code`, device_info: row.user_agent });
      return json({ ok: true });
    }

    // ---------- B) signed-in device shows the QR, the new device scans it ----------
    if (action === 'offer') {
      const m = await member(); if (m.err) return m.err;
      const { user } = m;
      const since = new Date(now - 60_000).toISOString();
      const { count } = await admin.from('device_link_requests').select('id', { count: 'exact', head: true }).eq('offered_by', user!.id).gt('created_at', since);
      if ((count ?? 0) >= 6) return json({ ok: false, reason: 'too_many' }, 429);
      void admin.from('device_link_requests').delete().lt('created_at', new Date(now - 86_400_000).toISOString());
      // an earlier unused offer from this account is replaced by the new one
      await admin.from('device_link_requests').update({ status: 'cancelled', token_hash: null }).eq('offered_by', user!.id).in('status', ['offer', 'claimed']);
      const secret = randomSecret();
      const label = clean(body?.label, 60) || 'Signed-in device';
      for (let i = 0; i < 4; i++) {
        const code = randomCode(8);
        const expiresAt = new Date(now + TTL_MS).toISOString();
        const { data, error } = await admin.from('device_link_requests').insert({ code, secret_hash: await sha256(secret), device_label: label, user_agent: ua, ip_hash: ipHash, expires_at: expiresAt, status: 'offer', offered_by: user!.id }).select('id').single();
        if (!error && data) return json({ ok: true, id: data.id, code, secret, expiresAt });
      }
      return json({ ok: false, reason: 'error' }, 500);
    }

    if (action === 'claim') {
      const code = normCode(body?.code);
      if (code.length !== 8) return json({ ok: false, reason: 'invalid_code' }, 400);
      const since = new Date(now - 60_000).toISOString();
      const { count } = await admin.from('device_link_requests').select('id', { count: 'exact', head: true }).eq('claim_ip_hash', ipHash).gt('claimed_at', since);
      if ((count ?? 0) >= 8) return json({ ok: false, reason: 'too_many' }, 429);
      const { data: row } = await admin.from('device_link_requests').select('id, status, expires_at').eq('code', code).maybeSingle();
      if (!row || row.status !== 'offer' || new Date(row.expires_at).getTime() < now) return json({ ok: false, reason: 'code_not_found' }, 404);
      const claimSecret = randomSecret();
      const expiresAt = new Date(now + TTL_MS).toISOString();
      const { data: upd } = await admin.from('device_link_requests').update({
        status: 'claimed', claim_secret_hash: await sha256(claimSecret), claim_label: clean(body?.label, 60) || 'New device', claim_ua: ua, claim_ip_hash: ipHash,
        claimed_at: new Date().toISOString(), expires_at: expiresAt
      }).eq('id', row.id).eq('status', 'offer').select('id');
      if (!upd || !upd.length) return json({ ok: false, reason: 'code_not_found' }, 404);
      return json({ ok: true, id: row.id, claimSecret, expiresAt });
    }

    if (action === 'offer_poll' || action === 'offer_cancel') {
      const id = String(body?.id ?? ''); const secret = String(body?.secret ?? '');
      if (!isId(id) || secret.length < 20) return json({ ok: false, reason: 'invalid' }, 400);
      const { data: row } = await admin.from('device_link_requests').select('id, secret_hash, status, expires_at, claim_label, claimed_at, offered_by').eq('id', id).maybeSingle();
      if (!row || !row.offered_by || !timingEq(row.secret_hash, await sha256(secret))) return json({ ok: false, reason: 'invalid' }, 404);
      if (action === 'offer_cancel') { await admin.from('device_link_requests').update({ status: 'cancelled', token_hash: null }).eq('id', id).in('status', ['offer', 'claimed', 'approved']); return json({ ok: true }); }
      if (row.status === 'claimed') {
        if (new Date(row.expires_at).getTime() < now) return json({ ok: true, status: 'expired' });
        return json({ ok: true, status: 'claimed', claimLabel: row.claim_label, ageSeconds: Math.max(0, Math.round((now - new Date(row.claimed_at).getTime()) / 1000)) });
      }
      if (row.status === 'offer' && new Date(row.expires_at).getTime() < now) return json({ ok: true, status: 'expired' });
      return json({ ok: true, status: row.status });
    }

    if (action === 'offer_approve') {
      const m = await member(); if (m.err) return m.err;
      const { user, mine } = m;
      const id = String(body?.id ?? ''); const secret = String(body?.secret ?? '');
      if (!isId(id) || secret.length < 20) return json({ ok: false, reason: 'invalid' }, 400);
      const { data: row } = await admin.from('device_link_requests').select('id, secret_hash, status, expires_at, claim_label, claim_ua, offered_by').eq('id', id).maybeSingle();
      if (!row || row.offered_by !== user!.id || !timingEq(row.secret_hash, await sha256(secret))) return json({ ok: false, reason: 'invalid' }, 404);
      if (row.status !== 'claimed' || new Date(row.expires_at).getTime() < now) return json({ ok: false, reason: 'code_not_found' }, 404);
      const t = await mintToken(user!.id); if (t.err) return t.err;
      const { data: upd } = await admin.from('device_link_requests').update({ status: 'approved', approved_by: user!.id, approved_at: new Date().toISOString(), token_hash: t.hashed }).eq('id', row.id).eq('status', 'claimed').select('id');
      if (!upd || !upd.length) return json({ ok: false, reason: 'code_not_found' }, 404);
      await admin.from('security_events').insert({ business_id: mine.business_id, user_id: user!.id, event_type: 'device_linked', detail: `Linked "${row.claim_label}" by showing a code`, device_info: row.claim_ua });
      return json({ ok: true });
    }

    if (action === 'claim_poll') {
      const id = String(body?.id ?? ''); const secret = String(body?.claimSecret ?? '');
      if (!isId(id) || secret.length < 20) return json({ ok: false, reason: 'invalid' }, 400);
      const { data: row } = await admin.from('device_link_requests').select('id, claim_secret_hash, status, token_hash, expires_at').eq('id', id).maybeSingle();
      if (!row || !row.claim_secret_hash || !timingEq(row.claim_secret_hash, await sha256(secret))) return json({ ok: false, reason: 'invalid' }, 404);
      if (row.status === 'approved' && row.token_hash) {
        const { data: taken } = await admin.from('device_link_requests').update({ status: 'used', token_hash: null }).eq('id', id).eq('status', 'approved').select('id');
        if (taken && taken.length) return json({ ok: true, status: 'approved', tokenHash: row.token_hash });
        return json({ ok: true, status: 'used' });
      }
      if (row.status === 'claimed' && new Date(row.expires_at).getTime() < now) return json({ ok: true, status: 'expired' });
      return json({ ok: true, status: row.status === 'claimed' ? 'pending' : row.status === 'used' ? 'used' : 'cancelled' });
    }

    return json({ ok: false, reason: 'unknown_action' }, 400);
  } catch (_e) {
    return json({ ok: false, reason: 'error' }, 500);
  }
});
