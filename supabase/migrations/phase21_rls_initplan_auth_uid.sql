-- Wrap auth.uid() in (select ...) in flagged RLS policies (evaluated once per query, not per row).
do $$
declare p record; new_using text; new_check text; stmt text;
begin
  for p in select schemaname, tablename, policyname, qual, with_check from pg_policies
    where schemaname = 'public' and policyname in (
      'employee_payments_isolation','platform_admins_self','webauthn_self','security_events_insert_self','notices_read',
      'notice_ack_own','device_sessions_write_own','device_sessions_delete_own','device_sessions_update_claim',
      'user_active_business_self','businesses_select','businesses_write','businesses_update','businesses_delete',
      'profiles_own_rows','audit_insert','reviews_own_select')
  loop
    new_using := case when p.qual is null or p.qual like '%SELECT auth.uid()%' then p.qual else replace(p.qual, 'auth.uid()', '( SELECT auth.uid() AS uid)') end;
    new_check := case when p.with_check is null or p.with_check like '%SELECT auth.uid()%' then p.with_check else replace(p.with_check, 'auth.uid()', '( SELECT auth.uid() AS uid)') end;
    stmt := format('alter policy %I on %I.%I', p.policyname, p.schemaname, p.tablename);
    if new_using is not null then stmt := stmt || format(' using (%s)', new_using); end if;
    if new_check is not null then stmt := stmt || format(' with check (%s)', new_check); end if;
    if new_using is distinct from p.qual or new_check is distinct from p.with_check then execute stmt; end if;
  end loop;
end $$;
