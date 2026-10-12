# Round 24 (already applied to the live database)
- businesses.max_discount_percent (owner-set discount limit for cashiers).
- Trigger trg_check_sale_item_price: a sale line can never be sold below the product's buying price; discounts above the owner's limit need a manager's approval; price changes are logged.
- site_visits.channel + admin_channel_usage(p_days): usage by web / pwa / android_app / ios_app / desktop_app (admin: Apps & updates -> Who uses ShopOS).
- Edge function track v3 records the channel (from the app's browser identity ShopOSApp/ or ShopOSDesktop/).
- New CI upload key created (ci_ingest_tokens, label "GitHub builds (Round 24)"); store its value as the GitHub secret SHOPOS_INGEST_TOKEN.
