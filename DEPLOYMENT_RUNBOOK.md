# ShopOS — Deployment Runbook (Phases 1–5)

Run everything against a **staging branch of your Supabase project first**.
Do not run any of this against production until staging checks all pass.

## 0. Before you start

- [ ] Note current row counts: `select count(*) from profiles;` and `select count(*) from audit_log;`
- [ ] Confirm you have a recent Supabase backup/point-in-time-recovery available
- [ ] `npm install && npm run build` on both `shopos-app` and `shopos-admin` locally — I could not run this myself (no network/node_modules in my sandbox), so this is the first real compiler check either codebase has had since these changes

## 1. Run SQL migrations, in this exact order

Each file has its own verification queries in a comment block at the bottom — run them before moving to the next file, not just at the end.

| # | File | What it does |
|---|------|---------------|
| 1 | `phase1_business_memberships.sql` | Turns `profiles` into a true membership table — one email can belong to multiple businesses |
| 2 | `phase1b_own_membership_visibility.sql` | Lets a user see their own membership rows across every business (needed by the offline sync engine) |
| 3 | `phase1c_fix_activate_business.sql` | Fixes the OTP activation RPC for multi-business accounts |
| 4 | `phase1d_fix_remaining_id_assumptions.sql` | Fixes `reopen_daily_closing()` and `next_document_number()`, same root cause |
| 5 | `phase2_permissions_model.sql` | Adds the `permissions`/`role_permissions` tables and `has_permission()`/`user_has_permission()` |
| 6 | `phase2b_profiles_privilege_fix.sql` | Closes the privilege-escalation hole in `profiles` writes (no role check existed before) |
| 7 | `phase5a_audit_log_rls.sql` | Closes the same class of hole in `audit_log` — makes it append-only, gated by `audit.view` |
| 8 | `phase6a_device_sessions_rls.sql` | Fixes the actual cause of the "sync isn't working" / 75-failed-items bug — a shared device (till/tablet) couldn't be re-claimed by a different staff member logging in |
| 9 | `phase7_receipt_sharing.sql` | Secure receipt sharing — `receipt_shares` table + `create_receipt_share`/`get_public_receipt` RPCs powering the QR code and Share button on receipts |
| 10 | `phase8_fix_active_business_backfill.sql` | **The actual root cause of "sync isn't working"** — profiles created after phase1 never got a resolvable active business on the server, silently failing reads/writes for those accounts (Sam included) |
| 11 | `phase9_permissions_rls.sql` | `permissions`/`role_permissions` had **no RLS at all** since phase2 — any staff member at any business could read/write platform-wide role defaults. Now read-only for staff, writable only by platform admins |

After all seven, spot-check as a real staff account of each role (owner, manager, cashier at minimum):
- [ ] Sign in still works
- [ ] `select has_permission('inventory.delete');` returns the expected true/false for that role
- [ ] `select * from audit_log;` is empty for a cashier, populated for a role with `audit.view`

## 2. Deploy Edge Functions

```
supabase functions deploy invite-employee
supabase functions deploy reset-employee-password
supabase functions deploy approve-owner
supabase functions deploy admin-create-business
supabase functions deploy admin-set-business-status   # new — see below
```

`approve-owner` and `admin-create-business` now also accept `skipInviteEmail: true` — generates a secure activation link (via Supabase's `generateLink`) instead of sending an email through Supabase's built-in mailer, which has a much lower rate limit than this app's own Gmail SMTP and is what was actually being exceeded. The admin app's Owner Requests screen has a checkbox for this now.

`admin-set-business-status` is new. It needs the same SMTP secrets as your
existing `send-activation-email`/`send-password-reset` functions — if
those are already set, nothing further to configure:
```
supabase secrets set SMTP_HOST=... SMTP_PORT=... SMTP_USER=... SMTP_PASS=... SMTP_FROM="ShopOS <...>"
```

- [ ] Test `invite-employee` twice: once with a brand-new email (new account created), once with an email that already has a ShopOS account from another business (should add a second membership, not error)
- [ ] Test `admin-set-business-status` from the admin app and confirm the owner receives an email

## 3. Deploy frontend apps

- [ ] `shopos-app` (main app) — includes the Dexie schema bump to version 16; existing users will silently migrate their local IndexedDB on next load, nothing manual needed
- [ ] `shopos-admin` — `BusinessDetail.tsx` now calls the new Edge Function instead of the RPC directly

## 4. Smoke test against your acceptance checklist (spec section 22/28)

- [ ] Business A cannot access Business B's data by changing IDs/URLs
- [ ] A cashier cannot promote themselves via direct API call (`update profiles set role='owner'...` must fail)
- [ ] Same email CAN belong to two businesses with different roles
- [ ] Same email CANNOT be added twice to the same business
- [ ] Staff/inventory/supplier/customer detail views load with history data
- [ ] Audit Log page shows entries for a role with `audit.view`, nothing for one without
- [ ] Existing POS/sales/inventory/receipts flows still work unchanged

## Known gaps carried forward (not silently "done")

- Audit coverage is partial — most actions still don't write an audit entry (see `lib/audit.ts`)
- No self-service OTP resend — still admin-relayed (no SMS provider configured)
- The public receipt "Want a POS like this?" button points at a hardcoded mailto (`dariusmomanyi678@gmail.com`) in `src/features/pos/PublicReceipt.tsx` — swap `CONTACT_URL` for a WhatsApp link or landing page if you'd rather it go somewhere else
- **Vercel build was confirmed broken for shopos-admin** (missing `Trash2` import) and fixed. **shopos-app's own build has never actually been checked** — don't assume it's building successfully just because admin's error is fixed; check its build log too.
- **shopos-admin was pushing to the wrong GitHub repo** (`Adminshopos` instead of `Shopos-admin`) for several rounds — corrected via a fresh clone (`shopos-admin-correct`). Confirm you're pushing from that folder going forward, not the old `shopos-admin-repo`.
- I could not run a real TypeScript build in my sandbox — treat step 0's build check as mandatory, not optional, on **both** apps.
- Role Defaults (new, admin-only) lets platform admins edit role permission defaults that apply to **every business on ShopOS at once** — there's intentionally no per-business override UI for this yet, only per-staff-member overrides within each business's own Users page.
