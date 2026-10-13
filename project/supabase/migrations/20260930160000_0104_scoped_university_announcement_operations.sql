BEGIN;

-- University-admin announcement writes use a narrow audit path rather than
-- widening the platform-staff logger or trusting browser-supplied actors.
CREATE OR REPLACE FUNCTION public.record_trusted_university_announcement_action(
  p_action text,
  p_announcement_id uuid,
  p_university_id uuid,
  p_metadata jsonb
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN
  IF auth.uid() IS NULL OR public.current_app_role() IS DISTINCT FROM 'university_admin'
    OR p_university_id IS NULL OR NOT public.can_manage_university(p_university_id) THEN
    RAISE EXCEPTION 'Assigned university administrator access required' USING ERRCODE = '42501';
  END IF;
  IF p_action NOT IN ('announcement.create', 'announcement.update', 'announcement.delete') THEN
    RAISE EXCEPTION 'Invalid university announcement audit action' USING ERRCODE = '22023';
  END IF;
  INSERT INTO public.admin_actions(admin_id, action, module, target_type, target_id, metadata)
  VALUES (auth.uid(), p_action, 'announcements', 'announcement', p_announcement_id, COALESCE(p_metadata, '{}'::jsonb));
  INSERT INTO public.audit_logs(actor_id, target_id, action, entity_type, entity_id, metadata)
  VALUES (auth.uid(), p_announcement_id, p_action, 'announcement', p_announcement_id, COALESCE(p_metadata, '{}'::jsonb));
END;
$$;
REVOKE ALL ON FUNCTION public.record_trusted_university_announcement_action(text, uuid, uuid, jsonb)
FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.get_admin_announcements(
  p_limit integer DEFAULT 200,
  p_offset integer DEFAULT 0
)
RETURNS TABLE(
  id uuid, title text, body text, type text, target_audience text, university_id uuid,
  is_active boolean, starts_at timestamptz, ends_at timestamptz, created_by uuid,
  created_at timestamptz, university jsonb
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE
  role_name text := public.current_app_role();
  row_limit integer := COALESCE(p_limit, 200);
  row_offset integer := COALESCE(p_offset, 0);
BEGIN
  IF auth.uid() IS NULL OR role_name IS NULL OR role_name NOT IN ('super_admin', 'university_admin') THEN
    RAISE EXCEPTION 'Announcement management access required' USING ERRCODE = '42501';
  END IF;
  IF row_limit < 1 OR row_limit > 200 OR row_offset < 0 OR row_offset > 10000 THEN
    RAISE EXCEPTION 'Invalid announcement page' USING ERRCODE = '22023';
  END IF;
  RETURN QUERY
  SELECT a.id, a.title, a.body, a.type, a.target_audience, a.university_id,
         a.is_active, a.starts_at, a.ends_at, a.created_by, a.created_at,
         CASE WHEN u.id IS NULL THEN NULL ELSE jsonb_build_object('name', u.name, 'short_name', u.short_name) END
  FROM public.announcements a
  LEFT JOIN public.universities u ON u.id = a.university_id
  WHERE role_name = 'super_admin'
     OR (a.university_id IS NOT NULL AND public.can_manage_university(a.university_id))
  ORDER BY a.created_at DESC, a.id
  LIMIT row_limit OFFSET row_offset;
END;
$$;
REVOKE ALL ON FUNCTION public.get_admin_announcements(integer, integer) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_admin_announcements(integer, integer) TO authenticated;

CREATE OR REPLACE FUNCTION public.create_admin_announcement(
  p_title text, p_body text, p_type text, p_target_audience text,
  p_university_id uuid DEFAULT NULL, p_starts_at timestamptz DEFAULT NULL,
  p_ends_at timestamptz DEFAULT NULL, p_reason text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE
  role_name text := public.current_app_role();
  new_id uuid;
  clean_reason text := NULLIF(btrim(p_reason), '');
  start_time timestamptz := COALESCE(p_starts_at, now());
  end_time timestamptz := COALESCE(p_ends_at, now() + interval '7 days');
  audit_metadata jsonb;
BEGIN
  IF auth.uid() IS NULL OR role_name IS NULL OR role_name NOT IN ('super_admin', 'university_admin') THEN
    RAISE EXCEPTION 'Announcement management access required' USING ERRCODE = '42501';
  END IF;
  IF clean_reason IS NULL OR length(clean_reason) NOT BETWEEN 10 AND 500 THEN
    RAISE EXCEPTION 'An announcement reason between 10 and 500 characters is required' USING ERRCODE = '22023';
  END IF;
  IF NULLIF(btrim(p_title), '') IS NULL OR length(p_title) > 200
    OR NULLIF(btrim(p_body), '') IS NULL OR length(p_body) > 10000
    OR p_type IS NULL OR p_type NOT IN ('platform', 'university', 'maintenance', 'promotional')
    OR p_target_audience IS NULL OR p_target_audience NOT IN ('all', 'students', 'vendors', 'specific_university')
    OR end_time <= start_time THEN
    RAISE EXCEPTION 'Invalid announcement values' USING ERRCODE = '22023';
  END IF;
  IF p_type = 'university' OR p_target_audience = 'specific_university' THEN
    IF p_university_id IS NULL OR NOT public.can_manage_university(p_university_id) THEN
      RAISE EXCEPTION 'University scope required' USING ERRCODE = '42501';
    END IF;
  ELSIF p_university_id IS NOT NULL OR role_name <> 'super_admin' THEN
    RAISE EXCEPTION 'Platform-wide announcements require super administrator authority and no university scope' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.announcements(title, body, type, target_audience, university_id, starts_at, ends_at, created_by)
  VALUES (btrim(p_title), btrim(p_body), p_type, p_target_audience, p_university_id, start_time, end_time, auth.uid())
  RETURNING id INTO new_id;
  audit_metadata := jsonb_build_object('reason', clean_reason, 'university_id', p_university_id, 'type', p_type, 'target_audience', p_target_audience);
  IF role_name = 'university_admin' THEN
    PERFORM public.record_trusted_university_announcement_action('announcement.create', new_id, p_university_id, audit_metadata);
  ELSE
    PERFORM public.record_trusted_admin_action('announcement.create', 'announcements', 'announcement', new_id, audit_metadata);
  END IF;
  RETURN new_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_admin_announcement(
  p_announcement_id uuid, p_title text, p_body text, p_type text, p_target_audience text,
  p_university_id uuid, p_is_active boolean, p_starts_at timestamptz, p_ends_at timestamptz, p_reason text
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE
  role_name text := public.current_app_role();
  old_university_id uuid;
  clean_reason text := NULLIF(btrim(p_reason), '');
  audit_metadata jsonb;
BEGIN
  IF auth.uid() IS NULL OR role_name IS NULL OR role_name NOT IN ('super_admin', 'university_admin') THEN
    RAISE EXCEPTION 'Announcement management access required' USING ERRCODE = '42501';
  END IF;
  IF clean_reason IS NULL OR length(clean_reason) NOT BETWEEN 10 AND 500 THEN
    RAISE EXCEPTION 'An announcement reason between 10 and 500 characters is required' USING ERRCODE = '22023';
  END IF;
  SELECT university_id INTO old_university_id FROM public.announcements WHERE id = p_announcement_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Announcement not found' USING ERRCODE = 'P0002'; END IF;
  IF role_name = 'university_admin'
    AND (old_university_id IS NULL OR NOT public.can_manage_university(old_university_id)) THEN
    RAISE EXCEPTION 'Announcement is outside your university scope' USING ERRCODE = '42501';
  END IF;
  IF NULLIF(btrim(p_title), '') IS NULL OR length(p_title) > 200
    OR NULLIF(btrim(p_body), '') IS NULL OR length(p_body) > 10000
    OR p_type IS NULL OR p_type NOT IN ('platform', 'university', 'maintenance', 'promotional')
    OR p_target_audience IS NULL OR p_target_audience NOT IN ('all', 'students', 'vendors', 'specific_university')
    OR p_starts_at IS NULL OR p_ends_at IS NULL OR p_ends_at <= p_starts_at THEN
    RAISE EXCEPTION 'Invalid announcement values' USING ERRCODE = '22023';
  END IF;
  IF p_type = 'university' OR p_target_audience = 'specific_university' THEN
    IF p_university_id IS NULL OR NOT public.can_manage_university(p_university_id) THEN
      RAISE EXCEPTION 'University scope required' USING ERRCODE = '42501';
    END IF;
  ELSIF p_university_id IS NOT NULL OR role_name <> 'super_admin' THEN
    RAISE EXCEPTION 'Platform-wide announcements require super administrator authority and no university scope' USING ERRCODE = '42501';
  END IF;

  UPDATE public.announcements
  SET title = btrim(p_title), body = btrim(p_body), type = p_type,
      target_audience = p_target_audience, university_id = p_university_id,
      is_active = COALESCE(p_is_active, true), starts_at = p_starts_at, ends_at = p_ends_at
  WHERE id = p_announcement_id;
  audit_metadata := jsonb_build_object('reason', clean_reason, 'prior_university_id', old_university_id,
    'university_id', p_university_id, 'type', p_type, 'target_audience', p_target_audience);
  IF role_name = 'university_admin' THEN
    PERFORM public.record_trusted_university_announcement_action('announcement.update', p_announcement_id, old_university_id, audit_metadata);
  ELSE
    PERFORM public.record_trusted_admin_action('announcement.update', 'announcements', 'announcement', p_announcement_id, audit_metadata);
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.delete_admin_announcement(p_announcement_id uuid, p_reason text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE
  role_name text := public.current_app_role();
  target_university_id uuid;
  clean_reason text := NULLIF(btrim(p_reason), '');
  audit_metadata jsonb;
BEGIN
  IF auth.uid() IS NULL OR role_name IS NULL OR role_name NOT IN ('super_admin', 'university_admin') THEN
    RAISE EXCEPTION 'Announcement management access required' USING ERRCODE = '42501';
  END IF;
  IF clean_reason IS NULL OR length(clean_reason) NOT BETWEEN 10 AND 500 THEN
    RAISE EXCEPTION 'A deletion reason between 10 and 500 characters is required' USING ERRCODE = '22023';
  END IF;
  SELECT university_id INTO target_university_id FROM public.announcements WHERE id = p_announcement_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Announcement not found' USING ERRCODE = 'P0002'; END IF;
  IF target_university_id IS NULL OR NOT public.can_manage_university(target_university_id) THEN
    IF role_name <> 'super_admin' OR target_university_id IS NOT NULL THEN
      RAISE EXCEPTION 'Announcement is outside your authorized scope' USING ERRCODE = '42501';
    END IF;
  END IF;
  IF role_name = 'university_admin' AND NOT public.can_manage_university(target_university_id) THEN
    RAISE EXCEPTION 'Announcement is outside your university scope' USING ERRCODE = '42501';
  END IF;
  DELETE FROM public.announcements WHERE id = p_announcement_id;
  audit_metadata := jsonb_build_object('reason', clean_reason, 'university_id', target_university_id);
  IF role_name = 'university_admin' THEN
    PERFORM public.record_trusted_university_announcement_action('announcement.delete', p_announcement_id, target_university_id, audit_metadata);
  ELSE
    PERFORM public.record_trusted_admin_action('announcement.delete', 'announcements', 'announcement', p_announcement_id, audit_metadata);
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.create_admin_announcement(text, text, text, text, uuid, timestamptz, timestamptz, text),
  public.update_admin_announcement(uuid, text, text, text, text, uuid, boolean, timestamptz, timestamptz, text),
  public.delete_admin_announcement(uuid, text)
FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.create_admin_announcement(text, text, text, text, uuid, timestamptz, timestamptz, text),
  public.update_admin_announcement(uuid, text, text, text, text, uuid, boolean, timestamptz, timestamptz, text),
  public.delete_admin_announcement(uuid, text)
TO authenticated;

COMMIT;
