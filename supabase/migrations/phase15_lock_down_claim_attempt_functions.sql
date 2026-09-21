revoke all on function register_claim_attempt(text, boolean) from public, anon, authenticated;
revoke all on function check_claim_lock(text) from public, anon, authenticated;
grant execute on function register_claim_attempt(text, boolean) to service_role;
grant execute on function check_claim_lock(text) to service_role;
