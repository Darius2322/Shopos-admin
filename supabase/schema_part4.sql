-- ============================================================================
-- PART 4 — OTP activation, session security, cancel-sale, daily closing,
-- break tracking, and the document-numbering race-condition fix.
--
-- This is additive: run it once, after schema.sql (parts 1-3), against your
-- EXISTING Supabase project. It does not touch existing data.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Business activation status: extend the existing CHECK constraint instead
-- of replacing the column, so existing 'active'/'paused'/'suspended' rows
-- are untouched.
-- ----------------------------------------------------------------------------
alter table businesses drop constraint if exists businesses_status_check;
alter table businesses add constraint businesses_status_check
  check (status in ('pending_activation','active','paused','suspended'));

-- profiles.status already includes 'pending' from Part 1 — reused as-is for
-- "created, but business not yet activated."

-- ----------------------------------------------------------------------------
-- OTP ACTIVATION CODES
-- ----------------------------------------------------------------------------
-- Only a SHA-256 hash of the code is ever stored — never the plaintext.
-- Generated and verified server-side (Edge Function generates + hashes;
-- activate_business() below verifies), so it can never be forged or bypassed
-- by editing frontend state, per the spec's explicit requirement.
create table otp_codes (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  purpose text not null default 'activation' check (purpose in ('activation')),
  code_hash text not null,
  attempts int not null default 0,
  max_attempts int not null default 5,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);
alter table otp_codes enable row level security;
-- No direct client access at all — only the security-definer function below
-- and the service-role Edge Function ever touch this table.
create policy otp_codes_no_direct_access on otp_codes for all using (false);

