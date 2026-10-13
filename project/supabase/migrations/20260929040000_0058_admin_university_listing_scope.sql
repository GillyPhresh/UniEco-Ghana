-- Management listings derive tenant scope from the authenticated database role
-- and membership, never from browser-supplied university IDs.
BEGIN;

CREATE OR REPLACE FUNCTION public.get_admin_universities()
RETURNS TABLE (
  id uuid,
  name text,
  short_name text,
  slug text,
  city text,
  region text,
  country text,
  logo_url text,
  hero_image_url text,
  logo_alt_text text,
  hero_alt_text text,
  image_credit text,
  image_source text,
  website_url text,
  description text,
  is_enabled boolean,
  created_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE v_role text := public.current_app_role();
BEGIN
  IF auth.uid() IS NULL OR v_role IS NULL OR v_role NOT IN ('super_admin','university_admin') THEN
    RAISE EXCEPTION 'University management access required' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT u.id,u.name,u.short_name,u.slug,u.city,u.region,u.country,u.logo_url,u.hero_image_url,
         u.logo_alt_text,u.hero_alt_text,u.image_credit,u.image_source,u.website_url,u.description,
         u.is_enabled,u.created_at
  FROM public.universities u
  WHERE public.can_manage_university(u.id)
  ORDER BY u.name;
END;
$$;

REVOKE ALL ON FUNCTION public.get_admin_universities() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_admin_universities() TO authenticated;

COMMIT;
