-- Repair legacy Paystack payments that were received before the internal
-- provider-environment marker was recorded. This does not mark payments paid
-- by itself: the server must first verify the reference with Paystack, amount,
-- currency, and environment, then call this function.
BEGIN;

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
  was_missing_environment boolean;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'Payment reconciliation worker required' USING ERRCODE = '42501';
  END IF;
  IF p_provider_environment NOT IN ('test', 'live')
     OR p_amount IS NULL
     OR p_currency <> 'GHS' THEN
    RAISE EXCEPTION 'Invalid verified Paystack result' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO payment_row
  FROM public.payments
  WHERE payment_reference = p_payment_reference
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Payment reference was not found' USING ERRCODE = 'P0002';
  END IF;
  IF payment_row.provider <> 'paystack'
     OR payment_row.amount <> p_amount
     OR payment_row.currency <> p_currency THEN
    RAISE EXCEPTION 'Verified provider result does not match the internal payment' USING ERRCODE = '22023';
  END IF;

  was_missing_environment := payment_row.provider_environment IS NULL;

  -- Never overwrite a known environment. A missing value is the only legacy
  -- state that may be bound from the verified server-side Paystack response.
  IF payment_row.provider_environment IS NULL THEN
    UPDATE public.payments
    SET provider_environment = p_provider_environment,
        updated_at = now()
    WHERE id = payment_row.id;
  ELSIF payment_row.provider_environment IS DISTINCT FROM p_provider_environment THEN
    RAISE EXCEPTION 'Payment environment does not match the verified provider environment' USING ERRCODE = '22023';
  END IF;

  RETURN jsonb_build_object(
    'payment_id', payment_row.id,
    'payment_reference', payment_row.payment_reference,
    'provider_environment', p_provider_environment,
    'bound_legacy_environment', was_missing_environment
  );
END;
$$;

REVOKE ALL ON FUNCTION public.bind_legacy_paystack_environment(text, text, numeric, text)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.bind_legacy_paystack_environment(text, text, numeric, text)
  TO service_role;

COMMIT;
