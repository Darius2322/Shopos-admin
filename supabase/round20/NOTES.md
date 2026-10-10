# Round 20 (database already applied live)
- Grants: authenticated on package tables; service_role on all public tables/functions (fixes analytics + ingest).
- New: packages.validity_days, admin_assign_package2, admin_remove_business_package, admin_set_business_expiry, admin_package_stats, admin_db_by_business.
- Edge function: github-installer-assets (admin only; reads latest public GitHub release).
