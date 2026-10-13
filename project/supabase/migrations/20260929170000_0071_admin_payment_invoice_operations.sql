-- Narrow super-admin payment/invoice read models and audited server exports.
-- Moderators do not receive blanket access to financial transaction payloads.
BEGIN;

DROP POLICY IF EXISTS staff_select_all_payments ON public.payments;
CREATE POLICY super_admin_select_all_payments ON public.payments FOR SELECT TO authenticated
  USING (public.is_super_admin());
DROP POLICY IF EXISTS staff_select_all_payment_history ON public.payment_status_history;
CREATE POLICY super_admin_select_payment_history ON public.payment_status_history FOR SELECT TO authenticated
  USING (public.is_super_admin());
DROP POLICY IF EXISTS staff_select_tx_audit ON public.transaction_audit_log;
CREATE POLICY super_admin_select_transaction_audit ON public.transaction_audit_log FOR SELECT TO authenticated
  USING (public.is_super_admin());
DROP POLICY IF EXISTS staff_select_redemptions ON public.coupon_redemptions;
CREATE POLICY super_admin_select_coupon_redemptions ON public.coupon_redemptions FOR SELECT TO authenticated
  USING (public.is_super_admin());

CREATE OR REPLACE FUNCTION public.get_admin_payment_directory(
  p_status text DEFAULT NULL,p_limit integer DEFAULT 20,p_offset integer DEFAULT 0
)
RETURNS TABLE(
  id uuid,payment_reference text,provider text,payment_type text,amount numeric,currency text,status text,
  created_at timestamptz,user_full_name text,user_email text,total_count bigint
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE v_limit integer:=COALESCE(p_limit,20); v_offset integer:=COALESCE(p_offset,0);
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_super_admin() THEN RAISE EXCEPTION 'Super administrator access required' USING ERRCODE='42501'; END IF;
  IF p_status IS NOT NULL AND p_status NOT IN ('pending','initiated','success','failed','cancelled','refunded') THEN RAISE EXCEPTION 'Invalid payment status filter' USING ERRCODE='22023'; END IF;
  IF v_limit NOT BETWEEN 1 AND 100 OR v_offset < 0 OR v_offset > 10000 THEN RAISE EXCEPTION 'Invalid pagination' USING ERRCODE='22023'; END IF;
  RETURN QUERY
  SELECT payment.id,payment.payment_reference,payment.provider,payment.payment_type,payment.amount,payment.currency,
    payment.status,payment.created_at,profile.full_name,profile.email,count(*) OVER()
  FROM public.payments payment
  LEFT JOIN public.profiles profile ON profile.id=payment.user_id
  WHERE p_status IS NULL OR payment.status=p_status
  ORDER BY payment.created_at DESC,payment.id
  LIMIT v_limit OFFSET v_offset;
END; $$;

CREATE OR REPLACE FUNCTION public.export_admin_payments(p_status text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE v_count bigint; v_rows jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_super_admin() THEN RAISE EXCEPTION 'Super administrator access required' USING ERRCODE='42501'; END IF;
  IF p_status IS NOT NULL AND p_status NOT IN ('pending','initiated','success','failed','cancelled','refunded') THEN RAISE EXCEPTION 'Invalid payment status filter' USING ERRCODE='22023'; END IF;
  SELECT count(*) INTO v_count FROM public.payments payment WHERE p_status IS NULL OR payment.status=p_status;
  IF v_count > 5000 THEN RAISE EXCEPTION 'Export exceeds the 5000-record limit; apply a status filter' USING ERRCODE='22023'; END IF;
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'reference',payment.payment_reference,'provider',payment.provider,'type',payment.payment_type,
    'user',COALESCE(profile.full_name,profile.email),'amount',payment.amount,'currency',payment.currency,
    'status',payment.status,'created_at',payment.created_at
  ) ORDER BY payment.created_at DESC,payment.id),'[]'::jsonb)
  INTO v_rows
  FROM public.payments payment
  LEFT JOIN public.profiles profile ON profile.id=payment.user_id
  WHERE p_status IS NULL OR payment.status=p_status;
  PERFORM public.record_trusted_admin_action(
    'payments.export','payments','payments',NULL,
    jsonb_build_object('format','csv','status',p_status,'record_count',v_count)
  );
  RETURN v_rows;
