-- Management order monitoring: narrow read models only. Order transitions stay
-- in the existing resource-specific customer/vendor/delivery procedures.
BEGIN;

CREATE INDEX IF NOT EXISTS orders_university_status_created_idx
  ON public.orders (university_id, status, created_at DESC);

CREATE OR REPLACE FUNCTION public.get_admin_order_monitoring(
  p_status text DEFAULT NULL,
  p_search text DEFAULT NULL,
  p_limit integer DEFAULT 20,
  p_offset integer DEFAULT 0
)
RETURNS TABLE(
  id uuid,
  order_number text,
  university_id uuid,
  university_name text,
  buyer_id uuid,
  buyer_full_name text,
  buyer_email text,
  vendor_id uuid,
  vendor_business_name text,
  status text,
  total_amount numeric,
  currency text,
  order_type text,
  delivery_method text,
  created_at timestamptz,
  completed_at timestamptz,
  items_count integer,
  total_count bigint
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_role text;
  v_status text := NULLIF(btrim(p_status), '');
  v_search text := NULLIF(btrim(p_search), '');
  v_limit integer := COALESCE(p_limit, 20);
  v_offset integer := COALESCE(p_offset, 0);
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;

  v_role := public.current_app_role();
  IF v_role NOT IN ('super_admin', 'university_admin') THEN
    RAISE EXCEPTION 'Management order access required' USING ERRCODE = '42501';
  END IF;
  IF v_status IS NOT NULL AND v_status NOT IN ('pending', 'accepted', 'processing', 'ready', 'out_for_delivery', 'completed', 'cancelled') THEN
    RAISE EXCEPTION 'Invalid order status filter' USING ERRCODE = '22023';
  END IF;
  IF v_search IS NOT NULL AND length(v_search) NOT BETWEEN 3 AND 100 THEN
    RAISE EXCEPTION 'Search must be between 3 and 100 characters' USING ERRCODE = '22023';
  END IF;
  IF v_limit NOT BETWEEN 1 AND 100 OR v_offset < 0 OR v_offset > 10000 THEN
    RAISE EXCEPTION 'Invalid pagination' USING ERRCODE = '22023';
  END IF;

  RETURN QUERY
  SELECT
    o.id,
    o.order_number,
    o.university_id,
    u.name,
    o.buyer_id,
    buyer.full_name,
    buyer.email,
    o.vendor_id,
    vendor.business_name,
    o.status,
    o.total_amount,
    o.currency,
    o.order_type,
    o.delivery_method,
    o.created_at,
    o.completed_at,
    COALESCE(item_counts.items_count, 0)::integer,
    count(*) OVER ()
  FROM public.orders o
  LEFT JOIN public.universities u ON u.id = o.university_id
  JOIN public.profiles buyer ON buyer.id = o.buyer_id
  LEFT JOIN public.vendors vendor ON vendor.id = o.vendor_id
  LEFT JOIN LATERAL (
    SELECT count(*)::integer AS items_count
    FROM public.order_items item
    WHERE item.order_id = o.id
  ) item_counts ON true
  WHERE public.can_manage_university(o.university_id)
    AND (v_status IS NULL OR o.status = v_status)
    AND (
      v_search IS NULL
      OR position(lower(v_search) in lower(COALESCE(o.order_number, ''))) > 0
      OR position(lower(v_search) in lower(COALESCE(buyer.full_name, ''))) > 0
      OR position(lower(v_search) in lower(buyer.email)) > 0
      OR position(lower(v_search) in lower(COALESCE(vendor.business_name, ''))) > 0
    )
  ORDER BY o.created_at DESC
  LIMIT v_limit OFFSET v_offset;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_admin_order_monitoring_summary()
RETURNS TABLE(total bigint, pending bigint, completed bigint, cancelled bigint)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE v_role text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;
  v_role := public.current_app_role();
  IF v_role NOT IN ('super_admin', 'university_admin') THEN
    RAISE EXCEPTION 'Management order access required' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    count(*)::bigint,
    count(*) FILTER (WHERE o.status = 'pending')::bigint,
    count(*) FILTER (WHERE o.status = 'completed')::bigint,
    count(*) FILTER (WHERE o.status = 'cancelled')::bigint
  FROM public.orders o
  WHERE public.can_manage_university(o.university_id);
END;
$$;

REVOKE ALL ON FUNCTION public.get_admin_order_monitoring(text,text,integer,integer) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.get_admin_order_monitoring_summary() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_admin_order_monitoring(text,text,integer,integer), public.get_admin_order_monitoring_summary() TO authenticated;

COMMIT;
