-- Other apps: a list the ShopOS admin manages, shown to shop owners under More > Other apps.
-- Additive and safe to re-run: one new column on the existing platform_settings row. No data is removed.
-- Reading is already public (platform_settings_public_read); updating is already limited to platform admins.
alter table public.platform_settings add column if not exists other_apps jsonb not null default '[]'::jsonb;
