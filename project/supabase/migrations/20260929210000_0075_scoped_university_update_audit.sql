-- Keep university-admin metadata updates scoped and auditable without granting
-- the university administrator access to the platform-wide audit logger.
BEGIN;

CREATE OR REPLACE FUNCTION public.record_trusted_university_admin_action(
  p_action text,
  p_university_id uuid,
  p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF auth.uid() IS NULL
    OR public.current_app_role() IS DISTINCT FROM 'university_admin'
    OR NOT public.can_manage_university(p_university_id) THEN
    RAISE EXCEPTION 'Assigned university administrator access required' USING ERRCODE = '42501';
  END IF;
  IF p_action IS NULL OR p_action NOT IN (
    'university.branding_set', 'university.branding_removed',
    'university.branding_metadata_updated', 'university.update'
  ) THEN
    RAISE EXCEPTION 'Invalid university administrator audit action' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.admin_actions (admin_id, action, module, target_type, target_id, metadata)
  VALUES (auth.uid(), p_action, 'universities', 'university', p_university_id, COALESCE(p_metadata, '{}'::jsonb));
  INSERT INTO public.audit_logs (actor_id, target_id, action, entity_type, entity_id, metadata)
  VALUES (auth.uid(), p_university_id, p_action, 'university', p_university_id, COALESCE(p_metadata, '{}'::jsonb));
END;
$$;

CREATE OR REPLACE FUNCTION public.update_admin_university(
  p_university_id uuid, p_name text, p_short_name text, p_slug text, p_city text DEFAULT NULL,
  p_region text DEFAULT NULL, p_country text DEFAULT NULL, p_website_url text DEFAULT NULL,
  p_description text DEFAULT NULL, p_logo_alt_text text DEFAULT NULL, p_hero_alt_text text DEFAULT NULL,
  p_image_credit text DEFAULT NULL, p_image_source text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.can_manage_university(p_university_id) THEN
    RAISE EXCEPTION 'University administrator access required' USING ERRCODE = '42501';
  END IF;
  IF NULLIF(btrim(p_name), '') IS NULL OR NULLIF(btrim(p_short_name), '') IS NULL OR NULLIF(btrim(p_slug), '') IS NULL THEN
    RAISE EXCEPTION 'Name, short name and slug are required' USING ERRCODE = '22023';
  END IF;

  UPDATE public.universities
  SET name = btrim(p_name), short_name = btrim(p_short_name), slug = btrim(p_slug),
      city = NULLIF(btrim(p_city), ''), region = NULLIF(btrim(p_region), ''),
      country = COALESCE(NULLIF(btrim(p_country), ''), country),
      website_url = NULLIF(btrim(p_website_url), ''), description = NULLIF(btrim(p_description), ''),
      logo_alt_text = NULLIF(btrim(p_logo_alt_text), ''), hero_alt_text = NULLIF(btrim(p_hero_alt_text), ''),
      image_credit = NULLIF(btrim(p_image_credit), ''), image_source = NULLIF(btrim(p_image_source), ''),
      updated_at = now()
  WHERE id = p_university_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'University not found' USING ERRCODE = 'P0002'; END IF;

  IF public.current_app_role() = 'university_admin' THEN
    PERFORM public.record_trusted_university_admin_action(
      'university.update', p_university_id,
      jsonb_build_object('directory_metadata_updated', true, 'branding_metadata_updated', true)
    );
  ELSE
    PERFORM public.record_trusted_admin_action(
      'university.update', 'universities', 'university', p_university_id, '{}'::jsonb
    );
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.update_admin_university(uuid,text,text,text,text,text,text,text,text,text,text,text,text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.update_admin_university(uuid,text,text,text,text,text,text,text,text,text,text,text,text) TO authenticated;

COMMIT;
