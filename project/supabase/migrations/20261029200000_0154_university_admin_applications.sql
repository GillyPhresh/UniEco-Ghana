-- UniEco Ghana university administrator application workflow.
--
-- Students apply for a specific university. Super administrators review the
-- private queue. Only an approved application creates an administrator
-- assignment and a referral token; submission alone grants no privilege.

BEGIN;

CREATE TABLE IF NOT EXISTS public.university_admin_openings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  university_id uuid NOT NULL UNIQUE REFERENCES public.universities(id) ON DELETE RESTRICT,
  title text NOT NULL DEFAULT 'University Administrator Programme',
  description text NOT NULL DEFAULT 'Help students and vendors join UniEco Ghana and support your university community.',
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('draft','open','paused','closed')),
  opens_at timestamptz NOT NULL DEFAULT now(),
  closes_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  CHECK (closes_at IS NULL OR closes_at > opens_at)
);
CREATE INDEX IF NOT EXISTS university_admin_openings_status_idx
  ON public.university_admin_openings(status, opens_at, closes_at);
ALTER TABLE public.university_admin_openings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.university_admin_openings FROM PUBLIC, anon, authenticated, service_role;

CREATE TABLE IF NOT EXISTS public.university_admin_applications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  application_reference text NOT NULL UNIQUE,
  opening_id uuid NOT NULL REFERENCES public.university_admin_openings(id) ON DELETE RESTRICT,
  university_id uuid NOT NULL REFERENCES public.universities(id) ON DELETE RESTRICT,
  applicant_user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','under_review','approved','rejected','withdrawn')),
  phone text NOT NULL CHECK (phone ~ '^\\+?[0-9 ()-]{9,20}$'),
  student_id_number text NOT NULL CHECK (length(trim(student_id_number)) BETWEEN 2 AND 80),
  programme text NOT NULL CHECK (length(trim(programme)) BETWEEN 2 AND 160),
  level text NOT NULL CHECK (length(trim(level)) BETWEEN 1 AND 40),
  availability text NOT NULL CHECK (length(trim(availability)) BETWEEN 2 AND 120),
  experience text NOT NULL CHECK (length(trim(experience)) BETWEEN 10 AND 3000),
  cover_note text NOT NULL CHECK (length(trim(cover_note)) BETWEEN 20 AND 3000),
  cv_path text,
  terms_accepted boolean NOT NULL DEFAULT false CHECK (terms_accepted),
  submitted_at timestamptz NOT NULL DEFAULT now(),
  reviewed_at timestamptz,
  reviewed_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  reviewer_note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS university_admin_one_open_application_idx
  ON public.university_admin_applications(applicant_user_id, university_id)
  WHERE status IN ('pending','under_review','approved');
CREATE INDEX IF NOT EXISTS university_admin_applications_queue_idx
  ON public.university_admin_applications(status, submitted_at DESC);
CREATE INDEX IF NOT EXISTS university_admin_applications_university_idx
  ON public.university_admin_applications(university_id, status, submitted_at DESC);
ALTER TABLE public.university_admin_applications ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.university_admin_applications FROM PUBLIC, anon, authenticated, service_role;

CREATE TABLE IF NOT EXISTS public.university_admin_application_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id uuid NOT NULL REFERENCES public.university_admin_applications(id) ON DELETE RESTRICT,
  from_status text,
  to_status text NOT NULL,
  reason text,
  actor_user_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS university_admin_application_events_app_idx
  ON public.university_admin_application_events(application_id, created_at DESC);
