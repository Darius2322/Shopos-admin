# ShopOS – this round (drop-in files, same paths under `src/`)

Database (already applied live to project ShopOs via migrations phase30–32):
- `inventory_movements`: + `note`, `quantity_before`; insert guard (needs inventory.adjust, same-business product, actor forced to auth.uid()).
- `businesses.document_template` (classic|modern|compact|ledger|bold) – only owner / business.settings can change (trigger).
- `document_shares` + `create_document_share` / `revoke_document_share` / `get_public_document_full` (quotation + invoice links; cross-business creation rejected – tested).
- `client_activity_events` + `record_client_activity()` – offline sessions uploaded with real timestamps; advances last_active_at / last_login_at / login counts.
- Admin RPCs: `admin_transactions_per_day`, `admin_top_businesses`, `admin_activity_feed`, upgraded `admin_business_usage` (all check is_platform_admin).

## shopos-app (`app/src`)
- NEW `lib/documentTemplates.ts`, `components/DocumentView.tsx` – 5 ShopOS-branded templates (footer cannot be removed).
- NEW `components/ShareDocumentSheet.tsx`, `lib/documentShare.ts`, `lib/documentData.ts` – "Send digital receipt/quotation/invoice": WhatsApp / SMS / copy / native share as link, or share as picture (works offline).
- NEW `features/documents/PublicDocument.tsx` (route `/d/<token>`), `DocumentTemplatesPage.tsx` (More → Document Templates).
- NEW `lib/clientActivity.ts` – offline-safe session log. `lib/auth.ts` records app opens.
- NEW `features/inventory/StockAdjustSheet.tsx`; `lib/products.ts` `adjustStock()` – Add / Remove / Set, reason, note, before→after, audit event; product page history shows who/why/note.
- `InventoryList.tsx`: category menu (chips + counts + inline "New category"), richer dashboard (units, retail value, potential profit, expiring, stock-health bar, top categories), sort + supplier + stock-status filters, quick adjust per row.
- `lib/sync.ts`: finished items leave the queue and counters immediately; duplicate queue entries collapse; activity flushed after sync.
- `index.css`: visible hover/pressed states in dark mode (desktop).
- `MoreMenu.tsx` / `AppShell.tsx`: items flagged `comingSoon` (M-Pesa) are inert with a "Coming soon" badge.
- Routes added in `App.tsx`; types in `lib/types.ts`.

## shopos-admin (`admin/src/pages`)
- `Dashboard.tsx`: transactions per day chart (7/30/90d) + top performing shops with growth vs prior period.
- `BusinessDetail.tsx`: last login, last inventory update, last offline session, logins today/7d/30d, merged activity timeline (flags offline sessions).

## Not verified / needs you
- I only had the change bundles, not the full repos, so nothing was compiled here. Run `tsc`/build once after copying.
- `lib/db.ts`, `lib/audit.ts` weren't in the bundle; I used the exports the existing code already imports (`db`, `newRecordBase`, `enqueueSync`, `recordAuditEvent`). Confirm `db.suppliers` and `db.businesses` exist.
- M-Pesa is already flagged comingSoon in AppShell; the nav item type now allows it.
- Receipt popup/print (`ReceiptModal`, `PublicReceipt`) still use their existing layout; templates are applied to the new share sheet, public `/d/` links and the preview.
- Test on a real Android device: share-as-picture uses SVG foreignObject; logos from other domains need CORS, otherwise the logo is omitted from the picture.

---
# Round 3 (soft delete, consent, deposits, search, avatars, categories, admin tabs)

## Already live in Supabase (project ShopOs)
- Migration `phase33`: soft-delete columns on businesses/profiles (+ `auth_business_id()` now ignores deleted businesses, so RLS hides them), `account_deletions` log, `consent_documents` / `account_consents`, `customer_deposits` ledger + `record_customer_deposit()` / `customer_deposit_balance()` (tested: overdraw blocked, other business blocked), unused `product-images` bucket (can be ignored/removed).
- Edge functions: `delete-my-account` v2 (SOFT: bans sign-ins, revokes sessions, keeps data 30 days), `admin-delete-business` v2 (soft by default; `purge:true` only for already-deleted), NEW `admin-restore-business`, `claim-owner-account` v8 (records consent).
- Consent notice v1.0 is seeded with `enforced = false`. **After you wire `<ConsentBox>` into the account-setup screen, turn enforcement on:**
  `update consent_documents set enforced = true where is_current;`
  (Until then nobody is blocked; existing users get a one-time prompt once enforced.) Have a lawyer review the notice text.

