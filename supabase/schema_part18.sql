-- ============================================================================
-- PART 18 — Inventory categories, actually wired up.
--
-- The `categories` table and `products.category_id` foreign key have
-- existed since Part 1, but no UI or sync ever used them — every product
-- has always been created with category_id left null. This adds what a
-- real category management screen needs (archive instead of delete, an
-- updated_at to sync on) and a uniqueness guard, without touching any
-- existing row.
-- ============================================================================

alter table categories
  add column if not exists archived boolean not null default false,
  add column if not exists updated_at timestamptz not null default now();

-- Prevents two active categories with the same name in one business
-- (case-insensitive) — but an archived one doesn't block reusing the name,
-- since "Archive/disable" must not behave like a permanent name reservation.
create unique index if not exists categories_unique_active_name
  on categories (business_id, lower(name)) where not archived;

-- Keep updated_at current on every edit, reusing the generic trigger
-- function already defined in schema.sql for every other table.
drop trigger if exists categories_touch_updated_at on categories;
create trigger categories_touch_updated_at before update on categories
  for each row execute function touch_updated_at();
