-- Security hardening for the university administrator referral ledger.
BEGIN;

CREATE OR REPLACE FUNCTION public.guard_university_admin_referral_ledger()
RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, public AS $func$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'University administrator referral history is immutable' USING ERRCODE = '42501';
  END IF;
  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW.assignment_id IS DISTINCT FROM OLD.assignment_id
     OR NEW.token_id IS DISTINCT FROM OLD.token_id
     OR NEW.university_id IS DISTINCT FROM OLD.university_id
     OR NEW.referred_user_id IS DISTINCT FROM OLD.referred_user_id
     OR NEW.registration_type IS DISTINCT FROM OLD.registration_type
     OR NEW.captured_at IS DISTINCT FROM OLD.captured_at THEN
    RAISE EXCEPTION 'University administrator referral facts are immutable' USING ERRCODE = '42501';
  END IF;
  IF NEW.status IS DISTINCT FROM OLD.status AND NOT (
    (OLD.status = 'pending' AND NEW.status IN ('qualified','rejected','reversed'))
    OR (OLD.status = 'qualified' AND NEW.status = 'reversed')
  ) THEN
    RAISE EXCEPTION 'Invalid university administrator referral state transition' USING ERRCODE = '22023';
  END IF;
  RETURN NEW;
END $func$;

CREATE OR REPLACE FUNCTION public.guard_university_admin_no_self_referral()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $func$
DECLARE administrator_user_id uuid;
BEGIN
  SELECT assignment.user_id INTO administrator_user_id
  FROM public.university_admin_assignments assignment
  WHERE assignment.id = NEW.assignment_id;
  IF administrator_user_id IS NULL THEN
    RAISE EXCEPTION 'Administrator assignment not found' USING ERRCODE = '23503';
  END IF;
  IF administrator_user_id = NEW.referred_user_id THEN
    RAISE EXCEPTION 'Self-referrals are not allowed' USING ERRCODE = '22023';
  END IF;
  RETURN NEW;
END $func$;

DROP TRIGGER IF EXISTS guard_university_admin_referral_ledger ON public.university_admin_referrals;
CREATE TRIGGER guard_university_admin_referral_ledger
BEFORE UPDATE OR DELETE ON public.university_admin_referrals
FOR EACH ROW EXECUTE FUNCTION public.guard_university_admin_referral_ledger();

DROP TRIGGER IF EXISTS guard_university_admin_no_self_referral ON public.university_admin_referrals;
CREATE TRIGGER guard_university_admin_no_self_referral
BEFORE INSERT OR UPDATE ON public.university_admin_referrals
FOR EACH ROW EXECUTE FUNCTION public.guard_university_admin_no_self_referral();

REVOKE ALL ON FUNCTION public.guard_university_admin_referral_ledger() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.guard_university_admin_no_self_referral() FROM PUBLIC, anon, authenticated, service_role;

COMMIT;