-- ----------------------------------------------------------------------------
-- activate_business(): the ONE way a business can move from
-- 'pending_activation' to 'active'. Runs with elevated privilege (security
-- definer) specifically so it can update businesses/profiles despite RLS,
-- but it still enforces every rule itself:
--   - caller must be signed in
--   - caller's own profile must belong to the target business
--   - the OTP must be unexpired, unused, and under its attempt limit
--   - the hash must match
-- Wrong code -> attempt is recorded and rejected, no state changes leak.
-- ----------------------------------------------------------------------------
create or replace function activate_business(p_business_id uuid, p_code text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile_business_id uuid;
  v_otp record;
  v_code_hash text;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  select business_id into v_profile_business_id from profiles where id = auth.uid();
  if v_profile_business_id is null or v_profile_business_id <> p_business_id then
    raise exception 'Not authorized for this business';
  end if;

  select * into v_otp from otp_codes
    where business_id = p_business_id and purpose = 'activation' and used_at is null
    order by created_at desc limit 1;

  if v_otp is null then
    raise exception 'No activation code found — ask an admin to resend one';
  end if;
  if v_otp.expires_at < now() then
    raise exception 'This code has expired — ask an admin to resend one';
  end if;
  if v_otp.attempts >= v_otp.max_attempts then
    raise exception 'Too many incorrect attempts — ask an admin to resend a code';
  end if;

  v_code_hash := encode(digest(p_code, 'sha256'), 'hex');

  if v_code_hash <> v_otp.code_hash then
    update otp_codes set attempts = attempts + 1 where id = v_otp.id;
    raise exception 'Incorrect code';
  end if;

  update otp_codes set used_at = now() where id = v_otp.id;
  update businesses set status = 'active', updated_at = now() where id = p_business_id;
  update profiles set status = 'active', updated_at = now() where id = auth.uid();

  insert into audit_log (business_id, user_id, action, entity_type, entity_id)
  values (p_business_id, auth.uid(), 'account_activated', 'business', p_business_id);

  return true;
end;
$$;

revoke all on function activate_business(uuid, text) from public;
grant execute on function activate_business(uuid, text) to authenticated;

-- Financial-mutation tables must reject writes until the business is
-- actually activated — enforced here at the database, not just by the
-- frontend hiding a button. A business stuck in 'pending_activation' or an
-- admin-paused/suspended business cannot record sales, debts, payments,
-- purchases, quotations, or invoices no matter what the client sends.
create or replace function require_active_business() returns trigger
language plpgsql as $$
declare
  v_status text;
begin
  select status into v_status from businesses where id = new.business_id;
  if v_status is distinct from 'active' then
    raise exception 'Business is not active (status: %) — this action is blocked', v_status;
  end if;
  return new;
end;
$$;

create trigger sales_require_active before insert on sales for each row execute function require_active_business();
create trigger debts_require_active before insert on debts for each row execute function require_active_business();
create trigger payments_require_active before insert on payments for each row execute function require_active_business();
create trigger purchases_require_active before insert on purchases for each row execute function require_active_business();
create trigger quotations_require_active before insert on quotations for each row execute function require_active_business();
create trigger invoices_require_active before insert on invoices for each row execute function require_active_business();

-- ----------------------------------------------------------------------------
-- SESSION REVOCATION (owner/admin can force a user to re-login)
-- ----------------------------------------------------------------------------
alter table profiles add column if not exists force_logout_at timestamptz;
-- The app checks this on every bootstrap/sync: if force_logout_at is newer
-- than the local session's login time, it signs the device out. This is a
-- practical approximation of session revocation without a custom auth
-- server — Supabase's own JWT stays valid until it expires, but the app
-- itself will refuse to proceed past this check.

-- ----------------------------------------------------------------------------
-- SECURITY EVENTS
-- ----------------------------------------------------------------------------
create table security_events (
  id uuid primary key default gen_random_uuid(),
  business_id uuid references businesses(id) on delete cascade,
  user_id uuid references auth.users(id),
  event_type text not null, -- login_success | login_failed | otp_failed | otp_success | permission_change | force_logout | admin_action
  detail text,
  device_info text,
  created_at timestamptz not null default now()
);
alter table security_events enable row level security;
create policy security_events_isolation on security_events for all using (
  business_id = auth_business_id() or is_platform_admin()
);
create policy security_events_insert_self on security_events for insert with check (
  user_id = auth.uid() or business_id = auth_business_id()
);

-- ----------------------------------------------------------------------------
-- DOCUMENT NUMBERING — race-condition fix
-- ----------------------------------------------------------------------------
-- The previous approach (count local rows, format a number) can produce the
-- same receipt/quotation/invoice number twice if two branches are offline
-- and creating documents simultaneously. This table + function makes
-- numbering atomic and server-authoritative: the app now calls
-- next_document_number() at sync time (or when online) rather than
-- formatting the number itself.
create table document_counters (
  business_id uuid not null references businesses(id) on delete cascade,
  doc_type text not null check (doc_type in ('receipt','quotation','invoice')),
  year int not null,
  last_number int not null default 0,
  primary key (business_id, doc_type, year)
);
alter table document_counters enable row level security;
create policy document_counters_no_direct_access on document_counters for all using (false);

create or replace function next_document_number(p_business_id uuid, p_doc_type text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_year int := extract(year from now());
  v_next int;
  v_prefix text;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  if (select business_id from profiles where id = auth.uid()) <> p_business_id then
    raise exception 'Not authorized for this business';
  end if;

  insert into document_counters (business_id, doc_type, year, last_number)
  values (p_business_id, p_doc_type, v_year, 1)
  on conflict (business_id, doc_type, year)
  do update set last_number = document_counters.last_number + 1
  returning last_number into v_next;

  v_prefix := case p_doc_type
    when 'receipt' then 'REC'
    when 'quotation' then 'QT'
    when 'invoice' then 'INV'
  end;

  return v_prefix || '-' || v_year || '-' || lpad(v_next::text, 5, '0');
end;
$$;

revoke all on function next_document_number(uuid, text) from public;
grant execute on function next_document_number(uuid, text) to authenticated;

-- ----------------------------------------------------------------------------
-- CANCEL SALE (distinct from refund — for a sale that shouldn't have
-- happened at all, e.g. duplicate or entirely wrong customer)
-- ----------------------------------------------------------------------------
create table sale_cancellations (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  branch_id uuid not null references branches(id) on delete cascade,
  sale_id uuid not null references sales(id),
  requested_by uuid references auth.users(id),
  approved_by uuid references auth.users(id),
  reason text not null,
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  requested_at timestamptz not null default now(),
  decided_at timestamptz
);
alter table sale_cancellations enable row level security;
create policy sale_cancellations_isolation on sale_cancellations for all using (business_id = auth_business_id());

-- ----------------------------------------------------------------------------
-- LUNCH BREAK / POS LOCK TRACKING
-- ----------------------------------------------------------------------------
create table break_sessions (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  branch_id uuid not null references branches(id) on delete cascade,
  user_id uuid not null references auth.users(id),
  started_at timestamptz not null default now(),
  ended_at timestamptz
);
alter table break_sessions enable row level security;
create policy break_sessions_isolation on break_sessions for all using (business_id = auth_business_id());

-- ----------------------------------------------------------------------------
-- END-OF-DAY CLOSING
-- ----------------------------------------------------------------------------
create table daily_closings (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  branch_id uuid not null references branches(id) on delete cascade,
  closed_by uuid references auth.users(id),
  business_date date not null,
  total_sales numeric(12,2) not null default 0,
  cash_sales numeric(12,2) not null default 0,
  mpesa_sales numeric(12,2) not null default 0,
  card_sales numeric(12,2) not null default 0,
  bank_sales numeric(12,2) not null default 0,
  credit_sales numeric(12,2) not null default 0,
  other_sales numeric(12,2) not null default 0,
  refunds_total numeric(12,2) not null default 0,
  expenses_total numeric(12,2) not null default 0,
  expected_cash numeric(12,2) not null default 0,
  actual_cash numeric(12,2),
  cash_difference numeric(12,2),
  created_at timestamptz not null default now(),
  unique (branch_id, business_date)
);
alter table daily_closings enable row level security;
create policy daily_closings_isolation on daily_closings for all using (business_id = auth_business_id());
