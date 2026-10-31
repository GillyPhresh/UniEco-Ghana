-- A successfully initialized Live checkout is authoritative for its provider
-- environment, but it is not proof of payment. Align a reused registration
-- attempt so the later verified Paystack webhook can complete normally.
BEGIN;

CREATE OR REPLACE FUNCTION public.record_paystack_checkout_initialized(
  p_payment_reference text,
  p_provider_environment text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  payment_row public.payments%ROWTYPE;
  attempt_row public.student_registration_payment_attempts%ROWTYPE;
  affected_rows integer := 0;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'Paystack checkout worker required' USING ERRCODE = '42501';
  END IF;
  IF p_payment_reference IS NULL OR length(p_payment_reference) NOT BETWEEN 8 AND 120
     OR p_provider_environment IS NULL OR p_provider_environment NOT IN ('test', 'live') THEN
    RAISE EXCEPTION 'Invalid Paystack checkout environment' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO payment_row
  FROM public.payments
  WHERE payment_reference = p_payment_reference
    AND provider = 'paystack'
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Unknown Paystack payment reference' USING ERRCODE = 'P0002';
  END IF;
  IF payment_row.status NOT IN ('initiated', 'pending') THEN
    RAISE EXCEPTION 'Payment cannot be initialized from its current status' USING ERRCODE = '22023';
  END IF;
  IF payment_row.provider_environment IS NOT NULL
     AND payment_row.provider_environment IS DISTINCT FROM p_provider_environment
     AND NOT (payment_row.provider_environment = 'test' AND p_provider_environment = 'live') THEN
    RAISE EXCEPTION 'Paystack checkout environment conflicts with the payment record' USING ERRCODE = '22023';
  END IF;

  UPDATE public.payments
  SET status = 'pending',
      provider_environment = p_provider_environment,
      provider_checkout_initialized_at = COALESCE(provider_checkout_initialized_at, now()),
      updated_at = now()
  WHERE id = payment_row.id;

  IF payment_row.payment_type = 'student_registration' THEN
    SELECT * INTO attempt_row
    FROM public.student_registration_payment_attempts
    WHERE payment_id = payment_row.id
    FOR UPDATE;

    IF FOUND AND attempt_row.provider_environment IS DISTINCT FROM p_provider_environment THEN
      IF attempt_row.provider_environment IS NULL
         AND attempt_row.status IN ('initiated', 'pending') THEN
        UPDATE public.student_registration_payment_attempts
        SET provider_environment = p_provider_environment,
            updated_at = now()
        WHERE id = attempt_row.id
          AND provider_environment IS NULL
          AND status IN ('initiated', 'pending');
        GET DIAGNOSTICS affected_rows = ROW_COUNT;
      ELSIF attempt_row.provider_environment = 'test'
            AND p_provider_environment = 'live'
            AND attempt_row.status IN ('initiated', 'pending') THEN
        PERFORM set_config('app.verified_paystack_attempt_environment', payment_row.id::text, true);
        UPDATE public.student_registration_payment_attempts
        SET provider_environment = 'live',
            updated_at = now()
        WHERE id = attempt_row.id
          AND provider_environment = 'test'
          AND status IN ('initiated', 'pending');
        GET DIAGNOSTICS affected_rows = ROW_COUNT;
        PERFORM set_config('app.verified_paystack_attempt_environment', '', true);
      ELSE
        RAISE EXCEPTION 'Registration attempt environment conflicts with initialized checkout' USING ERRCODE = '22023';
      END IF;

      IF affected_rows <> 1 THEN
        RAISE EXCEPTION 'Registration attempt environment could not be aligned with checkout' USING ERRCODE = '22023';
      END IF;
    END IF;
  END IF;

  INSERT INTO public.payment_status_history(payment_id, status, event_type, description, actor_type, metadata)
  VALUES (
    payment_row.id,
    'pending',
    'provider_checkout_initialized',
    'Paystack checkout initialized',
    'provider',
    jsonb_build_object('environment', p_provider_environment)
  );

  RETURN jsonb_build_object('payment_id', payment_row.id, 'status', 'pending');
END;
$$;

REVOKE ALL ON FUNCTION public.record_paystack_checkout_initialized(text, text)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.record_paystack_checkout_initialized(text, text)
  TO service_role;

COMMENT ON FUNCTION public.record_paystack_checkout_initialized(text, text) IS
  'Service-role-only. Records a provider-initialized checkout and aligns unresolved registration environment metadata; checkout initialization never marks payment successful.';

COMMIT;
