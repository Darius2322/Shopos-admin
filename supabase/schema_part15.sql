-- ============================================================================
-- PART 15 — M-Pesa payment details on the business record, plus a receipt
-- print-mode preference. Both editable from Business Profile / the setup
-- wizard in the main app; shown on receipts.
-- ============================================================================

alter table businesses
  add column if not exists tax_pin text,
  add column if not exists paybill_number text,
  add column if not exists paybill_account text,
  add column if not exists till_number text,
  add column if not exists send_till_number text,
  add column if not exists mpesa_confirmation_name text,
  add column if not exists receipt_print_mode text not null default 'manual';

alter table businesses
  drop constraint if exists businesses_receipt_print_mode_check;
alter table businesses
  add constraint businesses_receipt_print_mode_check check (receipt_print_mode in ('auto', 'manual'));
