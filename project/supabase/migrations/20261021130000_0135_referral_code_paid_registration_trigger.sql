-- Ensure every paid student registration receives its referral code,
-- including cash-authorized registrations that bypass the Paystack payment
-- status trigger.
BEGIN;

CREATE OR REPLACE FUNCTION public.queue_referral_code_after_paid_registration()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  role_name text;
  profile_active boolean;
  profile_status text;
BEGIN
  IF NEW.status <> 'paid'
     OR (TG_OP = 'UPDATE' AND OLD.status = 'paid') THEN
    RETURN NEW;
  END IF;

  SELECT role.name, profile.is_active, profile.status
  INTO role_name, profile_active, profile_status
  FROM public.profiles profile
  JOIN public.user_roles role ON role.id = profile.role_id
  WHERE profile.id = NEW.user_id;

  IF role_name IN ('student', 'student_vendor')
     AND profile_active IS TRUE
     AND profile_status = 'active' THEN
    PERFORM public.ensure_my_student_referral_link_for_user(NEW.user_id);
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS queue_referral_code_after_paid_registration
  ON public.student_registration_payments;
CREATE TRIGGER queue_referral_code_after_paid_registration
  AFTER INSERT OR UPDATE OF status ON public.student_registration_payments
  FOR EACH ROW
  EXECUTE FUNCTION public.queue_referral_code_after_paid_registration();

REVOKE ALL ON FUNCTION public.queue_referral_code_after_paid_registration() FROM PUBLIC, anon, authenticated, service_role;

COMMIT;
