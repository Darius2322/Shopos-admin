-- Applied to production.
-- 1. reviews: signed-in users need table privileges for RLS to be evaluated (admin policy still restricts who sees rows).
grant select, update, delete on reviews to authenticated;
grant all on reviews to service_role;
-- 2. submit_public_review: a blank name (or "Anonymous") posts anonymously, with no business name attached.
--    (See the live function definition.)
-- 3. payment_transactions.payment_source_id: ON DELETE NO ACTION (checked at end of statement) so deleting a whole
--    business can cascade, while a source that still has payments cannot be deleted on its own.
alter table payment_transactions drop constraint payment_transactions_payment_source_id_fkey;
alter table payment_transactions add constraint payment_transactions_payment_source_id_fkey
  foreign key (payment_source_id) references payment_sources(id) on delete no action;