END; $$;

CREATE OR REPLACE FUNCTION public.get_admin_invoice_directory(
  p_status text DEFAULT NULL,p_limit integer DEFAULT 20,p_offset integer DEFAULT 0
)
RETURNS TABLE(
  id uuid,invoice_number text,vendor_id uuid,invoice_type text,amount numeric,currency text,tax_amount numeric,
  total_amount numeric,status text,created_at timestamptz,user_full_name text,user_email text,vendor_business_name text,total_count bigint
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE v_limit integer:=COALESCE(p_limit,20); v_offset integer:=COALESCE(p_offset,0);
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_super_admin() THEN RAISE EXCEPTION 'Super administrator access required' USING ERRCODE='42501'; END IF;
  IF p_status IS NOT NULL AND p_status NOT IN ('draft','issued','paid','void','refunded') THEN RAISE EXCEPTION 'Invalid invoice status filter' USING ERRCODE='22023'; END IF;
  IF v_limit NOT BETWEEN 1 AND 100 OR v_offset < 0 OR v_offset > 10000 THEN RAISE EXCEPTION 'Invalid pagination' USING ERRCODE='22023'; END IF;
  RETURN QUERY
  SELECT invoice.id,invoice.invoice_number,invoice.vendor_id,invoice.invoice_type,invoice.amount,invoice.currency,
    invoice.tax_amount,invoice.total_amount,invoice.status,invoice.created_at,profile.full_name,profile.email,vendor.business_name,count(*) OVER()
  FROM public.invoices invoice
  LEFT JOIN public.profiles profile ON profile.id=invoice.user_id
  LEFT JOIN public.vendors vendor ON vendor.id=invoice.vendor_id
  WHERE p_status IS NULL OR invoice.status=p_status
  ORDER BY invoice.created_at DESC,invoice.id
  LIMIT v_limit OFFSET v_offset;
END; $$;

CREATE OR REPLACE FUNCTION public.export_admin_invoices(p_status text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE v_count bigint; v_rows jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_super_admin() THEN RAISE EXCEPTION 'Super administrator access required' USING ERRCODE='42501'; END IF;
  IF p_status IS NOT NULL AND p_status NOT IN ('draft','issued','paid','void','refunded') THEN RAISE EXCEPTION 'Invalid invoice status filter' USING ERRCODE='22023'; END IF;
  SELECT count(*) INTO v_count FROM public.invoices invoice WHERE p_status IS NULL OR invoice.status=p_status;
  IF v_count > 5000 THEN RAISE EXCEPTION 'Export exceeds the 5000-record limit; apply a status filter' USING ERRCODE='22023'; END IF;
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'number',invoice.invoice_number,'user',COALESCE(profile.full_name,profile.email),
    'vendor',vendor.business_name,'type',invoice.invoice_type,'amount',invoice.total_amount,
    'currency',invoice.currency,'status',invoice.status,'created_at',invoice.created_at
  ) ORDER BY invoice.created_at DESC,invoice.id),'[]'::jsonb)
  INTO v_rows
  FROM public.invoices invoice
  LEFT JOIN public.profiles profile ON profile.id=invoice.user_id
  LEFT JOIN public.vendors vendor ON vendor.id=invoice.vendor_id
  WHERE p_status IS NULL OR invoice.status=p_status;
  PERFORM public.record_trusted_admin_action(
    'invoices.export','invoices','invoices',NULL,
    jsonb_build_object('format','csv','status',p_status,'record_count',v_count)
  );
  RETURN v_rows;
END; $$;

REVOKE ALL ON FUNCTION public.get_admin_payment_directory(text,integer,integer),public.export_admin_payments(text),public.get_admin_invoice_directory(text,integer,integer),public.export_admin_invoices(text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.get_admin_payment_directory(text,integer,integer),public.export_admin_payments(text),public.get_admin_invoice_directory(text,integer,integer),public.export_admin_invoices(text) TO authenticated;

COMMIT;
