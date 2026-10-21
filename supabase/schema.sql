-- ============================================================================
-- ShopOS — Core Multi-Tenant Schema
-- ============================================================================
-- Run this in the Supabase SQL Editor on a fresh project.
-- Naming convention: all columns snake_case (Postgres/Supabase standard).
-- The app's sync layer (src/lib/sync.ts) maps camelCase <-> snake_case
-- explicitly — this is the fix for the "debt shows as zero after sync" bug,
-- which was caused by pushing camelCase JS objects straight into Postgres.
-- ============================================================================

create extension if not exists "pgcrypto";

-- ----------------------------------------------------------------------------
-- BUSINESSES  (tenants)
-- ----------------------------------------------------------------------------
create table businesses (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete restrict,
  name text not null,
  logo_url text,
  phone text,
  email text,
  address text,
  currency text not null default 'KES',
  tax_rate numeric(5,2) not null default 0,
  payment_instructions text,
  receipt_footer text,
  status text not null default 'active' check (status in ('active','paused','suspended')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- BRANCHES
-- ----------------------------------------------------------------------------
create table branches (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  name text not null,
  code text,
  location text,
  phone text,
  manager_id uuid references auth.users(id) on delete set null,
  status text not null default 'active' check (status in ('active','paused')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- PROFILES  (one row per auth.users row; carries role + branch access)
-- ----------------------------------------------------------------------------
create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  business_id uuid not null references businesses(id) on delete cascade,
  full_name text not null,
  phone text,
  role text not null default 'cashier'
    check (role in ('owner','manager','cashier','inventory_manager','accountant','sales_staff')),
  status text not null default 'active' check (status in ('active','paused','suspended','pending')),
  last_login_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- which branches a profile may access
create table profile_branches (
  profile_id uuid not null references profiles(id) on delete cascade,
  branch_id uuid not null references branches(id) on delete cascade,
  primary key (profile_id, branch_id)
);

-- granular permission overrides (defaults come from role; these override)
create table profile_permissions (
  id text primary key generated always as (profile_id::text || ':' || permission) stored,
  profile_id uuid not null references profiles(id) on delete cascade,
  permission text not null,     -- e.g. 'sales.discount', 'inventory.adjust'
  allowed boolean not null,
  granted_by uuid references auth.users(id),
  updated_at timestamptz not null default now(),
  unique (profile_id, permission)
);

-- ----------------------------------------------------------------------------
-- CATEGORIES / SUPPLIERS / PRODUCTS
-- ----------------------------------------------------------------------------
create table categories (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now()
);

create table suppliers (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  name text not null,
  phone text,
  email text,
  address text,
  status text not null default 'active' check (status in ('active','paused')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table products (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  branch_id uuid not null references branches(id) on delete cascade,
  category_id uuid references categories(id) on delete set null,
  supplier_id uuid references suppliers(id) on delete set null,
  name text not null,
  sku text,
  barcode text,
  brand text,
  description text,
  unit text not null default 'piece',
  image_url text,
  buying_price numeric(12,2) not null default 0,
  selling_price numeric(12,2) not null default 0,
  wholesale_price numeric(12,2),
  quantity numeric(12,2) not null default 0,
  min_stock numeric(12,2) not null default 0,
  reorder_level numeric(12,2) not null default 0,
  expiry_date date,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index products_business_branch_idx on products(business_id, branch_id);
create index products_barcode_idx on products(barcode);

create table inventory_movements (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  branch_id uuid not null references branches(id) on delete cascade,
  product_id uuid not null references products(id) on delete cascade,
  reason text not null,           -- sale | supply | adjustment | return | damage | expiry | correction
  quantity_change numeric(12,2) not null,
  resulting_quantity numeric(12,2) not null,
  reference_id uuid,
  user_id uuid references auth.users(id),
  created_at timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- CUSTOMERS
-- ----------------------------------------------------------------------------
create table customers (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  branch_id uuid references branches(id) on delete set null,
  name text not null,
  phone text,
  email text,
  address text,
  credit_limit numeric(12,2) not null default 0,
  loyalty_registered boolean not null default false,
  loyalty_points numeric(12,2) not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- SALES / SALE ITEMS / PAYMENTS
-- ----------------------------------------------------------------------------
create table sales (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  branch_id uuid not null references branches(id) on delete cascade,
  customer_id uuid references customers(id) on delete set null,
  user_id uuid not null references auth.users(id),
  receipt_number text not null,
  status text not null default 'completed' check (status in ('completed','cancelled','refunded','partially_refunded')),
  subtotal numeric(12,2) not null,
  discount numeric(12,2) not null default 0,
  tax numeric(12,2) not null default 0,
  total numeric(12,2) not null,
  amount_paid numeric(12,2) not null default 0,
  balance_due numeric(12,2) not null default 0,   -- must equal total - amount_paid
  payment_method text not null,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_id, receipt_number)
);
create index sales_business_branch_idx on sales(business_id, branch_id);
create index sales_customer_idx on sales(customer_id);

create table sale_items (
  id uuid primary key default gen_random_uuid(),
  sale_id uuid not null references sales(id) on delete cascade,
  product_id uuid not null references products(id),
  product_name text not null,
  quantity numeric(12,2) not null,
  unit_price numeric(12,2) not null,
  unit_cost numeric(12,2) not null default 0,
  discount numeric(12,2) not null default 0,
  line_total numeric(12,2) not null
);

create table payments (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  branch_id uuid not null references branches(id) on delete cascade,
  customer_id uuid references customers(id) on delete set null,
  sale_id uuid references sales(id) on delete set null,
  debt_id uuid,  -- fk added after debts table exists
  direction text not null default 'in' check (direction in ('in','out')),
  amount numeric(12,2) not null,
  method text not null,
  note text,
  user_id uuid references auth.users(id),
  created_at timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- DEBTS  (the previously-buggy area — kept explicit and simple on purpose)
-- ----------------------------------------------------------------------------
create table debts (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  branch_id uuid not null references branches(id) on delete cascade,
  customer_id uuid not null references customers(id) on delete cascade,
  sale_id uuid references sales(id) on delete set null,
  receipt_id uuid references sales(id) on delete set null,
  user_id uuid references auth.users(id),
  original_amount numeric(12,2) not null check (original_amount >= 0),
  paid_amount numeric(12,2) not null default 0 check (paid_amount >= 0),
  remaining_amount numeric(12,2) not null check (remaining_amount >= 0),
  status text not null default 'outstanding' check (status in ('outstanding','partial','paid','overdue')),
  due_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- guarantees the exact bug class described in the spec can never recur:
  constraint debt_math_check check (remaining_amount = original_amount - paid_amount)
);
create index debts_customer_idx on debts(customer_id);
create index debts_business_branch_idx on debts(business_id, branch_id);

alter table payments add constraint payments_debt_fk foreign key (debt_id) references debts(id) on delete set null;

-- ----------------------------------------------------------------------------
-- SUPPLIES (purchases)
-- ----------------------------------------------------------------------------
create table purchases (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  branch_id uuid not null references branches(id) on delete cascade,
  supplier_id uuid not null references suppliers(id),
  user_id uuid references auth.users(id),
  invoice_number text,
  total numeric(12,2) not null,
  amount_paid numeric(12,2) not null default 0,
  amount_owed numeric(12,2) not null default 0,
  payment_method text,
  status text not null default 'credit' check (status in ('paid','partial','credit')),
  notes text,
  created_at timestamptz not null default now()
);

create table purchase_items (
  id uuid primary key default gen_random_uuid(),
  purchase_id uuid not null references purchases(id) on delete cascade,
  product_id uuid not null references products(id),
  quantity numeric(12,2) not null,
  buying_price numeric(12,2) not null,
  line_total numeric(12,2) not null
);

-- ----------------------------------------------------------------------------
-- EXPENSES
-- ----------------------------------------------------------------------------
create table expenses (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  branch_id uuid not null references branches(id) on delete cascade,
  category text not null,
  amount numeric(12,2) not null,
  payment_method text,
  description text,
  user_id uuid references auth.users(id),
  created_at timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- AUDIT LOG
-- ----------------------------------------------------------------------------
create table audit_log (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  branch_id uuid references branches(id),
  user_id uuid references auth.users(id),
  action text not null,
  entity_type text,
  entity_id uuid,
  previous_value text,
  new_value text,
  created_at timestamptz not null default now()
);

-- ============================================================================
-- ROW LEVEL SECURITY
-- ============================================================================
-- Helper: business_id of the currently authenticated profile
create or replace function auth_business_id() returns uuid
language sql stable security definer as $$
  select business_id from profiles where id = auth.uid()
$$;

create or replace function auth_role() returns text
language sql stable security definer as $$
  select role from profiles where id = auth.uid()
$$;

create or replace function auth_branch_ids() returns uuid[]
language sql stable security definer as $$
  select coalesce(array_agg(branch_id), '{}') from profile_branches where profile_id = auth.uid()
$$;

alter table businesses enable row level security;
alter table branches enable row level security;
alter table profiles enable row level security;
alter table profile_branches enable row level security;
alter table profile_permissions enable row level security;
alter table categories enable row level security;
alter table suppliers enable row level security;
alter table products enable row level security;
alter table inventory_movements enable row level security;
alter table customers enable row level security;
alter table sales enable row level security;
alter table sale_items enable row level security;
alter table payments enable row level security;
alter table debts enable row level security;
alter table purchases enable row level security;
alter table purchase_items enable row level security;
alter table expenses enable row level security;
alter table audit_log enable row level security;

-- Businesses: only the owner or members of that business can see it
create policy business_isolation on businesses
  for all using (id = auth_business_id() or owner_id = auth.uid());

-- Generic tenant-isolation policy, applied per table (business_id column)
create policy branches_isolation on branches for all using (business_id = auth_business_id());
create policy profiles_isolation on profiles for all using (business_id = auth_business_id());
create policy categories_isolation on categories for all using (business_id = auth_business_id());
create policy suppliers_isolation on suppliers for all using (business_id = auth_business_id());
create policy customers_isolation on customers for all using (business_id = auth_business_id());
create policy purchases_isolation on purchases for all using (business_id = auth_business_id());
create policy expenses_isolation on expenses for all using (business_id = auth_business_id());
create policy audit_isolation on audit_log for all using (business_id = auth_business_id());
create policy payments_isolation on payments for all using (business_id = auth_business_id());
create policy debts_isolation on debts for all using (business_id = auth_business_id());

-- Branch-scoped tables: must belong to the business AND (owner/manager sees all
-- branches; other roles are limited to their assigned branches)
create policy products_isolation on products for all using (
  business_id = auth_business_id()
  and (auth_role() in ('owner','manager') or branch_id = any(auth_branch_ids()))
);
create policy sales_isolation on sales for all using (
  business_id = auth_business_id()
  and (auth_role() in ('owner','manager') or branch_id = any(auth_branch_ids()))
);
create policy inventory_movements_isolation on inventory_movements for all using (
  business_id = auth_business_id()
  and (auth_role() in ('owner','manager') or branch_id = any(auth_branch_ids()))
);

create policy sale_items_isolation on sale_items for all using (
  exists (select 1 from sales s where s.id = sale_id and s.business_id = auth_business_id())
);
create policy purchase_items_isolation on purchase_items for all using (
  exists (select 1 from purchases p where p.id = purchase_id and p.business_id = auth_business_id())
);
create policy profile_branches_isolation on profile_branches for all using (
  exists (select 1 from profiles pr where pr.id = profile_id and pr.business_id = auth_business_id())
);
create policy profile_permissions_isolation on profile_permissions for all using (
  exists (select 1 from profiles pr where pr.id = profile_id and pr.business_id = auth_business_id())
);

-- ============================================================================
-- keep updated_at fresh
-- ============================================================================
create or replace function touch_updated_at() returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger businesses_touch before update on businesses for each row execute function touch_updated_at();
create trigger branches_touch before update on branches for each row execute function touch_updated_at();
create trigger profiles_touch before update on profiles for each row execute function touch_updated_at();
create trigger products_touch before update on products for each row execute function touch_updated_at();
create trigger customers_touch before update on customers for each row execute function touch_updated_at();
create trigger sales_touch before update on sales for each row execute function touch_updated_at();
create trigger debts_touch before update on debts for each row execute function touch_updated_at();

-- ============================================================================
-- PART 2 — Documents, refunds, employee payments, loyalty, notifications
-- ============================================================================

-- ----------------------------------------------------------------------------
-- QUOTATIONS
-- ----------------------------------------------------------------------------
create table quotations (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  branch_id uuid not null references branches(id) on delete cascade,
  customer_id uuid references customers(id) on delete set null,
  user_id uuid references auth.users(id),
  quotation_number text not null,
  status text not null default 'draft' check (status in ('draft','sent','accepted','rejected','expired','converted')),
  subtotal numeric(12,2) not null default 0,
  discount numeric(12,2) not null default 0,
  tax numeric(12,2) not null default 0,
  total numeric(12,2) not null default 0,
  valid_until date,
  notes text,
  terms text,
  converted_sale_id uuid references sales(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_id, quotation_number)
);

create table quotation_items (
  id uuid primary key default gen_random_uuid(),
  quotation_id uuid not null references quotations(id) on delete cascade,
  product_id uuid references products(id),
  description text not null,
  quantity numeric(12,2) not null,
  unit_price numeric(12,2) not null,
  discount numeric(12,2) not null default 0,
  line_total numeric(12,2) not null,
  created_at timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- INVOICES
-- ----------------------------------------------------------------------------
create table invoices (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  branch_id uuid not null references branches(id) on delete cascade,
  customer_id uuid references customers(id) on delete set null,
  user_id uuid references auth.users(id),
  quotation_id uuid references quotations(id) on delete set null,
  invoice_number text not null,
  status text not null default 'draft' check (status in ('draft','sent','partially_paid','paid','overdue','cancelled')),
  subtotal numeric(12,2) not null default 0,
  discount numeric(12,2) not null default 0,
  tax numeric(12,2) not null default 0,
  total numeric(12,2) not null default 0,
  amount_paid numeric(12,2) not null default 0,
  balance numeric(12,2) not null default 0,
  due_date date,
  notes text,
  terms text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_id, invoice_number),
  constraint invoice_balance_check check (balance = total - amount_paid)
);

create table invoice_items (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references invoices(id) on delete cascade,
  product_id uuid references products(id),
  description text not null,
  quantity numeric(12,2) not null,
  unit_price numeric(12,2) not null,
  discount numeric(12,2) not null default 0,
  line_total numeric(12,2) not null,
  created_at timestamptz not null default now()
);

create table invoice_payments (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references invoices(id) on delete cascade,
  amount numeric(12,2) not null,
  method text not null,
  user_id uuid references auth.users(id),
  created_at timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- REFUNDS  (request -> approval -> processed, never edits the original sale)
-- ----------------------------------------------------------------------------
create table refunds (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  branch_id uuid not null references branches(id) on delete cascade,
  sale_id uuid not null references sales(id),
  customer_id uuid references customers(id),
  requested_by uuid references auth.users(id),
  approved_by uuid references auth.users(id),
  reason text not null,
  status text not null default 'pending' check (status in ('pending','approved','rejected','processed')),
  total_amount numeric(12,2) not null default 0,
  refund_method text,
  requested_at timestamptz not null default now(),
  decided_at timestamptz,
  processed_at timestamptz,
  notes text
);

create table refund_items (
  id uuid primary key default gen_random_uuid(),
  refund_id uuid not null references refunds(id) on delete cascade,
  sale_item_id uuid references sale_items(id),
  product_id uuid not null references products(id),
  quantity numeric(12,2) not null,
  unit_price numeric(12,2) not null,
  line_total numeric(12,2) not null,
  condition text not null default 'resalable' check (condition in ('resalable','damaged','expired'))
);

-- ----------------------------------------------------------------------------
-- CORRECTION REQUESTS  (employee mistake resolution — never silent edits)
-- ----------------------------------------------------------------------------
create table correction_requests (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  branch_id uuid not null references branches(id) on delete cascade,
  sale_id uuid references sales(id),
  requested_by uuid references auth.users(id),
  decided_by uuid references auth.users(id),
  problem text not null,
  requested_correction text not null,
  status text not null default 'requested' check (status in ('requested','info_needed','approved','rejected')),
  requested_at timestamptz not null default now(),
  decided_at timestamptz,
  resolution_notes text
);

-- ----------------------------------------------------------------------------
-- EMPLOYEE PAYMENTS
-- ----------------------------------------------------------------------------
create table employee_payments (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  branch_id uuid not null references branches(id) on delete cascade,
  employee_id uuid not null references auth.users(id),
  paid_by uuid references auth.users(id),
  period_start date,
  period_end date,
  base_amount numeric(12,2) not null default 0,
  additions numeric(12,2) not null default 0,
  deductions numeric(12,2) not null default 0,
  advance numeric(12,2) not null default 0,
  net_amount numeric(12,2) not null,
  payment_method text not null,
  reference text,
  notes text,
  status text not null default 'paid' check (status in ('pending','paid','cancelled')),
  created_at timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- LOYALTY
-- ----------------------------------------------------------------------------
create table loyalty_settings (
  business_id uuid primary key references businesses(id) on delete cascade,
  enabled boolean not null default false,
  points_per_amount numeric(12,2) not null default 1,   -- points earned
  amount_per_point numeric(12,2) not null default 100,  -- KES spent per point
  min_purchase numeric(12,2) not null default 0,
  count_discount boolean not null default false,
  count_tax boolean not null default true,
  updated_at timestamptz not null default now()
);

create table loyalty_transactions (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  branch_id uuid references branches(id),
  customer_id uuid not null references customers(id) on delete cascade,
  sale_id uuid references sales(id),
  points_earned numeric(12,2) not null default 0,
  points_reversed numeric(12,2) not null default 0,
  previous_balance numeric(12,2) not null,
  new_balance numeric(12,2) not null,
  reason text not null default 'sale' check (reason in ('sale','refund_reversal','manual_adjustment')),
  user_id uuid references auth.users(id),
  created_at timestamptz not null default now(),
  constraint loyalty_balance_check check (new_balance = previous_balance + points_earned - points_reversed)
);

-- ----------------------------------------------------------------------------
-- NOTIFICATIONS
-- ----------------------------------------------------------------------------
create table notifications (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  branch_id uuid references branches(id),
  user_id uuid references auth.users(id),   -- null = broadcast to whole business
  type text not null,
  title text not null,
  body text,
  read boolean not null default false,
  entity_type text,
  entity_id uuid,
  created_at timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- SUPPORT TICKETS
-- ----------------------------------------------------------------------------
create table support_tickets (
  id uuid primary key default gen_random_uuid(),
  business_id uuid references businesses(id) on delete cascade,
  branch_id uuid references branches(id),
  user_id uuid references auth.users(id),
  subject text not null,
  category text not null,
  description text not null,
  status text not null default 'open' check (status in ('open','in_progress','waiting_for_user','resolved','closed')),
  app_version text,
  device_info text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table support_ticket_replies (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references support_tickets(id) on delete cascade,
  author_id uuid references auth.users(id),
  is_admin boolean not null default false,
  message text not null,
  created_at timestamptz not null default now()
);

-- ============================================================================
-- RLS for part 2
-- ============================================================================
alter table quotations enable row level security;
alter table quotation_items enable row level security;
alter table invoices enable row level security;
alter table invoice_items enable row level security;
alter table invoice_payments enable row level security;
alter table refunds enable row level security;
alter table refund_items enable row level security;
alter table correction_requests enable row level security;
alter table employee_payments enable row level security;
alter table loyalty_settings enable row level security;
alter table loyalty_transactions enable row level security;
alter table notifications enable row level security;
alter table support_tickets enable row level security;
alter table support_ticket_replies enable row level security;

create policy quotations_isolation on quotations for all using (business_id = auth_business_id());
create policy invoices_isolation on invoices for all using (business_id = auth_business_id());
create policy refunds_isolation on refunds for all using (business_id = auth_business_id());
create policy correction_isolation on correction_requests for all using (business_id = auth_business_id());
create policy loyalty_settings_isolation on loyalty_settings for all using (business_id = auth_business_id());
create policy loyalty_tx_isolation on loyalty_transactions for all using (business_id = auth_business_id());
create policy notifications_isolation on notifications for all using (business_id = auth_business_id());
create policy support_tickets_isolation on support_tickets for all using (business_id = auth_business_id());

-- employee payments: employees see only their own; owner/manager see all
create policy employee_payments_isolation on employee_payments for all using (
  business_id = auth_business_id()
  and (auth_role() in ('owner','manager') or employee_id = auth.uid())
);

create policy quotation_items_isolation on quotation_items for all using (
  exists (select 1 from quotations q where q.id = quotation_id and q.business_id = auth_business_id())
);
create policy invoice_items_isolation on invoice_items for all using (
  exists (select 1 from invoices i where i.id = invoice_id and i.business_id = auth_business_id())
);
create policy invoice_payments_isolation on invoice_payments for all using (
  exists (select 1 from invoices i where i.id = invoice_id and i.business_id = auth_business_id())
);
create policy refund_items_isolation on refund_items for all using (
  exists (select 1 from refunds r where r.id = refund_id and r.business_id = auth_business_id())
);
create policy support_replies_isolation on support_ticket_replies for all using (
  exists (select 1 from support_tickets t where t.id = ticket_id and (t.business_id = auth_business_id() or t.business_id is null))
);

create trigger invoices_touch before update on invoices for each row execute function touch_updated_at();
create trigger quotations_touch before update on quotations for each row execute function touch_updated_at();
create trigger support_tickets_touch before update on support_tickets for each row execute function touch_updated_at();
create trigger loyalty_settings_touch before update on loyalty_settings for each row execute function touch_updated_at();

-- ============================================================================
-- PART 3 — Platform admin, owner requests, WebAuthn credential references
-- ============================================================================

-- Platform admins are a small, separately-managed set of users (created by
-- inserting rows here manually via the Supabase dashboard/SQL editor — there
-- is intentionally no in-app way for a business user to grant themselves
-- this). Kept in its own table rather than a role on `profiles` so tenant
-- RLS never has to reason about a cross-tenant role.
create table platform_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  created_at timestamptz not null default now()
);

create or replace function is_platform_admin() returns boolean
language sql stable security definer as $$
  select exists (select 1 from platform_admins where user_id = auth.uid())
$$;

alter table platform_admins enable row level security;
create policy platform_admins_self on platform_admins for select using (user_id = auth.uid());

-- Admin-only additional read access, layered on top of (not replacing) the
-- existing tenant-isolation policies — Postgres RLS OR's policies of the
-- same command together, so normal tenant users are unaffected.
create policy businesses_admin_read on businesses for select using (is_platform_admin());
create policy businesses_admin_write on businesses for update using (is_platform_admin());
create policy branches_admin_read on branches for select using (is_platform_admin());
create policy profiles_admin_read on profiles for select using (is_platform_admin());
create policy support_tickets_admin on support_tickets for all using (is_platform_admin());
create policy support_replies_admin on support_ticket_replies for all using (is_platform_admin());

-- Prospective owner sign-up requests, reviewed by a platform admin before
-- a businesses/profiles row is created for them.
create table owner_requests (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  email text not null,
  phone text,
  business_name text not null,
  message text,
  status text not null default 'pending' check (status in ('pending','approved','rejected','paused')),
  decided_by uuid references auth.users(id),
  decided_at timestamptz,
  created_at timestamptz not null default now()
);
alter table owner_requests enable row level security;
create policy owner_requests_admin on owner_requests for all using (is_platform_admin());
create policy owner_requests_insert_anyone on owner_requests for insert with check (true);

-- References to WebAuthn platform-authenticator credentials. Only the
-- credential ID and public key are stored (never biometric data itself —
-- the device/OS handles the actual fingerprint/face verification and never
-- exposes it to this app or database).
create table webauthn_credentials (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  credential_id text not null unique,
  public_key text not null,
  label text,
  created_at timestamptz not null default now(),
  last_used_at timestamptz
);
alter table webauthn_credentials enable row level security;
create policy webauthn_self on webauthn_credentials for all using (user_id = auth.uid());
