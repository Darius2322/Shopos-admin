# ShopOS Admin — App Update System files

Complete, final versions of the files touched — drop into your repo at the
matching path under `src/`, commit, deploy.

Adds an **App Updates** tab: create/edit/publish/unpublish/delete release
entries for either the ShopOS app or the admin portal, from one screen. The
target app is required per release and locked once created, so a ShopOS-app
release can't drift into showing as an admin-portal release or vice versa.

No new dependencies — uses the same Supabase client and `Card`/`ErrorText`/
`Skeleton`/`StatusBadge` components already in the project.

See the main `shopos-app-changes.zip` README for the full picture of what's
done across both apps.

## Admin portal §15–21 progress (this pass)

**Two new database functions** (already applied live:
`phase29_admin_business_stats`) — `admin_business_usage(business_id)` and
`admin_platform_totals()`. Needed because `sales` has no admin-read RLS
policy (unlike `businesses`/`profiles`/`device_sessions`/`audit_log`/
`security_events`, which already do) — rather than opening broad read
access to every business's raw sale rows, these return only the aggregate
counts the admin portal needs, consistent with every other `admin_*`
function in your schema.

- **§16 Dashboard** — added new businesses (7d), active-today/week/month
  (from `businesses.last_active_at`, already tracked), total sales
  processed + transactions + today's sales (via the new RPC), total/active
  users, unpublished-release count. **Not added:** "system errors" and
  "failed sync events" — there's no server-side table for either (sync
  failures are local-device state by definition), so I left them out rather
  than fabricate a number.
- **§17 Business Detail** — new "Usage & activity" section: last active,
  last sale, and counts for products/customers/sales/debts/quotations/
  invoices/expenses/users, plus a recent-activity list from the audit log.
- **§18–19 Login/activity analytics** — the Audit Logs page now has a third
  tab, "Logins & security," pulling from `security_events` (successful vs.
  failed logins, with counts), plus a shared date filter (today/7d/30d/all)
  across all three tabs.
- **§20 Business search & filtering** — added search by name/email/phone,
  an activity filter (active in 7d/30d, inactive 30+ days), a registration
  date range, and a per-business user count in the list.
- **§21 System logs** — the date filter above extends to admin actions and
  business activity too, not just security events.

**Not done:** §15's actual visual redesign (typography, spacing, color
system) — everything above is functional/data work on the existing look,
not a restyle. That's still a dedicated pass if you want it.
