-- ============================================================================
-- PHASE 6a — fix device_sessions sync failures (the "sync isn't working"
-- report + the 75 stuck items in Sync Center)
-- ============================================================================
-- Root cause: src/lib/deviceSessions.ts deliberately reuses ONE device id
-- per browser across every login (comment: "deliberately NOT regenerated
-- per login, so re-logging in on the same phone updates the same device
-- row instead of piling up a new one every time"). That's the right idea
-- for one person's own phone.
--
-- But the existing policy:
--   create policy device_sessions_update_own on device_sessions for update
--     using (profile_id = auth.uid()) with check (profile_id = auth.uid());
--
-- checks the EXISTING row's profile_id, not the new one being written. On
-- a shared device (a shop's till/tablet used by several staff across
-- shifts — normal POS usage), when person B logs in after person A, the
-- client tries to update that same device row to profile_id = B, but the
-- row still belongs to A — so `using (profile_id = auth.uid())` evaluates
-- against A's id, B's auth.uid() doesn't match, and the update is denied.
-- Every retry fails the same way forever, which is exactly the
-- ever-growing "Failed: 75" you're seeing — it's the same handful of
-- shared devices failing the same update on every sync cycle.
--
-- Fix: a device row isn't sensitive data (device name/type/last-active —
-- already visible business-wide via device_sessions_read), so relax
-- UPDATE's USING to "anyone in this business" — that's what actually lets
-- a new login claim a shared device. WITH CHECK still requires
-- profile_id = auth.uid(), so nobody can set the row to claim it AS
-- someone else — you can only ever claim a device as yourself.
-- ============================================================================

begin;

drop policy if exists device_sessions_update_own on device_sessions;

create policy device_sessions_update_claim on device_sessions
  for update
  using (business_id = auth_business_id())
  with check (business_id = auth_business_id() and profile_id = auth.uid());

commit;

-- ============================================================================
-- VERIFY
-- ============================================================================
-- 1. As staff member B, on a device row currently owned by staff member A
--    in the same business: update should now succeed.
-- 2. As staff member B, try setting profile_id to A's id (impersonation
--    attempt) -- must still fail (WITH CHECK still requires = auth.uid()).
-- 3. As staff member C in a DIFFERENT business: update must still fail
--    (business_id check).
-- 4. In the app: clear the stuck queue items after this migration is
--    live -- either wait for the next heartbeat retry, or use "Retry
--    failed" in Sync Center. They should now clear instead of re-failing.
