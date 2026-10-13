-- Allow assigned university administrators to complete the branding workflows
-- that the existing scoped procedures already authorize, with resource-bound audit.
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
  IF p_action IS NULL OR p_action NOT IN ('university.branding_set', 'university.branding_removed', 'university.branding_metadata_updated') THEN
    RAISE EXCEPTION 'Invalid university administrator audit action' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.admin_actions (admin_id, action, module, target_type, target_id, metadata)
  VALUES (auth.uid(), p_action, 'universities', 'university', p_university_id, COALESCE(p_metadata, '{}'::jsonb));
  INSERT INTO public.audit_logs (actor_id, target_id, action, entity_type, entity_id, metadata)
  VALUES (auth.uid(), p_university_id, p_action, 'university', p_university_id, COALESCE(p_metadata, '{}'::jsonb));
END;
$$;

REVOKE ALL ON FUNCTION public.record_trusted_university_admin_action(text,uuid,jsonb) FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.set_admin_university_branding(
  p_university_id uuid,
  p_image_type text,
  p_object_path text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_slug text;
  v_column text;
  v_url text;
  v_action text;
  v_metadata jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT public.can_manage_university(p_university_id) THEN
    RAISE EXCEPTION 'University administrator access required' USING ERRCODE = '42501';
  END IF;
  IF p_image_type IS NULL OR p_image_type NOT IN ('logo','hero') THEN
    RAISE EXCEPTION 'Invalid image type' USING ERRCODE = '22023';
  END IF;

  SELECT slug INTO v_slug FROM public.universities WHERE id = p_university_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'University not found' USING ERRCODE = 'P0002'; END IF;
  IF p_object_path IS NOT NULL AND (
    p_object_path !~ ('^' || regexp_replace(v_slug,'([\\.\\+\\*\\?\\^\\$\\(\\)\\[\\]\\{\\}\\|\\\\])','\\\\\\1','g') || '/' || p_image_type || '-[0-9]+\\.(jpg|jpeg|png|webp)$')
    OR NOT EXISTS (SELECT 1 FROM storage.objects WHERE bucket_id = 'university-branding' AND name = p_object_path)
  ) THEN
    RAISE EXCEPTION 'Invalid university branding object' USING ERRCODE = '22023';
  END IF;

  v_column := CASE WHEN p_image_type = 'logo' THEN 'logo_url' ELSE 'hero_image_url' END;
  v_url := CASE WHEN p_object_path IS NULL THEN NULL ELSE
    'https://' || (current_setting('request.headers', true)::json ->> 'host') || '/storage/v1/object/public/university-branding/' || p_object_path END;
  IF p_object_path IS NOT NULL AND v_url IS NULL THEN
    RAISE EXCEPTION 'Unable to resolve storage host' USING ERRCODE = '22023';
  END IF;

  EXECUTE format('UPDATE public.universities SET %I = $1, updated_at = now() WHERE id = $2', v_column)
    USING v_url, p_university_id;
  v_action := CASE WHEN p_object_path IS NULL THEN 'university.branding_removed' ELSE 'university.branding_set' END;
  v_metadata := jsonb_build_object('image_type', p_image_type);
  IF public.current_app_role() = 'university_admin' THEN
    PERFORM public.record_trusted_university_admin_action(v_action, p_university_id, v_metadata);
  ELSE
    PERFORM public.record_trusted_admin_action(v_action, 'universities', 'university', p_university_id, v_metadata);
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_admin_university_branding_metadata(
  p_university_id uuid,
  p_logo_alt_text text DEFAULT NULL,
  p_hero_alt_text text DEFAULT NULL,
  p_image_credit text DEFAULT NULL,
  p_image_source text DEFAULT NULL
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
  IF length(COALESCE(p_logo_alt_text, '')) > 300 OR length(COALESCE(p_hero_alt_text, '')) > 300
    OR length(COALESCE(p_image_credit, '')) > 200 OR length(COALESCE(p_image_source, '')) > 500 THEN
    RAISE EXCEPTION 'Branding metadata exceeds allowed length' USING ERRCODE = '22023';
  END IF;

  UPDATE public.universities
  SET logo_alt_text = NULLIF(btrim(p_logo_alt_text), ''),
      hero_alt_text = NULLIF(btrim(p_hero_alt_text), ''),
      image_credit = NULLIF(btrim(p_image_credit), ''),
      image_source = NULLIF(btrim(p_image_source), ''),
      updated_at = now()
  WHERE id = p_university_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'University not found' USING ERRCODE = 'P0002'; END IF;

  IF public.current_app_role() = 'university_admin' THEN
    PERFORM public.record_trusted_university_admin_action(
      'university.branding_metadata_updated', p_university_id,
      jsonb_build_object('logo_alt_text_updated', p_logo_alt_text IS NOT NULL,
        'hero_alt_text_updated', p_hero_alt_text IS NOT NULL,
        'image_credit_updated', p_image_credit IS NOT NULL,
        'image_source_updated', p_image_source IS NOT NULL)
    );
  ELSE
    PERFORM public.record_trusted_admin_action(
      'university.branding_metadata_updated', 'universities', 'university', p_university_id,
      jsonb_build_object('logo_alt_text_updated', p_logo_alt_text IS NOT NULL,
        'hero_alt_text_updated', p_hero_alt_text IS NOT NULL,
        'image_credit_updated', p_image_credit IS NOT NULL,
        'image_source_updated', p_image_source IS NOT NULL)
    );
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.set_admin_university_branding(uuid,text,text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.set_admin_university_branding(uuid,text,text) TO authenticated;
REVOKE ALL ON FUNCTION public.update_admin_university_branding_metadata(uuid,text,text,text,text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.update_admin_university_branding_metadata(uuid,text,text,text,text) TO authenticated;

COMMIT;
