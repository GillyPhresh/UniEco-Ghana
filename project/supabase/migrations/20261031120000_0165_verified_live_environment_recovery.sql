-- Permit a narrowly scoped repair of legacy environment labels only after the
-- server has verified the same Paystack reference, amount and currency.
-- This migration never changes payment or registration status.
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
     OR NEW.fee_snapshot IS DISTINCT FROM OLD.fee_snapshot
     OR NEW.legacy_fee_snapshot_version IS DISTINCT FROM OLD.legacy_fee_snapshot_version
     OR NEW.referral_code_snapshot IS DISTINCT FROM OLD.referral_code_snapshot
     OR NEW.fee_snapshot_version IS DISTINCT FROM OLD.fee_snapshot_version
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'Payment attempt financial facts are immutable' USING ERRCODE = '42501';
  END IF;

  IF OLD.provider_environment IS NOT NULL
     AND NEW.provider_environment IS DISTINCT FROM OLD.provider_environment
     AND NOT (
       OLD.provider_environment IS NOT DISTINCT FROM 'test'
       AND NEW.provider_environment IS NOT DISTINCT FROM 'live'
       AND OLD.status IN ('initiated', 'pending', 'reconciliation_required')
       AND NEW.status = OLD.status
       AND NEW.verified_at IS NOT DISTINCT FROM OLD.verified_at
       AND auth.role() = 'service_role'
       AND current_setting('app.verified_paystack_attempt_environment', true) = OLD.payment_id::text
     ) THEN
    RAISE EXCEPTION 'Payment attempt environment is immutable outside verified live reconciliation' USING ERRCODE = '42501';
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

CREATE OR REPLACE FUNCTION public.bind_legacy_paystack_environment(
  p_payment_reference text,
  p_provider_environment text,
  p_amount numeric,
  p_currency text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  payment_row public.payments%ROWTYPE;
  attempt_row public.student_registration_payment_attempts%ROWTYPE;
  payment_environment_bound boolean := false;
  payment_environment_repaired boolean := false;
  attempt_environment_repaired boolean := false;
  affected_rows integer := 0;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'Payment reconciliation worker required' USING ERRCODE = '42501';
  END IF;
  IF p_payment_reference IS NULL OR length(p_payment_reference) NOT BETWEEN 8 AND 120
     OR p_provider_environment IS NULL OR p_provider_environment NOT IN ('test', 'live')
     OR p_amount IS NULL OR p_amount <= 0
     OR p_currency IS NULL OR upper(p_currency) <> 'GHS' THEN
    RAISE EXCEPTION 'Invalid verified Paystack result' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO payment_row
  FROM public.payments
  WHERE payment_reference = p_payment_reference
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Payment reference was not found' USING ERRCODE = 'P0002';
  END IF;
  IF payment_row.provider IS DISTINCT FROM 'paystack'
     OR payment_row.amount IS DISTINCT FROM p_amount
     OR payment_row.currency IS DISTINCT FROM upper(p_currency) THEN
    RAISE EXCEPTION 'Verified provider result does not match the internal payment' USING ERRCODE = '22023';
  END IF;
  IF payment_row.status NOT IN ('initiated', 'pending', 'reconciliation_required') THEN
    RAISE EXCEPTION 'Only unresolved payments can have their environment reconciled' USING ERRCODE = '22023';
  END IF;

  IF payment_row.provider_environment IS NULL THEN
    UPDATE public.payments
    SET provider_environment = p_provider_environment,
        updated_at = now()
    WHERE id = payment_row.id;
    payment_environment_bound := true;
  ELSIF payment_row.provider_environment IS DISTINCT FROM p_provider_environment THEN
    IF payment_row.provider_environment <> 'test' OR p_provider_environment <> 'live' THEN
      RAISE EXCEPTION 'Payment environment does not match the verified provider environment' USING ERRCODE = '22023';
    END IF;

    UPDATE public.payments
    SET provider_environment = 'live',
        updated_at = now()
    WHERE id = payment_row.id
      AND provider_environment = 'test'
      AND status IN ('initiated', 'pending', 'reconciliation_required');
    GET DIAGNOSTICS affected_rows = ROW_COUNT;
    IF affected_rows <> 1 THEN
      RAISE EXCEPTION 'Payment environment could not be safely reconciled' USING ERRCODE = '22023';
    END IF;
    payment_environment_repaired := true;
  END IF;

  IF payment_row.payment_type = 'student_registration' THEN
    SELECT * INTO attempt_row
    FROM public.student_registration_payment_attempts
    WHERE payment_id = payment_row.id
    FOR UPDATE;

    IF FOUND AND attempt_row.provider_environment IS DISTINCT FROM p_provider_environment THEN
      IF attempt_row.provider_environment IS NULL THEN
        UPDATE public.student_registration_payment_attempts
        SET provider_environment = p_provider_environment,
            updated_at = now()
        WHERE id = attempt_row.id
          AND provider_environment IS NULL
          AND status IN ('initiated', 'pending', 'reconciliation_required');
      ELSIF attempt_row.provider_environment = 'test'
            AND p_provider_environment = 'live'
            AND attempt_row.status IN ('initiated', 'pending', 'reconciliation_required') THEN
        PERFORM set_config('app.verified_paystack_attempt_environment', payment_row.id::text, true);
        UPDATE public.student_registration_payment_attempts
        SET provider_environment = 'live',
            updated_at = now()
        WHERE id = attempt_row.id
          AND provider_environment = 'test'
          AND status IN ('initiated', 'pending', 'reconciliation_required');
        GET DIAGNOSTICS affected_rows = ROW_COUNT;
        PERFORM set_config('app.verified_paystack_attempt_environment', '', true);
      ELSE
        RAISE EXCEPTION 'Registration attempt environment does not match the verified provider environment' USING ERRCODE = '22023';
      END IF;

      IF attempt_row.provider_environment IS NULL THEN
        GET DIAGNOSTICS affected_rows = ROW_COUNT;
      END IF;
      IF affected_rows <> 1 THEN
        RAISE EXCEPTION 'Registration attempt environment could not be safely reconciled' USING ERRCODE = '22023';
      END IF;
      attempt_environment_repaired := true;
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'payment_id', payment_row.id,
    'payment_reference', payment_row.payment_reference,
    'provider_environment', p_provider_environment,
    'bound_legacy_environment', payment_environment_bound,
    'repaired_verified_live_environment', payment_environment_repaired,
    'reconciled_attempt_environment', attempt_environment_repaired
  );
END;
$$;

REVOKE ALL ON FUNCTION public.bind_legacy_paystack_environment(text, text, numeric, text)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.bind_legacy_paystack_environment(text, text, numeric, text)
  TO service_role;

COMMENT ON FUNCTION public.bind_legacy_paystack_environment(text, text, numeric, text) IS
  'Service-role-only. Reconciles unresolved Paystack environment metadata only after server-side reference, amount and GHS currency verification; never changes payment status.';

COMMIT;
