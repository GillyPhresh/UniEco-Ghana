-- Preserve the account type selected before Google OAuth redirects away from
-- the app. This is intentionally limited to the signed-in user's own profile.
BEGIN;

CREATE OR REPLACE FUNCTION public.set_my_registration_intent(p_intent text)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;
  IF p_intent NOT IN ('student', 'external_vendor') THEN
    RAISE EXCEPTION 'Invalid registration intent' USING ERRCODE = '22023';
  END IF;

  UPDATE public.profiles
  SET preferences = COALESCE(preferences, '{}'::jsonb) || jsonb_build_object('registration_intent', p_intent),
      updated_at = now()
  WHERE id = auth.uid();

  RETURN FOUND;
END;
$$;

REVOKE ALL ON FUNCTION public.set_my_registration_intent(text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.set_my_registration_intent(text) TO authenticated;

COMMIT;
