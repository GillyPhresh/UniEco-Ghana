-- Extend management search with tenant-scoped catalogue and event records.
-- Excludes prices, inventory quantities, private messages, documents, payments,
-- support content, and all client-supplied authorization scope.
BEGIN;

CREATE INDEX IF NOT EXISTS businesses_management_name_trgm_idx
  ON public.businesses USING gin (lower(name) gin_trgm_ops);
CREATE INDEX IF NOT EXISTS products_management_name_trgm_idx
  ON public.products USING gin (lower(name) gin_trgm_ops);
CREATE INDEX IF NOT EXISTS services_management_name_trgm_idx
  ON public.services USING gin (lower(name) gin_trgm_ops);
CREATE INDEX IF NOT EXISTS events_management_title_trgm_idx
  ON public.events USING gin (lower(title) gin_trgm_ops);

CREATE OR REPLACE FUNCTION public.search_management_records(
  p_query text,
  p_limit integer DEFAULT 20,
  p_offset integer DEFAULT 0
)
RETURNS TABLE(
  resource_type text,
  resource_id uuid,
  title text,
  subtitle text,
  university_id uuid,
  created_at timestamptz,
  total_count bigint
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_query text := NULLIF(btrim(p_query), '');
  v_pattern text;
  v_role text;
  v_limit integer := COALESCE(p_limit, 20);
  v_offset integer := COALESCE(p_offset, 0);
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;
  v_role := public.current_app_role();
  IF v_role IS NULL OR v_role NOT IN ('super_admin', 'university_admin') THEN
    RAISE EXCEPTION 'Management search access required' USING ERRCODE = '42501';
  END IF;
  IF v_query IS NULL OR length(v_query) NOT BETWEEN 3 AND 100 THEN
    RAISE EXCEPTION 'Search must be between 3 and 100 characters' USING ERRCODE = '22023';
  END IF;
  v_pattern := '%' || replace(replace(replace(lower(v_query), E'\\', E'\\\\'), '%', E'\\%'), '_', E'\\_') || '%';
  IF v_limit NOT BETWEEN 1 AND 50 OR v_offset < 0 OR v_offset > 10000 THEN
    RAISE EXCEPTION 'Invalid result limit' USING ERRCODE = '22023';
  END IF;

  RETURN QUERY
  WITH scoped_results AS (
    SELECT 'vendor'::text AS resource_type, vendor.id AS resource_id, vendor.business_name AS title,
      COALESCE(university.name, 'No university') AS subtitle, vendor.university_id, vendor.created_at
    FROM public.vendors vendor
    LEFT JOIN public.universities university ON university.id = vendor.university_id
    WHERE public.can_manage_university(vendor.university_id)
      AND (lower(vendor.business_name) LIKE v_pattern ESCAPE E'\\'
        OR lower(COALESCE(vendor.business_slug, '')) LIKE v_pattern ESCAPE E'\\')

    UNION ALL

    SELECT 'order'::text, order_row.id, COALESCE(order_row.order_number, order_row.id::text),
      COALESCE(vendor.business_name, 'Unknown vendor') || ' · ' || order_row.status,
      order_row.university_id, order_row.created_at
    FROM public.orders order_row
    LEFT JOIN public.vendors vendor ON vendor.id = order_row.vendor_id
    WHERE public.can_manage_university(order_row.university_id)
      AND (lower(COALESCE(order_row.order_number, '')) LIKE v_pattern ESCAPE E'\\'
        OR lower(COALESCE(vendor.business_name, '')) LIKE v_pattern ESCAPE E'\\')

    UNION ALL

    SELECT 'university'::text, university.id, university.name,
      COALESCE(university.city, university.region, 'Ghana'), university.id, university.created_at
    FROM public.universities university
    WHERE public.can_manage_university(university.id)
      AND (lower(university.name) LIKE v_pattern ESCAPE E'\\'
        OR lower(COALESCE(university.short_name, '')) LIKE v_pattern ESCAPE E'\\')

    UNION ALL

    SELECT 'business'::text, business.id, business.name,
      COALESCE(university.name, 'No university'), COALESCE(business.university_id, vendor.university_id), business.created_at
    FROM public.businesses business
    JOIN public.vendors vendor ON vendor.id = business.vendor_id
    LEFT JOIN public.universities university ON university.id = COALESCE(business.university_id, vendor.university_id)
    WHERE public.can_manage_university(COALESCE(business.university_id, vendor.university_id))
      AND (lower(business.name) LIKE v_pattern ESCAPE E'\\'
        OR lower(COALESCE(business.slug, '')) LIKE v_pattern ESCAPE E'\\')

    UNION ALL

    SELECT 'product'::text, product.id, product.name, 'Product · ' || business.name,
      COALESCE(product.university_id, business.university_id, vendor.university_id), product.created_at
    FROM public.products product
    JOIN public.businesses business ON business.id = product.business_id
    JOIN public.vendors vendor ON vendor.id = business.vendor_id
    WHERE public.can_manage_university(COALESCE(product.university_id, business.university_id, vendor.university_id))
      AND (lower(product.name) LIKE v_pattern ESCAPE E'\\'
        OR lower(COALESCE(product.slug, '')) LIKE v_pattern ESCAPE E'\\'
        OR lower(business.name) LIKE v_pattern ESCAPE E'\\')

    UNION ALL

    SELECT 'service'::text, service.id, service.name, 'Service · ' || business.name,
      COALESCE(service.university_id, business.university_id, vendor.university_id), service.created_at
    FROM public.services service
    JOIN public.businesses business ON business.id = service.business_id
    JOIN public.vendors vendor ON vendor.id = business.vendor_id
    WHERE public.can_manage_university(COALESCE(service.university_id, business.university_id, vendor.university_id))
      AND (lower(service.name) LIKE v_pattern ESCAPE E'\\'
        OR lower(COALESCE(service.slug, '')) LIKE v_pattern ESCAPE E'\\'
        OR lower(business.name) LIKE v_pattern ESCAPE E'\\')

    UNION ALL

    SELECT 'event'::text, event.id, event.title,
      COALESCE(university.name, 'Platform event'), event.university_id, event.created_at
    FROM public.events event
    LEFT JOIN public.universities university ON university.id = event.university_id
    WHERE public.can_manage_university(event.university_id)
      AND (lower(event.title) LIKE v_pattern ESCAPE E'\\'
        OR lower(COALESCE(university.name, '')) LIKE v_pattern ESCAPE E'\\')
  ), platform_user_results AS (
    SELECT 'user'::text AS resource_type, profile.id AS resource_id,
      COALESCE(profile.full_name, profile.email) AS title,
      role.name AS subtitle, profile.university_id, profile.created_at
    FROM public.profiles profile
    JOIN public.user_roles role ON role.id = profile.role_id
    WHERE v_role = 'super_admin'
      AND (lower(COALESCE(profile.full_name, '')) LIKE v_pattern ESCAPE E'\\'
        OR lower(profile.email) LIKE v_pattern ESCAPE E'\\')
  )
  SELECT results.*, count(*) OVER () AS total_count
  FROM (
    SELECT * FROM scoped_results
    UNION ALL
    SELECT * FROM platform_user_results
  ) results
  ORDER BY created_at DESC, resource_type, resource_id
  LIMIT v_limit OFFSET v_offset;
END;
$$;

REVOKE ALL ON FUNCTION public.search_management_records(text,integer,integer) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.search_management_records(text,integer,integer) TO authenticated;

COMMIT;
