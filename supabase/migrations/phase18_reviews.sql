create table if not exists reviews (
  id uuid primary key default gen_random_uuid(),
  business_id uuid references businesses(id) on delete set null,
  user_id uuid references auth.users(id) on delete set null,
  author_name text not null,
  business_name text,
  rating smallint not null check (rating between 1 and 5),
  body text not null check (char_length(btrim(body)) between 10 and 1000),
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  verified boolean not null default true,
  created_at timestamptz not null default now(),
  moderated_by uuid references auth.users(id),
  moderated_at timestamptz
);
create unique index if not exists reviews_one_per_business on reviews (business_id) where business_id is not null;
create index if not exists reviews_status_created_idx on reviews (status, created_at desc);
alter table reviews enable row level security;
revoke all on reviews from anon;
drop policy if exists reviews_admin on reviews;
create policy reviews_admin on reviews for all using (is_platform_admin()) with check (is_platform_admin());
drop policy if exists reviews_own_select on reviews;
create policy reviews_own_select on reviews for select using (user_id = auth.uid());

create or replace function get_public_reviews(p_limit int default 50)
returns table (id uuid, author_name text, business_name text, rating smallint, body text, verified boolean, created_at timestamptz)
language sql security definer stable set search_path = public as $$
  select r.id, r.author_name, r.business_name, r.rating, r.body, r.verified, r.created_at
  from reviews r where r.status = 'approved' order by r.created_at desc
  limit least(greatest(coalesce(p_limit, 50), 1), 100);
$$;
revoke all on function get_public_reviews(int) from public;
grant execute on function get_public_reviews(int) to anon, authenticated;

create or replace function submit_review(p_rating int, p_body text) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_business uuid; v_name text; v_biz_name text; v_id uuid;
begin
  if auth.uid() is null then raise exception 'Sign in to leave a review'; end if;
  v_business := auth_business_id();
  if v_business is null then raise exception 'No business found for your account'; end if;
  if auth_role() is distinct from 'owner' then raise exception 'Only the business owner can submit a review'; end if;
  if p_rating is null or p_rating < 1 or p_rating > 5 then raise exception 'Choose a rating from 1 to 5'; end if;
  if p_body is null or char_length(btrim(p_body)) < 10 then raise exception 'Please write at least 10 characters'; end if;
  if char_length(p_body) > 1000 then raise exception 'Please keep your review under 1000 characters'; end if;
  select b.name into v_biz_name from businesses b where b.id = v_business and b.status = 'active';
  if v_biz_name is null then raise exception 'Your business must be active to leave a review'; end if;
  select coalesce(nullif(btrim(p.full_name), ''), 'ShopOS customer') into v_name
    from profiles p where p.user_id = auth.uid() and p.business_id = v_business limit 1;
  begin
    insert into reviews (business_id, user_id, author_name, business_name, rating, body)
    values (v_business, auth.uid(), v_name, v_biz_name, p_rating, btrim(p_body)) returning id into v_id;
  exception when unique_violation then raise exception 'You have already submitted a review for this business';
  end;
  return v_id;
end $$;
revoke all on function submit_review(int, text) from public, anon;
grant execute on function submit_review(int, text) to authenticated;
