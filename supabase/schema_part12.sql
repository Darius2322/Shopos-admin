-- ============================================================================
-- PART 12 — Platform support contact info (shown on public-facing screens:
-- sign-in, register, check-status).
--
-- Additive: run once, after parts 1-11, against your existing project.
-- ============================================================================

create table if not exists platform_settings (
  id text primary key default 'default',
  support_email text,
  support_whatsapp text, -- phone number in international format, no + or spaces, e.g. 254712345678
  support_phone text,    -- as you'd want it displayed/dialed, e.g. +254712345678
  updated_at timestamptz not null default now()
);

-- Seed the single settings row if it doesn't exist yet, so the admin UI
-- always has a row to update rather than needing an insert-vs-update branch.
insert into platform_settings (id) values ('default') on conflict (id) do nothing;

alter table platform_settings enable row level security;

-- Public read — this is what makes it show up on sign-in/register/status
-- screens for people who aren't logged in at all yet.
create policy platform_settings_public_read on platform_settings for select using (true);
-- Only a platform admin can change it.
create policy platform_settings_admin_write on platform_settings for update using (is_platform_admin());

drop trigger if exists platform_settings_touch on platform_settings;
create trigger platform_settings_touch before update on platform_settings
  for each row execute function touch_updated_at();
