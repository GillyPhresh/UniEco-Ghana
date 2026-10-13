BEGIN;

-- Keep identity, tenant, row-lock, and audit authority in the existing RPC;
-- require an audit reason for approval as well as rejection.
CREATE OR REPLACE FUNCTION public.review_student_verification(
  p_student_profile_id uuid,
  p_approved boolean,
  p_reason text DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  target_user_id uuid;
  target_university_id uuid;
  v_role text := public.current_app_role();
  clean_reason text := NULLIF(btrim(p_reason), '');
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authorized to review student verification' USING ERRCODE = '42501';
  END IF;
  IF p_approved IS NULL THEN
    RAISE EXCEPTION 'Verification decision is required' USING ERRCODE = '22023';
  END IF;
  IF clean_reason IS NULL OR length(clean_reason) NOT BETWEEN 10 AND 500 THEN
    RAISE EXCEPTION 'A decision reason between 10 and 500 characters is required' USING ERRCODE = '22023';
  END IF;

  SELECT student.user_id, COALESCE(student.university_id, profile.university_id)
    INTO target_user_id, target_university_id
  FROM public.student_profiles student
  JOIN public.profiles profile ON profile.id = student.user_id
  WHERE student.id = p_student_profile_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Student profile does not exist' USING ERRCODE = 'P0002';
  END IF;

  IF v_role = 'university_admin' THEN
    IF NOT public.can_manage_university(target_university_id) THEN
      RAISE EXCEPTION 'Student verification is outside your university scope' USING ERRCODE = '42501';
    END IF;
  ELSIF NOT (public.is_super_admin() OR public.has_permission('can_review_verifications')) THEN
    RAISE EXCEPTION 'Not authorized to review student verification' USING ERRCODE = '42501';
  END IF;

  UPDATE public.student_profiles
  SET verification_status = CASE WHEN p_approved THEN 'verified' ELSE 'rejected' END,
      is_verified_student = p_approved,
      rejection_reason = CASE WHEN p_approved THEN NULL ELSE clean_reason END,
      updated_at = now()
  WHERE id = p_student_profile_id;

  INSERT INTO public.audit_logs (actor_id, target_id, action, entity_type, entity_id, metadata)
  VALUES (auth.uid(), target_user_id,
    CASE WHEN p_approved THEN 'student_verification_approved' ELSE 'student_verification_rejected' END,
    'student_profiles', p_student_profile_id,
    jsonb_build_object('reason', clean_reason, 'university_id', target_university_id));
END;
$$;

REVOKE ALL ON FUNCTION public.review_student_verification(uuid, boolean, text)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.review_student_verification(uuid, boolean, text) TO authenticated;

COMMIT;
