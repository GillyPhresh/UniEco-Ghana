BEGIN;

-- Both outcomes of advertisement review affect public visibility. Preserve the
-- assigned moderator/super-admin gate and row lock while requiring an audited
-- reason for approvals as well as rejections.
CREATE OR REPLACE FUNCTION public.review_admin_advertisement(
  p_advertisement_id uuid,
  p_decision text,
  p_priority integer DEFAULT 0,
  p_featured boolean DEFAULT false,
  p_sponsored boolean DEFAULT false,
  p_rejection_reason text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=pg_catalog,public
AS $$
DECLARE
  v_reason text := NULLIF(btrim(p_rejection_reason), '');
  v_priority integer := COALESCE(p_priority, 0);
BEGIN
  IF auth.uid() IS NULL OR NOT (public.is_super_admin() OR public.has_permission('can_moderate_content')) THEN
    RAISE EXCEPTION 'Advertisement moderation permission required' USING ERRCODE='42501';
  END IF;
  IF p_decision IS NULL OR p_decision NOT IN ('approved','rejected') THEN
    RAISE EXCEPTION 'Invalid advertisement decision' USING ERRCODE='22023';
  END IF;
  IF v_priority NOT BETWEEN 0 AND 100 THEN
    RAISE EXCEPTION 'Advertisement priority must be between 0 and 100' USING ERRCODE='22023';
  END IF;
  IF v_reason IS NULL OR length(v_reason) NOT BETWEEN 10 AND 500 THEN
    RAISE EXCEPTION 'A review reason between 10 and 500 characters is required' USING ERRCODE='22023';
  END IF;

  PERFORM 1 FROM public.advertisements WHERE id=p_advertisement_id AND status='pending' FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Only pending advertisements can be reviewed' USING ERRCODE='22023';
  END IF;
  UPDATE public.advertisements
  SET status=p_decision,
      reviewed_by=auth.uid(),
      reviewed_at=now(),
      rejection_reason=CASE WHEN p_decision='rejected' THEN v_reason ELSE NULL END,
      priority=CASE WHEN p_decision='approved' THEN v_priority ELSE priority END,
      is_featured=CASE WHEN p_decision='approved' THEN COALESCE(p_featured,false) ELSE false END,
      is_sponsored=CASE WHEN p_decision='approved' THEN COALESCE(p_sponsored,false) ELSE false END
  WHERE id=p_advertisement_id;

  PERFORM public.record_trusted_admin_action(
    'advertisement.'||p_decision,
    'advertisements',
    'advertisement',
    p_advertisement_id,
    jsonb_build_object(
      'reason',v_reason,
      'priority',v_priority,
      'featured',COALESCE(p_featured,false),
      'sponsored',COALESCE(p_sponsored,false)
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.review_admin_advertisement(uuid,text,integer,boolean,boolean,text)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.review_admin_advertisement(uuid,text,integer,boolean,boolean,text)
  TO authenticated;

COMMIT;
