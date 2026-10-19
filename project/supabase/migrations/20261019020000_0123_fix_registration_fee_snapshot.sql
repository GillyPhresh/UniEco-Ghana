-- Production has a required fee_snapshot column on registration attempts,
-- while older registration functions only provide expected_amount. Populate
-- the immutable snapshot at insert time from the same authoritative fee.
BEGIN;

ALTER TABLE public.student_registration_payment_attempts
  ADD COLUMN IF NOT EXISTS fee_snapshot numeric(12,2);

UPDATE public.student_registration_payment_attempts
SET fee_snapshot = expected_amount
WHERE fee_snapshot IS NULL;

ALTER TABLE public.student_registration_payment_attempts
  ALTER COLUMN fee_snapshot SET NOT NULL;

CREATE OR REPLACE FUNCTION public.set_student_registration_fee_snapshot()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF NEW.fee_snapshot IS NULL THEN
    NEW.fee_snapshot := NEW.expected_amount;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_student_registration_fee_snapshot
  ON public.student_registration_payment_attempts;
CREATE TRIGGER set_student_registration_fee_snapshot
  BEFORE INSERT ON public.student_registration_payment_attempts
  FOR EACH ROW
  EXECUTE FUNCTION public.set_student_registration_fee_snapshot();

COMMIT;