## App files
NEW: `components/UniversalSearch.tsx`, `components/layout/UserMenu.tsx`, `components/ProductAvatar.tsx`, `components/DeleteAccountDialog.tsx`, `components/ConsentBox.tsx`, `features/dashboard/QuickActions.tsx`, `features/customers/DepositCard.tsx`, `features/categories/CategoryDetailPage.tsx`
CHANGED: `AppShell.tsx` (search + avatar menu + quick actions on dashboard), `MoreMenu.tsx` (Theme tile + Categories tile removed), `App.tsx` (route /categories/:id, ConsentGate), `InventoryList.tsx` (product pictures, add to category: new + existing), `CustomerDetailPage.tsx` (deposit card), `lib/products.ts`.

## Admin files
`pages/BusinessDetail.tsx` (tabs: Overview, Activity, Users, Access & branches, Consent, Account; soft delete / restore / permanently erase), `pages/Businesses.tsx` (deleted filter + badge).

## Needs you
- Wire `<ConsentBox onChange={(accepted, version) => ...}/>` into the owner account-setup page and send `{ acceptedTerms, termsVersion }` to `claim-owner-account`. I couldn't see that page.
- `DeleteAccountDialog.tsx` REPLACES your existing one (same props). Check it still matches your look.
- Dashboard shortcuts render above the dashboard via AppShell (I couldn't see Dashboard.tsx).
- Deposits are online-only on purpose (to prevent two devices spending the same balance); using a deposit as payment at the POS is not built yet.
- Product pictures are stored as small compressed images on the product (work offline, sync with the product).


---
# Round 4

## Already live in Supabase (migrations phase34, phase35)
- Secure links: every receipt/quotation/invoice link now EXPIRES (7/30/90/365 days, default 30), can be TURNED OFF, counts views, and stays 192-bit unguessable. Links already sent keep working for 90 more days. Pages send `noindex` + no-referrer.
- Templates: 10 layouts (5 new: Minimal, Elegant, Stripe, Corporate, Soft) + a brand colour per business (`businesses.document_accent`).
- `get_shopos_contact()`: ShopOS phone / WhatsApp / email / slogan from `platform_settings` (admin-editable). The slogan is a PLACEHOLDER ("Smart tools for every shop"); change it with:
  `update platform_settings set slogan = 'YOUR SLOGAN' where id = 'default';`
- Unique offline numbers: `reserve_document_numbers()` gives each device its own block of real numbers (tested: blocks never overlap).

## App
NEW: `lib/numberBlocks.ts` (offline-unique numbers, installed in App.tsx), `lib/brand.ts`, `components/PersonAvatar.tsx`, `RecordDebtSheet.tsx`, `AddDepositModal.tsx`, `features/closing/ClosingHistoryPage.tsx` (More > Previous Days), `features/profile/ProfilePage.tsx` (avatar menu > My profile), `features/debts/DepositsTab.tsx`, `features/expenses/ExpensesList.tsx` + `ExpenseDetailPage.tsx`, `features/public/ReviewForm.tsx`.
CHANGED: dashboard shortcuts (3 groups + clickable Recent sales / Low stock / Owed to you), customer page (avatar, quick actions: Record debt, Add deposit, New sale, Call, WhatsApp; tabs), debts list/detail (avatars, timestamps, tabs, Call/WhatsApp), Documents group in More now holds Templates, live search from the first letter, public receipt/quotation/invoice page (Close, Call/WhatsApp shop, Call ShopOS, logo + slogan), share sheet (expiry + Turn off link + Close).

## Needs you
- `ExpensesList.tsx` REPLACES your file (I couldn't see it). Rows open details; the repeat button re-records the same expense for today. No edit/delete: expenses have no delete column on the server.
- Landing page review form: I couldn't see it. Replace its form with `<ReviewForm />` (blank name = Anonymous; the database already does this).
- `/r/` receipt links now use the new public page (the old `PublicReceipt` is no longer routed).
- Dashboard.tsx wasn't available: shortcuts and clickable records are added above it via AppShell. If you send Dashboard.tsx I can make its own tiles clickable and remove duplicates.
- Deposits and Previous Days need a connection.
