-- Apply the same assigned-capability boundary at the database as in navigation.
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
  WHERE rp.role='moderator'
    AND rp.permission IN ('can_review_reports','can_review_verifications','can_manage_support','can_moderate_content')
  ORDER BY rp.permission;
END; $$;

CREATE OR REPLACE FUNCTION public.update_admin_moderator_permissions(p_permissions text[],p_reason text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE
  v_allowed constant text[] := ARRAY['can_review_reports','can_review_verifications','can_manage_support','can_moderate_content'];
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

CREATE OR REPLACE FUNCTION public.review_admin_advertisement(
  p_advertisement_id uuid,p_decision text,p_priority integer DEFAULT 0,
  p_featured boolean DEFAULT false,p_sponsored boolean DEFAULT false,p_rejection_reason text DEFAULT NULL
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE
  v_reason text:=NULLIF(btrim(p_rejection_reason),'');
  v_priority integer:=COALESCE(p_priority,0);
BEGIN
  IF auth.uid() IS NULL OR NOT (public.is_super_admin() OR public.has_permission('can_moderate_content')) THEN
    RAISE EXCEPTION 'Advertisement moderation permission required' USING ERRCODE='42501';
  END IF;
  IF p_decision NOT IN ('approved','rejected') THEN RAISE EXCEPTION 'Invalid advertisement decision' USING ERRCODE='22023'; END IF;
  IF v_priority NOT BETWEEN 0 AND 100 THEN RAISE EXCEPTION 'Advertisement priority must be between 0 and 100' USING ERRCODE='22023'; END IF;
  IF p_decision='rejected' AND (v_reason IS NULL OR length(v_reason) NOT BETWEEN 10 AND 500) THEN
    RAISE EXCEPTION 'A rejection reason between 10 and 500 characters is required' USING ERRCODE='22023';
  END IF;

  PERFORM 1 FROM public.advertisements WHERE id=p_advertisement_id AND status='pending' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Only pending advertisements can be reviewed' USING ERRCODE='22023'; END IF;
  UPDATE public.advertisements
  SET status=p_decision,reviewed_by=auth.uid(),reviewed_at=now(),
      rejection_reason=CASE WHEN p_decision='rejected' THEN v_reason ELSE NULL END,
      priority=CASE WHEN p_decision='approved' THEN v_priority ELSE priority END,
      is_featured=CASE WHEN p_decision='approved' THEN COALESCE(p_featured,false) ELSE false END,
      is_sponsored=CASE WHEN p_decision='approved' THEN COALESCE(p_sponsored,false) ELSE false END
  WHERE id=p_advertisement_id;
  PERFORM public.record_trusted_admin_action(
    'advertisement.'||p_decision,'advertisements','advertisement',p_advertisement_id,
    jsonb_build_object('reason',v_reason,'priority',v_priority,'featured',COALESCE(p_featured,false),'sponsored',COALESCE(p_sponsored,false))
  );
END; $$;

CREATE OR REPLACE FUNCTION public.moderate_admin_review(p_review_id uuid,p_decision text,p_note text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE
  v_note text:=NULLIF(btrim(p_note),'');
BEGIN
  IF auth.uid() IS NULL OR NOT (public.is_super_admin() OR public.has_permission('can_moderate_content')) THEN
    RAISE EXCEPTION 'Review moderation permission required' USING ERRCODE='42501';
  END IF;
  IF p_decision NOT IN ('published','hidden','removed') THEN RAISE EXCEPTION 'Invalid review moderation decision' USING ERRCODE='22023'; END IF;
  IF p_decision IN ('hidden','removed') AND (v_note IS NULL OR length(v_note) NOT BETWEEN 10 AND 500) THEN
    RAISE EXCEPTION 'A moderation reason between 10 and 500 characters is required' USING ERRCODE='22023';
  END IF;
  PERFORM 1 FROM public.reviews WHERE id=p_review_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Review not found' USING ERRCODE='P0002'; END IF;

  UPDATE public.reviews SET is_approved=(p_decision='published') WHERE id=p_review_id;
  INSERT INTO public.review_moderation(review_id,moderation_status,moderated_by,moderated_at,moderation_note)
  VALUES(p_review_id,p_decision,auth.uid(),now(),v_note)
  ON CONFLICT(review_id) DO UPDATE SET moderation_status=EXCLUDED.moderation_status,
    moderated_by=EXCLUDED.moderated_by,moderated_at=EXCLUDED.moderated_at,
    moderation_note=EXCLUDED.moderation_note,updated_at=now();
  PERFORM public.record_trusted_admin_action(
    'review.'||p_decision,'reputation','review',p_review_id,jsonb_build_object('reason',v_note)
  );
END; $$;

DROP POLICY IF EXISTS advertisements_staff_read ON public.advertisements;
DROP POLICY IF EXISTS advertisements_assigned_moderator_read ON public.advertisements;
CREATE POLICY advertisements_assigned_moderator_read ON public.advertisements FOR SELECT TO authenticated
  USING (public.is_super_admin() OR public.has_permission('can_moderate_content'));

DROP POLICY IF EXISTS reviews_public_approved ON public.reviews;
CREATE POLICY reviews_public_approved ON public.reviews FOR SELECT TO anon,authenticated
  USING (is_approved OR reviewer_id=auth.uid() OR public.is_super_admin() OR public.has_permission('can_moderate_content'));

DROP POLICY IF EXISTS staff_only_review_moderation ON public.review_moderation;
DROP POLICY IF EXISTS review_moderation_assigned_read ON public.review_moderation;
CREATE POLICY review_moderation_assigned_read ON public.review_moderation FOR SELECT TO authenticated
  USING (public.is_super_admin() OR public.has_permission('can_moderate_content'));

REVOKE ALL ON FUNCTION public.get_admin_role_permissions() FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.update_admin_moderator_permissions(text[],text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.get_admin_role_permissions(),public.update_admin_moderator_permissions(text[],text) TO authenticated;

COMMIT;
