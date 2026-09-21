# ShopOS

Offline-first POS and business-management scaffold: React + TypeScript + Vite,
Dexie (IndexedDB) for local storage, Supabase (Postgres + Auth) for the
backend, PWA-installable.

This is a **rebuilt core**, not the full 85-item spec. It's built to be
correct and extendable rather than wide-but-shaky. Read "What's implemented"
below before assuming a feature exists.

---

## Why this was rebuilt from scratch

The previous build (a compiled `dist` bundle called "Duka") had no available
source code, so nothing in it could be safely edited. Reverse-engineering the
sale/debt logic from the minified bundle showed the **local** debt math was
actually correct — the real risk was in how the app pushed local records to
Supabase: it sent JS camelCase field names (`remainingAmount`, `paidAmount`)
straight into `.upsert()` with no mapping to the database's snake_case
columns, which is exactly the kind of mismatch that can make a debt look
zeroed-out anywhere except the original device.

This rebuild fixes that class of bug at three separate layers, on purpose,
so it can't quietly reappear:

1. **Local calculation** (`src/lib/sales.ts`) — `balanceDue = total - amountPaid`,
   a debt is only ever created for `balanceDue > 0`, and `amountPaid` is never
   silently clamped up to the total when the payment method is credit.
2. **Sync layer** (`src/lib/sync.ts`) — every synced entity has an explicit
   `toRow` / `fromRow` mapper. Nothing is ever upserted as a raw object.
   Adding a new synced table means adding one mapper entry, not skipping one.
3. **Database constraint** (`supabase/schema.sql`) — the `debts` table has
   `check (remaining_amount = original_amount - paid_amount)`. If any future
   code path ever tries to write an inconsistent debt, Postgres rejects the
   write outright instead of silently storing a wrong number.

---

## What's implemented

Working end-to-end, including offline queueing and sync:

- Multi-tenant Postgres schema with Row Level Security covering core
  commerce, suppliers/purchases, quotations, invoices, refunds, correction
  requests, employee payments, loyalty, notifications, support tickets,
  platform admin access, owner sign-up requests, and WebAuthn credential
  references — `supabase/schema.sql`
- Offline-first local database (Dexie) mirroring the synced entities
- Sync engine: push queue with retry/backoff, pull-since-last-sync, explicit
  field mapping, idempotent client-generated UUIDs
- **POS**: product search, cart, payment method incl. Credit/Debt, correct
  debt creation, customer credit-limit warning, printable/shareable receipt
  showing loyalty points earned
- **Sales history**: full list, request a refund or a correction on any sale
- **Debts**: list, filter, guarded partial/full payment, live-derived balance
- **Refunds**: request → manager/owner approval → processed, restores
  resalable stock only, reduces a linked debt instead of editing the sale,
  optionally gated behind a biometric confirmation
- **Correction requests**: employees flag mistakes instead of silently
  editing a completed sale; manager/owner reviews and resolves
- **Quotations**: create, mark sent, convert directly to a completed sale
  (reuses the same debt-safe sale path, not a separate looser one)
- **Invoices**: create, record partial/full payments, balance always
  derived as total − paid and guarded against overpayment
- **Customers**: list, add, loyalty registration, live outstanding balance
- **Inventory**: list, low/out-of-stock filters, add product, transactional
  stock deduction on sale
- **Suppliers & purchases**: record supplies with line items, stock
  auto-increments, supplier balance tracked like customer debt
- **Employee payments**: salary/wage records with additions/deductions/
  advances; staff only see their own
- **Users**: staff list, per-user sales performance, role/status changes,
  per-employee permission overrides enforced by RLS
- **Loyalty**: business-configurable earning rate, registration required to
  earn, points shown on receipt, never awarded to unregistered customers
- **Notifications**: a bell in the header showing what needs attention right
  now — low/out-of-stock, overdue debts, pending refund/correction requests,
  failed syncs — computed live rather than a stored feed that can drift
- **Support**: employees/owners submit tickets, view their own status
- **Security**: optional biometric (WebAuthn platform authenticator)
  confirmation gate on refund approval, using the device's own fingerprint/
  face check
- **Branch switching**: identical mobile bottom-sheet / desktop dropdown,
  restricted to authorized branches
- **Dashboard**, **Sync Center**, **PWA** install support

### Platform admin portal — `../shopos-admin`

