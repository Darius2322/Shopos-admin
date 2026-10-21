-- ============================================================================
-- PART 5 — Onboarding progress (replaces manual SQL setup for new owners)
-- Additive only — safe to run against your existing project.
-- ============================================================================

alter table businesses add column if not exists onboarding_step int not null default 0;
alter table businesses add column if not exists onboarding_completed boolean not null default false;

-- Existing businesses (created before this column existed, including any
-- set up by hand via SQL) are treated as already onboarded — they should
-- never be forced into the wizard retroactively.
update businesses set onboarding_completed = true where onboarding_completed = false and created_at < now();
