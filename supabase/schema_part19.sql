-- ============================================================================
-- PART 19 — Branches as a premium feature, enforced at the database.
--
-- Until now, ANY business could create unlimited branches — there was no
-- concept of a plan or premium feature anywhere in the schema. This adds
-- one, and — critically — enforces it as a Postgres RLS policy on the
-- `branches` table itself, not just something the frontend can choose to
-- hide. A restrictive INSERT policy cannot be bypassed by editing a URL,
-- calling the API directly, or disabling JavaScript: Postgres itself
-- refuses the insert unless the flag is set (or it's the business's very
-- first branch, which every business needs regardless of plan).
-- ============================================================================

alter table businesses add column if not exists branches_enabled boolean not null default false;

create table if not exists feature_requests (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  feature text not null, -- currently only 'branches', kept generic for future premium features
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  requested_by uuid references profiles(id),
  reason text, -- the shop owner's stated reason for requesting it
  admin_reason text, -- the admin's stated reason for approving/rejecting
  decided_by uuid references auth.users(id),
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists feature_requests_business_idx on feature_requests(business_id);
create index if not exists feature_requests_status_idx on feature_requests(status);

alter table feature_requests enable row level security;

-- A shop's own users can see and file requests for their own business —
-- but never decide one themselves (no status/decided_* columns are
-- writable by this policy; only the admin RPC below can move status).
create policy feature_requests_isolation on feature_requests for select
  using (business_id = auth_business_id());
create policy feature_requests_insert on feature_requests for insert
  with check (business_id = auth_business_id() and status = 'pending' and decided_by is null);

-- Platform admin sees and decides every request.
create policy feature_requests_admin on feature_requests for all
  using (is_platform_admin());

drop trigger if exists feature_requests_touch_updated_at on feature_requests;
create trigger feature_requests_touch_updated_at before update on feature_requests
  for each row execute function touch_updated_at();

-- THE actual gate. A restrictive policy is AND'ed with the existing
-- permissive `branches_isolation` policy rather than replacing it — the
-- normal isolation rule still applies, this just narrows INSERT further.
-- Allows: the business's first branch always (every business needs one to
-- operate, regardless of plan), or any further branch once
-- businesses.branches_enabled is true.
create policy branches_premium_gate on branches as restrictive for insert
with check (
  (select branches_enabled from businesses where id = branches.business_id) = true
  or (select count(*) from branches b where b.business_id = branches.business_id) = 0
);

-- Called by the platform admin (from Admin Portal) to approve or reject a
-- request. Approving flips businesses.branches_enabled on automatically —
-- there is no separate "now go enable it" step to forget.
create or replace function admin_decide_feature_request(p_request_id uuid, p_approve boolean, p_admin_reason text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_business_id uuid;
  v_feature text;
begin
  if not is_platform_admin() then
    raise exception 'Not authorized';
  end if;

  select business_id, feature into v_business_id, v_feature
  from feature_requests where id = p_request_id and status = 'pending';
  if v_business_id is null then
    raise exception 'Request not found or already decided';
  end if;

  update feature_requests
    set status = case when p_approve then 'approved' else 'rejected' end,
        admin_reason = p_admin_reason, decided_by = auth.uid(), decided_at = now()
    where id = p_request_id;

  if p_approve and v_feature = 'branches' then
    update businesses set branches_enabled = true where id = v_business_id;
  end if;

  insert into admin_actions (admin_id, action, entity_type, entity_id, reason)
  values (auth.uid(), case when p_approve then 'feature_request_approved' else 'feature_request_rejected' end,
          'feature_request', p_request_id, p_admin_reason);
end;
$$;
revoke all on function admin_decide_feature_request(uuid, boolean, text) from public;
grant execute on function admin_decide_feature_request(uuid, boolean, text) to authenticated;

-- Called by the admin to pause/reactivate branches access for a business
-- that already has it (independent of the one-time request/approval
-- above — e.g. a lapsed subscription). Pausing only blocks CREATING new
-- branches (via the restrictive policy above); every existing branch and
-- all of its historical data is untouched and reads normally either way.
create or replace function admin_set_branches_enabled(p_business_id uuid, p_enabled boolean, p_reason text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not is_platform_admin() then
    raise exception 'Not authorized';
  end if;
  update businesses set branches_enabled = p_enabled where id = p_business_id;
  insert into admin_actions (admin_id, action, entity_type, entity_id, reason)
  values (auth.uid(), case when p_enabled then 'branches_activated' else 'branches_paused' end,
          'business', p_business_id, p_reason);
end;
$$;
revoke all on function admin_set_branches_enabled(uuid, boolean, text) from public;
grant execute on function admin_set_branches_enabled(uuid, boolean, text) to authenticated;
