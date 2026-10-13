BEGIN;

-- Retain the existing resource-specific authorization and audit architecture,
-- while removing reasonless API-call paths for destructive content actions.
REVOKE ALL ON FUNCTION public.delete_admin_category(uuid),
  public.delete_admin_cms_page(uuid),
  public.delete_admin_faq(uuid),
  public.delete_admin_announcement(uuid)
FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.delete_admin_category(p_category_id uuid, p_reason text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE
  clean_reason text := NULLIF(btrim(p_reason), '');
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Super administrator access required' USING ERRCODE = '42501';
  END IF;
  IF clean_reason IS NULL OR length(clean_reason) NOT BETWEEN 10 AND 500 THEN
    RAISE EXCEPTION 'A deletion reason between 10 and 500 characters is required' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (SELECT 1 FROM public.categories WHERE parent_id = p_category_id) THEN
    RAISE EXCEPTION 'Category has child categories' USING ERRCODE = '22023';
  END IF;
  DELETE FROM public.categories WHERE id = p_category_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Category not found' USING ERRCODE = 'P0002'; END IF;
  PERFORM public.record_trusted_admin_action('category.delete', 'categories', 'category', p_category_id,
    jsonb_build_object('reason', clean_reason));
END;
$$;

CREATE OR REPLACE FUNCTION public.delete_admin_cms_page(p_page_id uuid, p_reason text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE
  clean_reason text := NULLIF(btrim(p_reason), '');
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Super administrator access required' USING ERRCODE = '42501';
  END IF;
  IF clean_reason IS NULL OR length(clean_reason) NOT BETWEEN 10 AND 500 THEN
    RAISE EXCEPTION 'A deletion reason between 10 and 500 characters is required' USING ERRCODE = '22023';
  END IF;
  DELETE FROM public.cms_pages WHERE id = p_page_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'CMS page not found' USING ERRCODE = 'P0002'; END IF;
  PERFORM public.record_trusted_admin_action('cms.delete', 'cms', 'cms_page', p_page_id,
    jsonb_build_object('reason', clean_reason));
END;
$$;

CREATE OR REPLACE FUNCTION public.delete_admin_faq(p_faq_id uuid, p_reason text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE
  clean_reason text := NULLIF(btrim(p_reason), '');
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Super administrator access required' USING ERRCODE = '42501';
  END IF;
  IF clean_reason IS NULL OR length(clean_reason) NOT BETWEEN 10 AND 500 THEN
    RAISE EXCEPTION 'A deletion reason between 10 and 500 characters is required' USING ERRCODE = '22023';
  END IF;
  DELETE FROM public.cms_faq_entries WHERE id = p_faq_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'FAQ not found' USING ERRCODE = 'P0002'; END IF;
  PERFORM public.record_trusted_admin_action('faq.delete', 'cms', 'cms_faq_entry', p_faq_id,
    jsonb_build_object('reason', clean_reason));
END;
$$;

CREATE OR REPLACE FUNCTION public.delete_admin_announcement(p_announcement_id uuid, p_reason text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE
  university_id uuid;
  clean_reason text := NULLIF(btrim(p_reason), '');
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_staff() THEN
    RAISE EXCEPTION 'Staff access required' USING ERRCODE = '42501';
  END IF;
  IF clean_reason IS NULL OR length(clean_reason) NOT BETWEEN 10 AND 500 THEN
    RAISE EXCEPTION 'A deletion reason between 10 and 500 characters is required' USING ERRCODE = '22023';
  END IF;
  SELECT announcement.university_id INTO university_id
  FROM public.announcements announcement
  WHERE announcement.id = p_announcement_id
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Announcement not found' USING ERRCODE = 'P0002'; END IF;
  IF university_id IS NULL AND NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Super administrator access required' USING ERRCODE = '42501';
  ELSIF university_id IS NOT NULL AND NOT public.can_manage_university(university_id) THEN
    RAISE EXCEPTION 'University scope required' USING ERRCODE = '42501';
  END IF;
  DELETE FROM public.announcements WHERE id = p_announcement_id;
  PERFORM public.record_trusted_admin_action('announcement.delete', 'announcements', 'announcement', p_announcement_id,
    jsonb_build_object('reason', clean_reason, 'university_id', university_id));
END;
$$;

REVOKE ALL ON FUNCTION public.delete_admin_category(uuid, text),
  public.delete_admin_cms_page(uuid, text),
  public.delete_admin_faq(uuid, text),
  public.delete_admin_announcement(uuid, text)
FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.delete_admin_category(uuid, text),
  public.delete_admin_cms_page(uuid, text),
  public.delete_admin_faq(uuid, text),
  public.delete_admin_announcement(uuid, text)
TO authenticated;

COMMIT;