ALTER TABLE public.university_admin_application_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.university_admin_application_events FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.set_university_admin_opening(
  p_university_id uuid,
  p_status text,
  p_title text DEFAULT 'University Administrator Programme',
  p_description text DEFAULT 'Help students and vendors join UniEco Ghana and support your university community.',
  p_opens_at timestamptz DEFAULT now(),
  p_closes_at timestamptz DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $func$
DECLARE
  actor uuid := auth.uid();
  opening public.university_admin_openings%ROWTYPE;
BEGIN
  IF actor IS NULL OR NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Super administrator access required' USING ERRCODE = '42501';
  END IF;
  IF p_status NOT IN ('draft','open','paused','closed') THEN
    RAISE EXCEPTION 'Invalid opening status' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.universities WHERE id = p_university_id AND is_enabled) THEN
    RAISE EXCEPTION 'University is not available' USING ERRCODE = '22023';
  END IF;
  IF p_closes_at IS NOT NULL AND p_closes_at <= p_opens_at THEN
    RAISE EXCEPTION 'Closing time must be after opening time' USING ERRCODE = '22023';
  END IF;
  INSERT INTO public.university_admin_openings(
    university_id, title, description, status, opens_at, closes_at, created_by
  ) VALUES (
    p_university_id,
    COALESCE(NULLIF(trim(p_title),''),'University Administrator Programme'),
    COALESCE(NULLIF(trim(p_description),''),'Help students and vendors join UniEco Ghana and support your university community.'),
    p_status, p_opens_at, p_closes_at, actor
  )
  ON CONFLICT (university_id) DO UPDATE SET
    title=excluded.title,
    description=excluded.description,
    status=excluded.status,
    opens_at=excluded.opens_at,
    closes_at=excluded.closes_at,
    updated_at=now(),
    created_by=actor
  RETURNING * INTO opening;
  RETURN jsonb_build_object(
    'opening_id', opening.id,
    'university_id', opening.university_id,
    'title', opening.title,
    'description', opening.description,
    'status', opening.status,
    'opens_at', opening.opens_at,
    'closes_at', opening.closes_at,
    'application_path', '/university-admin/apply?university_id=' || opening.university_id
  );
END $func$;

CREATE OR REPLACE FUNCTION public.get_university_admin_application_form(p_university_id uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $func$
DECLARE opening public.university_admin_openings%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO opening
  FROM public.university_admin_openings
  WHERE university_id = p_university_id
    AND status = 'open'
    AND opens_at <= now()
    AND (closes_at IS NULL OR closes_at > now());
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Applications are not currently open for this university' USING ERRCODE = '22023';
  END IF;
  RETURN jsonb_build_object(
    'opening_id', opening.id,
    'university_id', opening.university_id,
    'title', opening.title,
    'description', opening.description,
    'opens_at', opening.opens_at,
    'closes_at', opening.closes_at,
    'application_path', '/university-admin/apply?university_id=' || opening.university_id
  );
END $func$;

CREATE OR REPLACE FUNCTION public.submit_university_admin_application(
  p_university_id uuid,
  p_phone text,
  p_student_id_number text,
  p_programme text,
  p_level text,
  p_availability text,
  p_experience text,
  p_cover_note text,
  p_cv_path text DEFAULT NULL,
  p_terms_accepted boolean DEFAULT false
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $func$
DECLARE
  actor uuid := auth.uid();
  opening public.university_admin_openings%ROWTYPE;
  profile_row public.profiles%ROWTYPE;
  application public.university_admin_applications%ROWTYPE;
BEGIN
  IF actor IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO profile_row FROM public.profiles WHERE id = actor;
  IF NOT FOUND OR NOT profile_row.is_active OR profile_row.status <> 'active'
     OR NOT EXISTS (
       SELECT 1 FROM public.user_roles role
       WHERE role.id = profile_row.role_id AND role.name IN ('student','student_vendor')
     ) THEN
    RAISE EXCEPTION 'Only an active student account may apply' USING ERRCODE = '42501';
  END IF;
  IF profile_row.university_id IS NOT NULL AND profile_row.university_id <> p_university_id THEN
    RAISE EXCEPTION 'You may apply only to your assigned university' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO opening
  FROM public.university_admin_openings
  WHERE university_id = p_university_id
    AND status = 'open'
    AND opens_at <= now()
    AND (closes_at IS NULL OR closes_at > now());
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Applications are not currently open for this university' USING ERRCODE = '22023';
  END IF;
  IF NOT p_terms_accepted THEN
    RAISE EXCEPTION 'You must accept the administrator programme terms' USING ERRCODE = '22023';
  END IF;
  INSERT INTO public.university_admin_applications(
    application_reference, opening_id, university_id, applicant_user_id,
    phone, student_id_number, programme, level, availability, experience,
    cover_note, cv_path, terms_accepted
  ) VALUES (
    'UA-' || to_char(now(),'YYYY') || '-' || upper(encode(extensions.gen_random_bytes(5),'hex')),
    opening.id, p_university_id, actor,
    trim(p_phone), trim(p_student_id_number), trim(p_programme), trim(p_level),
    trim(p_availability), trim(p_experience), trim(p_cover_note), NULLIF(trim(p_cv_path),''),
    p_terms_accepted
  ) RETURNING * INTO application;
  INSERT INTO public.university_admin_application_events(application_id,to_status,reason,actor_user_id)
  VALUES (application.id,'pending','Application submitted',actor);
  RETURN jsonb_build_object(
    'application_id', application.id,
    'application_reference', application.application_reference,
    'university_id', application.university_id,
    'status', application.status,
    'submitted_at', application.submitted_at
  );
END $func$;

CREATE OR REPLACE FUNCTION public.get_my_university_admin_applications()
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $func$
DECLARE actor uuid := auth.uid(); result jsonb;
BEGIN
  IF actor IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'application_id', application.id,
    'application_reference', application.application_reference,
    'university_id', application.university_id,
    'status', application.status,
    'programme', application.programme,
    'submitted_at', application.submitted_at,
    'reviewed_at', application.reviewed_at,
    'reviewer_note', application.reviewer_note
  ) ORDER BY application.submitted_at DESC),'[]'::jsonb)
  INTO result
  FROM public.university_admin_applications application
  WHERE application.applicant_user_id = actor;
  RETURN result;
