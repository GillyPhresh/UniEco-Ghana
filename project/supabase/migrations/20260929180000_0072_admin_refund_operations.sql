-- Private refund queue and reasoned, audited review workflow. Provider refund
-- execution remains disabled until a trusted provider adapter is implemented.
BEGIN;

CREATE INDEX IF NOT EXISTS refunds_created_at_id_idx ON public.refunds(created_at DESC,id);
CREATE INDEX IF NOT EXISTS refunds_status_created_at_id_idx ON public.refunds(status,created_at DESC,id);

CREATE OR REPLACE FUNCTION public.get_admin_refund_directory(
  p_status text DEFAULT NULL,p_limit integer DEFAULT 20,p_offset integer DEFAULT 0
)
RETURNS TABLE(
  id uuid,refund_number text,payment_id uuid,user_id uuid,vendor_id uuid,amount numeric,currency text,
  reason text,status text,created_at timestamptz,
  payment_reference text,payment_amount numeric,payment_status text,user_full_name text,user_email text,
  vendor_business_name text,total_count bigint
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE v_limit integer:=COALESCE(p_limit,20); v_offset integer:=COALESCE(p_offset,0);
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_super_admin() THEN RAISE EXCEPTION 'Super administrator access required' USING ERRCODE='42501'; END IF;
  IF p_status IS NOT NULL AND p_status NOT IN ('requested','approved','rejected','processing','processed','failed') THEN RAISE EXCEPTION 'Invalid refund status filter' USING ERRCODE='22023'; END IF;
  IF v_limit NOT BETWEEN 1 AND 100 OR v_offset < 0 OR v_offset > 10000 THEN RAISE EXCEPTION 'Invalid pagination' USING ERRCODE='22023'; END IF;
  RETURN QUERY
  SELECT refund.id,refund.refund_number,refund.payment_id,refund.user_id,refund.vendor_id,refund.amount,refund.currency,
    refund.reason,refund.status,refund.created_at,
    payment.payment_reference,payment.amount,payment.status,profile.full_name,profile.email,vendor.business_name,count(*) OVER()
  FROM public.refunds refund
  JOIN public.payments payment ON payment.id=refund.payment_id
  LEFT JOIN public.profiles profile ON profile.id=refund.user_id
  LEFT JOIN public.vendors vendor ON vendor.id=refund.vendor_id
  WHERE p_status IS NULL OR refund.status=p_status
  ORDER BY refund.created_at DESC,refund.id
  LIMIT v_limit OFFSET v_offset;
END; $$;

CREATE OR REPLACE FUNCTION public.review_payment_refund(p_refund_id uuid,p_approved boolean,p_notes text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE refund_row public.refunds%ROWTYPE; v_note text:=NULLIF(btrim(p_notes),''); v_decision text;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_super_admin() THEN RAISE EXCEPTION 'Only platform financial administrators can review refunds' USING ERRCODE='42501'; END IF;
  IF p_approved IS NULL THEN RAISE EXCEPTION 'Refund decision is required' USING ERRCODE='22023'; END IF;
  IF v_note IS NULL OR length(v_note) < 10 OR length(v_note) > 500 THEN RAISE EXCEPTION 'A review reason between 10 and 500 characters is required' USING ERRCODE='22023'; END IF;
  SELECT * INTO refund_row FROM public.refunds WHERE id=p_refund_id FOR UPDATE;
  IF NOT FOUND OR refund_row.status <> 'requested' THEN RAISE EXCEPTION 'Refund is not awaiting review' USING ERRCODE='22023'; END IF;
  v_decision:=CASE WHEN p_approved THEN 'approved' ELSE 'rejected' END;
  UPDATE public.refunds SET status=v_decision,reviewed_by=auth.uid(),reviewed_at=now(),notes=v_note WHERE id=p_refund_id;
  INSERT INTO public.transaction_audit_log(payment_id,new_status,changed_by,reason,metadata)
  VALUES(refund_row.payment_id,(SELECT payment.status FROM public.payments payment WHERE payment.id=refund_row.payment_id),auth.uid(),
    'refund_'||v_decision,jsonb_build_object('refund_id',p_refund_id,'refund_status',v_decision,'review_reason',v_note));
  PERFORM public.record_trusted_admin_action(
    'refund.'||v_decision,'refunds','refund',p_refund_id,
    jsonb_build_object('reason',v_note,'amount',refund_row.amount,'currency',refund_row.currency)
  );
END; $$;

REVOKE ALL ON FUNCTION public.get_admin_refund_directory(text,integer,integer),public.review_payment_refund(uuid,boolean,text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.get_admin_refund_directory(text,integer,integer),public.review_payment_refund(uuid,boolean,text) TO authenticated;

COMMIT;
