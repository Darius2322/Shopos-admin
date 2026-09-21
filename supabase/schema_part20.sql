-- ============================================================================
-- PART 20 — Connected Devices.
--
-- Nothing in this app tracked sessions or devices at all before this —
-- there was no data source for a "connected devices" screen to show. This
-- adds one: each browser/device that logs in gets a row, kept fresh by a
-- client-side heartbeat while the app is open, so it can be listed with a
-- real online/recently-active/offline status.
--
-- This is visibility only — it does not add a remote "sign this device
-- out" control. A real one would need to revoke that device's specific
-- Supabase session, which the client SDK doesn't expose (only
-- admin.auth.admin.signOut(userId), which signs out ALL of that user's
-- devices at once — a mismatched, much blunter capability than "remove
-- this one device"). Shipping a button that looks like it does the
-- precise thing but actually does something broader would be worse than
-- not having the button.
-- ============================================================================

create table if not exists device_sessions (
  id uuid primary key, -- client-generated, persisted in this browser's localStorage — identifies the DEVICE, not one login
  business_id uuid not null references businesses(id) on delete cascade,
  profile_id uuid not null references profiles(id) on delete cascade,
  branch_id uuid references branches(id) on delete set null,
  device_name text not null,
  device_type text not null check (device_type in ('mobile', 'tablet', 'desktop')),
  user_agent text,
  last_active_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create index if not exists device_sessions_business_idx on device_sessions(business_id);
create index if not exists device_sessions_profile_idx on device_sessions(profile_id);

alter table device_sessions enable row level security;

-- Anyone in the business can see the list (read-only visibility, nothing
-- sensitive beyond device name/type/last-active).
create policy device_sessions_read on device_sessions for select
  using (business_id = auth_business_id());

-- A user may only create/update/delete THEIR OWN device's row — never
-- another profile's. This is what stops one cashier from tampering with
-- (or deleting) another employee's session record.
create policy device_sessions_write_own on device_sessions for insert
  with check (business_id = auth_business_id() and profile_id = auth.uid());
create policy device_sessions_update_own on device_sessions for update
  using (profile_id = auth.uid()) with check (profile_id = auth.uid());
create policy device_sessions_delete_own on device_sessions for delete
  using (profile_id = auth.uid());

create policy device_sessions_admin_read on device_sessions for select using (is_platform_admin());
