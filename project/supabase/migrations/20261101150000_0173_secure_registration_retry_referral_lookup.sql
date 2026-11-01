-- Resume student registration through a narrowly scoped, per-user lookup.
-- The registration table intentionally denies direct access to every API
-- role, including service_role; expose only the caller's referral code here.
BEGIN;

CREATE OR REPLACE FUNCTION public.get_my_student_registration_referral_code()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT NULLIF(upper(btrim(registration.referral_code)), '')
  FROM public.student_registration_payments AS registration
  WHERE registration.user_id = auth.uid()
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.get_my_student_registration_referral_code()
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_my_student_registration_referral_code()
  TO authenticated;

COMMIT;
