-- UniEco Ghana university administrator appointments, duties and scorecards.
-- Qualified registrations are the only events that affect the score.

BEGIN;

CREATE TABLE IF NOT EXISTS public.university_admin_appointment_letters (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id uuid NOT NULL UNIQUE REFERENCES public.university_admin_applications(id) ON DELETE RESTRICT,
  assignment_id uuid NOT NULL UNIQUE REFERENCES public.university_admin_assignments(id) ON DELETE RESTRICT,
  university_id uuid NOT NULL REFERENCES public.universities(id) ON DELETE RESTRICT,
  recipient_user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  document_reference text NOT NULL UNIQUE,
  recipient_name text NOT NULL,
  title text NOT NULL DEFAULT 'University Administrator Appointment',
  effective_date date NOT NULL DEFAULT current_date,
  duties jsonb NOT NULL,
  letter_body text NOT NULL,
  status text NOT NULL DEFAULT 'issued' CHECK (status IN ('issued','acknowledged','revoked')),
  issued_at timestamptz NOT NULL DEFAULT now(),
  acknowledged_at timestamptz,
  revoked_at timestamptz,
  issued_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  acknowledged_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS university_admin_appointment_letters_recipient_idx
  ON public.university_admin_appointment_letters(recipient_user_id, status, issued_at DESC);
ALTER TABLE public.university_admin_appointment_letters ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.university_admin_appointment_letters FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.issue_university_admin_appointment_letter()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $func$
DECLARE
  assignment public.university_admin_assignments%ROWTYPE;
  profile_name text;
  profile_email text;
  letter_id uuid;
  communication_event_id uuid;
  duty_list jsonb := jsonb_build_array(
    jsonb_build_object('code','OUTREACH','title','Student and vendor outreach','description','Introduce UniEco Ghana to students and vendors within your assigned university community.'),
    jsonb_build_object('code','ONBOARDING','title','Registration support','description','Help applicants understand the registration steps and use your official administrator link correctly.'),
    jsonb_build_object('code','ACCURACY','title','Accurate information','description','Share only approved UniEco Ghana information and report incorrect university or business details.'),
    jsonb_build_object('code','REPORTING','title','Monthly reporting','description','Monitor your verified registration score and report important community issues to the super administrator.'),
    jsonb_build_object('code','SAFETY','title','Privacy and conduct','description','Never request passwords, payment PINs, private documents outside the approved form, or unofficial fees from applicants.'),
    jsonb_build_object('code','RESPECT','title','Professional conduct','description','Do not spam, impersonate UniEco Ghana, make false promises, or misuse referral links.'),
    jsonb_build_object('code','SUPPORT','title','Community support','description','Direct users to official UniEco Ghana support whenever a payment, account, verification, or safety issue needs attention.')
  );
BEGIN
  IF NEW.status <> 'approved' OR (TG_OP = 'UPDATE' AND OLD.status = 'approved') THEN
    RETURN NEW;
  END IF;
  SELECT * INTO assignment
  FROM public.university_admin_assignments
  WHERE university_id=NEW.university_id
    AND user_id=NEW.applicant_user_id
    AND status='active'
  ORDER BY appointed_at DESC
  LIMIT 1;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Approved application has no active administrator assignment' USING ERRCODE = '23514';
  END IF;
  SELECT COALESCE(NULLIF(trim(full_name),''),'University Administrator'), email
    INTO profile_name, profile_email
  FROM public.profiles WHERE id=NEW.applicant_user_id;
  INSERT INTO public.university_admin_appointment_letters(
    application_id, assignment_id, university_id, recipient_user_id,
    document_reference, recipient_name, duties, letter_body, issued_by
  ) VALUES (
    NEW.id,
    assignment.id,
    NEW.university_id,
    NEW.applicant_user_id,
    'UEA-LETTER-' || to_char(now(),'YYYY') || '-' || upper(encode(extensions.gen_random_bytes(5),'hex')),
    profile_name,
    duty_list,
    format(
      E'Dear %s,\n\nCongratulations. Following the review of your application, UniEco Ghana is pleased to appoint you as a University Administrator for your assigned university community, effective %s.\n\nYour role is to help students and vendors join UniEco Ghana, understand the platform, and access the correct support channels. You will be measured by verified registrations completed through your official administrator link.\n\nYour assigned duties are recorded in this appointment letter. You must protect user privacy, never collect passwords or payment PINs, never request unofficial fees, and never make promises on behalf of UniEco Ghana outside approved communication.\n\nYour performance score is based only on qualified registrations. A registration counts after the required verification conditions are completed; clicks, duplicate accounts, self-referrals, and unverified sign-ups do not count.\n\nWe wish you success in serving your university community.\n\nYours faithfully,\nGilbert Asare Marfo\nManaging Director\nUniEco Ghana',
      profile_name, to_char(current_date,'DD Month YYYY')
    ),
    COALESCE(NEW.reviewed_by, auth.uid())
  ) ON CONFLICT (application_id) DO NOTHING
  RETURNING id INTO letter_id;

  IF letter_id IS NOT NULL THEN
    communication_event_id := public.enqueue_trusted_communication_event(
      'university_admin_appointment',
      NEW.applicant_user_id,
      profile_email,
      NULL,
      'Congratulations — your UniEco Ghana University Administrator appointment',
      ARRAY['email','push']::text[],
      jsonb_build_object(
        'template', 'university_admin_appointment',
        'document_reference', (SELECT document_reference FROM public.university_admin_appointment_letters WHERE id=letter_id),
        'name', profile_name,
        'letter_body', (SELECT letter_body FROM public.university_admin_appointment_letters WHERE id=letter_id),
        'university_id', NEW.university_id,
        'body', 'Congratulations. Your UniEco Ghana University Administrator appointment is ready. Open your private workspace to read your appointment letter, duties, and scorecard.',
        'action_url', 'https://www.uniecoghana.com/admin/university-admin'
      )
    );
  END IF;
  RETURN NEW;
END $func$;

DROP TRIGGER IF EXISTS issue_university_admin_appointment_letter ON public.university_admin_applications;
CREATE TRIGGER issue_university_admin_appointment_letter
AFTER INSERT OR UPDATE OF status ON public.university_admin_applications
FOR EACH ROW WHEN (NEW.status = 'approved')
EXECUTE FUNCTION public.issue_university_admin_appointment_letter();

CREATE OR REPLACE FUNCTION public.get_my_university_admin_appointment()
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $func$
DECLARE actor uuid := auth.uid(); result jsonb;
BEGIN
  IF actor IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;
  SELECT jsonb_build_object(
    'letter_id', letter.id,
    'application_id', letter.application_id,
    'assignment_id', letter.assignment_id,
    'university_id', letter.university_id,
    'document_reference', letter.document_reference,
    'recipient_name', letter.recipient_name,
    'title', letter.title,
    'effective_date', letter.effective_date,
    'duties', letter.duties,
    'letter_body', letter.letter_body,
    'status', letter.status,
    'issued_at', letter.issued_at,
    'acknowledged_at', letter.acknowledged_at
  ) INTO result
  FROM public.university_admin_appointment_letters letter
  WHERE letter.recipient_user_id=actor
  ORDER BY letter.issued_at DESC
  LIMIT 1;
  RETURN COALESCE(result, jsonb_build_object('letter_id',NULL,'status',NULL));
END $func$;

CREATE OR REPLACE FUNCTION public.acknowledge_university_admin_appointment(p_letter_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $func$
DECLARE actor uuid := auth.uid(); changed public.university_admin_appointment_letters%ROWTYPE;
BEGIN
  IF actor IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;
  UPDATE public.university_admin_appointment_letters
  SET status='acknowledged', acknowledged_at=COALESCE(acknowledged_at,now()), acknowledged_by=actor
  WHERE id=p_letter_id AND recipient_user_id=actor AND status='issued'
  RETURNING * INTO changed;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Appointment letter not found or already acknowledged' USING ERRCODE = '22023';
  END IF;
  RETURN jsonb_build_object('letter_id',changed.id,'status',changed.status,'acknowledged_at',changed.acknowledged_at);
END $func$;

CREATE OR REPLACE FUNCTION public.get_my_university_admin_score(p_university_id uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $func$
DECLARE
  actor uuid := auth.uid();
  selected_university uuid := p_university_id;
  total_count integer := 0;
  student_count integer := 0;
  vendor_count integer := 0;
  current_month_count integer := 0;
  monthly_rank integer;
  university_admin_count integer;
  achievement text;
  next_milestone integer;
  result jsonb;
BEGIN
  IF actor IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;
  SELECT COALESCE(selected_university,min(university_id)) INTO selected_university
  FROM public.university_admin_assignments
  WHERE user_id=actor AND status IN ('active','suspended')
    AND (p_university_id IS NULL OR university_id=p_university_id);
  IF selected_university IS NULL THEN
    RAISE EXCEPTION 'Active university administrator assignment required' USING ERRCODE = '42501';
  END IF;
  SELECT count(*)::integer,
         count(*) FILTER (WHERE registration_type IN ('student','student_vendor'))::integer,
         count(*) FILTER (WHERE registration_type IN ('vendor','student_vendor'))::integer,
         count(*) FILTER (WHERE qualified_at >= date_trunc('month',now()) AND qualified_at < date_trunc('month',now()) + interval '1 month')::integer
  INTO total_count, student_count, vendor_count, current_month_count
  FROM public.university_admin_referrals referral
  JOIN public.university_admin_assignments assignment ON assignment.id=referral.assignment_id
  WHERE assignment.user_id=actor AND assignment.university_id=selected_university AND referral.status='qualified';
  WITH monthly AS (
    SELECT assignment.user_id, count(referral.id)::integer AS qualified_count
    FROM public.university_admin_assignments assignment
    LEFT JOIN public.university_admin_referrals referral
      ON referral.assignment_id=assignment.id
     AND referral.status='qualified'
     AND referral.qualified_at >= date_trunc('month',now())
     AND referral.qualified_at < date_trunc('month',now()) + interval '1 month'
    WHERE assignment.university_id=selected_university AND assignment.status IN ('active','suspended')
    GROUP BY assignment.user_id
  )
  SELECT 1 + count(*) FILTER (WHERE qualified_count > current_month_count), count(*)
  INTO monthly_rank, university_admin_count
  FROM monthly;
  achievement := CASE
    WHEN total_count >= 100 THEN 'UniEco Leader'
    WHEN total_count >= 50 THEN 'Community Builder'
    WHEN total_count >= 25 THEN 'Campus Champion'
    WHEN total_count >= 10 THEN 'Rising Star'
    ELSE 'Getting Started'
  END;
  next_milestone := CASE
    WHEN total_count < 10 THEN 10
    WHEN total_count < 25 THEN 25
    WHEN total_count < 50 THEN 50
    WHEN total_count < 100 THEN 100
    ELSE total_count + 25
  END;
  SELECT jsonb_build_object(
    'university_id',selected_university,
    'points',total_count,
    'qualified_registrations',total_count,
    'students',student_count,
    'vendors',vendor_count,
    'current_month',current_month_count,
    'monthly_rank',monthly_rank,
    'active_admins_in_university',university_admin_count,
    'achievement',achievement,
    'next_milestone',next_milestone,
    'progress_to_next_milestone',LEAST(100,round((total_count::numeric / NULLIF(next_milestone,0))*100)),
    'message',CASE WHEN current_month_count=0 THEN 'Your next verified registration starts your monthly score.' ELSE 'Keep going. Every verified student or vendor you help onboard moves your university community forward.' END,
    'monthly_history',COALESCE((SELECT jsonb_agg(jsonb_build_object('month',month_value,'qualified_registrations',month_count) ORDER BY month_value DESC) FROM (SELECT date_trunc('month',referral.qualified_at)::date AS month_value,count(*)::integer AS month_count FROM public.university_admin_referrals referral JOIN public.university_admin_assignments assignment ON assignment.id=referral.assignment_id WHERE assignment.user_id=actor AND assignment.university_id=selected_university AND referral.status='qualified' GROUP BY date_trunc('month',referral.qualified_at)::date ORDER BY month_value DESC LIMIT 6) history),'[]'::jsonb)
  ) INTO result;
  RETURN result;
END $func$;

CREATE OR REPLACE FUNCTION public.get_university_admin_leaderboard(p_university_id uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $func$
DECLARE actor uuid := auth.uid(); result jsonb;
BEGIN
  IF actor IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.university_admin_assignments
    WHERE user_id=actor AND university_id=p_university_id AND status IN ('active','suspended')
  ) AND NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'University administrator access required' USING ERRCODE = '42501';
  END IF;
  WITH totals AS (
    SELECT assignment.user_id,
           count(referral.id)::integer AS qualified_count,
           max(profile.full_name) AS full_name
    FROM public.university_admin_assignments assignment
    JOIN public.profiles profile ON profile.id=assignment.user_id
    LEFT JOIN public.university_admin_referrals referral
      ON referral.assignment_id=assignment.id AND referral.status='qualified'
    WHERE assignment.university_id=p_university_id AND assignment.status IN ('active','suspended')
    GROUP BY assignment.user_id
  ), ranked AS (
    SELECT row_number() OVER (ORDER BY qualified_count DESC, user_id)::integer AS rank,
           user_id, qualified_count, full_name
    FROM totals
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'rank',rank,
    'name',CASE WHEN length(trim(COALESCE(full_name,''))) > 2 THEN left(trim(full_name),1) || '•••' || right(trim(full_name),1) ELSE 'University Admin' END,
    'qualified_registrations',qualified_count,
    'is_me',user_id=actor
  ) ORDER BY rank),'[]'::jsonb) INTO result
  FROM (SELECT * FROM ranked ORDER BY rank LIMIT 20) leaderboard;
  RETURN result;
END $func$;

CREATE OR REPLACE FUNCTION public.revoke_university_admin_assignment(
  p_assignment_id uuid,
  p_reason text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $func$
DECLARE actor uuid := auth.uid(); assignment public.university_admin_assignments%ROWTYPE;
BEGIN
  IF actor IS NULL OR NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Super administrator access required' USING ERRCODE = '42501';
  END IF;
  IF length(trim(COALESCE(p_reason,''))) < 10 THEN
    RAISE EXCEPTION 'A clear reason is required' USING ERRCODE = '22023';
  END IF;
  UPDATE public.university_admin_assignments
  SET status='revoked', ended_at=COALESCE(ended_at,now()), updated_at=now()
  WHERE id=p_assignment_id AND status IN ('active','suspended')
  RETURNING * INTO assignment;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Active administrator assignment not found' USING ERRCODE = '22023';
  END IF;
  UPDATE public.university_admin_tokens SET revoked_at=COALESCE(revoked_at,now())
  WHERE assignment_id=assignment.id AND revoked_at IS NULL;
  UPDATE public.university_admin_appointment_letters
  SET status='revoked', revoked_at=COALESCE(revoked_at,now())
  WHERE assignment_id=assignment.id AND status <> 'revoked';
  RETURN jsonb_build_object('assignment_id',assignment.id,'status','revoked','reason',trim(p_reason));
END $func$;

GRANT EXECUTE ON FUNCTION public.get_my_university_admin_appointment() TO authenticated;
GRANT EXECUTE ON FUNCTION public.acknowledge_university_admin_appointment(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_university_admin_score(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_university_admin_leaderboard(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.revoke_university_admin_assignment(uuid,text) TO authenticated;

COMMIT;



