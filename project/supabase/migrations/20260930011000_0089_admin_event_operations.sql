-- Bounded event operations are distinct from reported-event moderation.
-- University scope is derived from the caller's database membership.
BEGIN;

CREATE INDEX IF NOT EXISTS events_university_start_idx
  ON public.events (university_id, start_time DESC);

CREATE OR REPLACE FUNCTION public.get_admin_event_operations(
  p_visibility text DEFAULT 'all',
  p_limit integer DEFAULT 30,
  p_offset integer DEFAULT 0
)
RETURNS TABLE(
  event_id uuid,
  title text,
  university_id uuid,
  university_name text,
  start_time timestamptz,
  location text,
  is_published boolean,
  created_at timestamptz,
  total_count bigint
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_visibility text := COALESCE(NULLIF(btrim(p_visibility), ''), 'all');
  v_limit integer := COALESCE(p_limit, 30);
  v_offset integer := COALESCE(p_offset, 0);
BEGIN
  IF auth.uid() IS NULL OR NOT (
    public.is_super_admin() OR public.current_app_role() = 'university_admin'
  ) THEN
    RAISE EXCEPTION 'Event operations access required' USING ERRCODE = '42501';
  END IF;
  IF v_visibility NOT IN ('all', 'published', 'draft') THEN
    RAISE EXCEPTION 'Invalid event visibility filter' USING ERRCODE = '22023';
  END IF;
  IF v_limit NOT BETWEEN 1 AND 100 OR v_offset < 0 OR v_offset > 10000 THEN
    RAISE EXCEPTION 'Invalid pagination' USING ERRCODE = '22023';
  END IF;

  RETURN QUERY
  SELECT event.id, event.title, event.university_id, university.name,
    event.start_time, event.location, event.is_published, event.created_at,
    count(*) OVER ()
  FROM public.events event
  LEFT JOIN public.universities university ON university.id = event.university_id
  WHERE (public.is_super_admin() OR public.can_manage_university(event.university_id))
    AND (v_visibility = 'all'
      OR (v_visibility = 'published' AND event.is_published)
      OR (v_visibility = 'draft' AND NOT event.is_published))
  ORDER BY event.start_time DESC NULLS LAST, event.created_at DESC
  LIMIT v_limit OFFSET v_offset;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_admin_event_visibility(
  p_event_id uuid,
  p_is_published boolean,
  p_reason text
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_event public.events%ROWTYPE;
  v_reason text := NULLIF(btrim(p_reason), '');
BEGIN
  IF auth.uid() IS NULL OR NOT (
    public.is_super_admin() OR public.current_app_role() = 'university_admin'
  ) THEN
    RAISE EXCEPTION 'Event operations access required' USING ERRCODE = '42501';
  END IF;
  IF p_is_published IS NULL OR v_reason IS NULL OR length(v_reason) < 10 OR length(v_reason) > 1000 THEN
    RAISE EXCEPTION 'A visibility choice and a reason between 10 and 1000 characters are required' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_event FROM public.events WHERE id = p_event_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Event not found' USING ERRCODE = 'P0002'; END IF;
  IF NOT (public.is_super_admin() OR public.can_manage_university(v_event.university_id)) THEN
    RAISE EXCEPTION 'Event operations access required' USING ERRCODE = '42501';
  END IF;
  IF v_event.is_published = p_is_published THEN
    RAISE EXCEPTION 'Event visibility is already set; refresh the list' USING ERRCODE = '22023';
  END IF;

  UPDATE public.events SET is_published = p_is_published, updated_at = now()
    WHERE id = v_event.id;

  IF public.current_app_role() = 'university_admin' THEN
    PERFORM public.record_trusted_university_event_action(
      CASE WHEN p_is_published THEN 'event.lifecycle.publish' ELSE 'event.lifecycle.unpublish' END,
      v_event.university_id, v_event.id,
      jsonb_build_object('reason', v_reason, 'previous_visibility', v_event.is_published,
        'current_visibility', p_is_published)
    );
  ELSE
    PERFORM public.record_trusted_admin_action(
      CASE WHEN p_is_published THEN 'event.lifecycle.publish' ELSE 'event.lifecycle.unpublish' END,
      'events', 'event', v_event.id,
      jsonb_build_object('reason', v_reason, 'university_id', v_event.university_id,
        'previous_visibility', v_event.is_published, 'current_visibility', p_is_published)
    );
  END IF;
END;
$$;

-- Extend the narrowly scoped university-admin audit helper, not table access.
CREATE OR REPLACE FUNCTION public.record_trusted_university_event_action(
  p_action text,
  p_university_id uuid,
  p_event_id uuid,
  p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF auth.uid() IS NULL OR public.current_app_role() IS DISTINCT FROM 'university_admin'
    OR NOT public.can_manage_university(p_university_id) THEN
    RAISE EXCEPTION 'Assigned university event administrator access required' USING ERRCODE = '42501';
  END IF;
  IF p_action IS NULL OR p_action NOT IN (
    'event.moderation_dismiss', 'event.moderation_hide', 'event.moderation_publish',
    'event.lifecycle.publish', 'event.lifecycle.unpublish'
  ) THEN
    RAISE EXCEPTION 'Invalid university event audit action' USING ERRCODE = '22023';
  END IF;
  INSERT INTO public.admin_actions (admin_id, action, module, target_type, target_id, metadata)
  VALUES (auth.uid(), p_action, 'events', 'event', p_event_id,
    COALESCE(p_metadata, '{}'::jsonb) || jsonb_build_object('university_id', p_university_id));
  INSERT INTO public.audit_logs (actor_id, target_id, action, entity_type, entity_id, metadata)
  VALUES (auth.uid(), p_event_id, p_action, 'event', p_event_id,
    COALESCE(p_metadata, '{}'::jsonb) || jsonb_build_object('university_id', p_university_id));
END;
$$;

REVOKE ALL ON FUNCTION public.get_admin_event_operations(text, integer, integer) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.set_admin_event_visibility(uuid, boolean, text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.record_trusted_university_event_action(text, uuid, uuid, jsonb) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_admin_event_operations(text, integer, integer),
  public.set_admin_event_visibility(uuid, boolean, text) TO authenticated;

COMMIT;
