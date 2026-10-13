-- Support assignment extends the existing can_manage_support capability and
-- trusted audit path; it does not create a separate support role model.
BEGIN;

CREATE OR REPLACE FUNCTION public.get_admin_support_assignees()
RETURNS TABLE(user_id uuid, full_name text, role_name text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT (public.is_super_admin() OR public.has_permission('can_manage_support')) THEN
    RAISE EXCEPTION 'Support management permission required' USING ERRCODE='42501';
  END IF;
  RETURN QUERY
  SELECT profile.id, profile.full_name, role.name
  FROM public.profiles profile
  JOIN public.user_roles role ON role.id=profile.role_id
  WHERE profile.is_active AND profile.status='active'
    AND (role.name='super_admin' OR (role.name='moderator' AND EXISTS (
      SELECT 1 FROM public.role_permissions permission
      WHERE permission.role=role.name AND permission.permission='can_manage_support'
    )))
  ORDER BY CASE role.name WHEN 'super_admin' THEN 0 ELSE 1 END,
    profile.full_name NULLS LAST, profile.id;
END; $$;

-- Disable the previous one-argument self-assignment entry point so it cannot
-- bypass the reasoned workflow during direct RPC calls.
REVOKE ALL ON FUNCTION public.assign_admin_support_ticket(uuid)
  FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.assign_admin_support_ticket(
  p_ticket_id uuid,
  p_assignee_id uuid,
  p_reason text
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE
  v_ticket public.support_tickets%ROWTYPE;
  v_reason text := NULLIF(btrim(p_reason), '');
  v_previous_assignee uuid;
BEGIN
  IF auth.uid() IS NULL OR NOT (public.is_super_admin() OR public.has_permission('can_manage_support')) THEN
    RAISE EXCEPTION 'Support management permission required' USING ERRCODE='42501';
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
        WHERE permission.role=role.name AND permission.permission='can_manage_support'
      )))
  ) THEN
    RAISE EXCEPTION 'Assignee must be an active support operator' USING ERRCODE='22023';
  END IF;

  SELECT * INTO v_ticket FROM public.support_tickets
  WHERE id=p_ticket_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Support ticket not found' USING ERRCODE='P0002'; END IF;
  IF v_ticket.status='closed' THEN
    RAISE EXCEPTION 'Closed support tickets cannot be assigned' USING ERRCODE='22023';
  END IF;
  v_previous_assignee := v_ticket.assigned_to;

  UPDATE public.support_tickets
  SET assigned_to=p_assignee_id,
      status=CASE WHEN p_assignee_id IS NOT NULL AND status IN ('open','resolved') THEN 'in_progress' ELSE status END,
      updated_at=now()
  WHERE id=p_ticket_id;

  PERFORM public.record_trusted_admin_action(
    CASE WHEN p_assignee_id IS NULL THEN 'support.unassigned' ELSE 'support.assigned' END,
    'support','support_ticket',p_ticket_id,
    jsonb_build_object(
      'previous_assignee_id',v_previous_assignee,
      'assignee_id',p_assignee_id,
      'reason',v_reason
    )
  );
END; $$;

REVOKE ALL ON FUNCTION public.get_admin_support_assignees(),
  public.assign_admin_support_ticket(uuid,uuid,text)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_admin_support_assignees(),
  public.assign_admin_support_ticket(uuid,uuid,text) TO authenticated;

COMMIT;
