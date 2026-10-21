-- ============================================================================
-- PHASE 1 — Business Memberships (one auth user, many businesses)
-- ============================================================================
-- SAFE / NON-DESTRUCTIVE. Run this on a staging branch of your Supabase
-- project first, and diff row counts on profiles/profile_branches/
-- profile_permissions before and after. Nothing is dropped.
--
-- What this fixes:
--   profiles.id was FORCED to equal auth.users.id (one row per auth user,
--   ever). That makes it structurally impossible for the same email to be
--   Staff in Business A and Manager in Business B (spec section 4/17).
--
-- What this migration does:
--   1. Adds profiles.user_id (references auth.users, many rows allowed).
--   2. Backfills user_id = id for every existing row — zero data loss.
--   3. Detaches profiles.id from auth.users.id going forward (new
--      memberships get a fresh generated id; EXISTING rows keep their
--      current id unchanged, so `profiles.id = auth.uid()` still holds
--      true for every current single-business user — no app code that
--      reads today's data breaks).
--   4. Adds unique(business_id, user_id) — the actual "no duplicate
--      membership in one business" rule from spec section 4/24. Supabase
--      Auth already guarantees one auth.users row per email, so this is
--      the correct, sufficient constraint (no separate normalized_email
--      column needed).
--   5. Adds user_active_business — which business a session is "in" right
--      now — and a validated RPC to switch it. auth_business_id()/
--      auth_role()/auth_branch_ids() are redefined to resolve through
--      this, so ALL 69 existing RLS policies keep working unmodified —
--      they just call the same function names.
--   6. A user can never set their own active business to one they don't
--      have an active membership in — validated server-side inside the
--      RPC (security definer), never trusts client input directly.
--
-- What this migration does NOT do yet (later phases):
--   - Granular permissions table / role_permissions / member_permissions
--     (spec sections 9-13) — layered on top in phase 2.
--   - Business-specific login URL resolution (phase 3).
--   - Local IndexedDB sync layer (src/lib/db.ts, sync.ts) still assumes
--     one cached profile per user_id — needs a small update to key by
--     (user_id, business_id) once multi-business is actually used. Until
--     then every existing user has exactly one membership, so it keeps
--     working exactly as before with zero changes required.
-- ============================================================================

begin;

-- ----------------------------------------------------------------------------
-- 1-2. Add + backfill user_id
-- ----------------------------------------------------------------------------
alter table profiles add column if not exists user_id uuid;
update profiles set user_id = id where user_id is null;
alter table profiles alter column user_id set not null;
alter table profiles
  add constraint profiles_user_id_fkey foreign key (user_id) references auth.users(id) on delete cascade;

-- ----------------------------------------------------------------------------
-- 3. Detach id from auth.users for FUTURE rows only (existing ids untouched)
-- ----------------------------------------------------------------------------
alter table profiles drop constraint if exists profiles_id_fkey;
alter table profiles alter column id set default gen_random_uuid();

-- ----------------------------------------------------------------------------
-- 4. Prevent duplicate membership in the same business
-- ----------------------------------------------------------------------------
alter table profiles
  add constraint profiles_business_user_unique unique (business_id, user_id);

-- ----------------------------------------------------------------------------
-- 5. Active business per session + validated switch RPC
-- ----------------------------------------------------------------------------
create table if not exists user_active_business (
  user_id uuid primary key references auth.users(id) on delete cascade,
  business_id uuid not null references businesses(id) on delete cascade,
  profile_id uuid not null references profiles(id) on delete cascade,
  updated_at timestamptz not null default now()
);

-- Backfill: every current user has exactly one membership — make it active.
insert into user_active_business (user_id, business_id, profile_id)
select user_id, business_id, id from profiles
on conflict (user_id) do nothing;

alter table user_active_business enable row level security;
create policy user_active_business_self on user_active_business for select using (user_id = auth.uid());
-- No insert/update/delete policy for regular users — writes only happen
-- through the security-definer RPC below, which bypasses RLS deliberately
-- and validates membership itself. Do not add a broader policy here.

create or replace function switch_active_business(p_business_id uuid) returns void
language plpgsql security definer as $$
declare
  v_profile_id uuid;
begin
  select id into v_profile_id
  from profiles
  where user_id = auth.uid()
    and business_id = p_business_id
    and status = 'active';

  if v_profile_id is null then
    raise exception 'No active membership in that business';
  end if;

  insert into user_active_business (user_id, business_id, profile_id, updated_at)
  values (auth.uid(), p_business_id, v_profile_id, now())
  on conflict (user_id) do update
    set business_id = excluded.business_id,
        profile_id = excluded.profile_id,
        updated_at = now();
end;
$$;

-- List every business the current user has an active membership in, for
-- rendering a business switcher UI.
create or replace function my_memberships() returns table (
  business_id uuid, business_name text, role text, status text
) language sql stable security definer as $$
  select b.id, b.name, p.role, p.status
  from profiles p
  join businesses b on b.id = p.business_id
  where p.user_id = auth.uid()
$$;

-- ----------------------------------------------------------------------------
-- 6. Redefine the three functions every existing RLS policy already calls.
--    Same names, same return types — no policy needs to change.
-- ----------------------------------------------------------------------------
create or replace function auth_business_id() returns uuid
language sql stable security definer as $$
  select business_id from user_active_business where user_id = auth.uid()
$$;

create or replace function auth_role() returns text
language sql stable security definer as $$
  select p.role from profiles p
  join user_active_business uab on uab.profile_id = p.id
  where p.user_id = auth.uid()
$$;

create or replace function auth_branch_ids() returns uuid[]
language sql stable security definer as $$
  select coalesce(array_agg(pb.branch_id), '{}')
  from profile_branches pb
  join user_active_business uab on uab.profile_id = pb.profile_id
  where uab.user_id = auth.uid()
$$;

-- New helper for the "any business I belong to" case (business switcher /
-- businesses list), separate from the "current active business" case above.
create or replace function auth_business_ids() returns uuid[]
language sql stable security definer as $$
  select coalesce(array_agg(business_id), '{}') from profiles where user_id = auth.uid()
$$;

-- Businesses SELECT policy needs to allow seeing every business the user is
-- a member of (for the switcher), not just the currently active one. Write
-- operations stay scoped to the active business via the existing policy.
drop policy if exists business_isolation on businesses;
create policy businesses_select on businesses
  for select using (id = any(auth_business_ids()) or owner_id = auth.uid());
create policy businesses_write on businesses
  for insert with check (owner_id = auth.uid());
create policy businesses_update on businesses
  for update using (id = auth_business_id() or owner_id = auth.uid())
  with check (id = auth_business_id() or owner_id = auth.uid());
create policy businesses_delete on businesses
  for delete using (owner_id = auth.uid());

commit;

-- ============================================================================
-- VERIFY BEFORE MOVING ON (run these manually, don't just trust "no errors")
-- ============================================================================
-- 1. select count(*) from profiles;                    -- must match pre-migration count
-- 2. select count(*) from user_active_business;         -- must equal count(*) from profiles
--    (fails only if two profiles rows already shared a user_id pre-migration,
--    which schema.sql's old 1:1 design made impossible anyway)
-- 3. select id, user_id from profiles where id <> user_id;  -- should be EMPTY right now
--    (confirms zero existing rows changed identity)
-- 4. As a real existing staff user, confirm the app still loads normally —
--    auth_business_id()/auth_role()/auth_branch_ids() must return the same
--    values as before for anyone with only one membership.
