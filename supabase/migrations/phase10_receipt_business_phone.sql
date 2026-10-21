-- ============================================================================
-- PHASE 10 — add businessPhone to get_public_receipt()
-- ============================================================================
-- The receipt's "Contact this shop" button needs a phone number to build a
-- WhatsApp link from. branchPhone already existed, but not every branch
-- has its own number set — this adds the business-level phone as a
-- fallback source so the button still has something to work with.
-- ============================================================================

create or replace function get_public_receipt(p_token text) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_share receipt_shares%rowtype;
  v_sale sales%rowtype;
  v_business businesses%rowtype;
  v_branch branches%rowtype;
  v_items jsonb;
begin
  select * into v_share from receipt_shares where token = p_token;
  if not found then
    raise exception 'Receipt not found';
  end if;

  select * into v_sale from sales where id = v_share.sale_id;
  select * into v_business from businesses where id = v_share.business_id;
  select * into v_branch from branches where id = v_sale.branch_id;

  select coalesce(jsonb_agg(jsonb_build_object(
    'productName', product_name, 'quantity', quantity, 'lineTotal', line_total
  ) order by id), '[]'::jsonb)
  into v_items
  from sale_items where sale_id = v_sale.id;

  return jsonb_build_object(
    'businessName', v_business.name,
    'businessPhone', v_business.phone,
    'branchName', v_branch.name,
    'branchLocation', v_branch.location,
    'branchPhone', v_branch.phone,
    'receiptNumber', v_sale.receipt_number,
    'createdAt', v_sale.created_at,
    'items', v_items,
    'tax', v_sale.tax,
    'total', v_sale.total,
    'amountPaid', v_sale.amount_paid,
    'paymentMethod', v_sale.payment_method,
    'balanceDue', v_sale.balance_due
  );
end;
$$;

-- ============================================================================
-- VERIFY
-- ============================================================================
-- select get_public_receipt('<a real token>'); -- should now include businessPhone
