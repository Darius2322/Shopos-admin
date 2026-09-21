-- ============================================================================
-- PART 21 — Per-shop login URL, and clears the way for admin business deletion.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- A URL-safe identifier per business, e.g. "sams-electronics" — the owner
-- shares a URL built from this (https://yourapp.com/login/sams-electronics)
-- with staff so it's obvious which shop's login page they've landed on,
-- instead of a generic screen indistinguishable from any other business.
-- ----------------------------------------------------------------------------
alter table businesses add column if not exists slug text;

create or replace function slugify(p_text text) returns text
language sql immutable as $$
  select trim(both '-' from regexp_replace(lower(trim(p_text)), '[^a-z0-9]+', '-', 'g'));
$$;

-- Backfill existing businesses with no slug yet, de-duplicating by
-- appending a short suffix from the id when two shops share a name.
update businesses
set slug = slugify(name) || case when exists (
  select 1 from businesses b2 where b2.id <> businesses.id and slugify(b2.name) = slugify(businesses.name)
) then '-' || substr(id::text, 1, 4) else '' end
where slug is null;

alter table businesses alter column slug set not null;
create unique index if not exists businesses_slug_unique on businesses (slug);

-- Auto-generates a slug for every NEW business going forward — without
-- this, admin-create-business and approve-owner (which just insert a name,
-- not a slug) would start failing the NOT NULL constraint just added
-- above the moment this migration runs.
create or replace function set_business_slug() returns trigger
language plpgsql as $$
declare
  v_base text;
  v_candidate text;
  v_suffix int := 0;
begin
  if new.slug is not null and new.slug <> '' then
    new.slug := lower(trim(new.slug));
    return new;
  end if;
  v_base := slugify(new.name);
  v_candidate := v_base;
  while exists (select 1 from businesses where slug = v_candidate and id <> new.id) loop
    v_suffix := v_suffix + 1;
    v_candidate := v_base || '-' || v_suffix;
  end loop;
  new.slug := v_candidate;
  return new;
end;
$$;
drop trigger if exists businesses_set_slug on businesses;
create trigger businesses_set_slug before insert on businesses
  for each row execute function set_business_slug();

-- Public, read-only, and deliberately narrow — returns ONLY the name and
-- logo for a slug, nothing about the owner, finances, or anything else.
-- This is what the branded /login/:slug page calls before anyone has
-- signed in, so it must never leak more than that.
create or replace function get_business_by_slug(p_slug text)
returns table (name text, logo_url text)
language sql
stable
security definer
set search_path = public
as $$
  select name, logo_url from businesses where slug = lower(trim(p_slug));
$$;
grant execute on function get_business_by_slug(text) to anon, authenticated;

-- ----------------------------------------------------------------------------
-- Lets a business actually be deleted (admin-delete-business edge function).
-- Every OTHER business_id foreign key already cascades — this was the one
-- left as NO ACTION (Postgres' implicit default, which behaves like
-- RESTRICT), and since every business has at least one owner_requests row
-- by construction (that's how it was created), deleting a business would
-- always have failed with a foreign-key violation. SET NULL instead of
-- CASCADE here on purpose: the application history itself ("someone applied
-- to open a shop") is worth keeping for the admin's own records even after
-- the business it resulted in is gone.
-- ----------------------------------------------------------------------------
-- Constraint names are Postgres auto-generated and this one predates any
-- explicit name being given, so it's found dynamically here rather than
-- guessed — an unmatched name below would silently leave the old
-- NO-ACTION constraint in place, defeating this fix entirely.
do $$
declare
  v_conname text;
begin
  select conname into v_conname
  from pg_constraint
  where conrelid = 'owner_requests'::regclass
    and confrelid = 'businesses'::regclass
    and contype = 'f';
  if v_conname is not null then
    execute format('alter table owner_requests drop constraint %I', v_conname);
  end if;
end $$;

alter table owner_requests add constraint owner_requests_business_id_fkey
  foreign key (business_id) references businesses(id) on delete set null;
