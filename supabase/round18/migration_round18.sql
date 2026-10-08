-- Round 18: phone-scans-desktop device linking, database health/capacity, soft-delete listing.

-- 1) Device link: a signed-in device can now OFFER a code (QR) that a new phone scans.
alter table public.device_link_requests drop constraint if exists device_link_requests_status_check;
alter table public.device_link_requests add constraint device_link_requests_status_check
  check (status = any (array['pending','approved','used','cancelled','offer','claimed']));
alter table public.device_link_requests
  add column if not exists offered_by uuid,
  add column if not exists claim_secret_hash text,
  add column if not exists claim_label text,
  add column if not exists claim_ua text,
  add column if not exists claim_ip_hash text,
  add column if not exists claimed_at timestamptz;

-- 2) Database plan size (editable by platform admins). Supabase free plan = 500 MB.
alter table public.platform_settings add column if not exists db_limit_mb integer not null default 500;

-- 3) Overview used by the admin Database menu.
create or replace function public.admin_db_overview() returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  lim bigint; sz bigint; remaining bigint; used_pct numeric;
  tbls jsonb; cap jsonb; health jsonb; info jsonb;
  w_sales numeric; w_items numeric; w_pay numeric; w_prod numeric; w_move numeric; w_cust numeric;
  n_sales bigint; n_items bigint; n_biz bigint; biz_bytes numeric;
  hit numeric; conns int; maxc int; dead bigint; live bigint; longq int; idle_tx int; no_rls int;
  status text := 'good'; notes jsonb := '[]'::jsonb;
