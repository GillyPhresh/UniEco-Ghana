-- Allow the Paystack server-approval callback to validate only an exact,
-- already-claimed live UniEco referral payout. This function never mutates data.
BEGIN;

CREATE OR REPLACE FUNCTION public.is_referral_payout_approval_valid(
  p_reference text,
  p_amount_pesewas bigint,
  p_currency text,
  p_recipient_code text
) RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'Service access required' USING ERRCODE='42501';
  END IF;

  IF p_reference IS NULL OR p_reference !~ '^[a-z0-9_-]{16,50}$'
    OR p_amount_pesewas IS NULL OR p_amount_pesewas <= 0 OR p_amount_pesewas > 100000000
    OR p_currency IS DISTINCT FROM 'GHS'
    OR p_recipient_code IS NULL OR p_recipient_code !~ '^RCP_[A-Za-z0-9]+$' THEN
    RETURN false;
  END IF;

  RETURN EXISTS (
    SELECT 1
    FROM public.referral_payouts p
    WHERE p.reference = p_reference
      AND p.amount = p_amount_pesewas::numeric / 100
      AND p.currency = p_currency
      AND p.recipient_code = p_recipient_code
      AND p.environment = 'live'
      AND p.status = 'processing'
  );
END
$$;

REVOKE ALL ON FUNCTION public.is_referral_payout_approval_valid(text,bigint,text,text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_referral_payout_approval_valid(text,bigint,text,text) TO service_role;

COMMIT;
