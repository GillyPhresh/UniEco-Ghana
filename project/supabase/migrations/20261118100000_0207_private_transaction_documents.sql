-- Read-only, party-scoped transaction documents. No payment or invoice writes.
BEGIN;
SET LOCAL lock_timeout = '5s';

CREATE FUNCTION public.get_transaction_document(p_kind text, p_id uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public
AS $fn$
DECLARE
  viewer uuid := auth.uid();
  sale public.orders%ROWTYPE;
  bill public.invoices%ROWTYPE;
  charge public.payments%ROWTYPE;
  proof public.receipts%ROWTYPE;
  shop_name text;
  buyer_name text;
  marketplace_order uuid;
  lines jsonb := '[]'::jsonb;
  line_sum numeric;
  price_subtotal numeric;
  doc_status text;
  is_buyer boolean;
BEGIN
  IF viewer IS NULL OR p_id IS NULL THEN RETURN NULL; END IF;

  IF p_kind IN ('order-invoice', 'order-receipt') THEN
    SELECT o.* INTO sale
    FROM public.orders o
    WHERE o.id = p_id AND (o.buyer_id = viewer OR EXISTS (
      SELECT 1 FROM public.vendors v WHERE v.id=o.vendor_id AND v.owner_id=viewer
    ));
    IF NOT FOUND THEN RETURN NULL; END IF;
    is_buyer := sale.buyer_id = viewer;
    SELECT business_name INTO shop_name FROM public.vendors WHERE id=sale.vendor_id;
    IF is_buyer THEN SELECT full_name INTO buyer_name FROM public.profiles WHERE id=viewer; END IF;

    -- An order transition, a checkout redirect, or a cash arrangement is not payment proof.
    SELECT r.* INTO proof
    FROM public.receipts r JOIN public.payments p ON p.id=r.payment_id
    WHERE r.order_id=sale.id AND p.order_id=sale.id AND p.payment_type='marketplace' AND r.receipt_type='marketplace'
      AND r.user_id=sale.buyer_id AND p.user_id=sale.buyer_id
      AND r.vendor_id IS NOT DISTINCT FROM sale.vendor_id AND p.vendor_id IS NOT DISTINCT FROM sale.vendor_id
      AND r.currency=sale.currency AND p.currency=sale.currency AND r.amount=p.amount AND p.amount=sale.total_amount
      AND p.paid_at IS NOT NULL AND p.provider_environment IS DISTINCT FROM 'test'
      AND p.status IN ('success','refunded','partially_refunded')
      AND NULLIF(btrim(r.receipt_number),'') IS NOT NULL;
    IF proof.id IS NOT NULL THEN SELECT * INTO charge FROM public.payments WHERE id=proof.payment_id; END IF;
    IF p_kind='order-receipt' AND proof.id IS NULL THEN RETURN NULL; END IF;

    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'label',COALESCE(NULLIF(i.item_name,''),NULLIF(i.unit_name,''),'Order item'),
      'quantity',i.quantity,'unitPrice',i.unit_price,'total',i.unit_price*i.quantity
    ) ORDER BY i.created_at,i.id),'[]'::jsonb), SUM(i.unit_price*i.quantity)
    INTO lines,line_sum FROM public.order_items i WHERE i.order_id=sale.id;
    IF line_sum = sale.total_amount - COALESCE(sale.delivery_fee,0) + COALESCE(sale.coupon_discount,0)
      THEN price_subtotal := line_sum;
    ELSE lines := '[]'::jsonb; END IF;

    doc_status := CASE
      WHEN charge.status='refunded' THEN 'refunded'
      WHEN charge.status='partially_refunded' THEN 'partially_refunded'
      WHEN p_kind='order-invoice' AND sale.status='cancelled' THEN 'cancelled'
      WHEN charge.status='success' THEN 'paid'
      WHEN sale.status='refunded' THEN 'closed'
      WHEN EXISTS (SELECT 1 FROM public.payments p WHERE p.order_id=sale.id AND p.user_id=sale.buyer_id
        AND p.payment_type='marketplace' AND p.provider='manual' AND p.status='cash_on_delivery')
        THEN 'cash_unconfirmed'
      ELSE 'unconfirmed' END;

    RETURN jsonb_build_object(
      'kind',p_kind,
      'number',CASE WHEN p_kind='order-receipt' THEN proof.receipt_number ELSE 'ORDER-'||sale.id::text END,
      'orderNumber',COALESCE(sale.order_number,sale.id::text),
      'orderId',sale.id,'viewerSide',CASE WHEN is_buyer THEN 'buyer' ELSE 'seller' END,'receiptAvailable',proof.id IS NOT NULL,
      'issuer',COALESCE(shop_name,'Marketplace seller'),'billedTo',COALESCE(buyer_name,'Order customer'),
      'issuedAt',CASE WHEN p_kind='order-receipt' THEN proof.generated_at ELSE sale.created_at END,
      'paidAt',charge.paid_at,'paymentReference',charge.payment_reference,'paymentMethod',charge.provider,
      'status',doc_status,'currency',sale.currency,'total',sale.total_amount,
      'subtotal',price_subtotal,'discount',CASE WHEN price_subtotal IS NOT NULL THEN sale.coupon_discount END,
      'delivery',CASE WHEN price_subtotal IS NOT NULL THEN sale.delivery_fee END,'items',lines);
  END IF;

  IF p_kind='receipt' THEN
    SELECT p.* INTO charge FROM public.payments p
    WHERE p.id=p_id AND p.user_id=viewer AND p.paid_at IS NOT NULL AND p.provider_environment IS DISTINCT FROM 'test'
      AND p.status IN ('success','refunded','partially_refunded');
    IF NOT FOUND THEN RETURN NULL; END IF;
    IF charge.payment_type='marketplace' THEN
      marketplace_order := charge.order_id;
      IF EXISTS (SELECT 1 FROM public.receipts r WHERE r.order_id=marketplace_order AND r.payment_id=charge.id AND r.user_id=viewer)
        THEN RETURN public.get_transaction_document('order-receipt',marketplace_order); END IF;
      RETURN NULL;
    END IF;
    SELECT r.* INTO proof FROM public.receipts r
    WHERE r.payment_id=charge.id AND r.order_id IS NULL AND r.user_id=viewer
      AND r.amount=charge.amount AND r.currency=charge.currency AND r.receipt_type=charge.payment_type
      AND NULLIF(btrim(r.receipt_number),'') IS NOT NULL;
    IF NOT FOUND THEN RETURN NULL; END IF;
    SELECT full_name INTO buyer_name FROM public.profiles WHERE id=viewer;
    RETURN jsonb_build_object(
      'kind',p_kind,'number',proof.receipt_number,'issuedAt',proof.generated_at,
      'issuer','UniEco Ghana','billedTo',COALESCE(proof.billing_name,buyer_name,'Account holder'),
      'paidAt',charge.paid_at,'paymentReference',charge.payment_reference,'paymentMethod',charge.provider,
      'purpose',charge.payment_type,'status',CASE WHEN charge.status='success' THEN 'paid' ELSE charge.status END,
      'currency',charge.currency,'total',charge.amount,'items',lines);
  END IF;

  IF p_kind='invoice' THEN
    SELECT i.* INTO bill FROM public.invoices i WHERE i.id=p_id AND i.user_id=viewer;
    IF NOT FOUND THEN RETURN NULL; END IF;
    SELECT p.* INTO charge FROM public.payments p WHERE p.id=bill.payment_id AND p.user_id=viewer
      AND p.vendor_id IS NOT DISTINCT FROM bill.vendor_id AND p.payment_type=bill.invoice_type
      AND p.currency=bill.currency AND p.amount=bill.total_amount AND p.paid_at IS NOT NULL
      AND p.provider_environment IS DISTINCT FROM 'test'
      AND p.status IN ('success','refunded','partially_refunded');
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'label',i.description,'quantity',i.quantity,'unitPrice',i.unit_price,'total',i.total_price
    ) ORDER BY i.created_at,i.id),'[]'::jsonb)
    INTO lines FROM public.invoice_items i WHERE i.invoice_id=bill.id;
    SELECT full_name INTO buyer_name FROM public.profiles WHERE id=viewer;
    doc_status := CASE WHEN bill.status IN ('void','draft') THEN bill.status
      WHEN charge.status IN ('refunded','partially_refunded') THEN charge.status
      WHEN bill.status='refunded' THEN 'closed'
      WHEN charge.status='success' THEN 'paid' ELSE 'unconfirmed' END;
    RETURN jsonb_build_object(
      'kind',p_kind,'number',bill.invoice_number,'issuedAt',COALESCE(bill.issued_at,bill.created_at),'dueAt',bill.due_date,
      'issuer','UniEco Ghana','billedTo',COALESCE(bill.billing_name,buyer_name,'Account holder'),
      'paidAt',charge.paid_at,'paymentReference',charge.payment_reference,'paymentMethod',charge.provider,
      'paymentId',charge.id,'purpose',bill.invoice_type,'status',doc_status,'currency',bill.currency,
      'subtotal',bill.amount,'tax',bill.tax_amount,'total',bill.total_amount,'items',lines);
  END IF;

  RETURN NULL;
