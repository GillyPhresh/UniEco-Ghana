-- Complete the University Administrator programme without weakening the
-- existing role, referral, or payroll boundaries.

BEGIN;

-- A single public application URL can list open campuses after sign-in.
CREATE OR REPLACE FUNCTION public.list_open_university_admin_openings()
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $func$
DECLARE actor uuid := auth.uid(); profile_row public.profiles%ROWTYPE; result jsonb;
BEGIN
  IF actor IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO profile_row FROM public.profiles WHERE id=actor;
  IF NOT FOUND OR NOT profile_row.is_active OR profile_row.status <> 'active'
     OR NOT EXISTS (
       SELECT 1 FROM public.user_roles role
       WHERE role.id=profile_row.role_id AND role.name IN ('student','student_vendor')
     ) THEN
    RAISE EXCEPTION 'An active student account is required to apply' USING ERRCODE = '42501';
  END IF;
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'opening_id', opening.id,
    'university_id', opening.university_id,
    'university_name', university.name,
    'title', opening.title,
    'description', opening.description,
    'closes_at', opening.closes_at
  ) ORDER BY university.name),'[]'::jsonb)
  INTO result
  FROM public.university_admin_openings opening
  JOIN public.universities university ON university.id=opening.university_id
  WHERE opening.status='open' AND opening.opens_at <= now()
    AND (opening.closes_at IS NULL OR opening.closes_at > now())
    AND university.is_enabled
    AND (profile_row.university_id IS NULL OR profile_row.university_id=opening.university_id);
  RETURN result;
END $func$;
GRANT EXECUTE ON FUNCTION public.list_open_university_admin_openings() TO authenticated;
REVOKE ALL ON FUNCTION public.list_open_university_admin_openings() FROM PUBLIC, anon, service_role;

-- Alert every active super administrator when a candidate submits. The alert
-- contains a reference and destination, not the candidate's private answers.
CREATE OR REPLACE FUNCTION public.notify_super_admin_of_university_admin_application()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $func$
DECLARE
  applicant_name text;
  university_name text;
  admin_row record;
BEGIN
  SELECT COALESCE(NULLIF(trim(profile.full_name),''),'A student')
    INTO applicant_name
  FROM public.profiles profile WHERE profile.id=NEW.applicant_user_id;
  SELECT university.name INTO university_name
  FROM public.universities university WHERE university.id=NEW.university_id;

  FOR admin_row IN
    SELECT profile.id, profile.email
    FROM public.profiles profile
    JOIN public.user_roles role ON role.id=profile.role_id
    WHERE role.name='super_admin' AND profile.is_active AND profile.status='active'
  LOOP
    PERFORM public.enqueue_trusted_communication_event(
      'university_admin_application_received',
      admin_row.id,
      admin_row.email,
      NULL,
      'University Administrator application received — ' || NEW.application_reference,
      ARRAY['email','push']::text[],
      jsonb_build_object(
        'template','university_admin_application_received',
        'name',applicant_name,
        'application_reference',NEW.application_reference,
        'university_name',university_name,
        'body',applicant_name || ' submitted a University Administrator application for ' || COALESCE(university_name,'a university') || '. Review it in the management system.',
        'action_url','https://www.uniecoghana.com/admin/university-administrators?status=pending'
      )
    );
  END LOOP;
  RETURN NEW;
END $func$;
DROP TRIGGER IF EXISTS notify_super_admin_university_admin_application ON public.university_admin_applications;
CREATE TRIGGER notify_super_admin_university_admin_application
AFTER INSERT ON public.university_admin_applications
FOR EACH ROW EXECUTE FUNCTION public.notify_super_admin_of_university_admin_application();
REVOKE ALL ON FUNCTION public.notify_super_admin_of_university_admin_application() FROM PUBLIC, anon, authenticated, service_role;

-- Add reversible encryption for the shareable referral token so its owner can
-- safely retrieve the same link on later visits. Browser roles cannot read the
-- token table or ciphertext; the RPC checks the active assignment first.
ALTER TABLE public.university_admin_tokens
  ADD COLUMN IF NOT EXISTS token_ciphertext bytea;