END $func$;

CREATE OR REPLACE FUNCTION public.withdraw_university_admin_application(p_application_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $func$
DECLARE actor uuid := auth.uid(); application public.university_admin_applications%ROWTYPE; old_status text;
BEGIN
  IF actor IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO application FROM public.university_admin_applications
  WHERE id=p_application_id AND applicant_user_id=actor FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Application not found' USING ERRCODE = '22023';
  END IF;
  IF application.status NOT IN ('pending','under_review') THEN
    RAISE EXCEPTION 'This application cannot be withdrawn' USING ERRCODE = '22023';
  END IF;
  old_status := application.status;
  UPDATE public.university_admin_applications
  SET status='withdrawn', updated_at=now()
  WHERE id=application.id;
  INSERT INTO public.university_admin_application_events(application_id,from_status,to_status,reason,actor_user_id)
  VALUES (application.id,old_status,'withdrawn','Withdrawn by applicant',actor);
  RETURN jsonb_build_object('application_id',application.id,'status','withdrawn');
END $func$;

CREATE OR REPLACE FUNCTION public.list_university_admin_applications(
  p_status text DEFAULT NULL,
  p_university_id uuid DEFAULT NULL,
  p_limit integer DEFAULT 100
) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $func$
DECLARE result jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Super administrator access required' USING ERRCODE = '42501';
  END IF;
  IF p_limit < 1 OR p_limit > 250 THEN
    RAISE EXCEPTION 'Limit must be between 1 and 250' USING ERRCODE = '22023';
  END IF;
  IF p_status IS NOT NULL AND p_status NOT IN ('pending','under_review','approved','rejected','withdrawn') THEN
    RAISE EXCEPTION 'Invalid application status' USING ERRCODE = '22023';
  END IF;
  SELECT COALESCE(jsonb_agg(row_data ORDER BY submitted_at DESC),'[]'::jsonb)
  INTO result
  FROM (
    SELECT jsonb_build_object(
      'application_id', application.id,
      'application_reference', application.application_reference,
      'university_id', application.university_id,
      'applicant_user_id', application.applicant_user_id,
      'applicant_name', COALESCE(profile.full_name,'Student'),
      'status', application.status,
      'phone', application.phone,
      'student_id_number', application.student_id_number,
      'programme', application.programme,
      'level', application.level,
      'availability', application.availability,
      'experience', application.experience,
      'cover_note', application.cover_note,
      'cv_path', application.cv_path,
      'submitted_at', application.submitted_at,
      'reviewed_at', application.reviewed_at,
      'reviewer_note', application.reviewer_note
    ) AS row_data, application.submitted_at
    FROM public.university_admin_applications application
    JOIN public.profiles profile ON profile.id=application.applicant_user_id
    WHERE (p_status IS NULL OR application.status=p_status)
      AND (p_university_id IS NULL OR application.university_id=p_university_id)
    ORDER BY application.submitted_at DESC
    LIMIT p_limit
  ) rows;
  RETURN result;
END $func$;

CREATE OR REPLACE FUNCTION public.review_university_admin_application(
  p_application_id uuid,
  p_decision text,
  p_reviewer_note text DEFAULT NULL,
  p_job_title text DEFAULT 'University Administrator'
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $func$
DECLARE
  actor uuid := auth.uid();
  application public.university_admin_applications%ROWTYPE;
  assignment public.university_admin_assignments%ROWTYPE;
  token_result jsonb;
  old_status text;
BEGIN
  IF actor IS NULL OR NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Super administrator access required' USING ERRCODE = '42501';
  END IF;
  IF p_decision NOT IN ('under_review','approve','reject') THEN
    RAISE EXCEPTION 'Decision must be under_review, approve, or reject' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO application FROM public.university_admin_applications
  WHERE id=p_application_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Application not found' USING ERRCODE = '22023';
  END IF;
  IF application.status IN ('approved','rejected','withdrawn') THEN
    RAISE EXCEPTION 'This application has already been finalized' USING ERRCODE = '22023';
  END IF;
  IF p_decision='reject' AND length(trim(COALESCE(p_reviewer_note,''))) < 10 THEN
    RAISE EXCEPTION 'A clear reason is required when rejecting an application' USING ERRCODE = '22023';
  END IF;
  old_status := application.status;
  IF p_decision='under_review' THEN
    UPDATE public.university_admin_applications
    SET status='under_review', reviewer_note=NULLIF(trim(p_reviewer_note),''), reviewed_by=actor, reviewed_at=now(), updated_at=now()
    WHERE id=application.id;
    INSERT INTO public.university_admin_application_events(application_id,from_status,to_status,reason,actor_user_id)
    VALUES (application.id,old_status,'under_review',NULLIF(trim(p_reviewer_note),''),actor);
    RETURN jsonb_build_object('application_id',application.id,'status','under_review');
  END IF;
  IF p_decision='reject' THEN
    UPDATE public.university_admin_applications
    SET status='rejected', reviewer_note=trim(p_reviewer_note), reviewed_by=actor, reviewed_at=now(), updated_at=now()
    WHERE id=application.id;
    INSERT INTO public.university_admin_application_events(application_id,from_status,to_status,reason,actor_user_id)
    VALUES (application.id,old_status,'rejected',trim(p_reviewer_note),actor);
    RETURN jsonb_build_object('application_id',application.id,'status','rejected');
  END IF;
  PERFORM public.assign_university_administrator(
    application.applicant_user_id,
    application.university_id,
    'Approved University Administrator application ' || application.application_reference
  );
  INSERT INTO public.university_admin_assignments(university_id,user_id,job_title,appointed_by)
  VALUES (
    application.university_id, application.applicant_user_id,
    COALESCE(NULLIF(trim(p_job_title),''),'University Administrator'), actor
  ) RETURNING * INTO assignment;
  SELECT public.issue_university_admin_token(assignment.id,NULL) INTO token_result;
  UPDATE public.university_admin_applications
  SET status='approved', reviewer_note=NULLIF(trim(p_reviewer_note),''), reviewed_by=actor, reviewed_at=now(), updated_at=now()
  WHERE id=application.id;
  INSERT INTO public.university_admin_application_events(application_id,from_status,to_status,reason,actor_user_id)
  VALUES (application.id,old_status,'approved',NULLIF(trim(p_reviewer_note),''),actor);
  RETURN jsonb_build_object(
    'application_id',application.id,
    'status','approved',
    'assignment_id',assignment.id,
    'administrator_user_id',assignment.user_id,
    'administrator_token',token_result
  );
END $func$;

GRANT EXECUTE ON FUNCTION public.set_university_admin_opening(uuid,text,text,text,timestamptz,timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_university_admin_application_form(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.submit_university_admin_application(uuid,text,text,text,text,text,text,text,text,boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_university_admin_applications() TO authenticated;
GRANT EXECUTE ON FUNCTION public.withdraw_university_admin_application(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_university_admin_applications(text,uuid,integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.review_university_admin_application(uuid,text,text,text) TO authenticated;

COMMIT;


