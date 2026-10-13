-- Add a scoped reviewer projection and short-lived authorization for private
-- student verification documents. The document path never enters the browser.
BEGIN;

CREATE INDEX IF NOT EXISTS student_profiles_verification_created_idx
  ON public.student_profiles(verification_status, created_at DESC, id);

CREATE OR REPLACE FUNCTION public.get_admin_student_verification_queue(
  p_status text DEFAULT 'pending',
  p_limit integer DEFAULT 30,
  p_offset integer DEFAULT 0
)
RETURNS TABLE(
  id uuid,
  user_id uuid,
  student_id_number text,
  program_of_study text,
  faculty text,
  department text,
  level text,
  verification_status text,
  is_verified_student boolean,
  has_student_id_document boolean,
  rejection_reason text,
  created_at timestamptz,
  user_email text,
  user_full_name text,
  user_avatar_url text,
  university_name text,
  total_count bigint
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_role text := public.current_app_role();
  v_status text := COALESCE(NULLIF(btrim(p_status), ''), 'pending');
  v_limit integer := COALESCE(p_limit, 30);
  v_offset integer := COALESCE(p_offset, 0);
BEGIN
  IF auth.uid() IS NULL OR NOT (public.is_super_admin() OR public.has_permission('can_review_verifications') OR v_role = 'university_admin') THEN
    RAISE EXCEPTION 'Student verification reviewer access required' USING ERRCODE = '42501';
  END IF;
  IF v_status NOT IN ('all', 'pending', 'verified', 'rejected') THEN
    RAISE EXCEPTION 'Invalid verification status filter' USING ERRCODE = '22023';
  END IF;
  IF v_limit NOT BETWEEN 1 AND 100 OR v_offset < 0 OR v_offset > 10000 THEN
    RAISE EXCEPTION 'Invalid pagination' USING ERRCODE = '22023';
  END IF;

  RETURN QUERY
  SELECT student.id, student.user_id, student.student_id_number, student.program_of_study,
    student.faculty, student.department, student.level, student.verification_status,
    student.is_verified_student, student.student_id_document_url IS NOT NULL,
    student.rejection_reason, student.created_at, profile.email, profile.full_name,
    profile.avatar_url, university.name, count(*) OVER ()
  FROM public.student_profiles student
  JOIN public.profiles profile ON profile.id = student.user_id
  LEFT JOIN public.universities university ON university.id = COALESCE(student.university_id, profile.university_id)
  WHERE (v_status = 'all' OR student.verification_status = v_status)
    AND (v_role <> 'university_admin'
      OR public.can_manage_university(COALESCE(student.university_id, profile.university_id)))
  ORDER BY student.created_at DESC, student.id
  LIMIT v_limit OFFSET v_offset;
END;
$$;

CREATE OR REPLACE FUNCTION public.authorize_student_verification_document_access(p_student_profile_id uuid)
RETURNS TABLE(bucket_id text, object_path text, owner_id uuid, expires_in_seconds integer)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_owner_id uuid;
  v_university_id uuid;
  v_path text;
  v_role text := public.current_app_role();
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;

  SELECT student.user_id, COALESCE(student.university_id, profile.university_id), student.student_id_document_url
    INTO v_owner_id, v_university_id, v_path
  FROM public.student_profiles student
  JOIN public.profiles profile ON profile.id = student.user_id
  WHERE student.id = p_student_profile_id;
  IF NOT FOUND OR v_path IS NULL THEN
    RAISE EXCEPTION 'Student verification document not found' USING ERRCODE = 'P0002';
  END IF;

  IF auth.uid() <> v_owner_id THEN
    IF v_role = 'university_admin' THEN
      IF NOT public.can_manage_university(v_university_id) THEN
        RAISE EXCEPTION 'Student verification document access denied' USING ERRCODE = '42501';
      END IF;
    ELSIF NOT (public.is_super_admin() OR public.has_permission('can_review_verifications')) THEN
      RAISE EXCEPTION 'Student verification document access denied' USING ERRCODE = '42501';
    END IF;
  END IF;

  -- The owner UUID is the only permitted folder; filenames follow the
  -- onboarding-generated key and may not contain path separators.
  IF v_path !~* ('^' || v_owner_id::text || '/[a-z0-9_-]{1,160}\.(jpg|jpeg|png|webp|pdf)$')
    OR NOT EXISTS (SELECT 1 FROM storage.objects object
      WHERE object.bucket_id = 'student-documents' AND object.name = v_path) THEN
    RAISE EXCEPTION 'Invalid student verification document reference' USING ERRCODE = '22023';
  END IF;

  RETURN QUERY SELECT 'student-documents'::text, v_path, v_owner_id, 300;
END;
$$;

-- Require a reason for rejection and reject forged NULL decisions before audit.
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
  IF (NOT p_approved AND (clean_reason IS NULL OR length(clean_reason) NOT BETWEEN 10 AND 500))
    OR (p_approved AND length(COALESCE(clean_reason, '')) > 500) THEN
    RAISE EXCEPTION 'A rejection reason between 10 and 500 characters is required' USING ERRCODE = '22023';
  END IF;

  SELECT student.user_id, COALESCE(student.university_id, profile.university_id)
    INTO target_user_id, target_university_id
  FROM public.student_profiles student
  JOIN public.profiles profile ON profile.id = student.user_id
  WHERE student.id = p_student_profile_id
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Student profile does not exist' USING ERRCODE = 'P0002'; END IF;
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

REVOKE ALL ON FUNCTION public.get_admin_student_verification_queue(text,integer,integer) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_admin_student_verification_queue(text,integer,integer) TO authenticated;
REVOKE ALL ON FUNCTION public.authorize_student_verification_document_access(uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.authorize_student_verification_document_access(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.review_student_verification(uuid,boolean,text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.review_student_verification(uuid,boolean,text) TO authenticated;

COMMIT;