CREATE OR REPLACE FUNCTION public.get_my_university_admin_referral_link(
  p_university_id uuid DEFAULT NULL,
  p_rotate boolean DEFAULT false
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $func$
DECLARE
  actor uuid := auth.uid();
  assignment public.university_admin_assignments%ROWTYPE;
  token_row public.university_admin_tokens%ROWTYPE;
  token_value text;
  vault_secret text;
  encryption_key text;
BEGIN
  IF actor IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;
  SELECT decrypted_secret INTO vault_secret
  FROM vault.decrypted_secrets
  WHERE name='unieco_internal_function_secret'
  LIMIT 1;
  IF NULLIF(vault_secret,'') IS NULL THEN
    RAISE EXCEPTION 'Secure referral-link storage is not configured. Contact UniEco Ghana support.' USING ERRCODE = '55000';
  END IF;
  encryption_key := encode(extensions.digest(vault_secret || '|university-admin-token-v1', 'sha256'), 'hex');

  SELECT * INTO assignment
  FROM public.university_admin_assignments
  WHERE user_id=actor AND status='active'
    AND (p_university_id IS NULL OR university_id=p_university_id)
  ORDER BY university_id, appointed_at DESC
  LIMIT 1 FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Active university administrator assignment required' USING ERRCODE = '42501';
  END IF;

  IF p_rotate THEN
    UPDATE public.university_admin_tokens
    SET revoked_at=COALESCE(revoked_at,now())
    WHERE assignment_id=assignment.id AND revoked_at IS NULL;
  ELSE
    SELECT * INTO token_row
    FROM public.university_admin_tokens
    WHERE assignment_id=assignment.id AND revoked_at IS NULL
      AND token_ciphertext IS NOT NULL
      AND (expires_at IS NULL OR expires_at > now())
    ORDER BY issued_at DESC LIMIT 1;
    IF FOUND THEN
      token_value := extensions.pgp_sym_decrypt(token_row.token_ciphertext, encryption_key);
      RETURN jsonb_build_object(
        'university_id',assignment.university_id,
        'token_hint',token_row.token_hint,
        'registration_path','/signup#university_admin_token=' || token_value,
        'expires_at',token_row.expires_at,
        'issued_at',token_row.issued_at
      );
    END IF;
  END IF;

  token_value := 'UEA-' || upper(encode(extensions.gen_random_bytes(12),'hex'));
  INSERT INTO public.university_admin_tokens(
    assignment_id,token_digest,token_hint,expires_at,issued_by,token_ciphertext
  ) VALUES (
    assignment.id,
    encode(extensions.digest(token_value,'sha256'),'hex'),
    left(token_value,12),
    NULL,
    actor,
    extensions.pgp_sym_encrypt(token_value,encryption_key)
  ) RETURNING * INTO token_row;

  RETURN jsonb_build_object(
    'university_id',assignment.university_id,
    'token_hint',token_row.token_hint,
    'registration_path','/signup#university_admin_token=' || token_value,
    'expires_at',token_row.expires_at,
    'issued_at',token_row.issued_at
  );
END $func$;
REVOKE ALL ON FUNCTION public.get_my_university_admin_referral_link(uuid,boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_university_admin_referral_link(uuid,boolean) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_my_university_admin_earnings(p_university_id uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $func$
DECLARE
  actor uuid := auth.uid();
  selected_university uuid;
  assignment_ids uuid[];
  rate numeric(12,2);
  student_total integer;
  vendor_total integer;
  qualified_total integer;
  past_rows jsonb;
BEGIN
  IF actor IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;
  SELECT min(university_id)
  INTO selected_university
  FROM public.university_admin_assignments
  WHERE user_id=actor AND status='active'
    AND (p_university_id IS NULL OR university_id=p_university_id);
  IF selected_university IS NULL THEN
    RAISE EXCEPTION 'Active university administrator assignment required' USING ERRCODE = '42501';
  END IF;
  SELECT array_agg(id) INTO assignment_ids
  FROM public.university_admin_assignments
  WHERE user_id=actor AND status='active' AND university_id=selected_university;
  SELECT rate_per_qualified_registration INTO rate
  FROM public.university_admin_compensation_settings WHERE singleton;
  SELECT
    count(*) FILTER (WHERE registration_type IN ('student','student_vendor'))::integer,
    count(*) FILTER (WHERE registration_type IN ('vendor','student_vendor'))::integer,
    count(*)::integer
  INTO student_total,vendor_total,qualified_total
  FROM public.university_admin_referrals referral
  WHERE referral.assignment_id=ANY(assignment_ids)
    AND referral.status='qualified'
    AND referral.qualified_at >= date_trunc('month',now())
    AND referral.qualified_at < date_trunc('month',now()) + interval '1 month';
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'month_start',earning.month_start,
    'qualified_count',earning.qualified_count,
    'student_count',earning.student_count,
    'vendor_count',earning.vendor_count,
    'rate_per_registration',earning.rate_per_registration,
    'amount',earning.amount,
    'currency',earning.currency,
    'status',earning.status,
    'payout_reference',earning.payout_reference,
    'paid_at',earning.paid_at
  ) ORDER BY earning.month_start DESC),'[]'::jsonb)
  INTO past_rows
  FROM public.university_admin_monthly_earnings earning
  WHERE earning.assignment_id=ANY(assignment_ids);
  RETURN jsonb_build_object(
    'university_id',selected_university,
    'month_start',date_trunc('month',now())::date,
    'student_count',COALESCE(student_total,0),
    'vendor_count',COALESCE(vendor_total,0),
    'qualified_count',COALESCE(qualified_total,0),
    'rate_per_registration',COALESCE(rate,0),
    'estimated_amount',round(COALESCE(qualified_total,0)*COALESCE(rate,0),2),
    'currency','GHS',
    'rate_configured',COALESCE(rate,0)>0,
    'history',past_rows
  );
