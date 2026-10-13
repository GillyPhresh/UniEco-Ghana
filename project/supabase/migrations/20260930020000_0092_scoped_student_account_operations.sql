-- Narrow reasoned account-status operations for platform admins and assigned
-- university admins. Role changes remain in their dedicated workflow.
BEGIN;

CREATE OR REPLACE FUNCTION public.record_trusted_university_student_action(
  p_action text,
  p_university_id uuid,
  p_student_id uuid,
  p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF auth.uid() IS NULL
    OR public.current_app_role() IS DISTINCT FROM 'university_admin'
    OR NOT public.can_manage_university(p_university_id) THEN
    RAISE EXCEPTION 'Assigned university administrator access required' USING ERRCODE = '42501';
  END IF;
  IF p_action IS NULL OR p_action NOT IN ('student.account_suspended', 'student.account_reactivated') THEN
    RAISE EXCEPTION 'Invalid student account audit action' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.admin_actions (admin_id, action, module, target_type, target_id, metadata)
  VALUES (auth.uid(), p_action, 'students', 'profile', p_student_id,
    COALESCE(p_metadata, '{}'::jsonb) || jsonb_build_object('university_id', p_university_id));
  INSERT INTO public.audit_logs (actor_id, target_id, action, entity_type, entity_id, metadata)
  VALUES (auth.uid(), p_student_id, p_action, 'profile', p_student_id,
    COALESCE(p_metadata, '{}'::jsonb) || jsonb_build_object('university_id', p_university_id));
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_set_student_account_status(
  p_student_id uuid,
  p_status text,
  p_reason text
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_profile public.profiles%ROWTYPE;
  v_university_id uuid;
  v_role text := public.current_app_role();
  v_reason text := NULLIF(btrim(p_reason), '');
BEGIN
  IF auth.uid() IS NULL OR NOT (
    public.is_super_admin()
    OR v_role = 'university_admin'
  ) THEN
    RAISE EXCEPTION 'Student account management access required' USING ERRCODE = '42501';
  END IF;
  IF p_student_id IS NULL OR p_student_id = auth.uid() THEN
    RAISE EXCEPTION 'Invalid student account target' USING ERRCODE = '42501';
  END IF;
  IF p_status IS NULL OR p_status NOT IN ('active', 'suspended') THEN
    RAISE EXCEPTION 'Only active or suspended student states are supported' USING ERRCODE = '22023';
  END IF;
  IF v_reason IS NULL OR length(v_reason) NOT BETWEEN 10 AND 500 THEN
    RAISE EXCEPTION 'A reason between 10 and 500 characters is required' USING ERRCODE = '22023';
  END IF;

  SELECT profile.* INTO v_profile
  FROM public.profiles AS profile
  JOIN public.user_roles AS role ON role.id = profile.role_id
  WHERE profile.id = p_student_id AND role.name IN ('student', 'student_vendor')
  FOR UPDATE OF profile;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Eligible student account not found' USING ERRCODE = 'P0002';
  END IF;

  SELECT COALESCE(student.university_id, v_profile.university_id) INTO v_university_id
  FROM (SELECT p_student_id AS user_id) AS target
  LEFT JOIN public.student_profiles AS student ON student.user_id = target.user_id;

  IF v_role = 'university_admin' AND (
    v_university_id IS NULL OR NOT public.can_manage_university(v_university_id)
  ) THEN
    RAISE EXCEPTION 'Student account is outside your assigned university' USING ERRCODE = '42501';
  END IF;
  IF v_profile.status IS NULL OR v_profile.status NOT IN ('active', 'suspended', 'inactive') THEN
    RAISE EXCEPTION 'Pending student accounts must use the verification workflow' USING ERRCODE = '22023';
  END IF;
  IF v_profile.status = p_status AND v_profile.is_active = (p_status = 'active') THEN
    RAISE EXCEPTION 'Student account already has this status' USING ERRCODE = '22023';
  END IF;

  UPDATE public.profiles
  SET status = p_status, is_active = (p_status = 'active'), updated_at = now()
  WHERE id = p_student_id;

  IF v_role = 'university_admin' THEN
    PERFORM public.record_trusted_university_student_action(
      CASE WHEN p_status = 'suspended' THEN 'student.account_suspended' ELSE 'student.account_reactivated' END,
      v_university_id, p_student_id,
      jsonb_build_object('reason', v_reason, 'previous_status', v_profile.status,
        'previous_is_active', v_profile.is_active, 'current_status', p_status,
        'current_is_active', p_status = 'active')
    );
  ELSE
    PERFORM public.record_trusted_admin_action(
      CASE WHEN p_status = 'suspended' THEN 'student.account_suspended' ELSE 'student.account_reactivated' END,
      'students', 'profile', p_student_id,
      jsonb_build_object('reason', v_reason, 'university_id', v_university_id,
        'previous_status', v_profile.status, 'previous_is_active', v_profile.is_active,
        'current_status', p_status, 'current_is_active', p_status = 'active')
    );
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.record_trusted_university_student_action(text, uuid, uuid, jsonb)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.admin_set_student_account_status(uuid, text, text)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_set_student_account_status(uuid, text, text) TO authenticated;

COMMIT;
