-- ============================================================================
-- PHASE 7 — Secure receipt sharing (spec: QR + share link, public page
-- shows only that one receipt, nothing else about the business)
-- ============================================================================
-- Design: no table is ever exposed to the public/anon role directly — both
-- creating and reading a share go through narrow SECURITY DEFINER
-- functions that return only the specific fields a receipt page needs.
-- The token itself is an unguessable random value (48 hex chars from
-- gen_random_bytes), so knowing one receipt's link tells you nothing
-- about any other receipt or any other business data.
-- ============================================================================

begin;

create table if not exists receipt_shares (
  token text primary key,
  sale_id uuid not null references sales(id) on delete cascade,
  business_id uuid not null references businesses(id) on delete cascade,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id)
);
create index if not exists receipt_shares_sale_idx on receipt_shares(sale_id);

alter table receipt_shares enable row level security;
-- Deliberately NO policies at all on this table — not even for staff.
-- Every access (creating a link, or reading one publicly) goes through
-- the two functions below, which run as SECURITY DEFINER and decide
-- exactly what's exposed. A direct table policy here would risk staff
-- being able to list every token ever issued, or anon being able to
-- browse the table structure — neither should be possible.

-- Called by a signed-in staff member from the receipt screen. Reuses an
-- existing token for that sale if one was already generated, rather than
-- minting (and leaving valid) a new link every time Share is tapped again.
create or replace function create_receipt_share(p_sale_id uuid) returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_business_id uuid;
  v_token text;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;

  select business_id into v_business_id from sales where id = p_sale_id;
  if v_business_id is null then raise exception 'Sale not found'; end if;
  if v_business_id <> auth_business_id() then raise exception 'Not authorized for this sale'; end if;

  select token into v_token from receipt_shares where sale_id = p_sale_id;
  if v_token is not null then return v_token; end if;

  v_token := encode(gen_random_bytes(24), 'hex');
  insert into receipt_shares (token, sale_id, business_id, created_by)
  values (v_token, p_sale_id, v_business_id, auth.uid());
  return v_token;
end;
$$;

-- Called by the PUBLIC receipt page — no auth required, callable by the
-- anon role. Returns exactly the fields a receipt display needs and
-- nothing else: no customer PII beyond what's already printed on a
-- physical receipt, no business financial totals beyond this one sale,
-- no way to enumerate other sales or tokens.
create or replace function get_public_receipt(p_token text) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_share receipt_shares%rowtype;
  v_sale sales%rowtype;
  v_business businesses%rowtype;
  v_branch branches%rowtype;
  v_items jsonb;
begin
  select * into v_share from receipt_shares where token = p_token;
  if not found then
    raise exception 'Receipt not found';
  end if;

  select * into v_sale from sales where id = v_share.sale_id;
  select * into v_business from businesses where id = v_share.business_id;
  select * into v_branch from branches where id = v_sale.branch_id;

  select coalesce(jsonb_agg(jsonb_build_object(
    'productName', product_name, 'quantity', quantity, 'lineTotal', line_total
  ) order by id), '[]'::jsonb)
  into v_items
  from sale_items where sale_id = v_sale.id;

  return jsonb_build_object(
    'businessName', v_business.name,
    'branchName', v_branch.name,
    'branchLocation', v_branch.location,
    'branchPhone', v_branch.phone,
    'receiptNumber', v_sale.receipt_number,
    'createdAt', v_sale.created_at,
    'items', v_items,
    'tax', v_sale.tax,
    'total', v_sale.total,
    'amountPaid', v_sale.amount_paid,
    'paymentMethod', v_sale.payment_method,
    'balanceDue', v_sale.balance_due
  );
end;
$$;

grant execute on function create_receipt_share(uuid) to authenticated;
grant execute on function get_public_receipt(text) to anon, authenticated;

commit;

-- ============================================================================
-- VERIFY
-- ============================================================================
-- 1. As a real staff member: select create_receipt_share('<a real sale id>');
--    -- returns a 48-char hex token
-- 2. Calling it again with the SAME sale id returns the SAME token (reuse,
--    not a fresh one each time)
-- 3. As an anon/unauthenticated request: select get_public_receipt('<that token>');
--    -- returns the jsonb receipt data
-- 4. select get_public_receipt('not-a-real-token'); -- raises "Receipt not found"
-- 5. Confirm the returned jsonb contains no customer name/phone, no other
--    sale's data, and no business-wide totals -- only this one receipt
