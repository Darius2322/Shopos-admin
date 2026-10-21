-- Round 14 (apply once in Supabase → SQL editor if the assistant could not apply it).
-- 1. Installer library: every uploaded version is kept; one per computer type + chip is "current".
alter table public.desktop_releases add column if not exists arch text not null default 'x64';
alter table public.desktop_releases add column if not exists notes text;
alter table public.desktop_releases add column if not exists is_current boolean not null default false;
alter table public.desktop_releases add column if not exists published_at timestamptz;
alter table public.desktop_releases drop constraint if exists desktop_releases_arch_check;
alter table public.desktop_releases add constraint desktop_releases_arch_check check (arch in ('x64','ia32','arm64','universal'));
alter table public.desktop_releases drop constraint if exists desktop_releases_platform_version_key;
drop index if exists public.desktop_releases_platform_version_key;
create unique index if not exists desktop_releases_platform_arch_version on public.desktop_releases (platform, arch, version);
create unique index if not exists desktop_releases_one_current on public.desktop_releases (platform, arch) where is_current;

create or replace function public.admin_set_current_desktop_release(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare r public.desktop_releases;
begin
  if not is_platform_admin() then raise exception 'Not authorized'; end if;
  select * into r from public.desktop_releases where id = p_id;
  if not found then raise exception 'Installer not found'; end if;
  update public.desktop_releases set is_current = false where platform = r.platform and arch = r.arch and is_current and id <> p_id;
  update public.desktop_releases set is_current = true, published = true, published_at = now() where id = p_id;
  insert into admin_actions (admin_id, action, entity_type, entity_id, reason) values (auth.uid(), 'desktop_release_current', 'desktop_release', p_id, r.platform || ' ' || r.arch || ' ' || r.version);
end $$;

create or replace function public.admin_unpublish_desktop_release(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not is_platform_admin() then raise exception 'Not authorized'; end if;
  update public.desktop_releases set published = false, is_current = false where id = p_id;
  if not found then raise exception 'Installer not found'; end if;
  insert into admin_actions (admin_id, action, entity_type, entity_id) values (auth.uid(), 'desktop_release_unpublish', 'desktop_release', p_id);
end $$;

-- 2. Decisions can be turned around.
create or replace function public.admin_decide_desktop_request(p_request_id uuid, p_decision text, p_reason text default null, p_valid_days integer default 30)
returns void language plpgsql security definer set search_path = public as $$
declare cur public.desktop_setup_requests;
begin
  if not is_platform_admin() then raise exception 'Not authorized'; end if;
  if p_decision not in ('approve','reject','revoke','reopen') then raise exception 'Unknown decision'; end if;
  select * into cur from public.desktop_setup_requests where id = p_request_id for update;
  if not found then raise exception 'Request not found'; end if;
  if p_decision in ('approve','reopen') and exists (
      select 1 from public.desktop_setup_requests o where o.business_id = cur.business_id and o.platform = cur.platform and o.id <> cur.id and o.status in ('pending','approved')) then
    raise exception 'This shop already has another open request for this computer type. Decide that one first.';
  end if;
  if p_decision = 'approve' then
    if cur.status not in ('pending','rejected','revoked') then raise exception 'Only pending, rejected or revoked requests can be approved'; end if;
    update public.desktop_setup_requests set status='approved', admin_reason=p_reason, decided_by=auth.uid(), decided_at=now(),
      expires_at = now() + make_interval(days => greatest(1, least(coalesce(p_valid_days,30), 365))) where id = p_request_id;
  elsif p_decision = 'reject' then
    if cur.status <> 'pending' then raise exception 'Only a pending request can be rejected. Use revoke for an approved one.'; end if;
    update public.desktop_setup_requests set status='rejected', admin_reason=p_reason, decided_by=auth.uid(), decided_at=now(), expires_at=null where id = p_request_id;
  elsif p_decision = 'revoke' then
    if cur.status <> 'approved' then raise exception 'Only an approved request can be revoked'; end if;
    update public.desktop_setup_requests set status='revoked', admin_reason=p_reason, decided_by=auth.uid(), decided_at=now() where id = p_request_id;
  else
    if cur.status not in ('rejected','revoked','approved') then raise exception 'Nothing to reopen'; end if;
    update public.desktop_setup_requests set status='pending', admin_reason=null, decided_by=null, decided_at=null, expires_at=null where id = p_request_id;
  end if;
  insert into admin_actions (admin_id, action, entity_type, entity_id, reason) values (auth.uid(), 'desktop_setup_' || p_decision, 'desktop_setup_request', p_request_id, p_reason);
end $$;

-- Registration applications and feature requests: send a rejected one back to pending, then approve it the usual way.
create or replace function public.admin_reopen_owner_request(p_request_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not is_platform_admin() then raise exception 'Not authorized'; end if;
  update public.owner_requests set status='pending', decided_by=null, decided_at=null, decision_reason=null
    where id = p_request_id and status in ('rejected','info_requested') and claimed_at is null;
  if not found then raise exception 'Only a rejected or info-requested application that has not been claimed can be reopened'; end if;
  insert into admin_actions (admin_id, action, entity_type, entity_id) values (auth.uid(), 'owner_request_reopened', 'owner_request', p_request_id);
end $$;

create or replace function public.admin_reopen_feature_request(p_request_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not is_platform_admin() then raise exception 'Not authorized'; end if;
  update public.feature_requests set status='pending', admin_reason=null, decided_by=null, decided_at=null
    where id = p_request_id and status = 'rejected';
  if not found then raise exception 'Only a rejected request can be reopened'; end if;
  insert into admin_actions (admin_id, action, entity_type, entity_id) values (auth.uid(), 'feature_request_reopened', 'feature_request', p_request_id);
end $$;

revoke all on function public.admin_set_current_desktop_release(uuid), public.admin_unpublish_desktop_release(uuid), public.admin_decide_desktop_request(uuid, text, text, integer), public.admin_reopen_owner_request(uuid), public.admin_reopen_feature_request(uuid) from public, anon;
grant execute on function public.admin_set_current_desktop_release(uuid), public.admin_unpublish_desktop_release(uuid), public.admin_decide_desktop_request(uuid, text, text, integer), public.admin_reopen_owner_request(uuid), public.admin_reopen_feature_request(uuid) to authenticated;
