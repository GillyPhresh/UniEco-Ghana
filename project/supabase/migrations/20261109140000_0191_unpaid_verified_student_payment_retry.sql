-- A legacy student can be marked active/verified even though registration
-- payment never completed. Re-open only when every recorded registration
-- charge is definitively failed/cancelled; never retry an unknown or charged
-- transaction. The underlying 0190 routine still owns intent creation.
BEGIN;

ALTER FUNCTION public.begin_student_registration_payment(
  uuid, text, text, text, text, text, text, integer, integer, text, text, text
) RENAME TO begin_student_registration_payment_pre_0191;

REVOKE ALL ON FUNCTION public.begin_student_registration_payment_pre_0191(
  uuid, text, text, text, text, text, text, integer, integer, text, text, text
) FROM PUBLIC, anon, authenticated;

CREATE FUNCTION public.begin_student_registration_payment(
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
  p_referral_code text DEFAULT NULL,
  p_idempotency_key text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, extensions, public
AS $$
DECLARE
  uid uuid := auth.uid();
  profile_row public.profiles%ROWTYPE;
  registration_status text;
  verified_student boolean;
  unresolved_charge boolean;
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO profile_row FROM public.profiles WHERE id = uid FOR UPDATE;
  IF NOT FOUND OR NOT profile_row.is_active THEN
    RAISE EXCEPTION 'Student registration is unavailable' USING ERRCODE = '42501';
  END IF;

  SELECT registration.status INTO registration_status
  FROM public.student_registration_payments registration
  WHERE registration.user_id = uid FOR UPDATE;

  SELECT EXISTS (
    SELECT 1 FROM public.student_profiles student
    WHERE student.user_id = uid
      AND (student.is_verified_student IS TRUE OR student.verification_status IN ('verified', 'approved'))
  ) INTO verified_student;

  IF verified_student AND registration_status IS DISTINCT FROM 'paid' THEN
    SELECT EXISTS (
      SELECT 1 FROM public.payments payment
      WHERE payment.user_id = uid
        AND payment.payment_type = 'student_registration'
        AND payment.status NOT IN ('failed', 'cancelled')
    ) INTO unresolved_charge;

    IF NOT unresolved_charge THEN
      -- This account has no known successful, pending, or ambiguous charge.
      -- Remove legacy access/verification while it completes the required fee.
      UPDATE public.profiles
      SET status = 'pending_payment', updated_at = now()
      WHERE id = uid AND status = 'active';

      UPDATE public.student_profiles
      SET verification_status = 'pending', is_verified_student = false, updated_at = now()
      WHERE user_id = uid;
    END IF;
  END IF;

  RETURN public.begin_student_registration_payment_pre_0191(
    p_university_id, p_phone, p_student_id_number, p_program, p_faculty,
    p_department, p_level, p_admission_year, p_graduation_year,
    p_student_document_path, p_referral_code, p_idempotency_key
  );
END;
$$;

REVOKE ALL ON FUNCTION public.begin_student_registration_payment(
  uuid, text, text, text, text, text, text, integer, integer, text, text, text
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.begin_student_registration_payment(
  uuid, text, text, text, text, text, text, integer, integer, text, text, text
) TO authenticated, service_role;

COMMIT;
