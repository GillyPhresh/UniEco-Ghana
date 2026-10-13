BEGIN;

-- Ticket closure is an audited staff action; require a bounded explanation and
-- keep the transition inside the existing permission-checked RPC boundary.
CREATE OR REPLACE FUNCTION public.close_admin_support_ticket(p_ticket_id uuid, p_reason text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_reason text := trim(coalesce(p_reason, ''));
BEGIN
  IF auth.uid() IS NULL OR NOT (public.is_super_admin() OR public.has_permission('can_manage_support')) THEN
    RAISE EXCEPTION 'Support management permission required' USING ERRCODE='42501';
  END IF;
  IF length(v_reason) NOT BETWEEN 10 AND 1000 THEN
    RAISE EXCEPTION 'A closure reason between 10 and 1000 characters is required' USING ERRCODE='22023';
  END IF;

  UPDATE public.support_tickets
  SET status='closed', closed_at=now(), closed_by=auth.uid(), updated_at=now()
  WHERE id=p_ticket_id AND status IN ('open','in_progress','resolved');
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Ticket cannot be closed from its current status' USING ERRCODE='22023';
  END IF;

  PERFORM public.record_trusted_admin_action(
    'support.closed','support','support_ticket',p_ticket_id,
    jsonb_build_object('reason',v_reason)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.close_admin_support_ticket(uuid)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.close_admin_support_ticket(uuid,text)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.close_admin_support_ticket(uuid,text) TO authenticated;

COMMIT;
