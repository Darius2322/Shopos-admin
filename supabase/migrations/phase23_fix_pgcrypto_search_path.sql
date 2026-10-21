-- ROOT CAUSE of "receipt link broken" and "admin cannot generate activation code":
-- pgcrypto lives in the `extensions` schema, but these functions ran with search_path=public,
-- so gen_random_bytes()/digest() were not found.
alter function create_receipt_share(uuid) set search_path = public, extensions, pg_temp;
alter function admin_generate_otp(uuid, integer) set search_path = public, extensions, pg_temp;
