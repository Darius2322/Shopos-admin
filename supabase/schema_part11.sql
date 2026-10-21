-- ============================================================================
-- PART 11 — Fix owner-request submission, block duplicate applications.
--
-- Additive: run once, after parts 1-10, against your existing project.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- THE ACTUAL BUG BEHIND "Could not submit request":
--
-- Login.tsx's RegisterBusiness did:
--   supabase.from('owner_requests').insert({...}).select('reference_code').single()
--
-- The insert itself was always allowed (owner_requests_insert_anyone, Part
-- 1). But `.select()` chained after `.insert()` makes supabase-js ask
-- PostgREST to read the row back (Prefer: return=representation) — and
-- that read-back is a SELECT, subject to SELECT RLS policies, not the
-- INSERT check. owner_requests has no SELECT policy for anon at all (only
-- owner_requests_admin, gated on is_platform_admin()). So the insert
-- quietly succeeded server-side every time, then the read-back returned
-- zero rows, and .single() on zero rows throws — which is what surfaced
-- as "Could not submit request" in the UI. This means every self-service
-- registration before this fix silently created a real owner_requests row
-- even though the applicant saw an error and got no reference code.
--
-- Fixed by moving submission into a SECURITY DEFINER function instead:
-- its RETURN value isn't a table read subject to RLS at all, so there's no
-- read-back to be blocked. This also gives a natural place to enforce
-- "no second concurrent application per email" (this round's other ask)
-- with a clear error message, and keeps the DB-generated reference code
-- properly encapsulated behind one call.
-- ----------------------------------------------------------------------------

-- generate_reference_code() (Part 9) was never marked security definer —
-- when its internal uniqueness pre-check ran as anon (no SELECT policy
-- available), it silently saw zero existing rows and always "passed" on
-- the first try. Harmless in practice (the column's real UNIQUE
-- constraint still catches an actual collision, and 32^6 possibilities
-- makes that vanishingly rare) but not what the pre-check was meant to
-- do. Fixed for correctness now that submission goes through a
-- security-definer path anyway.
create or replace function generate_reference_code()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_chars text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  v_code text;
  v_exists boolean;
begin
  loop
    v_code := 'SR-';
    for i in 1..6 loop
      v_code := v_code || substr(v_chars, floor(random() * length(v_chars) + 1)::int, 1);
    end loop;
    select exists(select 1 from owner_requests where reference_code = v_code) into v_exists;
    exit when not v_exists;
  end loop;
  return v_code;
end;
$$;

create or replace function submit_owner_request(
  p_full_name text, p_email text, p_phone text, p_business_name text, p_message text default null
)
returns text -- the new reference_code
language plpgsql
security definer
set search_path = public
as $$
declare
  v_existing_ref text;
  v_new_ref text;
begin
  if p_full_name is null or trim(p_full_name) = '' then raise exception 'Full name is required'; end if;
  if p_email is null or trim(p_email) = '' then raise exception 'Email is required'; end if;
  if p_business_name is null or trim(p_business_name) = '' then raise exception 'Business name is required'; end if;

  -- Block a second application while one is still live for this email,
  -- but allow reapplying after a rejection or once already approved —
  -- this is "no second concurrent application", not "this email can
  -- never appear twice in the table".
  select reference_code into v_existing_ref
    from owner_requests
    where lower(email) = lower(trim(p_email)) and status in ('pending', 'info_requested')
    limit 1;
  if v_existing_ref is not null then
    raise exception 'You already have an application in progress with this email (reference %). Check its status instead of submitting again.', v_existing_ref;
  end if;

  v_new_ref := generate_reference_code();

  insert into owner_requests (full_name, email, phone, business_name, message, reference_code)
  values (trim(p_full_name), trim(p_email), nullif(trim(coalesce(p_phone, '')), ''), trim(p_business_name), p_message, v_new_ref);

  return v_new_ref;
end;
$$;
revoke all on function submit_owner_request(text, text, text, text, text) from public;
grant execute on function submit_owner_request(text, text, text, text, text) to anon, authenticated;