END $func$;
GRANT EXECUTE ON FUNCTION public.get_my_university_admin_earnings(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.get_my_university_admin_earnings(uuid) FROM PUBLIC, anon, service_role;

-- This state-changing qualification helper is called only by trusted triggers
-- and the separately guarded privileged RPC. It must never be a client API.
REVOKE ALL ON FUNCTION public.qualify_university_admin_registration_internal(uuid,text) FROM PUBLIC, anon, authenticated, service_role;

-- A vendor referral is not earned merely because an account has the vendor
-- role. Require both approved verification and an active subscription. For a
-- dual student/vendor referral, require the student payment and both vendor
-- conditions before crediting the combined registration.
CREATE OR REPLACE FUNCTION public.qualify_university_admin_registration_internal(
  p_referred_user_id uuid,
  p_source text
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $func$
BEGIN
  UPDATE public.university_admin_referrals referral
  SET status='qualified',qualified_at=COALESCE(referral.qualified_at,now()),qualification_source=p_source
  FROM public.profiles profile
  JOIN public.user_roles role ON role.id=profile.role_id
  LEFT JOIN public.vendor_profiles vendor ON vendor.profile_id=profile.id
  WHERE referral.referred_user_id=p_referred_user_id
    AND referral.status='pending'
    AND profile.id=referral.referred_user_id
    AND profile.is_active
    AND profile.status='active'
    AND (
      (
        referral.registration_type='student'
        AND role.name IN ('student','student_vendor')
        AND EXISTS (
          SELECT 1 FROM public.student_registration_payments payment
          WHERE payment.user_id=referral.referred_user_id AND payment.status='paid'
        )
      )
      OR (
        referral.registration_type='vendor'
        AND role.name IN ('vendor','external_vendor','student_vendor')
        AND vendor.verification_status='active'
        AND vendor.subscription_status='active'
      )
      OR (
        referral.registration_type='student_vendor'
        AND role.name='student_vendor'
        AND vendor.verification_status='active'
        AND vendor.subscription_status='active'
        AND EXISTS (
          SELECT 1 FROM public.student_registration_payments payment
          WHERE payment.user_id=referral.referred_user_id AND payment.status='paid'
        )
      )
    );
END $func$;
REVOKE ALL ON FUNCTION public.qualify_university_admin_registration_internal(uuid,text) FROM PUBLIC, anon, authenticated, service_role;

-- Close the earlier role-only qualification gap for unpaid/unverified vendor
-- referrals. Never rewrite already-approved or paid payroll ledger entries;
-- such exceptions are recorded for Super Admin reconciliation.
WITH invalid_qualified AS (
  SELECT referral.id,referral.assignment_id,referral.referred_user_id,referral.registration_type,referral.qualified_at
  FROM public.university_admin_referrals referral
  JOIN public.profiles profile ON profile.id=referral.referred_user_id
  JOIN public.user_roles role ON role.id=profile.role_id
  LEFT JOIN public.vendor_profiles vendor ON vendor.profile_id=profile.id
  WHERE referral.status='qualified'
    AND (
      (referral.registration_type='vendor' AND (
        role.name NOT IN ('vendor','external_vendor','student_vendor')
        OR vendor.verification_status IS DISTINCT FROM 'active'
        OR vendor.subscription_status IS DISTINCT FROM 'active'
      ))
      OR (referral.registration_type='student_vendor' AND (
        role.name IS DISTINCT FROM 'student_vendor'
        OR vendor.verification_status IS DISTINCT FROM 'active'
        OR vendor.subscription_status IS DISTINCT FROM 'active'
        OR NOT EXISTS (
          SELECT 1 FROM public.student_registration_payments payment
          WHERE payment.user_id=referral.referred_user_id AND payment.status='paid'
        )
      ))
    )
)
INSERT INTO public.audit_logs(actor_id,target_id,action,entity_type,entity_id,metadata)
SELECT NULL,invalid_qualified.referred_user_id,'university_admin_referral_reconciliation_required',
       'university_admin_referral',invalid_qualified.id,
       jsonb_build_object('assignment_id',invalid_qualified.assignment_id,
                          'registration_type',invalid_qualified.registration_type,
                          'qualified_at',invalid_qualified.qualified_at,
                          'reason','Previously credited vendor registration lacks verified active vendor subscription')
FROM invalid_qualified
WHERE EXISTS (
  SELECT 1 FROM public.university_admin_monthly_earnings earning
  WHERE earning.assignment_id=invalid_qualified.assignment_id
    AND earning.month_start=date_trunc('month',invalid_qualified.qualified_at)::date
    AND earning.status IN ('approved','paid')
);

UPDATE public.university_admin_referrals referral
SET status='pending',qualified_at=NULL,qualification_source='reopened_for_vendor_verification_and_subscription'
WHERE referral.status='qualified'
  AND referral.registration_type IN ('vendor','student_vendor')
  AND NOT EXISTS (
    SELECT 1 FROM public.university_admin_monthly_earnings earning
    WHERE earning.assignment_id=referral.assignment_id
      AND earning.month_start=date_trunc('month',referral.qualified_at)::date
      AND earning.status IN ('approved','paid')
  )
  AND (
    NOT EXISTS (
      SELECT 1
      FROM public.profiles profile
      JOIN public.user_roles role ON role.id=profile.role_id
      JOIN public.vendor_profiles vendor ON vendor.profile_id=profile.id
      WHERE profile.id=referral.referred_user_id
        AND profile.is_active AND profile.status='active'
        AND role.name IN ('vendor','external_vendor','student_vendor')
        AND vendor.verification_status='active'
        AND vendor.subscription_status='active'
    )
    OR (referral.registration_type='student_vendor' AND NOT EXISTS (
      SELECT 1 FROM public.student_registration_payments payment
      WHERE payment.user_id=referral.referred_user_id AND payment.status='paid'
    ))
  );

-- Subscription activation can happen after verification, so both state
-- transitions call the same idempotent qualification function.
CREATE OR REPLACE FUNCTION public.qualify_university_admin_vendor_subscription()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $func$
BEGIN
  IF NEW.subscription_status='active'
     AND (TG_OP='INSERT' OR OLD.subscription_status IS DISTINCT FROM NEW.subscription_status) THEN
    PERFORM public.qualify_university_admin_registration_internal(NEW.profile_id,'vendor_subscription_activated');
  END IF;
  RETURN NEW;
END $func$;
DROP TRIGGER IF EXISTS qualify_university_admin_vendor_subscription ON public.vendor_profiles;
CREATE TRIGGER qualify_university_admin_vendor_subscription
AFTER INSERT OR UPDATE OF subscription_status ON public.vendor_profiles
FOR EACH ROW WHEN (NEW.subscription_status='active')
EXECUTE FUNCTION public.qualify_university_admin_vendor_subscription();
REVOKE ALL ON FUNCTION public.qualify_university_admin_vendor_subscription() FROM PUBLIC, anon, authenticated, service_role;

-- An assignment receives its persistent, encrypted referral token through the
-- administrator-only dashboard RPC. Do not return a second unencrypted token
-- in the Super Admin approval response.
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
  old_status text;
BEGIN
  IF actor IS NULL OR NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Super administrator access required' USING ERRCODE = '42501';
  END IF;
  IF p_decision IS NULL OR p_decision NOT IN ('under_review','approve','reject') THEN
    RAISE EXCEPTION 'Decision must be under_review, approve, or reject' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO application FROM public.university_admin_applications
  WHERE id=p_application_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Application not found' USING ERRCODE = '22023'; END IF;
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
  VALUES (application.university_id,application.applicant_user_id,
    COALESCE(NULLIF(trim(p_job_title),''),'University Administrator'),actor)
  RETURNING * INTO assignment;
  UPDATE public.university_admin_applications
  SET status='approved', reviewer_note=NULLIF(trim(p_reviewer_note),''), reviewed_by=actor, reviewed_at=now(), updated_at=now()
  WHERE id=application.id;
  INSERT INTO public.university_admin_application_events(application_id,from_status,to_status,reason,actor_user_id)
  VALUES (application.id,old_status,'approved',NULLIF(trim(p_reviewer_note),''),actor);
  RETURN jsonb_build_object(
    'application_id',application.id,
    'status','approved',
    'assignment_id',assignment.id,
    'administrator_user_id',assignment.user_id
  );
END $func$;
REVOKE ALL ON FUNCTION public.review_university_admin_application(uuid,text,text,text) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.review_university_admin_application(uuid,text,text,text) TO authenticated;

-- Count a referred vendor only once the vendor verification workflow has
-- activated the vendor profile. Referral claiming alone never qualifies it.
CREATE OR REPLACE FUNCTION public.qualify_university_admin_vendor_verification()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $func$
BEGIN
  IF NEW.verification_status='active'
     AND (TG_OP='INSERT' OR OLD.verification_status IS DISTINCT FROM NEW.verification_status) THEN
    PERFORM public.qualify_university_admin_registration_internal(NEW.profile_id,'vendor_verification_approved');
  END IF;
  RETURN NEW;
END $func$;
DROP TRIGGER IF EXISTS qualify_university_admin_vendor_verification ON public.vendor_profiles;
CREATE TRIGGER qualify_university_admin_vendor_verification
AFTER INSERT OR UPDATE OF verification_status ON public.vendor_profiles
FOR EACH ROW WHEN (NEW.verification_status='active')
EXECUTE FUNCTION public.qualify_university_admin_vendor_verification();
REVOKE ALL ON FUNCTION public.qualify_university_admin_vendor_verification() FROM PUBLIC, anon, authenticated, service_role;

-- Keep the appointment email payload in step with the official documents.
-- The original issue trigger runs first alphabetically; this trigger enriches
-- its queued event with the database-authoritative duties and university name.
CREATE OR REPLACE FUNCTION public.add_university_admin_appointment_document_data()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $func$
DECLARE letter public.university_admin_appointment_letters%ROWTYPE; university_name text;
BEGIN
  IF NEW.status <> 'approved' OR (TG_OP='UPDATE' AND OLD.status='approved') THEN
    RETURN NEW;
  END IF;
  SELECT * INTO letter FROM public.university_admin_appointment_letters
  WHERE application_id=NEW.id;
  IF NOT FOUND THEN RETURN NEW; END IF;
  SELECT name INTO university_name FROM public.universities WHERE id=letter.university_id;
  UPDATE public.communication_events event
  SET metadata=event.metadata || jsonb_build_object(
    'duties',letter.duties,
    'university_name',university_name,
    'appointment_title',letter.title,
    'effective_date',letter.effective_date
  ), updated_at=now()
  WHERE event.event_type='university_admin_appointment'
    AND event.recipient_id=letter.recipient_user_id
    AND event.metadata->>'document_reference'=letter.document_reference;
  RETURN NEW;
END $func$;
DROP TRIGGER IF EXISTS z_add_university_admin_appointment_document_data ON public.university_admin_applications;
CREATE TRIGGER z_add_university_admin_appointment_document_data
AFTER INSERT OR UPDATE OF status ON public.university_admin_applications
FOR EACH ROW WHEN (NEW.status='approved')
EXECUTE FUNCTION public.add_university_admin_appointment_document_data();
REVOKE ALL ON FUNCTION public.add_university_admin_appointment_document_data() FROM PUBLIC, anon, authenticated, service_role;

-- Explicitly configure the commission rate; never infer or hard-code pay.
CREATE OR REPLACE FUNCTION public.set_university_admin_compensation_rate(p_rate numeric)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $func$
DECLARE actor uuid := auth.uid(); changed public.university_admin_compensation_settings%ROWTYPE;
BEGIN
  IF actor IS NULL OR NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Super administrator access required' USING ERRCODE = '42501';
  END IF;
  IF p_rate IS NULL OR p_rate < 0 OR p_rate > 100000 THEN
    RAISE EXCEPTION 'Enter a valid non-negative GHS rate per qualified registration' USING ERRCODE = '22023';
  END IF;
  UPDATE public.university_admin_compensation_settings
  SET rate_per_qualified_registration=round(p_rate,2),updated_at=now(),updated_by=actor
  WHERE singleton RETURNING * INTO changed;
  INSERT INTO public.audit_logs(actor_id,action,entity_type,entity_id,metadata)
  VALUES(actor,'university_admin_compensation_rate_changed','university_admin_compensation_settings',NULL,
    jsonb_build_object('rate_per_qualified_registration',changed.rate_per_qualified_registration,'currency',changed.currency));
  RETURN jsonb_build_object('rate_per_qualified_registration',changed.rate_per_qualified_registration,'currency',changed.currency,'updated_at',changed.updated_at);
END $func$;
GRANT EXECUTE ON FUNCTION public.set_university_admin_compensation_rate(numeric) TO authenticated;
REVOKE ALL ON FUNCTION public.set_university_admin_compensation_rate(numeric) FROM PUBLIC, anon, service_role;

-- Payroll review exposes only to Super Admin and separates each payee so a
-- different transfer reference can be recorded for every administrator.
CREATE OR REPLACE FUNCTION public.get_university_admin_payroll(p_month_start date)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $func$
DECLARE rate numeric(12,2); currency_value text; rows_value jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Super administrator access required' USING ERRCODE = '42501';
  END IF;
  IF p_month_start IS NULL OR p_month_start <> date_trunc('month',p_month_start)::date THEN
    RAISE EXCEPTION 'Choose the first day of a calendar month' USING ERRCODE = '22023';
  END IF;
  SELECT rate_per_qualified_registration,currency INTO rate,currency_value
  FROM public.university_admin_compensation_settings WHERE singleton;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'earning_id',earning.id,
    'assignment_id',assignment.id,
    'user_id',assignment.user_id,
    'university_id',assignment.university_id,
    'university_name',university.name,
    'administrator_name',COALESCE(NULLIF(trim(profile.full_name),''),'University Administrator'),
    'administrator_email',profile.email,
    'student_count',COALESCE(earning.student_count,counts.student_count),
    'vendor_count',COALESCE(earning.vendor_count,counts.vendor_count),
    'qualified_count',COALESCE(earning.qualified_count,counts.qualified_count),
    'rate_per_registration',COALESCE(earning.rate_per_registration,rate),
    'amount',COALESCE(earning.amount,round(counts.qualified_count*rate,2)),
    'currency',COALESCE(earning.currency,currency_value),
    'status',COALESCE(earning.status,'preview'),
    'payout_reference',earning.payout_reference,
    'paid_at',earning.paid_at
  ) ORDER BY university.name,profile.full_name),'[]'::jsonb)
  INTO rows_value
  FROM public.university_admin_assignments assignment
  JOIN public.profiles profile ON profile.id=assignment.user_id
  JOIN public.universities university ON university.id=assignment.university_id
  LEFT JOIN public.university_admin_monthly_earnings earning
    ON earning.assignment_id=assignment.id AND earning.month_start=p_month_start
  CROSS JOIN LATERAL (
    SELECT
      count(referral.id) FILTER (WHERE referral.registration_type IN ('student','student_vendor'))::integer AS student_count,
      count(referral.id) FILTER (WHERE referral.registration_type IN ('vendor','student_vendor'))::integer AS vendor_count,
      count(referral.id)::integer AS qualified_count
    FROM public.university_admin_referrals referral
    WHERE referral.assignment_id=assignment.id AND referral.status='qualified'
      AND referral.qualified_at >= p_month_start
      AND referral.qualified_at < (p_month_start + interval '1 month')
  ) counts
  WHERE assignment.status IN ('active','suspended','revoked')
    AND (earning.id IS NOT NULL OR counts.qualified_count > 0);

  RETURN jsonb_build_object(
    'month_start',p_month_start,
    'rate_per_qualified_registration',rate,
    'currency',currency_value,
    'rows',rows_value
  );