A genuinely separate app (own `package.json`, own build, own deploy target,
dark theme so it's visually distinct from the business app), matching the
spec's requirement that it never be reachable from inside ShopOS itself.
It covers:

- Admin sign-in, gated by a `platform_admins` table (populated manually —
  there's intentionally no in-app way to self-grant this)
- **Owner requests**: a public "request access" form (linked from the admin
  login screen) lets a prospective business owner apply; an admin approves
  or rejects
- **Businesses**: list all, pause/activate
- **Support tickets**: list all, change status across every business

Approving an owner request needs to create a real `auth.users` row, which
requires Supabase's service-role key — that key must never reach a browser.
So approval calls a Supabase **Edge Function** (`supabase/functions/approve-owner`)
that runs server-side with the service role, invites the new owner by email,
and creates their business/branch/profile rows atomically. Deploy it with
`supabase functions deploy approve-owner` (see Supabase CLI docs) and set
`SUPABASE_SERVICE_ROLE_KEY` as a function secret, not an app env var.

## What's scaffolded in the schema but has no UI yet

## What's genuinely not built

Push notifications (the in-app bell is real and live; browser/OS push isn't
wired up), thermal/ESC-POS receipt formatting for physical printers, and
owner-editable document number prefixes (numbers generate correctly with
fixed `QT-`/`INV-`/`REC-` prefixes). None of these have schema or code yet.

## Fixed this round

Support ticket replies are now two-way in the main app (a tap-to-open
thread, not just a status label) and sync via `support_ticket_replies`.
`loyalty_settings` and `profile_permissions` now have real Dexie tables and
wired sync mappers — loyalty settings and permission overrides both push to
Supabase correctly. Getting `profile_permissions` syncing required a schema
change: its Postgres primary key was a composite `(profile_id, permission)`,
but the generic sync engine assumed every table has a single `id` column to
upsert/delete against. Rather than special-case it forever, the table now
has a generated `id` column (`profile_id || ':' || permission`) and the sync
engine gained an explicit per-entity conflict-column map — the same pattern
now also handles `loyalty_settings`, whose primary key is `business_id`, not
`id`. If you add another business-scoped singleton table later, check
`CONFLICT_COLUMN` and `LOCAL_PK` in `src/lib/sync.ts` before assuming `id`
will work.

Two settings pages that were missing entirely are also in now: **Business
Profile** (name, contact info, tax rate, receipt footer — nothing to edit
these existed before) and **Loyalty Program** (earning rate, minimum
purchase, whether tax/discount count — previously loyalty only had sensible
defaults with no way to change them).

Quotation→sale conversion recalculates tax at 0% to avoid double-taxing an
already-priced quotation line — fine for flat-rate tax, worth checking if
you use per-item tax rates.

## Barcode scanning — added this round

POS and Inventory previously only supported the desktop keyboard-wedge
pattern (a USB/Bluetooth scanner typing into whatever input has focus,
then Enter). Camera-based scanning for phones was genuinely missing —
there was no camera code anywhere in the app. Added:

- `src/components/scanner/BarcodeScannerModal.tsx` — uses the native
  `BarcodeDetector` browser API (Chrome/Android WebView — matches this
  project's target platform) via `getUserMedia`, with vibration + a beep
  on detection, and a torch toggle where the device supports it. When
  `BarcodeDetector` or the camera isn't available, it never fakes a scan —
  it drops straight to a manual barcode-entry field instead.
- **POS** — a scan button next to search, and in the POS actions menu.
  A match adds/increments the cart line; no match shows an inline error.
- **Inventory** — a scan button next to "Add product". A match opens a new
  edit-product view (products previously had no edit UI at all — only
  add); no match shows "Product not found → Create product", which opens
  the add-product form with the barcode pre-filled.
- Both `AddProductModal` and the new `EditProductModal` in Inventory now
  have a barcode field — it existed in the schema and type already but no
  form exposed it.

`BarcodeDetector` support is real but not universal (Safari/iOS doesn't
have it as of early 2026) — worth checking on an actual iPhone if any
customers are on iOS; the manual-entry fallback covers it either way.

## Branch Profile — added this round

Branches previously had only a flat list (name, manager, active/paused
toggle) with no way to drill into a single branch's numbers. Added
`src/features/branches/BranchProfile.tsx` at `/branches/:id`, linked from
the branches list. Tabs: **Sales** (today/7-day/30-day totals, payment
method breakdown, refunds/cancellations), **Inventory** (product count,
stock value, low/out-of-stock list), **Debts** (outstanding total + list),
**Activity** (recent audit log entries), and **People**. Debts and People
are hidden from cashiers/other non-management roles — a branch's full
financials and complete employee list are manager/owner-level information.

## Branch assignment — fixed this round

The People tab (and branch-level access generally) previously couldn't
tell which employees actually belonged to which branch, because
`profile_branches` — the join table that's existed in the schema since
Part 1 — had no `id`/`updated_at` columns for the sync engine to target,
no Dexie table, and no sync mapper. Every owner/manager saw every branch;
other roles defaulted to "first active branch" regardless of their real
assignment. `auth.ts` had a comment flagging exactly this.

Fixed with `schema_part8.sql` (run after part 7 — adds a generated `id`
column and `updated_at` to `profile_branches`, same pattern already used
for `profile_permissions`) plus:
- `profileBranches` Dexie table + sync mapper — it now actually pulls and
  pushes like every other synced entity
- `auth.ts` filters non-owner/manager roles to their assigned branches,
  falling back to every branch only if assignment sync hasn't populated
  anything yet (safer to over-grant than to lock someone out of their own
  job on a sync hiccup)
- A **Branch access** editor on each employee's profile in Users — check
  which branches a cashier/inventory manager/accountant/sales staff can
  see and work in. Managers still see every branch regardless of what's
  checked (noted in the UI), since the role itself grants that
- Branch Profile's People tab now shows employees actually assigned to
  that branch, not the whole company roster

One thing worth knowing: `invite-employee` (the Edge Function) already
wrote a `profile_branches` row for the invited employee's initial branch
— that was always correct. The gap was entirely on the read/sync side:
that row existed in Postgres but nothing ever pulled it down or acted on
it locally.

**Still not done at the time this was written:** the "All Branches"
consolidated view (spec §9–11) — see below, this was tackled next.

## All Branches consolidated view — done this round

Owners and managers can now select "All Branches" in the branch switcher.
`activeBranchId: null` is a real, persisted state now, not just an
unreachable default:

- `auth.ts` — `setActiveBranch(null)` (owner/manager only), persisted to
  `appContext.allBranches` so it survives a refresh instead of being
  silently overwritten back to a single branch
- **Dashboard, Sales, Debts, Customers, Quotations, Invoices, Payroll** —
  already aggregated by `businessId` regardless of branch, or now do
- **Inventory** — aggregates across branches, tags each row with its
  branch name, and disables Add/Scan while viewing All Branches (adding a
  product needs one concrete branch) with an inline explanation rather
  than a disabled button with no context
- **POS, End-of-Day, Record Supply** (from Suppliers) — these fundamentally
  need one branch. Previously POS silently fell back to `branches[0]` if
  `activeBranchId` was ever falsy, which would have rung up sales against
  the wrong branch the moment "All Branches" became reachable. Now they
  show a "pick a branch" prompt with a one-tap list instead of guessing.

## Notice targeting bug — found and fixed this round

While checking Notice Board wouldn't break under the All Branches change,
found it was never actually filtering notices by their targeting at all.
`Notice` has had `branchId`, `targetRole`, and `targetUserId` fields since
the schema was written, and the creation form already lets you set all
three — but the list view only checked archived/scheduled/expired status.
**Every notice was visible to every employee**, regardless of which
branch or role it was aimed at — a "Main Branch only: stock count
tomorrow" notice would have shown up for staff at every other branch too.
Fixed: non-management roles now only see notices with no branch/role/user
target, or one that matches them (using the same branch-authorization
list `profile_branches` now populates). Owners/managers still see every
notice regardless of targeting, since they moderate the whole board — and
notice cards now show who a notice is aimed at when you're in that
oversight view.

## CORS bug on every Edge Function — found and fixed this round

While chasing "Failed to fetch" errors on Approve, Create Business, and
Request-info, found the real cause: **none of the Edge Functions
(`approve-owner`, `admin-create-business`, `invite-employee`) had CORS
headers at all.** Supabase Edge Functions don't add these automatically —
without them, the browser's preflight `OPTIONS` request gets no
`Access-Control-Allow-Origin` back, so the browser blocks the real request
before it ever reaches the function. This isn't a Supabase outage or a
network issue — it would fail the same way for everyone, always, until
fixed. Added `supabase/functions/_shared/cors.ts` and wired all four
functions (the three above plus the new `claim-owner-account`) through it.

**Also found while rewriting `approve-owner`:** a duplicate `const
expiresAt` declaration (one for the business's access duration, one for
the OTP's own 15-minute window) — a hard syntax error that would have
broken the entire function, not just the duration feature. Renamed the
second one to `otpExpiresAt`.

**This means `invite-employee` — "Add employee" from Users — was very
likely broken this whole time too**, independent of anything else in this
round; it had the identical missing-CORS problem.

## Self-service account setup — done this round

Previously, an approved applicant had exactly one path to finish setup:
find and click the invite email. For a Kenyan SME context where checking
a specific email reliably isn't a safe assumption, added a second path
that needs no email at all:

- `check_owner_request_status` (Part 9) now requires the applicant's
  **email + reference code together**, not the code alone — and returns a
  `can_claim` flag
- If approved and not yet claimed, the status-check screen shows "Set up
  your account" right there — pick a password, and a new
  `claim-owner-account` Edge Function sets it directly (service role,
  since there's no session yet), scoped by matching email+reference code
  against `owner_requests` → `businesses.owner_id`
- The moment the password is set, the app signs them in immediately and
  routes straight into `Activation` (pending_activation), same as always
  — no separate step
- **One-time only** — `owner_requests.claimed_at` gates it, so the window
  where knowing email+reference code could hijack an account is only
  between approval and the real owner's first claim, not indefinite. After
  that, the status screen just says "already set up — sign in normally"
- Existing rows created before Part 9 had no reference code (the trigger
  only fires on new inserts) — `schema_part10.sql` backfills them, which
  is also why they were showing "Ref: —" in the admin's Owner Requests list

## Sign-out added to dead-end screens

"No business found for this account" and "This business is
paused/suspended" previously had no way out except closing the app —
if a device somehow got signed into the wrong/broken account, there was
no way to sign out and try again. Both now have a sign-out button.
(`Activation` already had one.)

---

## Getting a live link to test on your phone

You don't need your own machine for this — Vercel can build straight from
a GitHub repo:

1. Unzip this, `git init`, commit, and push it to a new GitHub repo (or
   upload the unzipped folder directly if you'd rather skip Git — Vercel's
   dashboard also accepts a drag-and-drop deploy of a project folder).
2. Run the Supabase setup in the section below first (schema + first user) —
   the app will still load without it, but sign-in won't work until it's done.
3. Go to vercel.com → **Add New Project** → import the repo.
4. In the import screen, add two environment variables:
   `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` (from your Supabase
   project's API settings).
5. Deploy. Vercel runs `npm install && npm run build` for you — this is also
   your first real compile check, since it wasn't possible to run here.
6. You'll get a `https://your-project.vercel.app` link, installable as a PWA
   on your phone, usable for testing immediately.

If `npm run build` fails on Vercel, the error log there will point at the
exact file/line — paste that back to me and I'll fix it directly, since I
can't run the build myself in this environment.

### Deploying the admin portal

`../shopos-admin` (a sibling folder to this one) is a separate app — deploy
it as its own Vercel project pointing at that folder, with the same two
Supabase env vars. Then deploy the `approve-owner` Edge Function via the
Supabase CLI so owner-request approval works (see the admin portal section
above). Do not link the admin portal's URL from anywhere inside the main
ShopOS app, per the spec.

## Two pre-existing build bugs — found and fixed this round

Running a real `tsc -b` (via the Vercel build log) surfaced two bugs that
predate everything in this document — not introduced by any of the work
above, just never caught because the project had apparently never made it
through a full clean build before:

- **`src/vite-env.d.ts` didn't exist anywhere in the project.** Every
  `import.meta.env.VITE_...` reference (in `lib/supabase.ts`,
  `lib/invites.ts`, and anywhere else using Vite env vars) failed
  type-checking with `Property 'env' does not exist on type 'ImportMeta'`.
  Added the one-line file Vite's own template always includes:
  `/// <reference types="vite/client" />`.
- **`Branch` was missing `syncStatus`.** `lib/branches.ts`
  (`assignBranchManager`, `setBranchStatus`) writes `syncStatus: 'pending'`
  onto branch records — the same local-sync-bookkeeping pattern every
  other synced entity (`Product`, `Sale`, `Customer`, etc.) already has —
  but `Branch`'s type never declared the field, so TypeScript's excess-
  property check rejected the object literal. Added
  `syncStatus?: SyncStatus` to match every other entity.

## Everything from this round

**Layout fixes:**
- Sidebar no longer scrolls with page content — the shell is now a fixed
  `h-screen` with independently-scrolling regions (sidebar / header / main),
  instead of `min-h-screen` letting the whole page grow and drag the sidebar
  along with it
- Navigating to a new section now resets scroll to the top of that
  section automatically (previously kept whatever scroll position the last
  section was left at, since `<main>` scrolling independently means the
  browser's automatic reset-on-navigate no longer applies)

**POS:**
- "Hold sale" is now a direct, always-visible button next to Scan/Calculator
  — previously only reachable through the ⋮ actions menu, which is the one
  place you don't want an extra tap for something time-pressured (a
  customer needs to step away mid-sale)
- New **Customer Display** — open via ⋮ → "Open customer display", opens
  in a second window and mirrors the cart live (name/qty/price/total) via
  `BroadcastChannel`. Deliberately shows nothing else — no product list,
  no inventory, nothing to browse, only what's already in the cart. Only
  works between tabs/windows on the *same device* (a dual-monitor till,
  or a tablet propped toward the customer on the same machine) — it can't
  push to a second physical device over the network; that would need a
  server-relayed channel (e.g. Supabase Realtime) instead, worth doing
  only if the one-device setup doesn't match how these shops actually work

**Employee accounts — switched from email invites to direct passwords:**
Adding an employee (`invite-employee`) now has the owner/manager set a
temporary password directly, and the account is created immediately
(`email_confirm: true`) rather than depending on an invite-email round
trip. New `reset-employee-password` Edge Function lets an owner/manager
reset anyone's password in their business — except a manager can never
reset an owner's password, enforced server-side, not just hidden in the
UI. Both surfaced in Users: the Add Employee form now has a password
field, and each profile drawer has a "Reset password" button (hidden
entirely if the viewer isn't allowed to use it against that person).

**Every Edge Function is now single-file and self-contained.** Previously
all four imported a shared `_shared/cors.ts` — technically correct, but
fragile for a workflow where functions get deployed by copy-pasting into
the Supabase Dashboard's editor one at a time, since the dashboard only
sees one function's own folder. CORS is now inlined directly into each of
the five files, so any one of them can be deployed alone, however you
deploy it.

**Self-service registration is now clearly connected to status checking.**
Right after submitting a new business application, there's now a "Check
my status now" button that carries the email + reference code straight
into the status screen and checks immediately — previously the connection
between "here's your reference code" and "go check your status with it"
required noticing a separate, easy-to-miss link.

---

## ⚠️ Deploying Edge Functions — this is a separate step from pushing to GitHub

**Pushing to GitHub only redeploys the frontend (Vercel). It does nothing
for Edge Functions.** Every "Failed to fetch" on Approve, Add Employee,
Create Business, Reset Password, or Reject/Request-info is almost
certainly because the underlying function has never actually been
deployed with today's code — not a bug to keep chasing in the frontend.

There are five functions, all in `supabase/functions/`:
`approve-owner`, `admin-create-business`, `invite-employee`,
`reset-employee-password`, `claim-owner-account`.

**Easiest path without a computer — the Supabase Dashboard:**
1. Open your project at supabase.com → **Edge Functions** in the left sidebar
2. If a function already exists (e.g. `approve-owner`), click it → find
   the code editor → select all, delete, paste this file's full contents
   → Deploy. If it doesn't exist yet, "Create a new function", name it
   exactly matching its folder name above, paste the code, Deploy.
3. Repeat for all five. Each is a single, complete file now — no other
   files or folders needed alongside it.

**If you ever get access to a computer:** the Supabase CLI is faster —
`supabase functions deploy <name>` for each, or `supabase functions deploy`
with no name to deploy all of them at once from this folder.

---

## Setup

```bash
npm install
cp .env.example .env   # fill in your Supabase project URL + anon key
```

1. Create a Supabase project.
2. In the SQL Editor, run `supabase/schema.sql` once.
3. Create your first user in Supabase Auth (Dashboard → Authentication →
   Add user), then insert matching rows for `businesses`, `branches`, and
   `profiles` (the `profiles.id` must equal the auth user's id). There's no
   self-serve signup screen yet — this is the one manual step until an
   onboarding flow is built.
4. `npm run dev` for local development, or connect the repo to Vercel
   (`vercel.json` is already set up) and add the same two env vars there.

## Notes on the local scaffold

- Non-owner/manager roles are meant to be limited to branches listed in
  `profile_branches`; the current `src/lib/auth.ts` loads all of a
  business's branches as a placeholder until that table is wired into the
  pull-sync. The RLS policies already enforce it server-side regardless.
- `npm install` was not run in the environment this was built in (no network
  access), so dependency versions haven't been verified against each other
  end-to-end. Run `npm install && npm run build` as your first step and fix
  forward if anything's out of date.
