# Round 20 (database already applied live)
- Grants: authenticated on package tables; service_role on all public tables/functions (fixes analytics + ingest).
- New: packages.validity_days, admin_assign_package2, admin_remove_business_package, admin_set_business_expiry, admin_package_stats, admin_db_by_business.
- Edge function: github-installer-assets (admin only; reads latest public GitHub release).

# Round 21 (applied live)
- admin_badge_counts(), my_active_business_id(), submit_owner_request_v2 (+ owner_requests.requested_package_id / requested_business_type)
- package_changes table + trigger, admin_package_detail(), admin_extend_offer(), admin_resolve_package_request allows approving a rejected request
- 5 new rows in package_services
