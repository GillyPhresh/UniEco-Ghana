-- A Paystack event may put both the payment and its linked student attempt
-- into reconciliation_required when the first webhook could not be safely
-- applied. A later server-side verification must be able to resolve that
-- attempt, while still keeping its financial facts immutable.
BEGIN;

CREATE OR REPLACE FUNCTION public.guard_student_registration_payment_attempt()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Registration payment attempt history is immutable' USING ERRCODE = '42501';
  END IF;

  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW.registration_id IS DISTINCT FROM OLD.registration_id
     OR NEW.payment_id IS DISTINCT FROM OLD.payment_id
     OR NEW.user_id IS DISTINCT FROM OLD.user_id
     OR NEW.provider IS DISTINCT FROM OLD.provider
     OR NEW.payment_purpose IS DISTINCT FROM OLD.payment_purpose
     OR NEW.expected_amount IS DISTINCT FROM OLD.expected_amount
     OR NEW.expected_currency IS DISTINCT FROM OLD.expected_currency
     OR NEW.fee_snapshot_version IS DISTINCT FROM OLD.fee_snapshot_version
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'Payment attempt financial facts are immutable' USING ERRCODE = '42501';
  END IF;

  IF OLD.provider_environment IS NOT NULL
     AND NEW.provider_environment IS DISTINCT FROM OLD.provider_environment THEN
    RAISE EXCEPTION 'Payment attempt environment is immutable once bound' USING ERRCODE = '42501';
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status AND NOT (
    (OLD.status = 'initiated' AND NEW.status IN ('pending', 'success', 'failed', 'cancelled', 'reconciliation_required')) OR
    (OLD.status = 'pending' AND NEW.status IN ('success', 'failed', 'cancelled', 'reconciliation_required', 'partially_refunded', 'refunded')) OR
    (OLD.status = 'success' AND NEW.status IN ('reconciliation_required', 'partially_refunded', 'refunded')) OR
    (OLD.status = 'failed' AND NEW.status IN ('reconciliation_required', 'refunded')) OR
    (OLD.status = 'partially_refunded' AND NEW.status IN ('refunded', 'reconciliation_required')) OR
    (OLD.status = 'reconciliation_required' AND NEW.status IN ('success', 'failed', 'cancelled'))
  ) THEN
    RAISE EXCEPTION 'Payment attempt state transition is not allowed' USING ERRCODE = '22023';
  END IF;

  RETURN NEW;
END;
$$;

COMMIT;
