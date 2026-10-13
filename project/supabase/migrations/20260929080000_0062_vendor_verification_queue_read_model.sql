-- Narrow verification queue read model. It does not disclose document paths;
-- document access remains in the existing signed-document authorization flow.
BEGIN;

CREATE INDEX IF NOT EXISTS vendors_verification_queue_idx
  ON public.vendors (is_verified, created_at DESC);

CREATE OR REPLACE FUNCTION public.get_vendor_verification_queue(
  p_status text DEFAULT 'unverified',
  p_limit integer DEFAULT 30,
  p_offset integer DEFAULT 0
)
RETURNS TABLE(
  id uuid,
  business_name text,
  business_type text,
  logo_url text,
  contact_phone text,
  is_verified boolean,
  is_active boolean,
  is_student_business boolean,
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
  v_status text := COALESCE(NULLIF(btrim(p_status), ''), 'unverified');
  v_limit integer := COALESCE(p_limit, 30);
  v_offset integer := COALESCE(p_offset, 0);
BEGIN
  IF auth.uid() IS NULL OR NOT (public.is_super_admin() OR public.has_permission('can_review_verifications')) THEN
    RAISE EXCEPTION 'Verification reviewer access required' USING ERRCODE = '42501';
  END IF;
  IF v_status NOT IN ('all', 'unverified', 'verified') THEN
    RAISE EXCEPTION 'Invalid verification status filter' USING ERRCODE = '22023';
  END IF;
  IF v_limit NOT BETWEEN 1 AND 100 OR v_offset < 0 OR v_offset > 10000 THEN
    RAISE EXCEPTION 'Invalid pagination' USING ERRCODE = '22023';
  END IF;

  RETURN QUERY
  SELECT
    v.id, v.business_name, v.business_type, v.logo_url, v.contact_phone,
    v.is_verified, v.is_active, v.is_student_business, v.rating_avg, v.rating_count,
    v.created_at, u.name, owner.full_name, owner.email, count(*) OVER ()
  FROM public.vendors v
  LEFT JOIN public.universities u ON u.id = v.university_id
  JOIN public.profiles owner ON owner.id = v.owner_id
  WHERE (v_status = 'all' OR (v_status = 'verified' AND v.is_verified) OR (v_status = 'unverified' AND NOT v.is_verified))
  ORDER BY v.created_at DESC
  LIMIT v_limit OFFSET v_offset;
END;
$$;

REVOKE ALL ON FUNCTION public.get_vendor_verification_queue(text,integer,integer) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_vendor_verification_queue(text,integer,integer) TO authenticated;

COMMIT;
