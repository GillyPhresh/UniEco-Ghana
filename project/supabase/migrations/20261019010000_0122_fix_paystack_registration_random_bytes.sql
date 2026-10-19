-- Supabase installs pgcrypto in the extensions schema. The registration
-- payment functions use gen_random_bytes for idempotency keys, so include
-- that schema in their SECURITY DEFINER search_path.
BEGIN;

ALTER FUNCTION public.begin_student_registration_payment(
  uuid, text, text, text, text, text, text, integer, integer, text, text, text
) SET search_path = pg_catalog, public, extensions;

ALTER FUNCTION public.begin_vendor_registration_payment(uuid, text)
  SET search_path = pg_catalog, public, extensions;

COMMIT;
