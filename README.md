# ShopOS Admin

Platform administrator portal — a separate app from `../shopos`, never linked
from inside it, gated by the `platform_admins` table (populated manually in
Supabase, no self-serve admin signup).

## Phase 1 (this round)

The portal was previously three thin sections (Owner Requests, Businesses,
Support) with no dashboard, no branch visibility, and no activation
management beyond what the approve-owner flow produced once. This round
added:

- **Dashboard** — platform-wide counts (businesses by status, branches,
  owners, employees, pending owner requests) and a recently-registered list
- **Owner Requests** — reject/request-info now record a reason and go
  through `admin_decide_owner_request()`, and status includes
  `info_requested`, not just pending/approved/rejected
- **Businesses → detail view** — click into a business to see its owner,
  branches, and employees, and to change status (activate/pause/suspend)
  with a required reason, logged to `admin_actions`
- **Activation management** — inside a business's detail view: see
  outstanding/expired/used codes (`admin_otp_status`, exposes attempts and
  expiry only — never the hash), regenerate (`admin_generate_otp`), or
  revoke (`admin_revoke_otp`) a code
- **Branches** — every branch across every business in one searchable list,
  linking back into that business's detail view
- **Audit Logs** — two tabs: platform-level `admin_actions` (every admin
  decision, with reason) and per-business `audit_log` (tenant activity),
  both admin-readable now via new RLS policies

### Required migration

Run `../shopos/supabase/schema_part7.sql` once, after parts 1–6, against
your existing Supabase project. It's additive — adds `admin_actions`, an
`owner_requests.decision_reason` column, the `info_requested` status, and
the `admin_*` security-definer functions listed above. Doesn't touch
existing data.

### Still not built (later phases)

Full **Branch Profile** drill-down (today/weekly/monthly sales, inventory
value, stock movements, per-branch daily closings) — the current Businesses
→ Branches view is a list with status only, not the full profile the spec
describes. Platform-wide **Analytics** and **Platform Settings** sections.
Notice board admin controls (platform-wide notices). These need either new
read paths into sales/inventory data scoped for admin, or, in the case of
Platform Settings, deciding what's actually configurable — worth scoping
together before building rather than guessing.

## Setup

Same as `../shopos`: `npm install`, copy `.env.example` to `.env` with your
Supabase URL + anon key, `npm run dev`. Deploy as its own Vercel project
(separate from the main app) with the same two env vars, per the main
README's "Deploying the admin portal" section.
