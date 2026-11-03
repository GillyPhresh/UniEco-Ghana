BEGIN;

-- Keep private profile contact details out of the general user-directory RPC.
-- Only a signed-in super administrator may request phone numbers for a
-- bounded set of users shown on the current management page.
CREATE OR REPLACE FUNCTION public.get_admin_user_contact_details(p_user_ids uuid[])
RETURNS TABLE(user_id uuid, phone text)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Super administrator access required' USING ERRCODE = '42501';
  END IF;

  IF p_user_ids IS NULL OR cardinality(p_user_ids) > 100 THEN
    RAISE EXCEPTION 'Provide a list of at most 100 user IDs' USING ERRCODE = '22023';
  END IF;

  RETURN QUERY
  SELECT profile.id AS user_id, profile.phone::text AS phone
  FROM public.profiles AS profile
  WHERE profile.id = ANY (p_user_ids);
END;
$$;

REVOKE ALL ON FUNCTION public.get_admin_user_contact_details(uuid[]) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_admin_user_contact_details(uuid[]) TO authenticated;

COMMIT;