END $func$;
GRANT EXECUTE ON FUNCTION public.get_university_admin_payroll(date) TO authenticated;
REVOKE ALL ON FUNCTION public.get_university_admin_payroll(date) FROM PUBLIC, anon, service_role;

CREATE OR REPLACE FUNCTION public.mark_university_admin_earning_paid(
  p_earning_id uuid,
  p_payout_reference text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $func$
DECLARE actor uuid := auth.uid(); changed public.university_admin_monthly_earnings%ROWTYPE;
BEGIN
  IF actor IS NULL OR NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Super administrator access required' USING ERRCODE = '42501';
  END IF;
  IF length(trim(COALESCE(p_payout_reference,''))) < 4 THEN
    RAISE EXCEPTION 'Enter the verified transfer reference for this administrator' USING ERRCODE = '22023';
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(trim(p_payout_reference),0));
  IF EXISTS (
    SELECT 1 FROM public.university_admin_monthly_earnings
    WHERE payout_reference=trim(p_payout_reference) AND id<>p_earning_id
  ) THEN
    RAISE EXCEPTION 'This transfer reference has already been recorded' USING ERRCODE = '23505';
  END IF;
  UPDATE public.university_admin_monthly_earnings
  SET status='paid',paid_at=COALESCE(paid_at,now()),paid_by=actor,payout_reference=trim(p_payout_reference)
  WHERE id=p_earning_id AND status='approved'
  RETURNING * INTO changed;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Only an approved monthly earning can be marked paid' USING ERRCODE = '22023';
  END IF;
  INSERT INTO public.audit_logs(actor_id,target_id,action,entity_type,entity_id,metadata)
  VALUES(actor,changed.assignment_id,'university_admin_monthly_earning_paid','university_admin_monthly_earning',changed.id,
    jsonb_build_object('month_start',changed.month_start,'amount',changed.amount,'currency',changed.currency,'payout_reference',changed.payout_reference));
  RETURN jsonb_build_object('earning_id',changed.id,'status',changed.status,'paid_at',changed.paid_at,'payout_reference',changed.payout_reference);
