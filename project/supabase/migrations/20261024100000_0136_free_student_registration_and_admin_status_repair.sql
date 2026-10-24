-- Normal student registration is free while verification remains a separate
-- review process. Vendor registration and other Paystack payments are unchanged.
BEGIN;

ALTER TABLE public.student_registration_payments
  DROP CONSTRAINT IF EXISTS student_registration_payments_status_check;

ALTER TABLE public.student_registration_payments
  ADD CONSTRAINT student_registration_payments_status_check
  CHECK (status IN ('pending_payment', 'paid', 'failed', 'reconciliation_required', 'reversed', 'waived'));

-- Repair accounts created by the old paid-registration gate. Do not touch
-- suspended accounts or paid/reconciliation records.
UPDATE public.profiles AS profile
SET status = 'active', is_active = true, updated_at = now()
FROM public.user_roles AS role
WHERE role.id = profile.role_id
  AND role.name = 'student'
  AND profile.status IN ('pending', 'pending_approval', 'pending_payment')
  AND profile.is_active;

UPDATE public.student_registration_payments AS registration
SET status = 'waived', updated_at = now()
FROM public.profiles AS profile
JOIN public.user_roles AS role ON role.id = profile.role_id
WHERE profile.id = registration.user_id
  AND role.name = 'student'
  AND registration.status IN ('pending_payment', 'failed');

