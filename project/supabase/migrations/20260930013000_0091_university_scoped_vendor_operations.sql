-- Extend vendor operations to assigned university admins without granting
-- platform-wide vendor visibility or mutation authority.
BEGIN;

CREATE OR REPLACE FUNCTION public.record_trusted_university_vendor_action(
  p_action text,
  p_university_id uuid,
  p_vendor_id uuid,
  p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF auth.uid() IS NULL OR public.current_app_role() IS DISTINCT FROM 'university_admin'
    OR NOT public.can_manage_university(p_university_id) THEN
    RAISE EXCEPTION 'Assigned university administrator access required' USING ERRCODE = '42501';
  END IF;
  IF p_action IS NULL OR p_action NOT IN (
    'vendor.verification_approved', 'vendor.verification_rejected',
    'vendor.suspended', 'vendor.reactivated'
  ) THEN
    RAISE EXCEPTION 'Invalid university vendor audit action' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.admin_actions (admin_id, action, module, target_type, target_id, metadata)
  VALUES (auth.uid(), p_action, 'vendors', 'vendor', p_vendor_id,
    COALESCE(p_metadata, '{}'::jsonb) || jsonb_build_object('university_id', p_university_id));
  INSERT INTO public.audit_logs (actor_id, target_id, action, entity_type, entity_id, metadata)
  VALUES (auth.uid(), p_vendor_id, p_action, 'vendor', p_vendor_id,
    COALESCE(p_metadata, '{}'::jsonb) || jsonb_build_object('university_id', p_university_id));
END;
$$;

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
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_status text := COALESCE(NULLIF(btrim(p_status), ''), 'unverified');
  v_limit integer := COALESCE(p_limit, 30);
  v_offset integer := COALESCE(p_offset, 0);
  v_role text := public.current_app_role();
BEGIN
  IF auth.uid() IS NULL OR NOT (
    public.is_super_admin()
    OR (v_role = 'moderator' AND public.has_permission('can_review_verifications'))
    OR v_role = 'university_admin'
  ) THEN
    RAISE EXCEPTION 'Verification reviewer access required' USING ERRCODE = '42501';
  END IF;
  IF v_status NOT IN ('all', 'unverified', 'verified') THEN
    RAISE EXCEPTION 'Invalid verification status filter' USING ERRCODE = '22023';
  END IF;
  IF v_limit NOT BETWEEN 1 AND 100 OR v_offset < 0 OR v_offset > 10000 THEN
    RAISE EXCEPTION 'Invalid pagination' USING ERRCODE = '22023';
  END IF;

  RETURN QUERY
  SELECT vendor.id, vendor.business_name, vendor.business_type, vendor.logo_url,
    vendor.contact_phone, vendor.is_verified, vendor.is_active,
    vendor.is_student_business, vendor.rating_avg, vendor.rating_count,
    vendor.created_at, university.name, owner.full_name,
    CASE WHEN public.is_super_admin() OR public.has_permission('can_review_verifications')
      THEN owner.email ELSE NULL END,
    count(*) OVER ()
  FROM public.vendors vendor
  LEFT JOIN public.universities university ON university.id = vendor.university_id
  JOIN public.profiles owner ON owner.id = vendor.owner_id
  WHERE (v_status = 'all'
      OR (v_status = 'verified' AND vendor.is_verified)
      OR (v_status = 'unverified' AND NOT vendor.is_verified))
    AND (
      public.is_super_admin()
      OR (v_role = 'moderator' AND public.has_permission('can_review_verifications'))
      OR (v_role = 'university_admin' AND public.can_manage_university(vendor.university_id))
    )
  ORDER BY vendor.created_at DESC, vendor.id
  LIMIT v_limit OFFSET v_offset;
END;
$$;

CREATE OR REPLACE FUNCTION public.review_vendor_verification(
  p_vendor_id uuid,
  p_approved boolean,
  p_reason text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_vendor public.vendors%ROWTYPE;
  v_reason text := NULLIF(btrim(p_reason), '');
  v_role text := public.current_app_role();
BEGIN
  IF auth.uid() IS NULL OR NOT (
    public.is_super_admin()
    OR (v_role = 'moderator' AND public.has_permission('can_review_verifications'))
    OR v_role = 'university_admin'
  ) THEN
    RAISE EXCEPTION 'Verification reviewer access required' USING ERRCODE = '42501';
  END IF;
  IF p_approved IS NULL OR v_reason IS NULL OR length(v_reason) NOT BETWEEN 10 AND 500 THEN
    RAISE EXCEPTION 'A decision reason between 10 and 500 characters is required' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_vendor FROM public.vendors WHERE id = p_vendor_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Vendor does not exist' USING ERRCODE = 'P0002'; END IF;
  IF v_role = 'university_admin' AND NOT public.can_manage_university(v_vendor.university_id) THEN
    RAISE EXCEPTION 'Assigned university vendor access required' USING ERRCODE = '42501';
  END IF;
  IF v_vendor.is_verified = p_approved THEN
    RAISE EXCEPTION 'Vendor verification state is already set; refresh and review again' USING ERRCODE = '22023';
  END IF;

  UPDATE public.vendors SET is_verified = p_approved, updated_at = now()
    WHERE id = v_vendor.id;
  UPDATE public.vendor_profiles
  SET verification_status = CASE WHEN p_approved THEN 'active' ELSE 'rejected' END,
      approved_at = CASE WHEN p_approved THEN now() ELSE NULL END,
      approved_by = CASE WHEN p_approved THEN auth.uid() ELSE NULL END,
      rejection_reason = CASE WHEN p_approved THEN NULL ELSE v_reason END
  WHERE profile_id = v_vendor.owner_id;

  IF v_role = 'university_admin' THEN
    PERFORM public.record_trusted_university_vendor_action(
      CASE WHEN p_approved THEN 'vendor.verification_approved' ELSE 'vendor.verification_rejected' END,
      v_vendor.university_id, v_vendor.id,
      jsonb_build_object('reason', v_reason, 'previous_is_verified', v_vendor.is_verified,
        'current_is_verified', p_approved)
    );
  ELSE
    PERFORM public.record_trusted_admin_action(
      CASE WHEN p_approved THEN 'vendor.verification_approved' ELSE 'vendor.verification_rejected' END,
      'vendors', 'vendor', v_vendor.id,
      jsonb_build_object('reason', v_reason, 'university_id', v_vendor.university_id,
        'previous_is_verified', v_vendor.is_verified, 'current_is_verified', p_approved)
    );
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_vendor_active(
  p_vendor_id uuid,
  p_is_active boolean,
  p_reason text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_vendor public.vendors%ROWTYPE;
  v_reason text := NULLIF(btrim(p_reason), '');
  v_role text := public.current_app_role();
BEGIN
  IF auth.uid() IS NULL OR NOT (public.is_super_admin() OR v_role = 'university_admin') THEN
    RAISE EXCEPTION 'Vendor management access required' USING ERRCODE = '42501';
  END IF;
  IF p_is_active IS NULL OR v_reason IS NULL OR length(v_reason) NOT BETWEEN 10 AND 500 THEN
    RAISE EXCEPTION 'A reason between 10 and 500 characters is required' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_vendor FROM public.vendors WHERE id = p_vendor_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Vendor not found' USING ERRCODE = 'P0002'; END IF;
  IF v_role = 'university_admin' AND NOT public.can_manage_university(v_vendor.university_id) THEN
    RAISE EXCEPTION 'Assigned university vendor access required' USING ERRCODE = '42501';
  END IF;
  IF v_vendor.is_active = p_is_active THEN
    RAISE EXCEPTION 'Vendor status is already set; refresh and review again' USING ERRCODE = '22023';
  END IF;

  UPDATE public.vendors SET is_active = p_is_active, updated_at = now()
    WHERE id = v_vendor.id;

  IF v_role = 'university_admin' THEN
    PERFORM public.record_trusted_university_vendor_action(
      CASE WHEN p_is_active THEN 'vendor.reactivated' ELSE 'vendor.suspended' END,
      v_vendor.university_id, v_vendor.id,
      jsonb_build_object('reason', v_reason, 'previous_is_active', v_vendor.is_active,
        'current_is_active', p_is_active)
    );
  ELSE
    PERFORM public.record_trusted_admin_action(
      CASE WHEN p_is_active THEN 'vendor.reactivated' ELSE 'vendor.suspended' END,
      'vendors', 'vendor', v_vendor.id,
      jsonb_build_object('reason', v_reason, 'university_id', v_vendor.university_id,
        'previous_is_active', v_vendor.is_active, 'current_is_active', p_is_active)
    );
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.record_trusted_university_vendor_action(text, uuid, uuid, jsonb)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.get_vendor_verification_queue(text, integer, integer),
  public.review_vendor_verification(uuid, boolean, text),
  public.set_vendor_active(uuid, boolean, text)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_vendor_verification_queue(text, integer, integer),
  public.review_vendor_verification(uuid, boolean, text),
  public.set_vendor_active(uuid, boolean, text) TO authenticated;

COMMIT;
