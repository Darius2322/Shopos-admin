-- ============================================================================
-- PART 13 — End-of-Day: reopen workflow, discrepancy reason, notes.
--
-- Additive: run once, after parts 1-12, against your existing project.
-- ============================================================================

alter table daily_closings add column if not exists discrepancy_reason text;
alter table daily_closings add column if not exists notes text;
alter table daily_closings add column if not exists reopened_at timestamptz;
alter table daily_closings add column if not exists reopened_by uuid references auth.users(id);
alter table daily_closings add column if not exists reopen_reason text;

-- Snapshot of a closing's state at the moment it's reopened, before the
-- next close overwrites the live row — "keep the original record, log
-- every subsequent change" without a full closings-as-a-list redesign.
-- The live daily_closings row (one per branch per day, per its existing
-- unique constraint) always reflects the CURRENT numbers; this table is
-- the audit trail of what it looked like before each reopen.
create table if not exists daily_closing_history (
  id uuid primary key default gen_random_uuid(),
  daily_closing_id uuid not null references daily_closings(id) on delete cascade,
  business_id uuid not null references businesses(id) on delete cascade,
  snapshot jsonb not null,
  reopened_by uuid references auth.users(id),
  reopen_reason text,
  created_at timestamptz not null default now()
);
alter table daily_closing_history enable row level security;
create policy daily_closing_history_isolation on daily_closing_history for all using (business_id = auth_business_id());

-- Reopens a closed day: only an owner, or a manager, may call this — a
-- cashier cannot undo a closing. Snapshots the current row into history,
-- then marks it reopened; the branch can then submit a fresh close, which
-- overwrites the live totals (schema unchanged there) while this snapshot
-- preserves what it said before.
create or replace function reopen_daily_closing(p_closing_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_closing daily_closings%rowtype;
  v_role text;
begin
  select role into v_role from profiles where id = auth.uid();
  if v_role not in ('owner', 'manager') then
    raise exception 'Only an owner or manager can reopen a closed day';
  end if;
  if p_reason is null or trim(p_reason) = '' then
    raise exception 'A reason is required to reopen a closed day';
  end if;

  select * into v_closing from daily_closings where id = p_closing_id and business_id = auth_business_id();
  if not found then
    raise exception 'Closing not found';
  end if;

  insert into daily_closing_history (daily_closing_id, business_id, snapshot, reopened_by, reopen_reason)
  values (v_closing.id, v_closing.business_id, to_jsonb(v_closing), auth.uid(), p_reason);

  update daily_closings
    set reopened_at = now(), reopened_by = auth.uid(), reopen_reason = p_reason
    where id = p_closing_id;
end;
$$;
revoke all on function reopen_daily_closing(uuid, text) from public;
grant execute on function reopen_daily_closing(uuid, text) to authenticated;
