-- Narrow vendor directory projection for super-admins and assigned university admins.
-- University administrators receive no cross-tenant rows or owner email addresses.
BEGIN;

CREATE INDEX IF NOT EXISTS vendors_business_name_search_trgm_idx
  ON public.vendors USING gin (lower(business_name) gin_trgm_ops);
CREATE INDEX IF NOT EXISTS vendors_business_slug_search_trgm_idx
  ON public.vendors USING gin (lower(business_slug) gin_trgm_ops);

CREATE OR REPLACE FUNCTION public.get_admin_business_directory(
  p_search text DEFAULT NULL,
  p_verified boolean DEFAULT NULL,
  p_limit integer DEFAULT 20,
  p_offset integer DEFAULT 0
)
RETURNS TABLE(
  id uuid,
  business_name text,
  business_type text,
  is_verified boolean,
  is_active boolean,
  is_student_business boolean,
  delivery_available boolean,
  rating_avg numeric,
  rating_count integer,
  created_at timestamptz,
  university_name text,
  owner_full_name text,
  owner_email text,
  total_count bigint
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_role text;
  v_search text := NULLIF(btrim(p_search), '');
  v_pattern text;
  v_limit integer := COALESCE(p_limit, 20);
  v_offset integer := COALESCE(p_offset, 0);
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;
  v_role := public.current_app_role();
  IF v_role IS NULL OR v_role NOT IN ('super_admin', 'university_admin') THEN
    RAISE EXCEPTION 'Business directory access required' USING ERRCODE = '42501';
  END IF;
  IF v_search IS NOT NULL AND length(v_search) NOT BETWEEN 3 AND 100 THEN
    RAISE EXCEPTION 'Search must be between 3 and 100 characters' USING ERRCODE = '22023';
  END IF;
  IF v_search IS NOT NULL THEN
    v_pattern := '%' || replace(replace(replace(lower(v_search), E'\\', E'\\\\'), '%', E'\\%'), '_', E'\\_') || '%';
  END IF;
  IF v_limit NOT BETWEEN 1 AND 100 OR v_offset < 0 OR v_offset > 10000 THEN
    RAISE EXCEPTION 'Invalid pagination' USING ERRCODE = '22023';
  END IF;

  RETURN QUERY
  SELECT v.id, v.business_name, v.business_type, v.is_verified, v.is_active,
    v.is_student_business, v.delivery_available, v.rating_avg, v.rating_count,
    v.created_at, u.name, owner.full_name,
    CASE WHEN v_role = 'super_admin' THEN owner.email ELSE NULL END,
    count(*) OVER()
  FROM public.vendors v
  LEFT JOIN public.universities u ON u.id = v.university_id
  LEFT JOIN public.profiles owner ON owner.id = v.owner_id
  WHERE (v_role = 'super_admin' OR public.can_manage_university(v.university_id))
    AND (p_verified IS NULL OR v.is_verified = p_verified)
    AND (v_search IS NULL OR lower(v.business_name) LIKE v_pattern ESCAPE E'\\'
      OR lower(COALESCE(v.business_slug, '')) LIKE v_pattern ESCAPE E'\\')
  ORDER BY v.created_at DESC
  LIMIT v_limit OFFSET v_offset;
END;
$$;

REVOKE ALL ON FUNCTION public.get_admin_business_directory(text,boolean,integer,integer) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_admin_business_directory(text,boolean,integer,integer) TO authenticated;

COMMIT;
