-- ============================================================================
-- PHASE 1d — two more functions assumed profiles.id = auth.uid():
-- reopen_daily_closing() and next_document_number(). Same root cause as
-- phase1c, different call sites. Sweep of the full schema for
-- "profiles where id = auth.uid()" turned up exactly these two remaining
-- (besides the ones already superseded by phase1/phase1c's redefinitions).
--
-- Both bodies below are the ORIGINAL functions verbatim (checked against
-- schema_part13.sql / schema_part4.sql), with only the profiles lookup
-- line changed — nothing else was altered or dropped.
-- ============================================================================

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
  select role into v_role from profiles where user_id = auth.uid() and business_id = auth_business_id();
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

create or replace function next_document_number(p_business_id uuid, p_doc_type text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_year int := extract(year from now());
  v_next int;
  v_prefix text;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  -- Checks for ANY active membership in p_business_id, not equality with
  -- a single profile row — a caller can now belong to more than one
  -- business, and this must not reject a legitimate one just because it
  -- isn't whichever business happens to be "active" right now.
  if not exists (
    select 1 from profiles where user_id = auth.uid() and business_id = p_business_id and status = 'active'
  ) then
    raise exception 'Not authorized for this business';
  end if;

  insert into document_counters (business_id, doc_type, year, last_number)
  values (p_business_id, p_doc_type, v_year, 1)
  on conflict (business_id, doc_type, year)
  do update set last_number = document_counters.last_number + 1
  returning last_number into v_next;

  v_prefix := case p_doc_type
    when 'receipt' then 'REC'
    when 'quotation' then 'QT'
    when 'invoice' then 'INV'
  end;

  return v_prefix || '-' || v_year || '-' || lpad(v_next::text, 5, '0');
end;
$$;
