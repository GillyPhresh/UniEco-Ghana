BEGIN;

-- Broadcast approval, delivery queueing, and cancellation are consequential
-- operational transitions. Keep the existing actor/scope/state rules, but
-- require a reason and append trusted audit metadata for each transition.
CREATE OR REPLACE FUNCTION public.approve_admin_broadcast(p_broadcast_id uuid, p_reason text)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE v_reason text := trim(coalesce(p_reason, ''));
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Super administrator access required' USING ERRCODE='42501';
  END IF;
  IF length(v_reason) NOT BETWEEN 10 AND 1000 THEN
    RAISE EXCEPTION 'A reason between 10 and 1000 characters is required' USING ERRCODE='22023';
  END IF;
  UPDATE public.admin_broadcasts
  SET status='approved', approved_by=auth.uid(), approved_at=now(), updated_at=now()
  WHERE id=p_broadcast_id AND status='pending_approval';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Only a pending broadcast may be approved' USING ERRCODE='22023';
  END IF;
  PERFORM public.record_trusted_admin_action('broadcast.approved','communications','admin_broadcast',p_broadcast_id,jsonb_build_object('reason',v_reason));
  RETURN true;
END; $$;

CREATE OR REPLACE FUNCTION public.begin_admin_broadcast_delivery(p_broadcast_id uuid, p_reason text)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE v_reason text := trim(coalesce(p_reason, ''));
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Super administrator access required' USING ERRCODE='42501';
  END IF;
  IF length(v_reason) NOT BETWEEN 10 AND 1000 THEN
    RAISE EXCEPTION 'A reason between 10 and 1000 characters is required' USING ERRCODE='22023';
  END IF;
  UPDATE public.admin_broadcasts SET status='sending', updated_at=now()
  WHERE id=p_broadcast_id AND status='approved';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Only an approved broadcast may begin delivery' USING ERRCODE='22023';
  END IF;
  PERFORM public.record_trusted_admin_action('broadcast.delivery_queued','communications','admin_broadcast',p_broadcast_id,jsonb_build_object('reason',v_reason));
  RETURN true;
END; $$;

CREATE OR REPLACE FUNCTION public.cancel_admin_broadcast(p_broadcast_id uuid, p_reason text)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE v_reason text := trim(coalesce(p_reason, ''));
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_staff() THEN
    RAISE EXCEPTION 'Staff access required' USING ERRCODE='42501';
  END IF;
  IF length(v_reason) NOT BETWEEN 10 AND 1000 THEN
    RAISE EXCEPTION 'A reason between 10 and 1000 characters is required' USING ERRCODE='22023';
  END IF;
  UPDATE public.admin_broadcasts SET status='cancelled', updated_at=now()
  WHERE id=p_broadcast_id AND (created_by=auth.uid() OR public.is_super_admin())
    AND status IN ('draft','pending_approval','scheduled','approved');
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Broadcast cannot be cancelled by the caller' USING ERRCODE='42501';
  END IF;
  PERFORM public.record_trusted_admin_action('broadcast.cancelled','communications','admin_broadcast',p_broadcast_id,jsonb_build_object('reason',v_reason));
  RETURN true;
END; $$;

REVOKE ALL ON FUNCTION public.approve_admin_broadcast(uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.begin_admin_broadcast_delivery(uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.cancel_admin_broadcast(uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.approve_admin_broadcast(uuid,text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.begin_admin_broadcast_delivery(uuid,text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.cancel_admin_broadcast(uuid,text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.approve_admin_broadcast(uuid,text), public.begin_admin_broadcast_delivery(uuid,text), public.cancel_admin_broadcast(uuid,text) TO authenticated;

COMMIT;
