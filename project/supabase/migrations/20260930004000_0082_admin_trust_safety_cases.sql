-- Trust & Safety case workflow reuses the existing moderation schema and
-- can_review_reports capability; it does not create a parallel role system.
BEGIN;

CREATE INDEX IF NOT EXISTS moderation_cases_university_status_priority_idx
  ON public.moderation_cases (university_id, status, priority DESC, created_at DESC);

CREATE OR REPLACE FUNCTION public.get_admin_moderation_cases(
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
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_status text := NULLIF(btrim(p_status), '');
  v_severity text := NULLIF(btrim(p_severity), '');
  v_search text := NULLIF(btrim(p_search), '');
  v_limit integer := COALESCE(p_limit, 30);
  v_offset integer := COALESCE(p_offset, 0);
BEGIN
  IF auth.uid() IS NULL OR NOT (public.is_super_admin() OR public.has_permission('can_review_reports')) THEN
    RAISE EXCEPTION 'Trust and Safety review permission required' USING ERRCODE = '42501';
  END IF;
  IF v_status IS NOT NULL AND v_status NOT IN ('open', 'investigating', 'waiting_info', 'resolved', 'dismissed', 'escalated') THEN
    RAISE EXCEPTION 'Invalid case status filter' USING ERRCODE = '22023';
  END IF;
  IF v_severity IS NOT NULL AND v_severity NOT IN ('low', 'medium', 'high', 'critical') THEN
    RAISE EXCEPTION 'Invalid case severity filter' USING ERRCODE = '22023';
  END IF;
  IF v_search IS NOT NULL AND length(v_search) NOT BETWEEN 3 AND 100 THEN
    RAISE EXCEPTION 'Search must be between 3 and 100 characters' USING ERRCODE = '22023';
  END IF;
  IF v_limit NOT BETWEEN 1 AND 100 OR v_offset < 0 OR v_offset > 10000 THEN
    RAISE EXCEPTION 'Invalid pagination' USING ERRCODE = '22023';
  END IF;

  RETURN QUERY
  SELECT moderation.id, moderation.case_number, moderation.case_type, moderation.severity,
    moderation.status, moderation.title, moderation.description, moderation.subject_type,
    moderation.subject_id, university.name, moderation.assigned_to, assignee.full_name,
    moderation.priority, moderation.resolution,
    moderation.created_at, moderation.updated_at, count(*) OVER ()
  FROM public.moderation_cases moderation
  LEFT JOIN public.universities university ON university.id = moderation.university_id
  LEFT JOIN public.profiles assignee ON assignee.id = moderation.assigned_to
  WHERE (v_status IS NULL OR moderation.status = v_status)
    AND (v_severity IS NULL OR moderation.severity = v_severity)
    AND (v_search IS NULL OR
      position(lower(v_search) IN lower(moderation.case_number)) > 0 OR
      position(lower(v_search) IN lower(moderation.title)) > 0 OR
      position(lower(v_search) IN lower(moderation.case_type)) > 0)
  ORDER BY CASE moderation.severity WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END,
    moderation.priority DESC, moderation.created_at DESC
  LIMIT v_limit OFFSET v_offset;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_admin_moderation_case(
  p_case_id uuid,
  p_next_status text,
  p_reason text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_case public.moderation_cases%ROWTYPE;
  v_reason text := NULLIF(btrim(p_reason), '');
  v_transition_allowed boolean := false;
BEGIN
  IF auth.uid() IS NULL OR NOT (public.is_super_admin() OR public.has_permission('can_review_reports')) THEN
    RAISE EXCEPTION 'Trust and Safety review permission required' USING ERRCODE = '42501';
  END IF;
  IF p_next_status NOT IN ('investigating', 'waiting_info', 'resolved', 'dismissed', 'escalated') THEN
    RAISE EXCEPTION 'Invalid case status transition' USING ERRCODE = '22023';
  END IF;
  IF v_reason IS NULL OR length(v_reason) < 10 OR length(v_reason) > 1000 THEN
    RAISE EXCEPTION 'A case decision reason between 10 and 1000 characters is required' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_case FROM public.moderation_cases WHERE id = p_case_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Moderation case not found' USING ERRCODE = 'P0002'; END IF;
  v_transition_allowed :=
    (v_case.status = 'open' AND p_next_status IN ('investigating', 'waiting_info', 'dismissed', 'escalated')) OR
    (v_case.status = 'investigating' AND p_next_status IN ('waiting_info', 'resolved', 'dismissed', 'escalated')) OR
    (v_case.status = 'waiting_info' AND p_next_status IN ('investigating', 'resolved', 'dismissed', 'escalated')) OR
    (v_case.status = 'escalated' AND p_next_status IN ('investigating', 'resolved', 'dismissed'));
  IF NOT v_transition_allowed THEN
    RAISE EXCEPTION 'Case cannot transition from % to %', v_case.status, p_next_status USING ERRCODE = '22023';
  END IF;

  UPDATE public.moderation_cases
  SET status = p_next_status,
      resolution = CASE WHEN p_next_status IN ('resolved', 'dismissed') THEN v_reason ELSE resolution END,
      resolved_by = CASE WHEN p_next_status IN ('resolved', 'dismissed') THEN auth.uid() ELSE resolved_by END,
      resolved_at = CASE WHEN p_next_status IN ('resolved', 'dismissed') THEN now() ELSE resolved_at END,
      updated_at = now()
  WHERE id = p_case_id;

  INSERT INTO public.moderation_case_events(case_id, event_type, actor_id, details)
  VALUES (p_case_id, p_next_status, auth.uid(), jsonb_build_object('reason', v_reason));
  PERFORM public.record_trusted_admin_action(
    'trust_safety.case_' || p_next_status,
    'trust_safety', 'moderation_case', p_case_id,
    jsonb_build_object('reason', v_reason, 'previous_status', v_case.status)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_admin_moderation_cases(text, text, text, integer, integer) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.update_admin_moderation_case(uuid, text, text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_admin_moderation_cases(text, text, text, integer, integer), public.update_admin_moderation_case(uuid, text, text) TO authenticated;

COMMIT;
