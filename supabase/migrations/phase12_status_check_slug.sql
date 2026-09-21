-- ============================================================================
-- PHASE 12 — add slug to check_owner_request_status()
-- ============================================================================
-- The status-check page can already tell someone their business was
-- approved, but has no way to hand them their shop's actual login link
-- (e.g. shopos-app.vercel.app/login/dad-shop) without a second lookup.
-- Adding slug directly to this existing function's output is the
-- simplest way to make that available on the same screen.
-- ============================================================================

create or replace function check_owner_request_status(p_email text, p_reference_code text)
returns table (business_name text, status text, submitted_at timestamptz, decision_reason text, can_claim boolean, slug text)
language sql
security definer
set search_path = public
stable
as $$
  select r.business_name, r.status, r.created_at, r.decision_reason,
         (r.status = 'approved' and r.claimed_at is null and r.business_id is not null) as can_claim,
         b.slug
  from owner_requests r
  left join businesses b on b.id = r.business_id
  where r.reference_code = upper(trim(p_reference_code))
    and lower(r.email) = lower(trim(p_email));
$$;

revoke all on function check_owner_request_status(text, text) from public;
grant execute on function check_owner_request_status(text, text) to anon, authenticated;

-- ============================================================================
-- VERIFY
-- ============================================================================
-- select * from check_owner_request_status('<email>', '<ref code>');
-- -- should now include a slug column, populated once a business exists
