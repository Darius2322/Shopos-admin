-- Applied to production 2026-09-19 via Supabase MCP (superseded in part by phase16, which extends the guard).
create or replace function protect_business_privileged_columns()
returns trigger language plpgsql set search_path = public as $$
begin
  if current_user not in ('authenticated', 'anon') then return new; end if;
  if is_platform_admin() then return new; end if;
  if tg_op = 'INSERT' then
    new.status := 'pending_activation'; new.activation_expires_at := null; new.branches_enabled := false;
  else
    new.owner_id := old.owner_id; new.status := old.status;
    new.activation_expires_at := old.activation_expires_at; new.branches_enabled := old.branches_enabled;
  end if;
  return new;
end $$;
drop trigger if exists businesses_protect_privileged on businesses;
create trigger businesses_protect_privileged before insert or update on businesses
  for each row execute function protect_business_privileged_columns();
