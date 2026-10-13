-- Case assignment and history use the existing review capability, case events,
-- and trusted admin audit path. Raw case-table reads stay unavailable to browsers.
BEGIN;

DROP POLICY IF EXISTS staff_only_moderation_cases ON public.moderation_cases;
DROP POLICY IF EXISTS staff_only_moderation_links ON public.moderation_case_links;
DROP POLICY IF EXISTS staff_only_moderation_events ON public.moderation_case_events;
REVOKE SELECT ON public.moderation_cases, public.moderation_case_links, public.moderation_case_events FROM anon, authenticated;

-- The new columns are delivered through the narrow case read model. This RPC
-- has no SQL callers, so replacing its return shape is safe after dropping it.
DROP FUNCTION IF EXISTS public.get_admin_moderation_cases(text,text,text,integer,integer);
CREATE FUNCTION public.get_admin_moderation_cases(
  p_status text DEFAULT NULL,
  p_severity text DEFAULT NULL,
  p_search text DEFAULT NULL,
  p_limit integer DEFAULT 30,
  p_offset integer DEFAULT 0
)
RETURNS TABLE(
  id uuid,
  case_number text,
  case_type text,
  severity text,
  status text,
  title text,
  description text,
  subject_type text,
  subject_id text,
  university_name text,
  assigned_to_id uuid,
  assigned_to_name text,
  priority integer,
  resolution text,
  created_at timestamptz,
  updated_at timestamptz,
  total_count bigint
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE
  v_status text := NULLIF(btrim(p_status), '');
  v_severity text := NULLIF(btrim(p_severity), '');
  v_search text := NULLIF(btrim(p_search), '');
  v_limit integer := COALESCE(p_limit, 30);
  v_offset integer := COALESCE(p_offset, 0);
BEGIN
  IF auth.uid() IS NULL OR NOT (public.is_super_admin() OR public.has_permission('can_review_reports')) THEN
    RAISE EXCEPTION 'Trust and Safety review permission required' USING ERRCODE='42501';
  END IF;
  IF v_status IS NOT NULL AND v_status NOT IN ('open','investigating','waiting_info','resolved','dismissed','escalated') THEN
    RAISE EXCEPTION 'Invalid case status filter' USING ERRCODE='22023';
  END IF;
  IF v_severity IS NOT NULL AND v_severity NOT IN ('low','medium','high','critical') THEN
    RAISE EXCEPTION 'Invalid case severity filter' USING ERRCODE='22023';
  END IF;
  IF v_search IS NOT NULL AND length(v_search) NOT BETWEEN 3 AND 100 THEN
    RAISE EXCEPTION 'Search must be between 3 and 100 characters' USING ERRCODE='22023';
  END IF;
  IF v_limit NOT BETWEEN 1 AND 100 OR v_offset < 0 OR v_offset > 10000 THEN
    RAISE EXCEPTION 'Invalid pagination' USING ERRCODE='22023';
  END IF;

  RETURN QUERY
  SELECT moderation.id, moderation.case_number, moderation.case_type,
    moderation.severity, moderation.status, moderation.title, moderation.description,
    moderation.subject_type, moderation.subject_id, university.name,
    moderation.assigned_to, assignee.full_name, moderation.priority,
    moderation.resolution, moderation.created_at, moderation.updated_at,
    count(*) OVER ()
  FROM public.moderation_cases moderation
  LEFT JOIN public.universities university ON university.id=moderation.university_id
  LEFT JOIN public.profiles assignee ON assignee.id=moderation.assigned_to
  WHERE (v_status IS NULL OR moderation.status=v_status)
    AND (v_severity IS NULL OR moderation.severity=v_severity)
    AND (v_search IS NULL OR position(lower(v_search) IN lower(moderation.case_number)) > 0
      OR position(lower(v_search) IN lower(moderation.title)) > 0
      OR position(lower(v_search) IN lower(moderation.case_type)) > 0)
  ORDER BY CASE moderation.severity WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END,
    moderation.priority DESC, moderation.created_at DESC
  LIMIT v_limit OFFSET v_offset;
END; $$;

CREATE OR REPLACE FUNCTION public.get_admin_moderation_reviewers()
RETURNS TABLE(user_id uuid, full_name text, role_name text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT (public.is_super_admin() OR public.has_permission('can_review_reports')) THEN
    RAISE EXCEPTION 'Trust and Safety review permission required' USING ERRCODE='42501';
  END IF;
  RETURN QUERY
  SELECT profile.id, profile.full_name, role.name
  FROM public.profiles profile
  JOIN public.user_roles role ON role.id=profile.role_id
  WHERE profile.is_active AND profile.status='active'
    AND (role.name='super_admin' OR (role.name='moderator' AND EXISTS (
      SELECT 1 FROM public.role_permissions permission
      WHERE permission.role=role.name AND permission.permission='can_review_reports'
    )))
  ORDER BY CASE role.name WHEN 'super_admin' THEN 0 ELSE 1 END, profile.full_name NULLS LAST, profile.id;
END; $$;

CREATE OR REPLACE FUNCTION public.assign_admin_moderation_case(
  p_case_id uuid,
  p_assignee_id uuid,
  p_reason text
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE
  v_case public.moderation_cases%ROWTYPE;
  v_reason text := NULLIF(btrim(p_reason), '');
  v_previous_assignee uuid;
BEGIN
  IF auth.uid() IS NULL OR NOT (public.is_super_admin() OR public.has_permission('can_review_reports')) THEN
    RAISE EXCEPTION 'Trust and Safety review permission required' USING ERRCODE='42501';
  END IF;
  IF v_reason IS NULL OR length(v_reason) NOT BETWEEN 10 AND 500 THEN
    RAISE EXCEPTION 'An assignment reason between 10 and 500 characters is required' USING ERRCODE='22023';
  END IF;
  IF p_assignee_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.profiles profile
    JOIN public.user_roles role ON role.id=profile.role_id
    WHERE profile.id=p_assignee_id AND profile.is_active AND profile.status='active'
      AND (role.name='super_admin' OR (role.name='moderator' AND EXISTS (
        SELECT 1 FROM public.role_permissions permission
        WHERE permission.role=role.name AND permission.permission='can_review_reports'
      )))
  ) THEN
    RAISE EXCEPTION 'Assignee must be an active Trust and Safety reviewer' USING ERRCODE='22023';
  END IF;

  SELECT * INTO v_case FROM public.moderation_cases WHERE id=p_case_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Moderation case not found' USING ERRCODE='P0002'; END IF;
  IF v_case.status IN ('resolved','dismissed') THEN
    RAISE EXCEPTION 'Closed cases cannot be assigned' USING ERRCODE='22023';
  END IF;
  v_previous_assignee := v_case.assigned_to;

  UPDATE public.moderation_cases
  SET assigned_to=p_assignee_id, updated_at=now()
  WHERE id=p_case_id;

  INSERT INTO public.moderation_case_events(case_id,event_type,actor_id,details)
  VALUES(p_case_id,'assignment_changed',auth.uid(),jsonb_build_object(
    'previous_assignee_id',v_previous_assignee,
    'assignee_id',p_assignee_id,
    'reason',v_reason
  ));
  PERFORM public.record_trusted_admin_action(
    CASE WHEN p_assignee_id IS NULL THEN 'trust_safety.case_unassigned' ELSE 'trust_safety.case_assigned' END,
    'trust_safety','moderation_case',p_case_id,
    jsonb_build_object('previous_assignee_id',v_previous_assignee,'assignee_id',p_assignee_id,'reason',v_reason)
  );
END; $$;

CREATE OR REPLACE FUNCTION public.get_admin_moderation_case_events(p_case_id uuid,p_limit integer DEFAULT 100)
RETURNS TABLE(
  event_id uuid,
  event_type text,
  actor_name text,
  previous_assignee_name text,
  assignee_name text,
  reason text,
  created_at timestamptz
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE v_limit integer := COALESCE(p_limit,100);
BEGIN
  IF auth.uid() IS NULL OR NOT (public.is_super_admin() OR public.has_permission('can_review_reports')) THEN
    RAISE EXCEPTION 'Trust and Safety review permission required' USING ERRCODE='42501';
  END IF;
  IF p_case_id IS NULL OR v_limit NOT BETWEEN 1 AND 100 THEN
    RAISE EXCEPTION 'Invalid case history request' USING ERRCODE='22023';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM public.moderation_cases case_row WHERE case_row.id=p_case_id) THEN
    RAISE EXCEPTION 'Moderation case not found' USING ERRCODE='P0002';
  END IF;
  RETURN QUERY
  SELECT event.id,event.event_type,actor.full_name,previous_assignee.full_name,assignee.full_name,
    left(NULLIF(btrim(event.details->>'reason'),''),500),event.created_at
  FROM public.moderation_case_events event
  LEFT JOIN public.profiles actor ON actor.id=event.actor_id
  LEFT JOIN public.profiles previous_assignee ON previous_assignee.id::text=event.details->>'previous_assignee_id'
  LEFT JOIN public.profiles assignee ON assignee.id::text=event.details->>'assignee_id'
  WHERE event.case_id=p_case_id
  ORDER BY event.created_at DESC,event.id DESC
  LIMIT v_limit;
END; $$;

REVOKE ALL ON FUNCTION public.get_admin_moderation_cases(text,text,text,integer,integer) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.get_admin_moderation_reviewers() FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.assign_admin_moderation_case(uuid,uuid,text) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.get_admin_moderation_case_events(uuid,integer) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.get_admin_moderation_cases(text,text,text,integer,integer),
  public.get_admin_moderation_reviewers(),public.assign_admin_moderation_case(uuid,uuid,text),
  public.get_admin_moderation_case_events(uuid,integer) TO authenticated;

COMMIT;
