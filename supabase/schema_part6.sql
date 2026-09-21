-- ============================================================================
-- PART 6 — Digital Notice Board
-- Additive only — safe to run against your existing project.
-- ============================================================================

create table notices (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  branch_id uuid references branches(id) on delete cascade, -- null = whole business
  target_role text, -- null = all roles; otherwise one of the profile role values
  target_user_id uuid references auth.users(id), -- null = not targeted at one person
  created_by uuid references auth.users(id),
  title text not null,
  body text not null,
  category text not null default 'announcement'
    check (category in ('announcement','staff_notice','meeting','training','policy','reminder','maintenance','emergency')),
  pinned boolean not null default false,
  published_at timestamptz not null default now(),
  scheduled_for timestamptz,
  expires_at timestamptz,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table notice_acknowledgements (
  id uuid primary key default gen_random_uuid(),
  notice_id uuid not null references notices(id) on delete cascade,
  user_id uuid not null references auth.users(id),
  acknowledged_at timestamptz not null default now(),
  unique (notice_id, user_id)
);

alter table notices enable row level security;
alter table notice_acknowledgements enable row level security;

-- Business Owner/System Administrator can create business-wide platform
-- notices too; for this build, notices are always business-scoped (no
-- platform-wide notice from the admin portal yet — see README).
create policy notices_manage on notices for insert with check (
  business_id = auth_business_id() and auth_role() in ('owner','manager')
);
create policy notices_update on notices for update using (
  business_id = auth_business_id() and auth_role() in ('owner','manager')
);
create policy notices_delete on notices for delete using (
  business_id = auth_business_id() and auth_role() in ('owner','manager')
);

-- Read access: a profile sees a notice if it's targeted at their whole
-- business, their specific branch, their role, or them personally.
create policy notices_read on notices for select using (
  business_id = auth_business_id()
  and (
    branch_id is null
    or auth_role() in ('owner','manager')
    or exists (select 1 from profile_branches pb where pb.profile_id = auth.uid() and pb.branch_id = notices.branch_id)
  )
  and (target_role is null or target_role = auth_role())
  and (target_user_id is null or target_user_id = auth.uid())
);

create policy notice_ack_own on notice_acknowledgements for all using (
  user_id = auth.uid()
  or exists (select 1 from notices n where n.id = notice_id and n.business_id = auth_business_id() and auth_role() in ('owner','manager'))
);

create trigger notices_touch before update on notices for each row execute function touch_updated_at();