END $func$;
GRANT EXECUTE ON FUNCTION public.mark_university_admin_earning_paid(uuid,text) TO authenticated;
REVOKE ALL ON FUNCTION public.mark_university_admin_earning_paid(uuid,text) FROM PUBLIC, anon, service_role;

-- Correct the left-join count bug (count(*) counted the empty join row as one)
-- and refuse to produce misleading zero-rate payroll snapshots.
CREATE OR REPLACE FUNCTION public.finalize_university_admin_month(p_month_start date)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $func$
DECLARE actor uuid := auth.uid(); rate numeric(12,2); rows_written integer;
BEGIN
  IF actor IS NULL OR NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Super administrator access required' USING ERRCODE = '42501';
  END IF;
  IF p_month_start IS NULL OR p_month_start <> date_trunc('month',p_month_start)::date
     OR p_month_start >= date_trunc('month',now())::date THEN
    RAISE EXCEPTION 'Only completed calendar months can be finalized' USING ERRCODE = '22023';
  END IF;
  SELECT rate_per_qualified_registration INTO rate
  FROM public.university_admin_compensation_settings WHERE singleton FOR UPDATE;
  IF COALESCE(rate,0) <= 0 THEN
    RAISE EXCEPTION 'Set the approved compensation rate before finalizing monthly payroll' USING ERRCODE = '22023';
  END IF;
  INSERT INTO public.university_admin_monthly_earnings(
    assignment_id,university_id,month_start,month_end,
    student_count,vendor_count,qualified_count,rate_per_registration,amount
  )
  SELECT
    assignment.id,assignment.university_id,p_month_start,
    (p_month_start + interval '1 month')::date,
    count(referral.id) FILTER (WHERE referral.registration_type IN ('student','student_vendor'))::integer,
    count(referral.id) FILTER (WHERE referral.registration_type IN ('vendor','student_vendor'))::integer,
    count(referral.id)::integer,rate,count(referral.id)*rate
  FROM public.university_admin_assignments assignment
  LEFT JOIN public.university_admin_referrals referral
    ON referral.assignment_id=assignment.id AND referral.status='qualified'
    AND referral.qualified_at >= p_month_start
    AND referral.qualified_at < (p_month_start + interval '1 month')
  WHERE assignment.status IN ('active','suspended','revoked')
  GROUP BY assignment.id,assignment.university_id
  HAVING count(referral.id) > 0
  ON CONFLICT (assignment_id,month_start) DO UPDATE
    SET student_count=excluded.student_count,vendor_count=excluded.vendor_count,
        qualified_count=excluded.qualified_count,rate_per_registration=excluded.rate_per_registration,
        amount=excluded.amount,calculated_at=now()
    WHERE public.university_admin_monthly_earnings.status='draft';
  GET DIAGNOSTICS rows_written=ROW_COUNT;
  INSERT INTO public.audit_logs(actor_id,action,entity_type,metadata)
  VALUES(actor,'university_admin_month_finalized','university_admin_monthly_earnings',
    jsonb_build_object('month_start',p_month_start,'rate_per_qualified_registration',rate,'rows_written',rows_written));
  RETURN rows_written;