begin
  if not is_platform_admin() then raise exception 'Not authorized'; end if;
  select coalesce(db_limit_mb, 500)::bigint * 1048576 into lim from platform_settings where id = 'default';
  lim := coalesce(lim, 500::bigint * 1048576);
  sz := pg_database_size(current_database());
  remaining := greatest(lim - sz, 0);
  used_pct := round((sz::numeric / nullif(lim, 0)) * 100, 2);

  -- per-table: rows, size, estimated bytes per row (24-byte header + average column widths, x1.6 for indexes/overhead)
  with t as (
    select c.oid, c.relname,
           coalesce(s.n_live_tup, 0) live, coalesce(s.n_dead_tup, 0) dead,
           pg_total_relation_size(c.oid) bytes,
           s.last_autovacuum, s.last_autoanalyze, s.last_analyze, s.last_vacuum,
           (24 + coalesce((select sum(avg_width) from pg_stats p where p.schemaname = 'public' and p.tablename = c.relname), 40)) * 1.6 as row_bytes,
           exists (select 1 from information_schema.columns k where k.table_schema = 'public' and k.table_name = c.relname and k.column_name = 'business_id') scoped
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace and n.nspname = 'public'
    left join pg_stat_user_tables s on s.relid = c.oid
    where c.relkind = 'r'
  )
  select
    coalesce(jsonb_agg(jsonb_build_object('name', relname, 'rows', live, 'bytes', bytes, 'dead', dead,
      'row_bytes', round(row_bytes), 'scoped', scoped,
      'last_maintained', greatest(last_autovacuum, last_vacuum, last_autoanalyze, last_analyze)) order by bytes desc), '[]'::jsonb),
    sum(live) filter (where relname = 'sales'), sum(live) filter (where relname = 'sale_items'),
    max(row_bytes) filter (where relname = 'sales'), max(row_bytes) filter (where relname = 'sale_items'),
    max(row_bytes) filter (where relname = 'payments'), max(row_bytes) filter (where relname = 'products'),
    max(row_bytes) filter (where relname = 'inventory_movements'), max(row_bytes) filter (where relname = 'customers'),
    sum(live * row_bytes) filter (where scoped and relname <> 'businesses'),
    sum(dead), sum(live)
  into tbls, n_sales, n_items, w_sales, w_items, w_pay, w_prod, w_move, w_cust, biz_bytes, dead, live
  from t;

  select count(*) into n_biz from businesses where deleted_at is null;

  cap := jsonb_build_object(
    'remaining_bytes', remaining,
    'bytes_per_sale', round(coalesce(w_sales, 200) + greatest(coalesce(n_items::numeric / nullif(n_sales, 0), 3), 1) * coalesce(w_items, 150) + coalesce(w_pay, 150)),
    'bytes_per_product', round(coalesce(w_prod, 300) + coalesce(w_move, 150)),
    'bytes_per_customer', round(coalesce(w_cust, 250)),
    'bytes_per_business_actual', case when n_biz > 0 then round(coalesce(biz_bytes, 0) / n_biz) else 0 end,
    'businesses', n_biz
  );

  select round(case when (blks_hit + blks_read) = 0 then 100 else blks_hit::numeric * 100 / (blks_hit + blks_read) end, 2)
    into hit from pg_stat_database where datname = current_database();
  select count(*) into conns from pg_stat_activity where datname = current_database();
  maxc := current_setting('max_connections')::int;
  select count(*) into longq from pg_stat_activity where datname = current_database() and state = 'active' and now() - query_start > interval '5 minutes';
  select count(*) into idle_tx from pg_stat_activity where datname = current_database() and state = 'idle in transaction' and now() - state_change > interval '5 minutes';
  select count(*) into no_rls from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity;

  if used_pct >= 90 then status := 'critical'; notes := notes || to_jsonb('Database is ' || used_pct || '% full. Upgrade the plan or free space now.'::text);
  elsif used_pct >= 75 then status := 'watch'; notes := notes || to_jsonb('Database is ' || used_pct || '% full. Plan an upgrade.'::text); end if;
  if hit < 90 and (select coalesce(sum(blks_hit + blks_read), 0) from pg_stat_database where datname = current_database()) > 10000 then
    if status = 'good' then status := 'watch'; end if; notes := notes || to_jsonb('Cache hit rate is low (' || hit || '%).'::text); end if;
  if conns::numeric / maxc > 0.8 then if status = 'good' then status := 'watch'; end if; notes := notes || to_jsonb('Connections are close to the limit.'::text); end if;
  if longq > 0 then if status = 'good' then status := 'watch'; end if; notes := notes || to_jsonb(longq || ' query running for over 5 minutes.'::text); end if;
  if idle_tx > 0 then if status = 'good' then status := 'watch'; end if; notes := notes || to_jsonb(idle_tx || ' connection stuck idle in a transaction.'::text); end if;
  if live > 1000 and dead::numeric / nullif(live + dead, 0) > 0.2 then if status = 'good' then status := 'watch'; end if; notes := notes || to_jsonb('Many dead rows. Run "Refresh statistics" and let vacuum catch up.'::text); end if;
  if no_rls > 0 then status := 'critical'; notes := notes || to_jsonb(no_rls || ' table(s) without row-level security.'::text); end if;

  health := jsonb_build_object('status', status, 'notes', notes, 'cache_hit_pct', hit, 'connections', conns, 'max_connections', maxc,
    'long_queries', longq, 'idle_in_transaction', idle_tx, 'tables_without_rls', no_rls,
    'dead_rows', dead, 'live_rows', live);

  info := jsonb_build_object(
    'version', split_part(version(), ' on ', 1),
    'started_at', pg_postmaster_start_time(),
    'size_bytes', sz, 'limit_bytes', lim, 'used_pct', used_pct,
    'extensions', (select count(*) from pg_extension),
    'tables', (select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relkind = 'r'),
    'timezone', current_setting('TimeZone'),
    'app_events', (select count(*) from app_events),
    'expired_link_requests', (select count(*) from device_link_requests where created_at < now() - interval '1 day'),
    'stale_rate_limits', (select count(*) from rate_limits where updated_at < now() - interval '1 day'),
    'soft_deleted', (select count(*) from businesses where deleted_at is not null),
    'soft_deleted_overdue', (select count(*) from businesses where deleted_at is not null and purge_after is not null and purge_after < now())
  );

  return jsonb_build_object('info', info, 'health', health, 'capacity', cap, 'tables', tbls);
end $$;

