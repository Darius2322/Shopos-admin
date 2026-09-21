# ShopOS Android plugin — automatic M-Pesa payment detection

**Status: source only. Not compiled or run.** The project this came from is a web app / PWA with
no Android wrapper, so this needs a Capacitor Android project to live in, and it needs a real
device test before anything ships.

## What it does
- Registers a receiver for incoming SMS with **RECEIVE_SMS only** (never READ_SMS).
- Keeps a message only if the sender is M-Pesa **and** it reads like an incoming payment.
  Everything else is dropped inside the receiver: never queued, logged, shown or uploaded.
- Hands recognised messages to the web layer (`src/lib/payments/smsChannel.ts`), which parses
  them strictly (`mpesaSms.ts`), stores the normalised payment, syncs it, and de-duplicates by
  M-Pesa code. The original text stays on the device only.

## Add to a Capacitor project
1. `npm i @capacitor/core @capacitor/android && npx cap add android`
2. Copy `src/main/java/com/dmn/shopos/mpesa/*` into `android/app/src/main/java/...`
3. Merge `AndroidManifest.snippet.xml` into `android/app/src/main/AndroidManifest.xml`
4. Register the plugin in `MainActivity` (`registerPlugin(ShopOsMpesaPlugin::class.java)`)
5. `npm run build && npx cap sync android`, then test on a real phone with a real M-Pesa till SMS.

## Google Play — you must do this BEFORE publishing a build that requests SMS
RECEIVE_SMS is a **restricted permission**. Play only allows it for specific permitted use cases and
requires the *Permissions Declaration Form* in Play Console (App content), with a description of the core
feature, an in-app prominent disclosure, and a demo video. Approval is Google's decision, not ours.
Check the current policy text before submitting, and do not ship the permission until approved.
- The in-app rationale shown before the system prompt is in `PERMISSION_RATIONALE` (smsChannel.ts).
- Update and publish the Privacy Policy's Android/SMS section with the release (see PrivacyPage.tsx).

## Recommended alternative (no SMS at all)
Safaricom's **Daraja C2B API** can push payment confirmations for a Till/Paybill to a server URL. A
Supabase edge function could receive them and create the same `payment_transactions` rows
(source_type `api`). It works on the web app, needs no restricted permission, and is far easier to
get through Play. It does require the business to have Daraja access for its shortcode.