END $func$;
REVOKE ALL ON FUNCTION public.finalize_university_admin_month(date) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.finalize_university_admin_month(date) TO authenticated;

CREATE OR REPLACE FUNCTION public.approve_university_admin_month(p_month_start date)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $func$
DECLARE actor uuid := auth.uid(); changed integer;
BEGIN
  IF actor IS NULL OR NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Super administrator access required' USING ERRCODE = '42501';
  END IF;
  IF p_month_start IS NULL OR p_month_start <> date_trunc('month',p_month_start)::date
     OR p_month_start >= date_trunc('month',now())::date THEN
    RAISE EXCEPTION 'Only completed calendar months can be approved' USING ERRCODE = '22023';
  END IF;
  UPDATE public.university_admin_monthly_earnings
  SET status='approved',approved_at=COALESCE(approved_at,now()),approved_by=actor
  WHERE month_start=p_month_start AND status='draft';
  GET DIAGNOSTICS changed=ROW_COUNT;
  INSERT INTO public.audit_logs(actor_id,action,entity_type,metadata)
  VALUES(actor,'university_admin_month_approved','university_admin_monthly_earnings',
    jsonb_build_object('month_start',p_month_start,'rows_approved',changed));
  RETURN changed;
END $func$;
REVOKE ALL ON FUNCTION public.approve_university_admin_month(date) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.approve_university_admin_month(date) TO authenticated;

COMMIT;
