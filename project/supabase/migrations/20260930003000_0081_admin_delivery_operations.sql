-- Read-only delivery operations projection. State transitions remain in the
-- existing vendor/customer procedures; this RPC exposes no addresses, notes,
-- contact details, or financial fields.
BEGIN;

CREATE INDEX IF NOT EXISTS order_fulfillment_events_order_created_idx
  ON public.order_fulfillment_events (order_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.get_admin_delivery_operations(
  p_status text DEFAULT NULL,
  p_search text DEFAULT NULL,
  p_limit integer DEFAULT 50,
  p_offset integer DEFAULT 0
)
RETURNS TABLE(
  order_id uuid,
  order_number text,
  university_name text,
  vendor_name text,
  order_status text,
  delivery_method text,
  latest_event text,
  latest_event_at timestamptz,
  created_at timestamptz,
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
  v_limit integer := COALESCE(p_limit, 50);
  v_offset integer := COALESCE(p_offset, 0);
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;

  v_role := public.current_app_role();
  IF v_role NOT IN ('super_admin', 'university_admin') THEN
    RAISE EXCEPTION 'Management delivery access required' USING ERRCODE = '42501';
  END IF;
  IF v_status IS NOT NULL AND v_status NOT IN ('pending', 'accepted', 'processing', 'ready', 'out_for_delivery', 'completed', 'cancelled') THEN
    RAISE EXCEPTION 'Invalid delivery status filter' USING ERRCODE = '22023';
  END IF;
  IF v_search IS NOT NULL AND length(v_search) NOT BETWEEN 3 AND 100 THEN
    RAISE EXCEPTION 'Search must be between 3 and 100 characters' USING ERRCODE = '22023';
  END IF;
  IF v_limit NOT BETWEEN 1 AND 100 OR v_offset < 0 OR v_offset > 10000 THEN
    RAISE EXCEPTION 'Invalid pagination' USING ERRCODE = '22023';
  END IF;

  RETURN QUERY
  SELECT o.id, o.order_number, university.name, vendor.business_name, o.status,
    o.delivery_method, latest.event_type, latest.created_at, o.created_at,
    count(*) OVER ()
  FROM public.orders o
  LEFT JOIN public.universities university ON university.id = o.university_id
  LEFT JOIN public.vendors vendor ON vendor.id = o.vendor_id
  LEFT JOIN LATERAL (
    SELECT fulfillment.event_type, fulfillment.created_at
    FROM public.order_fulfillment_events fulfillment
    WHERE fulfillment.order_id = o.id
    ORDER BY fulfillment.created_at DESC
    LIMIT 1
  ) latest ON true
  WHERE public.can_manage_university(o.university_id)
    AND (o.delivery_method = 'delivery' OR o.status IN ('ready', 'out_for_delivery'))
    AND (v_status IS NULL OR o.status = v_status)
    AND (v_search IS NULL OR
      position(lower(v_search) IN lower(COALESCE(o.order_number, ''))) > 0 OR
      position(lower(v_search) IN lower(COALESCE(vendor.business_name, ''))) > 0)
  ORDER BY
    CASE WHEN o.status IN ('out_for_delivery', 'ready') THEN 0 ELSE 1 END,
    COALESCE(latest.created_at, o.updated_at) DESC
  LIMIT v_limit OFFSET v_offset;
END;
$$;

REVOKE ALL ON FUNCTION public.get_admin_delivery_operations(text, text, integer, integer) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_admin_delivery_operations(text, text, integer, integer) TO authenticated;

COMMIT;
