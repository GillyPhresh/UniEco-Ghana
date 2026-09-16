-- Minimal prerequisite for the historical A2 migration's grant revocation.
-- A2 itself uses public.financial_reference('PAY') for new payment records.
BEGIN;

CREATE OR REPLACE FUNCTION public.generate_payment_reference()
RETURNS text
LANGUAGE sql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT 'PAY-' || to_char(clock_timestamp(), 'YYYYMMDD') || '-' ||
    upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 16))
$$;

-- This is an internal compatibility helper, not a browser-facing RPC.
REVOKE ALL ON FUNCTION public.generate_payment_reference() FROM PUBLIC, anon, authenticated, service_role;

COMMIT;
