BEGIN;

-- Replace reasonless announcement RPC signatures so every create/update is
-- scope-checked and leaves a trusted audit reason in the database.
CREATE OR REPLACE FUNCTION public.create_admin_announcement(
  p_title text,
  p_body text,
  p_type text,
  p_target_audience text,
  p_university_id uuid DEFAULT NULL,
  p_starts_at timestamptz DEFAULT NULL,
  p_ends_at timestamptz DEFAULT NULL,
  p_reason text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE
  new_id uuid;
  clean_reason text := NULLIF(btrim(p_reason), '');
  starts_at timestamptz := COALESCE(p_starts_at, now());
  ends_at timestamptz := COALESCE(p_ends_at, now() + interval '7 days');
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_staff() THEN
    RAISE EXCEPTION 'Staff access required' USING ERRCODE = '42501';
  END IF;
  IF clean_reason IS NULL OR length(clean_reason) NOT BETWEEN 10 AND 500 THEN
    RAISE EXCEPTION 'An announcement reason between 10 and 500 characters is required' USING ERRCODE = '22023';
  END IF;
  IF NULLIF(btrim(p_title), '') IS NULL OR length(p_title) > 200
    OR NULLIF(btrim(p_body), '') IS NULL OR length(p_body) > 10000
    OR p_type IS NULL OR p_type NOT IN ('platform', 'university', 'maintenance', 'promotional')
    OR p_target_audience IS NULL OR p_target_audience NOT IN ('all', 'students', 'vendors', 'specific_university') THEN
    RAISE EXCEPTION 'Invalid announcement values' USING ERRCODE = '22023';
  END IF;
  IF ends_at <= starts_at THEN
    RAISE EXCEPTION 'Announcement end must be after start' USING ERRCODE = '22023';
  END IF;
  IF p_type = 'university' OR p_target_audience = 'specific_university' THEN
    IF p_university_id IS NULL OR NOT public.can_manage_university(p_university_id) THEN
      RAISE EXCEPTION 'University scope required' USING ERRCODE = '42501';
    END IF;
  ELSE
    IF p_university_id IS NOT NULL OR NOT public.is_super_admin() THEN
      RAISE EXCEPTION 'Platform-wide announcement requires super administrator authority and no university scope' USING ERRCODE = '42501';
    END IF;
  END IF;

  INSERT INTO public.announcements(title, body, type, target_audience, university_id, starts_at, ends_at, created_by)
  VALUES (btrim(p_title), btrim(p_body), p_type, p_target_audience, p_university_id, starts_at, ends_at, auth.uid())
  RETURNING id INTO new_id;
  PERFORM public.record_trusted_admin_action(
    'announcement.create', 'announcements', 'announcement', new_id,
    jsonb_build_object('reason', clean_reason, 'university_id', p_university_id, 'type', p_type, 'target_audience', p_target_audience)
  );
  RETURN new_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_admin_announcement(
  p_announcement_id uuid,
  p_title text,
  p_body text,
  p_type text,
  p_target_audience text,
  p_university_id uuid,
  p_is_active boolean,
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_reason text
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE
  existing_university_id uuid;
  clean_reason text := NULLIF(btrim(p_reason), '');
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_staff() THEN
    RAISE EXCEPTION 'Staff access required' USING ERRCODE = '42501';
  END IF;
  IF clean_reason IS NULL OR length(clean_reason) NOT BETWEEN 10 AND 500 THEN
    RAISE EXCEPTION 'An announcement reason between 10 and 500 characters is required' USING ERRCODE = '22023';
  END IF;
  SELECT university_id INTO existing_university_id
  FROM public.announcements WHERE id = p_announcement_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Announcement not found' USING ERRCODE = 'P0002'; END IF;
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
  ELSE
    -- Only a platform super-admin may remove tenant scope or publish platform-wide.
    IF p_university_id IS NOT NULL OR NOT public.is_super_admin() THEN
      RAISE EXCEPTION 'Platform-wide announcement requires super administrator authority and no university scope' USING ERRCODE = '42501';
    END IF;
  END IF;

  UPDATE public.announcements
  SET title = btrim(p_title), body = btrim(p_body), type = p_type,
      target_audience = p_target_audience, university_id = p_university_id,
      is_active = COALESCE(p_is_active, true), starts_at = p_starts_at, ends_at = p_ends_at
  WHERE id = p_announcement_id;
  PERFORM public.record_trusted_admin_action(
    'announcement.update', 'announcements', 'announcement', p_announcement_id,
    jsonb_build_object('reason', clean_reason, 'prior_university_id', existing_university_id, 'university_id', p_university_id, 'type', p_type, 'target_audience', p_target_audience)
  );
END;
$$;

-- Old signatures are removed, not merely hidden, so callers cannot bypass reason validation.
DROP FUNCTION IF EXISTS public.create_admin_announcement(text, text, text, text, uuid, timestamptz, timestamptz);
DROP FUNCTION IF EXISTS public.update_admin_announcement(uuid, text, text, text, text, uuid, boolean, timestamptz, timestamptz);
REVOKE ALL ON FUNCTION public.create_admin_announcement(text, text, text, text, uuid, timestamptz, timestamptz, text),
  public.update_admin_announcement(uuid, text, text, text, text, uuid, boolean, timestamptz, timestamptz, text)
FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.create_admin_announcement(text, text, text, text, uuid, timestamptz, timestamptz, text),
  public.update_admin_announcement(uuid, text, text, text, text, uuid, boolean, timestamptz, timestamptz, text)
TO authenticated;

COMMIT;
