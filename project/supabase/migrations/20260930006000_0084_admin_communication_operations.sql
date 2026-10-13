-- Communication operations use a narrow server-authorized read model. Browser
-- callers never receive recipient identifiers, provider references, or queue metadata.
BEGIN;

CREATE INDEX IF NOT EXISTS communication_logs_admin_filter_idx
  ON public.communication_logs (channel, status, created_at DESC);
CREATE INDEX IF NOT EXISTS communication_logs_event_type_created_idx
  ON public.communication_logs (event_type, created_at DESC);

DROP POLICY IF EXISTS staff_only_operational_records ON public.communication_events;
DROP POLICY IF EXISTS staff_only_delivery_records ON public.communication_deliveries;
DROP POLICY IF EXISTS staff_only_communication_logs ON public.communication_logs;
REVOKE SELECT ON public.communication_events, public.communication_deliveries, public.communication_logs FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.get_admin_role_permissions()
RETURNS TABLE(role text, permission text, created_at timestamptz)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Super administrator access required' USING ERRCODE='42501';
  END IF;
  RETURN QUERY
  SELECT rp.role, rp.permission, rp.created_at
  FROM public.role_permissions rp
  WHERE rp.role='moderator'
    AND rp.permission IN ('can_review_reports','can_review_verifications','can_manage_support','can_moderate_content','can_manage_communications')
  ORDER BY rp.permission;
END; $$;

CREATE OR REPLACE FUNCTION public.update_admin_moderator_permissions(p_permissions text[],p_reason text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE
  v_allowed constant text[] := ARRAY['can_review_reports','can_review_verifications','can_manage_support','can_moderate_content','can_manage_communications'];
  v_requested text[] := COALESCE(p_permissions, ARRAY[]::text[]);
  v_before text[];
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Super administrator access required' USING ERRCODE='42501';
  END IF;
  IF NULLIF(btrim(p_reason),'') IS NULL OR length(btrim(p_reason)) NOT BETWEEN 10 AND 500 THEN
    RAISE EXCEPTION 'A reason between 10 and 500 characters is required' USING ERRCODE='22023';
  END IF;
  IF cardinality(v_requested) <> (SELECT count(DISTINCT requested.permission)::integer FROM unnest(v_requested) AS requested(permission))
    OR EXISTS (SELECT 1 FROM unnest(v_requested) AS requested(permission) WHERE requested.permission IS NULL OR requested.permission <> ALL(v_allowed)) THEN
    RAISE EXCEPTION 'Unsupported moderator permission' USING ERRCODE='22023';
  END IF;

  SELECT COALESCE(array_agg(rp.permission ORDER BY rp.permission), ARRAY[]::text[])
    INTO v_before
  FROM public.role_permissions rp
  WHERE rp.role='moderator' AND rp.permission=ANY(v_allowed);

  DELETE FROM public.role_permissions rp
  WHERE rp.role='moderator' AND rp.permission=ANY(v_allowed)
    AND NOT (rp.permission=ANY(v_requested));
  INSERT INTO public.role_permissions(role,permission)
  SELECT 'moderator',requested.permission FROM unnest(v_requested) AS requested(permission)
  ON CONFLICT(role,permission) DO NOTHING;

  IF v_before IS DISTINCT FROM (
    SELECT COALESCE(array_agg(requested.permission ORDER BY requested.permission), ARRAY[]::text[])
    FROM unnest(v_requested) AS requested(permission)
  ) THEN
    PERFORM public.record_trusted_admin_action(
      'moderator.permissions_updated','roles','role',NULL,
      jsonb_build_object('role','moderator','before',v_before,'after',v_requested,'reason',btrim(p_reason))
    );
  END IF;
END; $$;

CREATE OR REPLACE FUNCTION public.get_admin_communication_logs(
  p_channel text DEFAULT NULL,
  p_status text DEFAULT NULL,
  p_event_type text DEFAULT NULL,
  p_limit integer DEFAULT 50,
  p_offset integer DEFAULT 0
)
RETURNS TABLE(
  id uuid,
  event_type text,
  channel text,
  status text,
  provider text,
  has_recipient boolean,
  created_at timestamptz,
  total_count bigint
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE
  v_channel text := NULLIF(btrim(p_channel), '');
  v_status text := NULLIF(btrim(p_status), '');
  v_event_type text := NULLIF(btrim(p_event_type), '');
  v_limit integer := COALESCE(p_limit, 50);
  v_offset integer := COALESCE(p_offset, 0);
BEGIN
  IF auth.uid() IS NULL OR NOT (public.is_super_admin() OR public.has_permission('can_manage_communications')) THEN
    RAISE EXCEPTION 'Communication management permission required' USING ERRCODE='42501';
  END IF;
  IF v_channel IS NOT NULL AND v_channel NOT IN ('in_app','email','push','whatsapp','sms') THEN
    RAISE EXCEPTION 'Invalid communication channel' USING ERRCODE='22023';
  END IF;
  IF v_status IS NOT NULL AND v_status NOT IN ('queued','processing','sent','delivered','failed','cancelled','opened','read') THEN
    RAISE EXCEPTION 'Invalid communication status' USING ERRCODE='22023';
  END IF;
  IF v_event_type IS NOT NULL AND length(v_event_type) NOT BETWEEN 1 AND 80 THEN
    RAISE EXCEPTION 'Event type filter must be between 1 and 80 characters' USING ERRCODE='22023';
  END IF;
  IF v_limit NOT BETWEEN 1 AND 100 OR v_offset < 0 OR v_offset > 10000 THEN
    RAISE EXCEPTION 'Invalid communication pagination' USING ERRCODE='22023';
  END IF;

  RETURN QUERY
  SELECT log.id, log.event_type, log.channel, log.status, log.provider,
    log.recipient_identifier IS NOT NULL, log.created_at, count(*) OVER ()
  FROM public.communication_logs log
  WHERE (v_channel IS NULL OR log.channel=v_channel)
    AND (v_status IS NULL OR log.status=v_status)
    AND (v_event_type IS NULL OR log.event_type=v_event_type)
  ORDER BY log.created_at DESC, log.id DESC
  LIMIT v_limit OFFSET v_offset;
END; $$;

CREATE OR REPLACE FUNCTION public.get_admin_communication_stats()
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE v_result jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT (public.is_super_admin() OR public.has_permission('can_manage_communications')) THEN
    RAISE EXCEPTION 'Communication management permission required' USING ERRCODE='42501';
  END IF;
  SELECT jsonb_build_object(
    'total', count(*),
    'byChannel', COALESCE((SELECT jsonb_object_agg(counts.channel, counts.total) FROM (
      SELECT channel, count(*) AS total FROM public.communication_logs GROUP BY channel
    ) counts), '{}'::jsonb),
    'byStatus', COALESCE((SELECT jsonb_object_agg(counts.status, counts.total) FROM (
      SELECT status, count(*) AS total FROM public.communication_logs GROUP BY status
    ) counts), '{}'::jsonb),
    'failed', count(*) FILTER (WHERE status='failed')
  ) INTO v_result
  FROM public.communication_logs;
  RETURN v_result;
END; $$;

REVOKE ALL ON FUNCTION public.get_admin_role_permissions() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.update_admin_moderator_permissions(text[],text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.get_admin_communication_logs(text,text,text,integer,integer) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.get_admin_communication_stats() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_admin_role_permissions(), public.update_admin_moderator_permissions(text[],text),
  public.get_admin_communication_logs(text,text,text,integer,integer), public.get_admin_communication_stats() TO authenticated;

COMMIT;
