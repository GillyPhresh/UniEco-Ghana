-- Expose a narrow, auditable way to assign existing moderator capabilities.
-- Sensitive support access and actions use the same database permission check.
BEGIN;

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
  WHERE rp.role = 'moderator'
    AND rp.permission IN ('can_review_reports','can_review_verifications','can_manage_support')
  ORDER BY rp.permission;
END; $$;

CREATE OR REPLACE FUNCTION public.update_admin_moderator_permissions(
  p_permissions text[], p_reason text
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE
  v_allowed constant text[] := ARRAY['can_review_reports','can_review_verifications','can_manage_support'];
  v_requested text[] := COALESCE(p_permissions, ARRAY[]::text[]);
  v_before text[];
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Super administrator access required' USING ERRCODE='42501';
  END IF;
  IF NULLIF(btrim(p_reason), '') IS NULL OR length(btrim(p_reason)) < 10 OR length(btrim(p_reason)) > 500 THEN
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
  INSERT INTO public.role_permissions(role, permission)
  SELECT 'moderator', requested.permission
  FROM unnest(v_requested) AS requested(permission)
  ON CONFLICT (role, permission) DO NOTHING;

  IF v_before IS DISTINCT FROM (SELECT COALESCE(array_agg(requested.permission ORDER BY requested.permission), ARRAY[]::text[]) FROM unnest(v_requested) AS requested(permission)) THEN
    PERFORM public.record_trusted_admin_action(
      'moderator.permissions_updated', 'roles', 'role', NULL,
      jsonb_build_object('role','moderator','before',v_before,'after',v_requested,'reason',btrim(p_reason))
    );
  END IF;
END; $$;

CREATE OR REPLACE FUNCTION public.get_admin_support_tickets(
  p_status text DEFAULT NULL, p_limit integer DEFAULT 20, p_offset integer DEFAULT 0
)
RETURNS TABLE(
  id uuid, ticket_number text, user_id uuid, user_full_name text, user_email text,
  subject text, category text, status text, priority text, assigned_to uuid,
  assignee_full_name text, created_at timestamptz, updated_at timestamptz, total_count bigint
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE v_status text := NULLIF(btrim(p_status), ''); v_limit integer := COALESCE(p_limit, 20); v_offset integer := COALESCE(p_offset, 0);
BEGIN
  IF auth.uid() IS NULL OR NOT (public.is_super_admin() OR public.has_permission('can_manage_support')) THEN
    RAISE EXCEPTION 'Support management permission required' USING ERRCODE='42501';
  END IF;
  IF v_status IS NOT NULL AND v_status NOT IN ('open','in_progress','resolved','closed') THEN RAISE EXCEPTION 'Invalid support status filter' USING ERRCODE='22023'; END IF;
  IF v_limit NOT BETWEEN 1 AND 100 OR v_offset < 0 OR v_offset > 10000 THEN RAISE EXCEPTION 'Invalid pagination' USING ERRCODE='22023'; END IF;
  RETURN QUERY
  SELECT t.id,t.ticket_number,t.user_id,requester.full_name,requester.email,t.subject,t.category,t.status,t.priority,t.assigned_to,assignee.full_name,t.created_at,t.updated_at,count(*) OVER()
  FROM public.support_tickets t
  JOIN public.profiles requester ON requester.id=t.user_id
  LEFT JOIN public.profiles assignee ON assignee.id=t.assigned_to
  WHERE v_status IS NULL OR t.status=v_status
  ORDER BY t.created_at DESC LIMIT v_limit OFFSET v_offset;
END; $$;

CREATE OR REPLACE FUNCTION public.get_admin_support_ticket_detail(p_ticket_id uuid)
RETURNS TABLE(
  id uuid, ticket_number text, user_id uuid, user_full_name text, user_email text,
  subject text, description text, category text, status text, priority text,
  assigned_to uuid, assignee_full_name text, created_at timestamptz, updated_at timestamptz
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT (public.is_super_admin() OR public.has_permission('can_manage_support')) THEN RAISE EXCEPTION 'Support management permission required' USING ERRCODE='42501'; END IF;
  RETURN QUERY
  SELECT t.id,t.ticket_number,t.user_id,requester.full_name,requester.email,t.subject,t.description,t.category,t.status,t.priority,t.assigned_to,assignee.full_name,t.created_at,t.updated_at
  FROM public.support_tickets t
  JOIN public.profiles requester ON requester.id=t.user_id
  LEFT JOIN public.profiles assignee ON assignee.id=t.assigned_to
  WHERE t.id=p_ticket_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Support ticket not found' USING ERRCODE='P0002'; END IF;
END; $$;

CREATE OR REPLACE FUNCTION public.get_admin_support_ticket_replies(p_ticket_id uuid)
RETURNS TABLE(id uuid, author_id uuid, author_full_name text, author_email text, body text, is_internal boolean, created_at timestamptz)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT (public.is_super_admin() OR public.has_permission('can_manage_support')) THEN RAISE EXCEPTION 'Support management permission required' USING ERRCODE='42501'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.support_tickets WHERE id=p_ticket_id) THEN RAISE EXCEPTION 'Support ticket not found' USING ERRCODE='P0002'; END IF;
  RETURN QUERY
  SELECT reply.id,reply.author_id,author.full_name,author.email,reply.body,reply.is_internal,reply.created_at
  FROM public.ticket_replies reply JOIN public.profiles author ON author.id=reply.author_id
  WHERE reply.ticket_id=p_ticket_id ORDER BY reply.created_at ASC;
END; $$;

CREATE OR REPLACE FUNCTION public.add_admin_ticket_reply(p_ticket_id uuid,p_body text,p_is_internal boolean DEFAULT false)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE v_id uuid;
BEGIN
  IF auth.uid() IS NULL OR NOT (public.is_super_admin() OR public.has_permission('can_manage_support')) THEN RAISE EXCEPTION 'Support management permission required' USING ERRCODE='42501'; END IF;
  IF NULLIF(trim(p_body),'') IS NULL OR length(trim(p_body)) > 10000 THEN RAISE EXCEPTION 'Reply body must contain 1 to 10000 characters' USING ERRCODE='22023'; END IF;
  PERFORM 1 FROM public.support_tickets WHERE id=p_ticket_id AND status <> 'closed' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Ticket is closed or missing' USING ERRCODE='22023'; END IF;
  INSERT INTO public.ticket_replies(ticket_id,author_id,body,is_internal)
  VALUES(p_ticket_id,auth.uid(),trim(p_body),COALESCE(p_is_internal,false)) RETURNING id INTO v_id;
  IF NOT COALESCE(p_is_internal,false) THEN UPDATE public.support_tickets SET status='in_progress',updated_at=now() WHERE id=p_ticket_id AND status IN ('open','resolved','in_progress'); END IF;
  PERFORM public.record_trusted_admin_action('support.reply','support','support_ticket',p_ticket_id,jsonb_build_object('internal',COALESCE(p_is_internal,false)));
  RETURN v_id;
END; $$;

CREATE OR REPLACE FUNCTION public.assign_admin_support_ticket(p_ticket_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT (public.is_super_admin() OR public.has_permission('can_manage_support')) THEN RAISE EXCEPTION 'Support management permission required' USING ERRCODE='42501'; END IF;
  UPDATE public.support_tickets SET assigned_to=auth.uid(),status='in_progress',updated_at=now() WHERE id=p_ticket_id AND status IN ('open','in_progress','resolved');
  IF NOT FOUND THEN RAISE EXCEPTION 'Ticket cannot be assigned from its current status' USING ERRCODE='22023'; END IF;
  PERFORM public.record_trusted_admin_action('support.assigned','support','support_ticket',p_ticket_id,'{}');
END; $$;

CREATE OR REPLACE FUNCTION public.close_admin_support_ticket(p_ticket_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT (public.is_super_admin() OR public.has_permission('can_manage_support')) THEN RAISE EXCEPTION 'Support management permission required' USING ERRCODE='42501'; END IF;
  UPDATE public.support_tickets SET status='closed',closed_at=now(),closed_by=auth.uid(),updated_at=now() WHERE id=p_ticket_id AND status IN ('open','in_progress','resolved');
  IF NOT FOUND THEN RAISE EXCEPTION 'Ticket cannot be closed from its current status' USING ERRCODE='22023'; END IF;
  PERFORM public.record_trusted_admin_action('support.closed','support','support_ticket',p_ticket_id,'{}');
END; $$;

CREATE OR REPLACE FUNCTION public.resolve_admin_report(p_report_id uuid,p_resolution_note text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT (public.is_super_admin() OR public.has_permission('can_review_reports')) THEN RAISE EXCEPTION 'Report review permission required' USING ERRCODE='42501'; END IF;
  IF NULLIF(trim(p_resolution_note),'') IS NULL OR length(trim(p_resolution_note)) < 10 OR length(trim(p_resolution_note)) > 1000 THEN
    RAISE EXCEPTION 'A resolution note between 10 and 1000 characters is required' USING ERRCODE='22023';
  END IF;
  UPDATE public.reports SET status='resolved',moderator_id=auth.uid(),resolved_at=now(),resolution_note=trim(p_resolution_note)
  WHERE id=p_report_id AND status='open';
  IF NOT FOUND THEN RAISE EXCEPTION 'Report cannot be resolved from its current status' USING ERRCODE='22023'; END IF;
  PERFORM public.record_trusted_admin_action('report.resolved','reports','report',p_report_id,'{}');
END; $$;

-- Replace broad legacy staff RLS with the explicit support capability while
-- retaining ticket-owner access to their own ticket and public replies.
DROP POLICY IF EXISTS support_tickets_owner_read ON public.support_tickets;
DROP POLICY IF EXISTS support_tickets_staff_read ON public.support_tickets;
CREATE POLICY support_tickets_owner_read ON public.support_tickets FOR SELECT TO authenticated
  USING (user_id=auth.uid() OR public.is_super_admin() OR public.has_permission('can_manage_support'));

DROP POLICY IF EXISTS ticket_replies_owner_read ON public.ticket_replies;
CREATE POLICY ticket_replies_owner_read ON public.ticket_replies FOR SELECT TO authenticated
  USING (
    ((NOT is_internal) AND EXISTS(SELECT 1 FROM public.support_tickets t WHERE t.id=ticket_id AND t.user_id=auth.uid()))
    OR public.is_super_admin() OR public.has_permission('can_manage_support')
  );

-- Report reviewer capability controls the same read/mutation boundary as the
-- route and RPC; reporters retain access to their own reports.
DROP POLICY IF EXISTS reports_owner_read ON public.reports;
DROP POLICY IF EXISTS reports_staff_read ON public.reports;
CREATE POLICY reports_owner_read ON public.reports FOR SELECT TO authenticated
  USING (reporter_id=auth.uid() OR public.is_super_admin() OR public.has_permission('can_review_reports'));

REVOKE ALL ON FUNCTION public.add_admin_ticket_reply(uuid,text,boolean), public.assign_admin_support_ticket(uuid), public.close_admin_support_ticket(uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.add_admin_ticket_reply(uuid,text,boolean), public.assign_admin_support_ticket(uuid), public.close_admin_support_ticket(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.resolve_admin_report(uuid,text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.resolve_admin_report(uuid,text) TO authenticated;

REVOKE ALL ON FUNCTION public.get_admin_role_permissions() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.update_admin_moderator_permissions(text[],text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.get_admin_support_tickets(text,integer,integer) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.get_admin_support_ticket_detail(uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.get_admin_support_ticket_replies(uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_admin_role_permissions() TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_admin_moderator_permissions(text[],text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_admin_support_tickets(text,integer,integer), public.get_admin_support_ticket_detail(uuid), public.get_admin_support_ticket_replies(uuid) TO authenticated;

COMMIT;
