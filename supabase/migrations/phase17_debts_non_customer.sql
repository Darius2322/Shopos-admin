alter table debts alter column customer_id drop not null;
alter table debts add column if not exists debtor_name text;
alter table debts add column if not exists debtor_phone text;
alter table debts add column if not exists reason text;
alter table debts add column if not exists notes text;
alter table debts add column if not exists debt_date date not null default current_date;
alter table debts add column if not exists source text not null default 'sale';
alter table debts drop constraint if exists debts_source_check;
alter table debts add constraint debts_source_check check (source in ('sale','manual'));
alter table debts drop constraint if exists debts_has_debtor_check;
alter table debts add constraint debts_has_debtor_check
  check (customer_id is not null or length(trim(coalesce(debtor_name, ''))) > 0);
create index if not exists debts_business_status_idx on debts (business_id, status);
create index if not exists debts_business_due_idx on debts (business_id, due_date) where status <> 'paid';
create index if not exists payments_debt_idx on payments (debt_id) where debt_id is not null;

create or replace function audit_debt_changes() returns trigger language plpgsql security definer set search_path = public as $$
declare v_action text; v_prev text; v_new text;
begin
  if auth.uid() is null then return new; end if;
  if tg_op = 'INSERT' then
    if new.source <> 'manual' then return new; end if;
    v_action := 'debt_created';
    v_new := jsonb_build_object('amount', new.original_amount, 'due', new.due_date, 'debtor', coalesce(new.debtor_name, 'customer'))::text;
  else
    if (old.original_amount, old.paid_amount, old.due_date, old.status, old.debtor_name, old.debtor_phone, old.reason)
       is not distinct from (new.original_amount, new.paid_amount, new.due_date, new.status, new.debtor_name, new.debtor_phone, new.reason) then
      return new;
    end if;
    v_action := case when new.paid_amount > old.paid_amount then 'debt_payment' else 'debt_updated' end;
    v_prev := jsonb_build_object('amount', old.original_amount, 'paid', old.paid_amount, 'due', old.due_date, 'status', old.status)::text;
    v_new  := jsonb_build_object('amount', new.original_amount, 'paid', new.paid_amount, 'due', new.due_date, 'status', new.status)::text;
  end if;
  insert into audit_log (business_id, branch_id, user_id, action, entity_type, entity_id, previous_value, new_value)
  values (new.business_id, new.branch_id, auth.uid(), v_action, 'debt', new.id, v_prev, v_new);
  return new;
end $$;
drop trigger if exists debts_audit on debts;
create trigger debts_audit after insert or update on debts for each row execute function audit_debt_changes();
