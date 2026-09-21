-- ============================================================================
-- PART 8 — profile_branches syncability
--
-- profile_branches existed since Part 1 (schema.sql) with only a composite
-- primary key (profile_id, branch_id), no `id` and no `updated_at`. The
-- generic sync engine (src/lib/sync.ts) needs a single-column `id` to
-- upsert/delete against and a timestamp column to pull incremental changes
-- — exactly the problem `profile_permissions` hit before, fixed the same
-- way there (see README "Fixed this round"). This is the same fix applied
-- to profile_branches, which until now had no Dexie table, no sync mapper,
-- and nothing in the app ever wrote to it — every owner/manager saw every
-- branch regardless of actual assignment.
--
-- Additive: run once, after parts 1-7, against your existing project.
-- ============================================================================

alter table profile_branches add column if not exists id text
  generated always as (profile_id::text || ':' || branch_id::text) stored;
alter table profile_branches add column if not exists updated_at timestamptz not null default now();

-- id wasn't previously unique/PK-enforced as a lookup target on its own;
-- the existing composite primary key already prevents duplicate
-- (profile_id, branch_id) pairs, so this just gives upserts a target.
do $$
begin
  if not exists (
    select 1 from pg_indexes where indexname = 'profile_branches_id_idx'
  ) then
    create unique index profile_branches_id_idx on profile_branches(id);
  end if;
end $$;

-- Keep updated_at fresh on assignment/removal changes (there's no UPDATE
-- path today — rows are only inserted or deleted — but this makes future
-- edits, e.g. changing which profile a row belongs to, behave correctly
-- without another migration).
drop trigger if exists profile_branches_touch on profile_branches;
create trigger profile_branches_touch before update on profile_branches
  for each row execute function touch_updated_at();