-- 4) Quick actions: a fixed list of safe maintenance jobs. Nothing else can be run from the admin.
create or replace function public.admin_db_action(p_action text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare n bigint := 0; msg text;
begin
  if not is_platform_admin() then raise exception 'Not authorized'; end if;
  if p_action = 'analyze' then
    analyze; msg := 'Statistics refreshed.';
  elsif p_action = 'purge_events' then
    delete from app_events where created_at < now() - interval '30 days'; get diagnostics n = row_count; msg := n || ' old monitor event(s) removed.';
  elsif p_action = 'purge_rate_limits' then
    delete from rate_limits where updated_at < now() - interval '1 day'; get diagnostics n = row_count; msg := n || ' stale rate-limit counter(s) removed.';
  elsif p_action = 'purge_link_requests' then
    delete from device_link_requests where created_at < now() - interval '1 day'; get diagnostics n = row_count; msg := n || ' expired device-link code(s) removed.';
  elsif p_action = 'purge_site_visits' then
    delete from site_visits where created_at < now() - interval '180 days'; get diagnostics n = row_count; msg := n || ' visit record(s) older than 180 days removed.';
  else
    raise exception 'Unknown action';
  end if;
  insert into admin_actions (admin_id, action, entity_type, reason) values (auth.uid(), 'db_' || p_action, 'database', msg);
  return jsonb_build_object('ok', true, 'rows', n, 'message', msg);
end $$;

create or replace function public.admin_set_db_limit(p_mb integer) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_platform_admin() then raise exception 'Not authorized'; end if;
  if p_mb is null or p_mb < 100 or p_mb > 1000000 then raise exception 'Enter a size between 100 MB and 1,000,000 MB'; end if;
  update platform_settings set db_limit_mb = p_mb, updated_at = now() where id = 'default';
  insert into admin_actions (admin_id, action, entity_type, reason) values (auth.uid(), 'db_limit_changed', 'database', 'Plan size set to ' || p_mb || ' MB');
end $$;

-- 5) Soft-deleted businesses (including those whose 30 days have ended).
create or replace function public.admin_deleted_businesses() returns table (
  id uuid, name text, owner_email text, deleted_at timestamptz, deletion_reason text, status_before_delete text,
  purge_after timestamptz, days_left integer, overdue boolean, products bigint, sales bigint, staff bigint
) language plpgsql security definer set search_path = public as $$
begin
  if not is_platform_admin() then raise exception 'Not authorized'; end if;
  return query
  select b.id, b.name, (select u.email::text from auth.users u where u.id = b.owner_id), b.deleted_at, b.deletion_reason, b.status_before_delete,
         b.purge_after,
         case when b.purge_after is null then null else ceil(extract(epoch from (b.purge_after - now())) / 86400)::int end,
         (b.purge_after is not null and b.purge_after < now()),
         (select count(*) from products p where p.business_id = b.id),
         (select count(*) from sales s where s.business_id = b.id),
         (select count(*) from profiles pr where pr.business_id = b.id)
  from businesses b where b.deleted_at is not null order by b.deleted_at desc;
end $$;

create or replace function public.admin_extend_purge(p_business_id uuid, p_days integer) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_platform_admin() then raise exception 'Not authorized'; end if;
  if p_days is null or p_days < 1 or p_days > 365 then raise exception 'Choose between 1 and 365 days'; end if;
  update businesses set purge_after = greatest(coalesce(purge_after, now()), now()) + make_interval(days => p_days)
   where id = p_business_id and deleted_at is not null;
  if not found then raise exception 'That business is not in the soft-deleted list'; end if;
  insert into admin_actions (admin_id, action, entity_type, entity_id, reason) values (auth.uid(), 'business_retention_extended', 'business', p_business_id, 'Held for ' || p_days || ' more day(s)');
end $$;

revoke execute on function public.admin_db_overview() from public, anon;
revoke execute on function public.admin_db_action(text) from public, anon;
revoke execute on function public.admin_set_db_limit(integer) from public, anon;
revoke execute on function public.admin_deleted_businesses() from public, anon;
revoke execute on function public.admin_extend_purge(uuid, integer) from public, anon;
grant execute on function public.admin_db_overview() to authenticated;
grant execute on function public.admin_db_action(text) to authenticated;
grant execute on function public.admin_set_db_limit(integer) to authenticated;
grant execute on function public.admin_deleted_businesses() to authenticated;
grant execute on function public.admin_extend_purge(uuid, integer) to authenticated;