CREATE OR REPLACE FUNCTION public.complete_student_registration(
  p_university_id uuid,
  p_phone text,
  p_student_id_number text,
  p_program text,
  p_faculty text,
  p_department text,
  p_level text,
  p_admission_year integer,
  p_graduation_year integer DEFAULT NULL,
  p_student_document_path text DEFAULT NULL,
  p_referral_code text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  uid uuid := auth.uid();
  profile_row public.profiles%ROWTYPE;
  registration_row public.student_registration_payments%ROWTYPE;
  code_value text := upper(NULLIF(btrim(p_referral_code), ''));
  referrer_id uuid;
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO profile_row
  FROM public.profiles
  WHERE id = uid
  FOR UPDATE;

  IF NOT FOUND
     OR NOT profile_row.is_active
     OR profile_row.status = 'suspended'
     OR public.current_app_role() NOT IN ('student', 'student_vendor') THEN
    RAISE EXCEPTION 'Student registration is unavailable' USING ERRCODE = '42501';
  END IF;

  IF p_phone IS NULL OR p_phone !~ '^\+?[0-9 ()-]{9,20}$'
     OR length(btrim(p_student_id_number)) NOT BETWEEN 2 AND 80
     OR length(btrim(p_program)) NOT BETWEEN 2 AND 120
     OR length(btrim(p_faculty)) NOT BETWEEN 2 AND 120
     OR length(btrim(p_department)) NOT BETWEEN 2 AND 120
     OR length(btrim(p_level)) NOT BETWEEN 1 AND 30
     OR p_admission_year NOT BETWEEN 1950 AND extract(year FROM now())::integer + 1
     OR NOT EXISTS (
       SELECT 1 FROM public.universities
       WHERE id = p_university_id AND is_enabled
     )
     OR (p_student_document_path IS NOT NULL
         AND p_student_document_path NOT LIKE uid::text || '/%') THEN
    RAISE EXCEPTION 'Student information is invalid' USING ERRCODE = '22023';
  END IF;

  IF code_value IS NOT NULL THEN
    IF code_value !~ '^UE-[A-F0-9]{20}$' THEN
      RAISE EXCEPTION 'Referral code is invalid' USING ERRCODE = '22023';
    END IF;
    SELECT code.user_id INTO referrer_id
    FROM public.student_referral_codes AS code
    JOIN public.profiles AS referrer ON referrer.id = code.user_id
    JOIN public.user_roles AS role ON role.id = referrer.role_id
    WHERE code.code = code_value
      AND code.revoked_at IS NULL
      AND referrer.is_active
      AND referrer.status = 'active'
      AND role.name IN ('student', 'student_vendor')
    FOR SHARE;
    IF referrer_id IS NULL OR referrer_id = uid THEN
      RAISE EXCEPTION 'Referral code is invalid' USING ERRCODE = '22023';
    END IF;
  END IF;

  UPDATE public.profiles
  SET phone = btrim(p_phone), university_id = p_university_id,
      status = 'active', is_active = true, updated_at = now()
  WHERE id = uid;

  INSERT INTO public.student_profiles(
    user_id, profile_id, university_id, student_id_number, program_of_study,
    faculty, department, level, admission_year, graduation_year,
    student_id_document_url, verification_status
  ) VALUES (
    uid, uid, p_university_id, btrim(p_student_id_number), btrim(p_program),
    btrim(p_faculty), btrim(p_department), btrim(p_level), p_admission_year,
    p_graduation_year, p_student_document_path, 'pending'
  )
  ON CONFLICT (user_id) DO UPDATE SET
    profile_id = excluded.profile_id,
    university_id = excluded.university_id,
    student_id_number = excluded.student_id_number,
    program_of_study = excluded.program_of_study,
    faculty = excluded.faculty,
    department = excluded.department,
    level = excluded.level,
    admission_year = excluded.admission_year,
    graduation_year = excluded.graduation_year,
    student_id_document_url = excluded.student_id_document_url,
    updated_at = now();

  INSERT INTO public.student_registration_payments(
    user_id, university_id, referral_code, status, paid_at
  ) VALUES (uid, p_university_id, code_value, 'waived', NULL)
  ON CONFLICT (user_id) DO UPDATE SET
    university_id = excluded.university_id,
    referral_code = COALESCE(public.student_registration_payments.referral_code, excluded.referral_code),
    status = CASE
      WHEN public.student_registration_payments.status = 'paid' THEN 'paid'
      ELSE 'waived'
    END,
    updated_at = now()
  RETURNING * INTO registration_row;

  IF referrer_id IS NOT NULL THEN
    INSERT INTO public.student_referral_attributions(
      referrer_user_id, referred_user_id, code, university_id
    ) VALUES (referrer_id, uid, code_value, p_university_id)
    ON CONFLICT (referred_user_id) DO NOTHING;
  END IF;

  INSERT INTO public.audit_logs(actor_id, target_id, action, entity_type, entity_id, metadata)
  VALUES (
    uid, uid, 'student_registration_completed_free', 'profiles', uid,
    jsonb_build_object(
      'registration_status', registration_row.status,
      'university_id', p_university_id,
      'verification_status', 'pending'
    )
  );

  RETURN jsonb_build_object(
    'status', 'active',
    'registration_status', registration_row.status,
    'payment_required', false,
    'verification_status', 'pending'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.complete_student_registration(uuid, text, text, text, text, text, text, integer, integer, text, text)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.complete_student_registration(uuid, text, text, text, text, text, text, integer, integer, text, text)
  TO authenticated;

CREATE OR REPLACE FUNCTION public.get_my_registration_access()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  uid uuid := auth.uid();
  role_name text := public.current_app_role();
  required_amount numeric(12,2);
  paid boolean := false;
BEGIN
  IF uid IS NULL THEN
    RETURN jsonb_build_object('allowed', false, 'role', NULL, 'required_amount', NULL, 'status', 'unauthenticated');
  END IF;

  IF role_name IN ('moderator', 'super_admin', 'university_admin') THEN
    RETURN jsonb_build_object('allowed', true, 'role', role_name, 'required_amount', 0, 'status', 'staff_exempt');
  END IF;

  -- Students can use the platform immediately. Verification remains a
  -- separate review decision and never blocks basic platform access.
  IF role_name = 'student' THEN
    RETURN jsonb_build_object('allowed', true, 'role', role_name, 'required_amount', 0, 'currency', 'GHS', 'status', 'free_access');
  END IF;

  IF role_name IN ('student_vendor', 'external_vendor') THEN
    SELECT vendor_registration_fee INTO required_amount
    FROM public.student_financial_settings WHERE singleton;
    paid := EXISTS (
      SELECT 1
      FROM public.vendors AS vendor
      JOIN public.vendor_registration_payment_states AS state
        ON state.vendor_id = vendor.id AND state.owner_id = uid AND state.state = 'paid'
      JOIN public.payments AS payment
        ON payment.id = state.payment_id
       AND payment.user_id = uid
       AND payment.vendor_id = vendor.id
       AND payment.payment_type = 'vendor_registration'
       AND payment.status = 'success'
       AND payment.amount = required_amount
       AND payment.currency = 'GHS'
      WHERE vendor.owner_id = uid
    );
    RETURN jsonb_build_object(
      'allowed', paid,
      'role', role_name,
      'required_amount', required_amount,
      'currency', 'GHS',
      'status', CASE WHEN paid THEN 'paid' ELSE 'payment_required' END
    );
  END IF;

  RETURN jsonb_build_object('allowed', false, 'role', role_name, 'required_amount', NULL, 'status', 'registration_required');
END;
$$;

REVOKE ALL ON FUNCTION public.get_my_registration_access() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_my_registration_access() TO authenticated;

COMMIT;
