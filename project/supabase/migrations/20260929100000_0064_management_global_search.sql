-- Permission-aware management search. It deliberately excludes private message
-- bodies, document records, payment details, and support-ticket content.
BEGIN;

CREATE INDEX IF NOT EXISTS profiles_directory_search_idx ON public.profiles (created_at DESC);
CREATE INDEX IF NOT EXISTS vendors_management_search_idx ON public.vendors (university_id, created_at DESC);
CREATE INDEX IF NOT EXISTS vendors_management_name_trgm_idx ON public.vendors USING gin (lower(business_name) gin_trgm_ops);
CREATE INDEX IF NOT EXISTS vendors_management_slug_trgm_idx ON public.vendors USING gin (lower(business_slug) gin_trgm_ops);
CREATE INDEX IF NOT EXISTS orders_management_number_trgm_idx ON public.orders USING gin (lower(order_number) gin_trgm_ops);
CREATE INDEX IF NOT EXISTS universities_management_name_trgm_idx ON public.universities USING gin (lower(name) gin_trgm_ops);
CREATE INDEX IF NOT EXISTS universities_management_short_name_trgm_idx ON public.universities USING gin (lower(short_name) gin_trgm_ops);
CREATE INDEX IF NOT EXISTS profiles_management_name_trgm_idx ON public.profiles USING gin (lower(full_name) gin_trgm_ops);
CREATE INDEX IF NOT EXISTS profiles_management_email_trgm_idx ON public.profiles USING gin (lower(email) gin_trgm_ops);

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
    SELECT
      'vendor'::text AS resource_type, v.id AS resource_id, v.business_name AS title,
      COALESCE(u.name, 'No university') AS subtitle, v.university_id, v.created_at
    FROM public.vendors v
    LEFT JOIN public.universities u ON u.id=v.university_id
    WHERE public.can_manage_university(v.university_id)
      AND (lower(v.business_name) LIKE v_pattern ESCAPE E'\\' OR lower(COALESCE(v.business_slug, '')) LIKE v_pattern ESCAPE E'\\')

    UNION ALL

    SELECT
      'order'::text, o.id, COALESCE(o.order_number, o.id::text),
      COALESCE(v.business_name, 'Unknown vendor') || ' · ' || o.status, o.university_id, o.created_at
    FROM public.orders o
    LEFT JOIN public.vendors v ON v.id=o.vendor_id
    WHERE public.can_manage_university(o.university_id)
      AND (lower(COALESCE(o.order_number, '')) LIKE v_pattern ESCAPE E'\\' OR lower(COALESCE(v.business_name, '')) LIKE v_pattern ESCAPE E'\\')

    UNION ALL

    SELECT
      'university'::text, u.id, u.name, COALESCE(u.city, u.region, 'Ghana'), u.id, u.created_at
    FROM public.universities u
    WHERE public.can_manage_university(u.id)
      AND (lower(u.name) LIKE v_pattern ESCAPE E'\\' OR lower(COALESCE(u.short_name, '')) LIKE v_pattern ESCAPE E'\\')
  ), platform_user_results AS (
    SELECT
      'user'::text AS resource_type, p.id AS resource_id, COALESCE(p.full_name, p.email) AS title,
      r.name AS subtitle, p.university_id, p.created_at
    FROM public.profiles p
    JOIN public.user_roles r ON r.id=p.role_id
    WHERE v_role='super_admin'
      AND (lower(COALESCE(p.full_name, '')) LIKE v_pattern ESCAPE E'\\' OR lower(p.email) LIKE v_pattern ESCAPE E'\\')
  )
  SELECT results.*, count(*) OVER() AS total_count FROM (
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
