alter table businesses add column if not exists last_active_at timestamptz;
alter table businesses add column if not exists last_activity_kind text;
create index if not exists businesses_last_active_at_idx on businesses (last_active_at desc nulls last);

create or replace function touch_business_activity(p_business_id uuid, p_kind text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then return; end if;
  if p_kind not in ('login','logout','sale','inventory','dashboard') then return; end if;
  if not exists (select 1 from profiles where user_id = auth.uid() and business_id = p_business_id and status = 'active') then return; end if;
  update businesses set last_active_at = now(), last_activity_kind = p_kind
   where id = p_business_id
     and (last_active_at is null or last_active_at < now() - interval '2 minutes' or p_kind in ('login','logout'));
end $$;
revoke all on function touch_business_activity(uuid, text) from public, anon;
grant execute on function touch_business_activity(uuid, text) to authenticated;

create or replace function protect_business_privileged_columns()
returns trigger language plpgsql set search_path = public as $$
begin
  if current_user not in ('authenticated', 'anon') then return new; end if;
  if is_platform_admin() then return new; end if;
  if tg_op = 'INSERT' then
    new.status := 'pending_activation'; new.activation_expires_at := null; new.branches_enabled := false;
    new.last_active_at := null; new.last_activity_kind := null;
  else
    new.owner_id := old.owner_id; new.status := old.status;
    new.activation_expires_at := old.activation_expires_at; new.branches_enabled := old.branches_enabled;
    new.last_active_at := old.last_active_at; new.last_activity_kind := old.last_activity_kind;
  end if;
  return new;
end $$;
