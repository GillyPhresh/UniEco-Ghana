-- The student registration RPC creates a fresh attempt after a failed or
-- cancelled checkout using pgcrypto's gen_random_bytes(). In Supabase,
-- pgcrypto is installed in the extensions schema, so include that schema in
-- this SECURITY DEFINER function's fixed search path.
BEGIN;

ALTER FUNCTION public.begin_student_registration_payment(
  uuid,
  text,
  text,
  text,
  text,
  text,
  text,
  integer,
  integer,
  text,
  text,
  text
) SET search_path = pg_catalog, extensions, public;

COMMIT;
