-- Modular payment sources + single-use, till-isolated M-Pesa transactions.
-- Ingestion is abstract: only 'manual' (typed/pasted by staff) and 'test' (mock) exist. No SMS reading.
create table if not exists payment_sources (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  branch_id uuid references branches(id) on delete set null,
  kind text not null default 'mpesa_till' check (kind in ('mpesa_till')),
  label text not null check (char_length(btrim(label)) between 1 and 80),
  till_number text not null check (till_number ~ '^[0-9]{5,10}$'),
  device_id text,
  mode text not null default 'test' check (mode in ('test','manual','api')),
  status text not null default 'active' check (status in ('active','disabled')),
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists payment_sources_till_unique on payment_sources (till_number) where status = 'active';
create index if not exists payment_sources_business_idx on payment_sources (business_id);

create table if not exists payment_transactions (
  id uuid primary key,
  business_id uuid not null references businesses(id) on delete cascade,
  branch_id uuid not null references branches(id) on delete cascade,
  payment_source_id uuid not null references payment_sources(id) on delete restrict,
  till_number text not null,
  transaction_code text not null check (transaction_code ~ '^[A-Z0-9]{8,12}$'),
  amount numeric(14,2) not null check (amount > 0),
  sender_name text, sender_phone text,
  received_at timestamptz not null,
  device_id text,
  source_type text not null check (source_type in ('test','manual','api')),
  status text not null default 'received' check (status in ('received','matched','used','unmatched')),
  matched_sale_id uuid references sales(id) on delete set null,
  matched_at timestamptz,
  matched_by uuid references auth.users(id),
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists payment_transactions_code_unique on payment_transactions (transaction_code);
create index if not exists payment_transactions_business_received_idx on payment_transactions (business_id, received_at desc);
create index if not exists payment_transactions_business_status_idx on payment_transactions (business_id, status);

alter table payment_sources enable row level security;
alter table payment_transactions enable row level security;
revoke all on payment_sources, payment_transactions from anon;
drop policy if exists payment_sources_select on payment_sources;
create policy payment_sources_select on payment_sources for select using (business_id = auth_business_id());
drop policy if exists payment_sources_write on payment_sources;
create policy payment_sources_write on payment_sources for all
  using (business_id = auth_business_id() and auth_role() in ('owner','manager'))
  with check (business_id = auth_business_id() and auth_role() in ('owner','manager'));
drop policy if exists payment_transactions_select on payment_transactions;
create policy payment_transactions_select on payment_transactions for select
  using (business_id = auth_business_id() and (auth_role() in ('owner','manager') or branch_id = any (auth_branch_ids())));

create or replace function payment_sources_guard() returns trigger language plpgsql set search_path = public as $$
begin
  new.updated_at := now();
  if tg_op = 'UPDATE' then new.business_id := old.business_id; new.created_by := old.created_by;
  else new.created_by := coalesce(auth.uid(), new.created_by); end if;
  return new;
end $$;
drop trigger if exists payment_sources_guard_trg on payment_sources;
create trigger payment_sources_guard_trg before insert or update on payment_sources for each row execute function payment_sources_guard();

create or replace function ingest_payment_transaction(
  p_id uuid, p_source_id uuid, p_branch_id uuid, p_code text, p_amount numeric,
  p_sender_name text, p_sender_phone text, p_received_at timestamptz,
  p_source_type text, p_device_id text default null, p_till_number text default null
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_biz uuid := auth_business_id(); v_src payment_sources%rowtype;
  v_code text := upper(btrim(coalesce(p_code, ''))); v_existing payment_transactions%rowtype;
begin
  if auth.uid() is null or v_biz is null then raise exception 'Not authorised'; end if;
  select * into v_src from payment_sources where id = p_source_id and business_id = v_biz and status = 'active';
  if v_src.id is null then raise exception 'Payment source not found or disabled'; end if;
  if p_branch_id is null or not exists (select 1 from branches where id = p_branch_id and business_id = v_biz) then raise exception 'Invalid branch'; end if;
  if auth_role() not in ('owner','manager') and not (p_branch_id = any (auth_branch_ids())) then raise exception 'No access to this branch'; end if;
  if p_source_type not in ('test','manual','api') then raise exception 'Unknown source type'; end if;
  if p_source_type = 'test' and v_src.mode <> 'test' then raise exception 'Test transactions are only allowed on a test-mode source'; end if;
  if p_source_type = 'manual' and v_src.mode = 'test' then raise exception 'Switch this source out of test mode to record real payments'; end if;
  if p_source_type = 'api' and v_src.mode <> 'api' then raise exception 'This source is not configured for automatic ingestion'; end if;
  if v_code !~ '^[A-Z0-9]{8,12}$' then raise exception 'That does not look like an M-Pesa transaction code'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'Amount must be greater than zero'; end if;

  if p_till_number is not null and btrim(p_till_number) <> '' and btrim(p_till_number) <> v_src.till_number then
    insert into audit_log (business_id, branch_id, user_id, action, entity_type, new_value)
    values (v_biz, p_branch_id, auth.uid(), 'mpesa_wrong_till_rejected', 'payment_transaction', jsonb_build_object('source', v_src.id)::text);
    return jsonb_build_object('result', 'wrong_till');
  end if;

  select * into v_existing from payment_transactions where id = p_id;
  if v_existing.id is not null then
    if v_existing.business_id = v_biz then return jsonb_build_object('result', 'exists', 'id', v_existing.id, 'status', v_existing.status); end if;
    return jsonb_build_object('result', 'duplicate');
  end if;
  select * into v_existing from payment_transactions where transaction_code = v_code;
  if v_existing.id is not null then
    insert into audit_log (business_id, branch_id, user_id, action, entity_type, new_value)
    values (v_biz, p_branch_id, auth.uid(), 'mpesa_duplicate_rejected', 'payment_transaction', jsonb_build_object('code', v_code)::text);
    if v_existing.business_id = v_biz then return jsonb_build_object('result', 'duplicate', 'id', v_existing.id, 'status', v_existing.status); end if;
    return jsonb_build_object('result', 'duplicate');
  end if;

  insert into payment_transactions (id, business_id, branch_id, payment_source_id, till_number, transaction_code, amount,
      sender_name, sender_phone, received_at, device_id, source_type, created_by)
  values (p_id, v_biz, p_branch_id, v_src.id, v_src.till_number, v_code, round(p_amount, 2),
      nullif(btrim(p_sender_name), ''), nullif(btrim(p_sender_phone), ''), coalesce(p_received_at, now()), p_device_id, p_source_type, auth.uid());
  insert into audit_log (business_id, branch_id, user_id, action, entity_type, entity_id, new_value)
  values (v_biz, p_branch_id, auth.uid(), 'mpesa_transaction_received', 'payment_transaction', p_id,
      jsonb_build_object('amount', round(p_amount, 2), 'source_type', p_source_type)::text);
  return jsonb_build_object('result', 'created', 'id', p_id, 'status', 'received');
exception when unique_violation then return jsonb_build_object('result', 'duplicate');
end $$;

create or replace function match_payment_transaction(p_transaction_id uuid, p_sale_id uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_biz uuid := auth_business_id(); v_tx payment_transactions%rowtype; v_updated int;
begin
  if auth.uid() is null or v_biz is null then raise exception 'Not authorised'; end if;
  select * into v_tx from payment_transactions where id = p_transaction_id and business_id = v_biz
     and (auth_role() in ('owner','manager') or branch_id = any (auth_branch_ids()));
  if v_tx.id is null then raise exception 'Transaction not found'; end if;
  if not exists (select 1 from sales where id = p_sale_id and business_id = v_biz) then raise exception 'Sale not found'; end if;
  update payment_transactions set status = 'used', matched_sale_id = p_sale_id, matched_at = now(), matched_by = auth.uid(), updated_at = now()
   where id = p_transaction_id and business_id = v_biz and matched_sale_id is null and status <> 'used';
  get diagnostics v_updated = row_count;
  if v_updated = 0 then
    if v_tx.matched_sale_id = p_sale_id then return jsonb_build_object('result', 'already_matched_to_this_sale'); end if;
    raise exception 'This M-Pesa payment has already been used for another sale';
  end if;
  insert into audit_log (business_id, branch_id, user_id, action, entity_type, entity_id, new_value)
  values (v_biz, v_tx.branch_id, auth.uid(), 'mpesa_transaction_matched', 'payment_transaction', p_transaction_id,
      jsonb_build_object('sale_id', p_sale_id, 'amount', v_tx.amount)::text);
  return jsonb_build_object('result', 'matched');
end $$;

revoke all on function ingest_payment_transaction(uuid, uuid, uuid, text, numeric, text, text, timestamptz, text, text, text) from public, anon;
revoke all on function match_payment_transaction(uuid, uuid) from public, anon;
grant execute on function ingest_payment_transaction(uuid, uuid, uuid, text, numeric, text, text, timestamptz, text, text, text) to authenticated;
grant execute on function match_payment_transaction(uuid, uuid) to authenticated;
grant select, insert, update, delete on payment_sources to authenticated;
grant select on payment_transactions to authenticated;
grant all on payment_sources, payment_transactions to service_role;
