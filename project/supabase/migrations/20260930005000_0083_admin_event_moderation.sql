-- Event moderation uses existing flags, content-moderation capability, tenant
-- membership, and trusted audit logging. No broad table writes are granted.
BEGIN;

CREATE INDEX IF NOT EXISTS content_quality_flags_type_status_created_idx
  ON public.content_quality_flags (content_type, status, created_at DESC);

-- University admins cannot use the platform-wide audit logger. This helper
-- records only event moderation actions inside their active university scope.
CREATE OR REPLACE FUNCTION public.record_trusted_university_event_action(
  p_action text,
  p_university_id uuid,
  p_event_id uuid,
  p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF auth.uid() IS NULL OR public.current_app_role() IS DISTINCT FROM 'university_admin'
    OR NOT public.can_manage_university(p_university_id) THEN
    RAISE EXCEPTION 'Assigned university event administrator access required' USING ERRCODE = '42501';
  END IF;
  IF p_action IS NULL OR p_action NOT IN ('event.moderation_dismiss', 'event.moderation_hide', 'event.moderation_publish') THEN
    RAISE EXCEPTION 'Invalid university event moderation audit action' USING ERRCODE = '22023';
  END IF;
  INSERT INTO public.admin_actions (admin_id, action, module, target_type, target_id, metadata)
  VALUES (auth.uid(), p_action, 'events', 'event', p_event_id,
    COALESCE(p_metadata, '{}'::jsonb) || jsonb_build_object('university_id', p_university_id));
  INSERT INTO public.audit_logs (actor_id, target_id, action, entity_type, entity_id, metadata)
  VALUES (auth.uid(), p_event_id, p_action, 'event', p_event_id,
    COALESCE(p_metadata, '{}'::jsonb) || jsonb_build_object('university_id', p_university_id));
END;
$$;

CREATE OR REPLACE FUNCTION public.get_admin_event_moderation_queue(
  p_status text DEFAULT 'pending',
  p_limit integer DEFAULT 30,
  p_offset integer DEFAULT 0
)
RETURNS TABLE(
  flag_id uuid,
  event_id uuid,
  event_title text,
  event_description text,
  university_id uuid,
  university_name text,
  event_start_time timestamptz,
  is_published boolean,
  flag_reason text,
  flag_details text,
  flag_status text,
  flagged_at timestamptz,
  total_count bigint
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_status text := NULLIF(btrim(p_status), '');
  v_limit integer := COALESCE(p_limit, 30);
  v_offset integer := COALESCE(p_offset, 0);
BEGIN
  IF auth.uid() IS NULL OR NOT (
    public.is_super_admin() OR public.has_permission('can_moderate_content')
    OR public.current_app_role() = 'university_admin'
  ) THEN
    RAISE EXCEPTION 'Event moderation access required' USING ERRCODE = '42501';
  END IF;
  IF v_status IS NOT NULL AND v_status NOT IN ('pending', 'reviewing', 'resolved', 'dismissed', 'all') THEN
    RAISE EXCEPTION 'Invalid event flag status' USING ERRCODE = '22023';
  END IF;
  IF v_limit NOT BETWEEN 1 AND 100 OR v_offset < 0 OR v_offset > 10000 THEN
    RAISE EXCEPTION 'Invalid pagination' USING ERRCODE = '22023';
  END IF;

  RETURN QUERY
  SELECT flag.id, event.id, event.title, event.description, event.university_id,
    university.name, event.start_time, event.is_published, flag.flag_reason,
    flag.flag_details, flag.status, flag.created_at, count(*) OVER ()
  FROM public.content_quality_flags flag
  JOIN public.events event ON event.id = flag.content_id
  LEFT JOIN public.universities university ON university.id = event.university_id
  WHERE flag.content_type = 'event'
    AND (v_status IS NULL OR v_status = 'all' OR flag.status = v_status)
    AND (
      public.is_super_admin()
      OR public.has_permission('can_moderate_content')
      OR public.can_manage_university(event.university_id)
    )
  ORDER BY CASE WHEN flag.status IN ('pending', 'reviewing') THEN 0 ELSE 1 END,
    event.start_time ASC NULLS LAST, flag.created_at DESC
  LIMIT v_limit OFFSET v_offset;
END;
$$;

CREATE OR REPLACE FUNCTION public.review_admin_event_flag(
  p_flag_id uuid,
  p_action text,
  p_reason text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_flag public.content_quality_flags%ROWTYPE;
  v_university_id uuid;
  v_is_published boolean;
  v_reason text := NULLIF(btrim(p_reason), '');
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;
  IF p_action IS NULL OR p_action NOT IN ('dismiss', 'hide', 'publish') THEN
    RAISE EXCEPTION 'Invalid event moderation action' USING ERRCODE = '22023';
  END IF;
  IF v_reason IS NULL OR length(v_reason) < 10 OR length(v_reason) > 1000 THEN
    RAISE EXCEPTION 'A moderation reason between 10 and 1000 characters is required' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_flag
  FROM public.content_quality_flags
  WHERE id = p_flag_id AND content_type = 'event'
  FOR UPDATE;
  IF NOT FOUND OR v_flag.status NOT IN ('pending', 'reviewing') THEN
    RAISE EXCEPTION 'Event flag is unavailable for review' USING ERRCODE = '22023';
  END IF;

  SELECT event.university_id, event.is_published INTO v_university_id, v_is_published
  FROM public.events event
  WHERE event.id = v_flag.content_id
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Event not found' USING ERRCODE = 'P0002'; END IF;
  IF NOT (
    public.is_super_admin() OR public.has_permission('can_moderate_content')
    OR public.can_manage_university(v_university_id)
  ) THEN
    RAISE EXCEPTION 'Event moderation access required' USING ERRCODE = '42501';
  END IF;
  IF (p_action = 'hide' AND NOT v_is_published) OR (p_action = 'publish' AND v_is_published) THEN
    RAISE EXCEPTION 'Event visibility has changed; refresh and review again' USING ERRCODE = '22023';
  END IF;

  IF p_action = 'hide' THEN
    UPDATE public.events SET is_published = false, updated_at = now() WHERE id = v_flag.content_id;
  ELSIF p_action = 'publish' THEN
    UPDATE public.events SET is_published = true, updated_at = now() WHERE id = v_flag.content_id;
  END IF;

  UPDATE public.content_quality_flags
  SET status = CASE WHEN p_action = 'dismiss' THEN 'dismissed' ELSE 'resolved' END,
      resolved_by = auth.uid(), resolved_at = now(), updated_at = now()
  WHERE id = p_flag_id;

  IF public.current_app_role() = 'university_admin' THEN
    PERFORM public.record_trusted_university_event_action(
      'event.moderation_' || p_action, v_university_id, v_flag.content_id,
      jsonb_build_object('reason', v_reason, 'flag_id', p_flag_id,
        'previous_visibility', v_is_published,
        'current_visibility', CASE WHEN p_action = 'hide' THEN false WHEN p_action = 'publish' THEN true ELSE v_is_published END)
    );
  ELSE
    PERFORM public.record_trusted_admin_action(
      'event.moderation_' || p_action, 'events', 'event', v_flag.content_id,
      jsonb_build_object('reason', v_reason, 'flag_id', p_flag_id,
        'previous_visibility', v_is_published,
        'current_visibility', CASE WHEN p_action = 'hide' THEN false WHEN p_action = 'publish' THEN true ELSE v_is_published END)
    );
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.record_trusted_university_event_action(text, uuid, uuid, jsonb) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.get_admin_event_moderation_queue(text, integer, integer) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.review_admin_event_flag(uuid, text, text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_admin_event_moderation_queue(text, integer, integer), public.review_admin_event_flag(uuid, text, text) TO authenticated;

COMMIT;
