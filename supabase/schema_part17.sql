-- ============================================================================
-- PART 17 — Server-authoritative timestamp for the sync watermark.
--
-- src/lib/sync.ts advanced its "lastSync" cursor using the CLIENT device's
-- clock, captured AFTER the pull's round-trip to Supabase finished. Under
-- clock drift (a phone with the wrong time is common) or simply the network
-- latency of the round-trip itself, a write from another device/branch
-- landing in that gap would be silently skipped on the next sync — it
-- looks like "my changes aren't syncing" with no error anywhere, because
-- nothing failed; the cursor just moved past it.
--
-- This adds a trivial function returning the DATABASE's clock, captured by
-- the client BEFORE it runs any of the per-table pull queries, so the next
-- watermark is anchored to Postgres's own `now()` rather than the device's.
-- ============================================================================

create or replace function current_db_time()
returns timestamptz
language sql
stable
as $$
  select now();
$$;
grant execute on function current_db_time() to authenticated;
