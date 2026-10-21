-- ============================================================================
-- PART 22 — Rate limits the new self-service "forgot password" email
-- request (see supabase/functions/send-password-reset). It's necessarily
-- public/unauthenticated — someone who forgot their password has no
-- session — which makes it a natural target for spamming a victim's inbox
-- (or running up the sender's Gmail send quota) without this.
-- ============================================================================

create table if not exists password_reset_requests (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  requested_at timestamptz not null default now()
);
create index if not exists password_reset_requests_email_idx on password_reset_requests (lower(email), requested_at);

-- Row Level Security is intentionally NOT enabled here — this table is
-- only ever touched via the security-definer function below, called by
-- the edge function's service-role client, and holds nothing more
-- sensitive than "someone asked to reset this email's password at this
-- time," which the function itself never exposes back to any caller.

-- Returns true if a new request is allowed (and logs it), false if this
-- email has already requested 3 or more resets in the last hour.
create or replace function check_and_log_reset_request(p_email text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_recent_count int;
begin
  select count(*) into v_recent_count
  from password_reset_requests
  where lower(email) = lower(trim(p_email)) and requested_at > now() - interval '1 hour';

  if v_recent_count >= 3 then
    return false;
  end if;

  insert into password_reset_requests (email) values (lower(trim(p_email)));
  return true;
end;
$$;
revoke all on function check_and_log_reset_request(text) from public;
grant execute on function check_and_log_reset_request(text) to anon, authenticated;
