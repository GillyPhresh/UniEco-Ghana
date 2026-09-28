BEGIN;

-- Platform super administrators have the platform-level authority implied by
-- their role. Other reviewers remain limited to the explicit permission.
CREATE OR REPLACE FUNCTION public.review_student_verification(
  p_student_profile_id uuid,
  p_approved boolean,
  p_reason text DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE target_user_id uuid;
BEGIN
  IF NOT (public.is_super_admin() OR public.has_permission('can_review_verifications')) THEN
    RAISE EXCEPTION 'Not authorized to review student verification' USING ERRCODE = '42501';
  END IF;

  SELECT user_id INTO target_user_id
  FROM public.student_profiles
  WHERE id = p_student_profile_id
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Student profile does not exist' USING ERRCODE = 'P0002'; END IF;

  UPDATE public.student_profiles
  SET verification_status = CASE WHEN p_approved THEN 'verified' ELSE 'rejected' END,
      is_verified_student = p_approved,
      rejection_reason = CASE WHEN p_approved THEN NULL ELSE NULLIF(trim(p_reason), '') END
  WHERE id = p_student_profile_id;

  INSERT INTO public.audit_logs (actor_id,target_id,action,entity_type,entity_id,metadata)
  VALUES (auth.uid(),target_user_id,CASE WHEN p_approved THEN 'student_verification_approved' ELSE 'student_verification_rejected' END,'student_profiles',p_student_profile_id,jsonb_build_object('reason',p_reason));
END $$;

DROP POLICY IF EXISTS students_read_own_or_review ON public.student_profiles;
CREATE POLICY students_read_own_or_review ON public.student_profiles
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR public.is_super_admin()
    OR public.has_permission('can_review_verifications')
  );

REVOKE ALL ON FUNCTION public.review_student_verification(uuid, boolean, text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.review_student_verification(uuid, boolean, text) TO authenticated;

COMMIT;
