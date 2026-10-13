-- Private, bounded subscription read and export workflows. The browser never
-- downloads the full financial/owner-linked subscription table directly.
BEGIN;

CREATE OR REPLACE FUNCTION public.get_admin_subscription_directory(
  p_status text DEFAULT NULL,p_limit integer DEFAULT 20,p_offset integer DEFAULT 0
)
RETURNS TABLE(
  id uuid,vendor_id uuid,plan text,status text,started_at timestamptz,ends_at timestamptz,
  amount numeric,currency text,created_at timestamptz,business_name text,business_slug text,total_count bigint
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE v_limit integer:=COALESCE(p_limit,20); v_offset integer:=COALESCE(p_offset,0);
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_super_admin() THEN RAISE EXCEPTION 'Super administrator access required' USING ERRCODE='42501'; END IF;
  IF p_status IS NOT NULL AND p_status NOT IN ('pending','active','expired','cancelled') THEN RAISE EXCEPTION 'Invalid subscription status filter' USING ERRCODE='22023'; END IF;
  IF v_limit NOT BETWEEN 1 AND 100 OR v_offset < 0 OR v_offset > 10000 THEN RAISE EXCEPTION 'Invalid pagination' USING ERRCODE='22023'; END IF;
  RETURN QUERY
  SELECT s.id,s.vendor_id,s.plan,s.status,s.started_at,s.ends_at,s.amount,s.currency,s.created_at,
    v.business_name,v.business_slug,count(*) OVER()
  FROM public.subscriptions s
  JOIN public.vendors v ON v.id=s.vendor_id
  WHERE p_status IS NULL OR s.status=p_status
  ORDER BY s.created_at DESC,s.id
  LIMIT v_limit OFFSET v_offset;
END; $$;

CREATE OR REPLACE FUNCTION public.export_admin_subscriptions(p_status text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE v_count bigint; v_rows jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_super_admin() THEN RAISE EXCEPTION 'Super administrator access required' USING ERRCODE='42501'; END IF;
  IF p_status IS NOT NULL AND p_status NOT IN ('pending','active','expired','cancelled') THEN RAISE EXCEPTION 'Invalid subscription status filter' USING ERRCODE='22023'; END IF;
  SELECT count(*) INTO v_count FROM public.subscriptions s WHERE p_status IS NULL OR s.status=p_status;
  IF v_count > 5000 THEN RAISE EXCEPTION 'Export exceeds the 5000-record limit; apply a status filter' USING ERRCODE='22023'; END IF;
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id',s.id,'vendor',v.business_name,'plan',s.plan,'status',s.status,
    'started_at',s.started_at,'ends_at',s.ends_at,'amount',s.amount,'currency',s.currency
  ) ORDER BY s.created_at DESC,s.id),'[]'::jsonb)
  INTO v_rows
  FROM public.subscriptions s JOIN public.vendors v ON v.id=s.vendor_id
  WHERE p_status IS NULL OR s.status=p_status;
  PERFORM public.record_trusted_admin_action(
    'subscriptions.export','subscriptions','subscriptions',NULL,
    jsonb_build_object('format','csv','status',p_status,'record_count',v_count)
  );
  RETURN v_rows;
END; $$;

REVOKE ALL ON FUNCTION public.get_admin_subscription_directory(text,integer,integer),public.export_admin_subscriptions(text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.get_admin_subscription_directory(text,integer,integer),public.export_admin_subscriptions(text) TO authenticated;

COMMIT;
