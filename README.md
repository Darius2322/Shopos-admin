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
- Mark M-Pesa entry `comingSoon: true` in the nav item list in `AppShell.tsx` if it isn't already (the rendering support is added; I saw the existing Coming Soon page but not the flag).
- Receipt popup/print (`ReceiptModal`, `PublicReceipt`) still use their existing layout; templates are applied to the new share sheet, public `/d/` links and the preview.
- Test on a real Android device: share-as-picture uses SVG foreignObject; logos from other domains need CORS, otherwise the logo is omitted from the picture.
