-- Remaining legacy helper prerequisites referenced by 0030's grant hardening.
-- A2 itself issues references with public.financial_reference(...).
BEGIN;

CREATE OR REPLACE FUNCTION public.generate_invoice_number()
RETURNS text
LANGUAGE sql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT 'INV-' || to_char(clock_timestamp(), 'YYYYMMDD') || '-' ||
    upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 16))
$$;

CREATE OR REPLACE FUNCTION public.generate_receipt_number()
RETURNS text
LANGUAGE sql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT 'RCP-' || to_char(clock_timestamp(), 'YYYYMMDD') || '-' ||
    upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 16))
$$;

-- Both helpers are internal compatibility functions, never browser RPCs.
REVOKE ALL ON FUNCTION public.generate_invoice_number() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.generate_receipt_number() FROM PUBLIC, anon, authenticated, service_role;

COMMIT;
