-- Fix the super-admin user directory role-filter validation.
-- The output column `id` is also visible inside PL/pgSQL, so the unqualified
-- user_roles.id reference is ambiguous at runtime.
BEGIN;

CREATE OR REPLACE FUNCTION public.get_admin_user_directory(
  p_search text DEFAULT NULL,
  p_role_id smallint DEFAULT NULL,
  p_status text DEFAULT NULL,
  p_limit integer DEFAULT 20,
  p_offset integer DEFAULT 0
)
RETURNS TABLE(
  id uuid,
  full_name text,
  email text,
  role_id smallint,
  role_name text,
  status text,
  is_active boolean,
  university_name text,
  created_at timestamptz,
  total_count bigint
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_search text := NULLIF(btrim(p_search), '');
  v_status text := NULLIF(btrim(p_status), '');
  v_limit integer := COALESCE(p_limit, 20);
  v_offset integer := COALESCE(p_offset, 0);
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Super administrator access required' USING ERRCODE = '42501';
  END IF;
  IF v_search IS NOT NULL AND length(v_search) NOT BETWEEN 3 AND 100 THEN
    RAISE EXCEPTION 'Search must be between 3 and 100 characters' USING ERRCODE = '22023';
  END IF;
  IF p_role_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.user_roles AS role_filter WHERE role_filter.id = p_role_id
  ) THEN
    RAISE EXCEPTION 'Unknown role filter' USING ERRCODE = '22023';
  END IF;
  IF v_status IS NOT NULL AND v_status NOT IN ('active', 'suspended', 'inactive', 'pending') THEN
    RAISE EXCEPTION 'Invalid account status filter' USING ERRCODE = '22023';
  END IF;
  IF v_limit NOT BETWEEN 1 AND 100 OR v_offset < 0 OR v_offset > 10000 THEN
    RAISE EXCEPTION 'Invalid pagination' USING ERRCODE = '22023';
  END IF;

  RETURN QUERY
  SELECT p.id, p.full_name, p.email, p.role_id, role.name, p.status, p.is_active,
    university.name, p.created_at, count(*) OVER ()
  FROM public.profiles AS p
  JOIN public.user_roles AS role ON role.id = p.role_id
  LEFT JOIN public.universities AS university ON university.id = p.university_id
  WHERE (
      v_search IS NULL
      OR position(lower(v_search) in lower(COALESCE(p.full_name, ''))) > 0
      OR position(lower(v_search) in lower(p.email)) > 0
    )
    AND (p_role_id IS NULL OR p.role_id = p_role_id)
    AND (v_status IS NULL OR p.status = v_status)
  ORDER BY p.created_at DESC
  LIMIT v_limit OFFSET v_offset;
END;
$$;

REVOKE ALL ON FUNCTION public.get_admin_user_directory(text, smallint, text, integer, integer)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_admin_user_directory(text, smallint, text, integer, integer)
  TO authenticated;

COMMIT;