END
$fn$;

REVOKE ALL ON FUNCTION public.get_transaction_document(text,uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_transaction_document(text,uuid) TO authenticated;

CREATE FUNCTION public.get_transaction_document_index(p_section text, p_offset integer DEFAULT 0)
RETURNS TABLE (id uuid, label text, amount numeric, currency text, document_date timestamptz)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public
AS $fn$
DECLARE
  viewer uuid := auth.uid();
  row_offset integer := greatest(0,least(coalesce(p_offset,0),10000));
BEGIN
  IF viewer IS NULL THEN RETURN; END IF;
  IF p_section='purchases' THEN
    RETURN QUERY SELECT o.id, COALESCE(o.order_number,'Order '||left(o.id::text,8)), o.total_amount, o.currency, o.created_at
    FROM public.orders o WHERE o.buyer_id=viewer
    ORDER BY o.created_at DESC,o.id DESC LIMIT 26 OFFSET row_offset;
  ELSIF p_section='sales' THEN
    RETURN QUERY SELECT o.id, COALESCE(o.order_number,'Order '||left(o.id::text,8)), o.total_amount, o.currency, o.created_at
    FROM public.vendors v JOIN public.orders o ON o.vendor_id=v.id WHERE v.owner_id=viewer
    ORDER BY o.created_at DESC,o.id DESC LIMIT 26 OFFSET row_offset;
  ELSIF p_section='invoices' THEN
    RETURN QUERY SELECT i.id, i.invoice_number, i.total_amount, i.currency, COALESCE(i.issued_at,i.created_at)
    FROM public.invoices i WHERE i.user_id=viewer
    ORDER BY i.created_at DESC,i.id DESC LIMIT 26 OFFSET row_offset;
  ELSIF p_section='receipts' THEN
    RETURN QUERY SELECT p.id, r.receipt_number, p.amount, p.currency, r.generated_at
    FROM public.receipts r JOIN public.payments p ON p.id=r.payment_id
    LEFT JOIN public.orders o ON o.id=r.order_id
    WHERE r.user_id=viewer AND p.user_id=viewer AND r.amount=p.amount AND r.currency=p.currency
      AND p.paid_at IS NOT NULL AND p.provider_environment IS DISTINCT FROM 'test'
      AND p.status IN ('success','refunded','partially_refunded')
      AND NULLIF(btrim(r.receipt_number),'') IS NOT NULL
      AND ((p.payment_type<>'marketplace' AND r.order_id IS NULL AND r.receipt_type=p.payment_type)
        OR (p.payment_type='marketplace' AND r.receipt_type='marketplace' AND p.order_id=o.id AND o.buyer_id=viewer
          AND r.vendor_id IS NOT DISTINCT FROM o.vendor_id AND p.vendor_id IS NOT DISTINCT FROM o.vendor_id
          AND p.currency=o.currency AND p.amount=o.total_amount))
    ORDER BY r.generated_at DESC,p.id DESC LIMIT 26 OFFSET row_offset;
  END IF;
END
$fn$;

REVOKE ALL ON FUNCTION public.get_transaction_document_index(text,integer) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_transaction_document_index(text,integer) TO authenticated;
NOTIFY pgrst, 'reload schema';
COMMIT;
