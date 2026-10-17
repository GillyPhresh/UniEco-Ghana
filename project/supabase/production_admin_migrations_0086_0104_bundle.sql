-- UniEco Ghana Production Admin migrations 0086-0104
-- Run as one fresh SQL query in the UniEco Production Supabase project.
BEGIN;

-- ============================================================
-- 20260930008000_0086_admin_search_quality_aggregates.sql
-- ============================================================
-- Search quality reporting exposes aggregate operational counts only.
-- Raw query text/session identifiers remain unavailable to the management UI.
CREATE INDEX IF NOT EXISTS search_queries_created_result_count_idx
  ON public.search_queries (created_at DESC, result_count);
CREATE INDEX IF NOT EXISTS search_clicks_search_query_id_idx
  ON public.search_clicks (search_query_id)
  WHERE search_query_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.get_admin_search_quality_metrics(p_days integer DEFAULT 30)
RETURNS TABLE(
  activity_date date,
  searches bigint,
  no_result_searches bigint,
  searches_with_clicks bigint
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_days integer := COALESCE(p_days, 30);
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Super administrator access required' USING ERRCODE = '42501';
  END IF;
  IF v_days NOT IN (7, 30, 90) THEN
    RAISE EXCEPTION 'Invalid reporting window' USING ERRCODE = '22023';
  END IF;

  RETURN QUERY
  SELECT q.created_at::date,
    count(*)::bigint,
    count(*) FILTER (WHERE q.result_count = 0)::bigint,
    count(*) FILTER (WHERE click.search_query_id IS NOT NULL)::bigint
  FROM public.search_queries q
  LEFT JOIN (
    SELECT DISTINCT search_query_id
    FROM public.search_clicks
    WHERE search_query_id IS NOT NULL
  ) click ON click.search_query_id = q.id
  WHERE q.created_at >= current_date - (v_days - 1)
    AND q.created_at < current_date + 1
  GROUP BY q.created_at::date
  ORDER BY q.created_at::date DESC;
END;
$$;

REVOKE ALL ON FUNCTION public.get_admin_search_quality_metrics(integer)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_admin_search_quality_metrics(integer) TO authenticated;

-- ============================================================
-- 20260930009000_0087_search_quality_uses_privacy_safe_analytics.sql
-- ============================================================
-- Use the existing authenticated, query-text-free analytics event stream.
-- The legacy search_queries table has no active writer and stores raw terms.
DROP INDEX IF EXISTS public.search_queries_created_result_count_idx;
DROP INDEX IF EXISTS public.search_clicks_search_query_id_idx;
DROP FUNCTION public.get_admin_search_quality_metrics(integer);

CREATE FUNCTION public.get_admin_search_quality_metrics(p_days integer DEFAULT 30)
RETURNS TABLE(
  activity_date date,
  searches bigint,
  no_result_searches bigint,
  search_result_clicks bigint
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_days integer := COALESCE(p_days, 30);
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Super administrator access required' USING ERRCODE = '42501';
  END IF;
  IF v_days NOT IN (7, 30, 90) THEN
    RAISE EXCEPTION 'Invalid reporting window' USING ERRCODE = '22023';
  END IF;

  RETURN QUERY
  SELECT event.occurred_at::date,
    count(*) FILTER (WHERE event.event_type = 'search')::bigint,
    count(*) FILTER (WHERE event.event_type = 'search' AND event.result_count = 0)::bigint,
    count(*) FILTER (WHERE event.event_type = 'search_result_click')::bigint
  FROM public.analytics_events event
  WHERE event.event_type IN ('search', 'search_result_click')
    AND event.occurred_at >= current_date - (v_days - 1)
    AND event.occurred_at < current_date + 1
  GROUP BY event.occurred_at::date
  ORDER BY event.occurred_at::date DESC;
END;
$$;

REVOKE ALL ON FUNCTION public.get_admin_search_quality_metrics(integer)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_admin_search_quality_metrics(integer) TO authenticated;

-- ============================================================
-- 20260930010000_0088_admin_support_assignment_workflow.sql
-- ============================================================
-- Support assignment extends the existing can_manage_support capability and
-- trusted audit path; it does not create a separate support role model.
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

-- ============================================================
-- 20260930011000_0089_admin_event_operations.sql
-- ============================================================
-- Bounded event operations are distinct from reported-event moderation.
-- University scope is derived from the caller's database membership.
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

-- ============================================================
-- 20260930012000_0090_vendor_status_superadmin_reasoned.sql
-- ============================================================
-- Vendor activation is a platform-level control: only super-admins may use it.
-- Both suspension and restoration require a reason and trusted audit evidence.
CREATE OR REPLACE FUNCTION public.set_vendor_active(
  p_vendor_id uuid,
  p_is_active boolean,
  p_reason text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_vendor public.vendors%ROWTYPE;
  v_reason text := NULLIF(btrim(p_reason), '');
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Super administrator access required' USING ERRCODE = '42501';
  END IF;
  IF p_is_active IS NULL OR v_reason IS NULL OR length(v_reason) NOT BETWEEN 10 AND 500 THEN
    RAISE EXCEPTION 'A reason between 10 and 500 characters is required' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_vendor FROM public.vendors WHERE id = p_vendor_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Vendor not found' USING ERRCODE = 'P0002'; END IF;
  IF v_vendor.is_active = p_is_active THEN
    RAISE EXCEPTION 'Vendor status is already set; refresh and review again' USING ERRCODE = '22023';
  END IF;

  UPDATE public.vendors SET is_active = p_is_active, updated_at = now()
  WHERE id = v_vendor.id;

  PERFORM public.record_trusted_admin_action(
    CASE WHEN p_is_active THEN 'vendor.reactivated' ELSE 'vendor.suspended' END,
    'vendors', 'vendor', v_vendor.id,
    jsonb_build_object(
      'reason', v_reason,
      'university_id', v_vendor.university_id,
      'previous_is_active', v_vendor.is_active,
      'current_is_active', p_is_active
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.set_vendor_active(uuid, boolean, text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.set_vendor_active(uuid, boolean, text) TO authenticated;

-- ============================================================
-- 20260930013000_0091_university_scoped_vendor_operations.sql
-- ============================================================
-- Extend vendor operations to assigned university admins without granting
-- platform-wide vendor visibility or mutation authority.
CREATE OR REPLACE FUNCTION public.record_trusted_university_vendor_action(
  p_action text,
  p_university_id uuid,
  p_vendor_id uuid,
  p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF auth.uid() IS NULL OR public.current_app_role() IS DISTINCT FROM 'university_admin'
    OR NOT public.can_manage_university(p_university_id) THEN
    RAISE EXCEPTION 'Assigned university administrator access required' USING ERRCODE = '42501';
  END IF;
  IF p_action IS NULL OR p_action NOT IN (
    'vendor.verification_approved', 'vendor.verification_rejected',
    'vendor.suspended', 'vendor.reactivated'
  ) THEN
    RAISE EXCEPTION 'Invalid university vendor audit action' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.admin_actions (admin_id, action, module, target_type, target_id, metadata)
  VALUES (auth.uid(), p_action, 'vendors', 'vendor', p_vendor_id,
    COALESCE(p_metadata, '{}'::jsonb) || jsonb_build_object('university_id', p_university_id));
  INSERT INTO public.audit_logs (actor_id, target_id, action, entity_type, entity_id, metadata)
  VALUES (auth.uid(), p_vendor_id, p_action, 'vendor', p_vendor_id,
    COALESCE(p_metadata, '{}'::jsonb) || jsonb_build_object('university_id', p_university_id));
END;
$$;

CREATE OR REPLACE FUNCTION public.get_vendor_verification_queue(
  p_status text DEFAULT 'unverified',
  p_limit integer DEFAULT 30,
  p_offset integer DEFAULT 0
)
RETURNS TABLE(
  id uuid,
  business_name text,
  business_type text,
  logo_url text,
  contact_phone text,
  is_verified boolean,
  is_active boolean,
  is_student_business boolean,
  rating_avg numeric,
  rating_count integer,
  created_at timestamptz,
  university_name text,
  owner_full_name text,
  owner_email text,
  total_count bigint
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_status text := COALESCE(NULLIF(btrim(p_status), ''), 'unverified');
  v_limit integer := COALESCE(p_limit, 30);
  v_offset integer := COALESCE(p_offset, 0);
  v_role text := public.current_app_role();
BEGIN
  IF auth.uid() IS NULL OR NOT (
    public.is_super_admin()
    OR (v_role = 'moderator' AND public.has_permission('can_review_verifications'))
    OR v_role = 'university_admin'
  ) THEN
    RAISE EXCEPTION 'Verification reviewer access required' USING ERRCODE = '42501';
  END IF;
  IF v_status NOT IN ('all', 'unverified', 'verified') THEN
    RAISE EXCEPTION 'Invalid verification status filter' USING ERRCODE = '22023';
  END IF;
  IF v_limit NOT BETWEEN 1 AND 100 OR v_offset < 0 OR v_offset > 10000 THEN
    RAISE EXCEPTION 'Invalid pagination' USING ERRCODE = '22023';
  END IF;

  RETURN QUERY
  SELECT vendor.id, vendor.business_name, vendor.business_type, vendor.logo_url,
    vendor.contact_phone, vendor.is_verified, vendor.is_active,
    vendor.is_student_business, vendor.rating_avg, vendor.rating_count,
    vendor.created_at, university.name, owner.full_name,
    CASE WHEN public.is_super_admin() OR public.has_permission('can_review_verifications')
      THEN owner.email ELSE NULL END,
    count(*) OVER ()
  FROM public.vendors vendor
  LEFT JOIN public.universities university ON university.id = vendor.university_id
  JOIN public.profiles owner ON owner.id = vendor.owner_id
  WHERE (v_status = 'all'
      OR (v_status = 'verified' AND vendor.is_verified)
      OR (v_status = 'unverified' AND NOT vendor.is_verified))
    AND (
      public.is_super_admin()
      OR (v_role = 'moderator' AND public.has_permission('can_review_verifications'))
      OR (v_role = 'university_admin' AND public.can_manage_university(vendor.university_id))
    )
  ORDER BY vendor.created_at DESC, vendor.id
  LIMIT v_limit OFFSET v_offset;
END;
$$;

CREATE OR REPLACE FUNCTION public.review_vendor_verification(
  p_vendor_id uuid,
  p_approved boolean,
  p_reason text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_vendor public.vendors%ROWTYPE;
  v_reason text := NULLIF(btrim(p_reason), '');
  v_role text := public.current_app_role();
BEGIN
  IF auth.uid() IS NULL OR NOT (
    public.is_super_admin()
    OR (v_role = 'moderator' AND public.has_permission('can_review_verifications'))
    OR v_role = 'university_admin'
  ) THEN
    RAISE EXCEPTION 'Verification reviewer access required' USING ERRCODE = '42501';
  END IF;
  IF p_approved IS NULL OR v_reason IS NULL OR length(v_reason) NOT BETWEEN 10 AND 500 THEN
    RAISE EXCEPTION 'A decision reason between 10 and 500 characters is required' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_vendor FROM public.vendors WHERE id = p_vendor_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Vendor does not exist' USING ERRCODE = 'P0002'; END IF;
  IF v_role = 'university_admin' AND NOT public.can_manage_university(v_vendor.university_id) THEN
    RAISE EXCEPTION 'Assigned university vendor access required' USING ERRCODE = '42501';
  END IF;
  IF v_vendor.is_verified = p_approved THEN
    RAISE EXCEPTION 'Vendor verification state is already set; refresh and review again' USING ERRCODE = '22023';
  END IF;

  UPDATE public.vendors SET is_verified = p_approved, updated_at = now()
    WHERE id = v_vendor.id;
  UPDATE public.vendor_profiles
  SET verification_status = CASE WHEN p_approved THEN 'active' ELSE 'rejected' END,
      approved_at = CASE WHEN p_approved THEN now() ELSE NULL END,
      approved_by = CASE WHEN p_approved THEN auth.uid() ELSE NULL END,
      rejection_reason = CASE WHEN p_approved THEN NULL ELSE v_reason END
  WHERE profile_id = v_vendor.owner_id;

  IF v_role = 'university_admin' THEN
    PERFORM public.record_trusted_university_vendor_action(
      CASE WHEN p_approved THEN 'vendor.verification_approved' ELSE 'vendor.verification_rejected' END,
      v_vendor.university_id, v_vendor.id,
      jsonb_build_object('reason', v_reason, 'previous_is_verified', v_vendor.is_verified,
        'current_is_verified', p_approved)
    );
  ELSE
    PERFORM public.record_trusted_admin_action(
      CASE WHEN p_approved THEN 'vendor.verification_approved' ELSE 'vendor.verification_rejected' END,
      'vendors', 'vendor', v_vendor.id,
      jsonb_build_object('reason', v_reason, 'university_id', v_vendor.university_id,
        'previous_is_verified', v_vendor.is_verified, 'current_is_verified', p_approved)
    );
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_vendor_active(
  p_vendor_id uuid,
  p_is_active boolean,
  p_reason text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_vendor public.vendors%ROWTYPE;
  v_reason text := NULLIF(btrim(p_reason), '');
  v_role text := public.current_app_role();
BEGIN
  IF auth.uid() IS NULL OR NOT (public.is_super_admin() OR v_role = 'university_admin') THEN
    RAISE EXCEPTION 'Vendor management access required' USING ERRCODE = '42501';
  END IF;
  IF p_is_active IS NULL OR v_reason IS NULL OR length(v_reason) NOT BETWEEN 10 AND 500 THEN
    RAISE EXCEPTION 'A reason between 10 and 500 characters is required' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_vendor FROM public.vendors WHERE id = p_vendor_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Vendor not found' USING ERRCODE = 'P0002'; END IF;
  IF v_role = 'university_admin' AND NOT public.can_manage_university(v_vendor.university_id) THEN
    RAISE EXCEPTION 'Assigned university vendor access required' USING ERRCODE = '42501';
  END IF;
  IF v_vendor.is_active = p_is_active THEN
    RAISE EXCEPTION 'Vendor status is already set; refresh and review again' USING ERRCODE = '22023';
  END IF;

  UPDATE public.vendors SET is_active = p_is_active, updated_at = now()
    WHERE id = v_vendor.id;

  IF v_role = 'university_admin' THEN
    PERFORM public.record_trusted_university_vendor_action(
      CASE WHEN p_is_active THEN 'vendor.reactivated' ELSE 'vendor.suspended' END,
      v_vendor.university_id, v_vendor.id,
      jsonb_build_object('reason', v_reason, 'previous_is_active', v_vendor.is_active,
        'current_is_active', p_is_active)
    );
  ELSE
    PERFORM public.record_trusted_admin_action(
      CASE WHEN p_is_active THEN 'vendor.reactivated' ELSE 'vendor.suspended' END,
      'vendors', 'vendor', v_vendor.id,
      jsonb_build_object('reason', v_reason, 'university_id', v_vendor.university_id,
        'previous_is_active', v_vendor.is_active, 'current_is_active', p_is_active)
    );
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.record_trusted_university_vendor_action(text, uuid, uuid, jsonb)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.get_vendor_verification_queue(text, integer, integer),
  public.review_vendor_verification(uuid, boolean, text),
  public.set_vendor_active(uuid, boolean, text)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_vendor_verification_queue(text, integer, integer),
  public.review_vendor_verification(uuid, boolean, text),
  public.set_vendor_active(uuid, boolean, text) TO authenticated;

-- ============================================================
-- 20260930020000_0092_scoped_student_account_operations.sql
-- ============================================================
-- Narrow reasoned account-status operations for platform admins and assigned
-- university admins. Role changes remain in their dedicated workflow.
CREATE OR REPLACE FUNCTION public.record_trusted_university_student_action(
  p_action text,
  p_university_id uuid,
  p_student_id uuid,
  p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF auth.uid() IS NULL
    OR public.current_app_role() IS DISTINCT FROM 'university_admin'
    OR NOT public.can_manage_university(p_university_id) THEN
    RAISE EXCEPTION 'Assigned university administrator access required' USING ERRCODE = '42501';
  END IF;
  IF p_action IS NULL OR p_action NOT IN ('student.account_suspended', 'student.account_reactivated') THEN
    RAISE EXCEPTION 'Invalid student account audit action' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.admin_actions (admin_id, action, module, target_type, target_id, metadata)
  VALUES (auth.uid(), p_action, 'students', 'profile', p_student_id,
    COALESCE(p_metadata, '{}'::jsonb) || jsonb_build_object('university_id', p_university_id));
  INSERT INTO public.audit_logs (actor_id, target_id, action, entity_type, entity_id, metadata)
  VALUES (auth.uid(), p_student_id, p_action, 'profile', p_student_id,
    COALESCE(p_metadata, '{}'::jsonb) || jsonb_build_object('university_id', p_university_id));
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_set_student_account_status(
  p_student_id uuid,
  p_status text,
  p_reason text
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_profile public.profiles%ROWTYPE;
  v_university_id uuid;
  v_role text := public.current_app_role();
  v_reason text := NULLIF(btrim(p_reason), '');
BEGIN
  IF auth.uid() IS NULL OR NOT (
    public.is_super_admin()
    OR v_role = 'university_admin'
  ) THEN
    RAISE EXCEPTION 'Student account management access required' USING ERRCODE = '42501';
  END IF;
  IF p_student_id IS NULL OR p_student_id = auth.uid() THEN
    RAISE EXCEPTION 'Invalid student account target' USING ERRCODE = '42501';
  END IF;
  IF p_status IS NULL OR p_status NOT IN ('active', 'suspended') THEN
    RAISE EXCEPTION 'Only active or suspended student states are supported' USING ERRCODE = '22023';
  END IF;
  IF v_reason IS NULL OR length(v_reason) NOT BETWEEN 10 AND 500 THEN
    RAISE EXCEPTION 'A reason between 10 and 500 characters is required' USING ERRCODE = '22023';
  END IF;

  SELECT profile.* INTO v_profile
  FROM public.profiles AS profile
  JOIN public.user_roles AS role ON role.id = profile.role_id
  WHERE profile.id = p_student_id AND role.name IN ('student', 'student_vendor')
  FOR UPDATE OF profile;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Eligible student account not found' USING ERRCODE = 'P0002';
  END IF;

  SELECT COALESCE(student.university_id, v_profile.university_id) INTO v_university_id
  FROM (SELECT p_student_id AS user_id) AS target
  LEFT JOIN public.student_profiles AS student ON student.user_id = target.user_id;

  IF v_role = 'university_admin' AND (
    v_university_id IS NULL OR NOT public.can_manage_university(v_university_id)
  ) THEN
    RAISE EXCEPTION 'Student account is outside your assigned university' USING ERRCODE = '42501';
  END IF;
  IF v_profile.status IS NULL OR v_profile.status NOT IN ('active', 'suspended', 'inactive') THEN
    RAISE EXCEPTION 'Pending student accounts must use the verification workflow' USING ERRCODE = '22023';
  END IF;
  IF v_profile.status = p_status AND v_profile.is_active = (p_status = 'active') THEN
    RAISE EXCEPTION 'Student account already has this status' USING ERRCODE = '22023';
  END IF;

  UPDATE public.profiles
  SET status = p_status, is_active = (p_status = 'active'), updated_at = now()
  WHERE id = p_student_id;

  IF v_role = 'university_admin' THEN
    PERFORM public.record_trusted_university_student_action(
      CASE WHEN p_status = 'suspended' THEN 'student.account_suspended' ELSE 'student.account_reactivated' END,
      v_university_id, p_student_id,
      jsonb_build_object('reason', v_reason, 'previous_status', v_profile.status,
        'previous_is_active', v_profile.is_active, 'current_status', p_status,
        'current_is_active', p_status = 'active')
    );
  ELSE
    PERFORM public.record_trusted_admin_action(
      CASE WHEN p_status = 'suspended' THEN 'student.account_suspended' ELSE 'student.account_reactivated' END,
      'students', 'profile', p_student_id,
      jsonb_build_object('reason', v_reason, 'university_id', v_university_id,
        'previous_status', v_profile.status, 'previous_is_active', v_profile.is_active,
        'current_status', p_status, 'current_is_active', p_status = 'active')
    );
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.record_trusted_university_student_action(text, uuid, uuid, jsonb)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.admin_set_student_account_status(uuid, text, text)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_set_student_account_status(uuid, text, text) TO authenticated;

-- ============================================================
-- 20260930030000_0093_admin_recent_activity.sql
-- ============================================================
-- Privacy-minimized recent activity for the management home, derived only
-- from trusted audit records and database-authorized university memberships.
CREATE OR REPLACE FUNCTION public.get_admin_recent_activity(p_limit integer DEFAULT 10)
RETURNS TABLE(
  id uuid,
  actor_name text,
  action text,
  module text,
  created_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_role text := public.current_app_role();
  v_limit integer := COALESCE(p_limit, 10);
BEGIN
  IF auth.uid() IS NULL OR v_role IS NULL OR v_role NOT IN ('super_admin', 'university_admin') THEN
    RAISE EXCEPTION 'Management activity access required' USING ERRCODE = '42501';
  END IF;
  IF v_role = 'university_admin' AND NOT EXISTS (
    SELECT 1 FROM public.university_admin_memberships membership
    WHERE membership.user_id = auth.uid() AND membership.is_active
  ) THEN
    RAISE EXCEPTION 'Active university administration scope required' USING ERRCODE = '42501';
  END IF;
  IF v_limit NOT BETWEEN 1 AND 20 THEN
    RAISE EXCEPTION 'Invalid activity page size' USING ERRCODE = '22023';
  END IF;

  RETURN QUERY
  SELECT entry.id, actor.full_name, entry.action, entry.module, entry.created_at
  FROM public.admin_actions entry
  JOIN public.profiles actor ON actor.id = entry.admin_id
  WHERE entry.module IN (
    'users', 'verification', 'students', 'vendors', 'universities', 'businesses',
    'orders', 'events', 'support', 'advertisements', 'moderation', 'cms', 'announcements'
  )
    AND (
      v_role = 'super_admin'
      OR entry.module IN ('verification', 'students', 'vendors', 'universities', 'businesses', 'orders', 'events')
    )
    AND (
      v_role = 'super_admin'
      OR EXISTS (
        SELECT 1 FROM public.university_admin_memberships membership
        WHERE membership.user_id = auth.uid() AND membership.is_active
          AND entry.metadata ->> 'university_id' = membership.university_id::text
      )
    )
  ORDER BY entry.created_at DESC, entry.id DESC
  LIMIT v_limit;
END;
$$;

REVOKE ALL ON FUNCTION public.get_admin_recent_activity(integer) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_admin_recent_activity(integer) TO authenticated;

-- ============================================================
-- 20260930040000_0094_management_search_catalog_events.sql
-- ============================================================
-- Extend management search with tenant-scoped catalogue and event records.
-- Excludes prices, inventory quantities, private messages, documents, payments,
-- support content, and all client-supplied authorization scope.
CREATE INDEX IF NOT EXISTS businesses_management_name_trgm_idx
  ON public.businesses USING gin (lower(name) gin_trgm_ops);
CREATE INDEX IF NOT EXISTS products_management_name_trgm_idx
  ON public.products USING gin (lower(name) gin_trgm_ops);
CREATE INDEX IF NOT EXISTS services_management_name_trgm_idx
  ON public.services USING gin (lower(name) gin_trgm_ops);
CREATE INDEX IF NOT EXISTS events_management_title_trgm_idx
  ON public.events USING gin (lower(title) gin_trgm_ops);

CREATE OR REPLACE FUNCTION public.search_management_records(
  p_query text,
  p_limit integer DEFAULT 20,
  p_offset integer DEFAULT 0
)
RETURNS TABLE(
  resource_type text,
  resource_id uuid,
  title text,
  subtitle text,
  university_id uuid,
  created_at timestamptz,
  total_count bigint
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_query text := NULLIF(btrim(p_query), '');
  v_pattern text;
  v_role text;
  v_limit integer := COALESCE(p_limit, 20);
  v_offset integer := COALESCE(p_offset, 0);
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;
  v_role := public.current_app_role();
  IF v_role IS NULL OR v_role NOT IN ('super_admin', 'university_admin') THEN
    RAISE EXCEPTION 'Management search access required' USING ERRCODE = '42501';
  END IF;
  IF v_query IS NULL OR length(v_query) NOT BETWEEN 3 AND 100 THEN
    RAISE EXCEPTION 'Search must be between 3 and 100 characters' USING ERRCODE = '22023';
  END IF;
  v_pattern := '%' || replace(replace(replace(lower(v_query), E'\\', E'\\\\'), '%', E'\\%'), '_', E'\\_') || '%';
  IF v_limit NOT BETWEEN 1 AND 50 OR v_offset < 0 OR v_offset > 10000 THEN
    RAISE EXCEPTION 'Invalid result limit' USING ERRCODE = '22023';
  END IF;

  RETURN QUERY
  WITH scoped_results AS (
    SELECT 'vendor'::text AS resource_type, vendor.id AS resource_id, vendor.business_name AS title,
      COALESCE(university.name, 'No university') AS subtitle, vendor.university_id, vendor.created_at
    FROM public.vendors vendor
    LEFT JOIN public.universities university ON university.id = vendor.university_id
    WHERE public.can_manage_university(vendor.university_id)
      AND (lower(vendor.business_name) LIKE v_pattern ESCAPE E'\\'
        OR lower(COALESCE(vendor.business_slug, '')) LIKE v_pattern ESCAPE E'\\')

    UNION ALL

    SELECT 'order'::text, order_row.id, COALESCE(order_row.order_number, order_row.id::text),
      COALESCE(vendor.business_name, 'Unknown vendor') || ' Â· ' || order_row.status,
      order_row.university_id, order_row.created_at
    FROM public.orders order_row
    LEFT JOIN public.vendors vendor ON vendor.id = order_row.vendor_id
    WHERE public.can_manage_university(order_row.university_id)
      AND (lower(COALESCE(order_row.order_number, '')) LIKE v_pattern ESCAPE E'\\'
        OR lower(COALESCE(vendor.business_name, '')) LIKE v_pattern ESCAPE E'\\')

    UNION ALL

    SELECT 'university'::text, university.id, university.name,
      COALESCE(university.city, university.region, 'Ghana'), university.id, university.created_at
    FROM public.universities university
    WHERE public.can_manage_university(university.id)
      AND (lower(university.name) LIKE v_pattern ESCAPE E'\\'
        OR lower(COALESCE(university.short_name, '')) LIKE v_pattern ESCAPE E'\\')

    UNION ALL

    SELECT 'business'::text, business.id, business.name,
      COALESCE(university.name, 'No university'), COALESCE(business.university_id, vendor.university_id), business.created_at
    FROM public.businesses business
    JOIN public.vendors vendor ON vendor.id = business.vendor_id
    LEFT JOIN public.universities university ON university.id = COALESCE(business.university_id, vendor.university_id)
    WHERE public.can_manage_university(COALESCE(business.university_id, vendor.university_id))
      AND (lower(business.name) LIKE v_pattern ESCAPE E'\\'
        OR lower(COALESCE(business.slug, '')) LIKE v_pattern ESCAPE E'\\')

    UNION ALL

    SELECT 'product'::text, product.id, product.name, 'Product Â· ' || business.name,
      COALESCE(product.university_id, business.university_id, vendor.university_id), product.created_at
    FROM public.products product
    JOIN public.businesses business ON business.id = product.business_id
    JOIN public.vendors vendor ON vendor.id = business.vendor_id
    WHERE public.can_manage_university(COALESCE(product.university_id, business.university_id, vendor.university_id))
      AND (lower(product.name) LIKE v_pattern ESCAPE E'\\'
        OR lower(COALESCE(product.slug, '')) LIKE v_pattern ESCAPE E'\\'
        OR lower(business.name) LIKE v_pattern ESCAPE E'\\')

    UNION ALL

    SELECT 'service'::text, service.id, service.name, 'Service Â· ' || business.name,
      COALESCE(service.university_id, business.university_id, vendor.university_id), service.created_at
    FROM public.services service
    JOIN public.businesses business ON business.id = service.business_id
    JOIN public.vendors vendor ON vendor.id = business.vendor_id
    WHERE public.can_manage_university(COALESCE(service.university_id, business.university_id, vendor.university_id))
      AND (lower(service.name) LIKE v_pattern ESCAPE E'\\'
        OR lower(COALESCE(service.slug, '')) LIKE v_pattern ESCAPE E'\\'
        OR lower(business.name) LIKE v_pattern ESCAPE E'\\')

    UNION ALL

    SELECT 'event'::text, event.id, event.title,
      COALESCE(university.name, 'Platform event'), event.university_id, event.created_at
    FROM public.events event
    LEFT JOIN public.universities university ON university.id = event.university_id
    WHERE public.can_manage_university(event.university_id)
      AND (lower(event.title) LIKE v_pattern ESCAPE E'\\'
        OR lower(COALESCE(university.name, '')) LIKE v_pattern ESCAPE E'\\')
  ), platform_user_results AS (
    SELECT 'user'::text AS resource_type, profile.id AS resource_id,
      COALESCE(profile.full_name, profile.email) AS title,
      role.name AS subtitle, profile.university_id, profile.created_at
    FROM public.profiles profile
    JOIN public.user_roles role ON role.id = profile.role_id
    WHERE v_role = 'super_admin'
      AND (lower(COALESCE(profile.full_name, '')) LIKE v_pattern ESCAPE E'\\'
        OR lower(profile.email) LIKE v_pattern ESCAPE E'\\')
  )
  SELECT results.*, count(*) OVER () AS total_count
  FROM (
    SELECT * FROM scoped_results
    UNION ALL
    SELECT * FROM platform_user_results
  ) results
  ORDER BY created_at DESC, resource_type, resource_id
  LIMIT v_limit OFFSET v_offset;
END;
$$;

REVOKE ALL ON FUNCTION public.search_management_records(text,integer,integer) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.search_management_records(text,integer,integer) TO authenticated;

-- ============================================================
-- 20260930050000_0095_management_operational_alerts.sql
-- ============================================================
-- A role-aware alert projection over existing operational state. This function
-- returns counts and fixed alert keys only; it never exposes underlying rows.
CREATE INDEX IF NOT EXISTS payments_status_created_alert_idx
  ON public.payments (status, created_at DESC);
CREATE INDEX IF NOT EXISTS communication_deliveries_status_created_alert_idx
  ON public.communication_deliveries (status, created_at DESC);
CREATE INDEX IF NOT EXISTS support_tickets_priority_status_created_alert_idx
  ON public.support_tickets (priority, status, created_at DESC);
CREATE INDEX IF NOT EXISTS vendors_verification_created_alert_idx
  ON public.vendors (is_verified, created_at DESC, university_id);
CREATE INDEX IF NOT EXISTS products_low_stock_scope_alert_idx
  ON public.products (university_id, stock)
  WHERE is_active AND NOT is_archived;

CREATE OR REPLACE FUNCTION public.get_admin_operational_alerts()
RETURNS TABLE(
  alert_key text,
  severity text,
  affected_count bigint,
  window_start timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_role text := public.current_app_role();
BEGIN
  IF auth.uid() IS NULL OR v_role IS NULL OR v_role NOT IN ('super_admin', 'university_admin', 'moderator') THEN
    RAISE EXCEPTION 'Operational alert access required' USING ERRCODE = '42501';
  END IF;
  IF v_role = 'university_admin' AND NOT EXISTS (
    SELECT 1 FROM public.university_admin_memberships membership
    WHERE membership.user_id = auth.uid() AND membership.is_active
  ) THEN
    RAISE EXCEPTION 'Active university administration scope required' USING ERRCODE = '42501';
  END IF;
  IF v_role = 'moderator' AND NOT (
    public.has_permission('can_review_reports')
    OR public.has_permission('can_review_verifications')
    OR public.has_permission('can_manage_support')
    OR public.has_permission('can_manage_communications')
  ) THEN
    RAISE EXCEPTION 'An operational alert permission is required' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  WITH alerts(alert_key, severity, affected_count, window_start) AS (
    SELECT 'payment_reconciliation'::text, 'critical'::text, count(*)::bigint, NULL::timestamptz
    FROM public.payments payment
    WHERE v_role = 'super_admin' AND payment.status = 'reconciliation_required'
    HAVING count(*) > 0

    UNION ALL

    SELECT 'communication_failures', 'high', count(*)::bigint, now() - interval '24 hours'
    FROM public.communication_deliveries delivery
    WHERE (v_role = 'super_admin' OR (v_role = 'moderator' AND public.has_permission('can_manage_communications')))
      AND delivery.status = 'failed' AND delivery.created_at >= now() - interval '24 hours'
    HAVING count(*) > 0

    UNION ALL

    SELECT 'urgent_support', 'high', count(*)::bigint, NULL::timestamptz
    FROM public.support_tickets ticket
    WHERE (v_role = 'super_admin' OR (v_role = 'moderator' AND public.has_permission('can_manage_support')))
      AND ticket.priority IN ('high', 'urgent') AND ticket.status NOT IN ('resolved', 'closed')
    HAVING count(*) > 0

    UNION ALL

    SELECT 'priority_reports', 'high', count(*)::bigint, NULL::timestamptz
    FROM public.reports report
    WHERE (v_role = 'super_admin' OR (v_role = 'moderator' AND public.has_permission('can_review_reports')))
      AND report.priority IN ('high', 'critical') AND report.status NOT IN ('resolved', 'dismissed', 'closed')
    HAVING count(*) > 0

    UNION ALL

    SELECT 'stale_vendor_verification', 'medium', count(*)::bigint, now() - interval '72 hours'
    FROM public.vendors vendor
    WHERE NOT vendor.is_verified AND vendor.created_at < now() - interval '72 hours'
      AND (
        v_role = 'super_admin'
        OR (v_role = 'university_admin' AND public.can_manage_university(vendor.university_id))
        OR (v_role = 'moderator' AND public.has_permission('can_review_verifications'))
      )
    HAVING count(*) > 0

    UNION ALL

    SELECT 'low_stock_products', 'medium', count(*)::bigint, NULL::timestamptz
    FROM public.products product
    JOIN public.businesses business ON business.id = product.business_id
    JOIN public.vendors vendor ON vendor.id = business.vendor_id
    WHERE product.is_active AND NOT product.is_archived AND product.stock <= product.low_stock_threshold
      AND (
        v_role = 'super_admin'
        OR (v_role = 'university_admin' AND public.can_manage_university(COALESCE(product.university_id, business.university_id, vendor.university_id)))
      )
    HAVING count(*) > 0
  )
  SELECT alerts.alert_key, alerts.severity, alerts.affected_count, alerts.window_start
  FROM alerts
  ORDER BY CASE alerts.severity WHEN 'critical' THEN 1 WHEN 'high' THEN 2 ELSE 3 END,
    alerts.alert_key;
END;
$$;

REVOKE ALL ON FUNCTION public.get_admin_operational_alerts() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_admin_operational_alerts() TO authenticated;

-- ============================================================
-- 20260930060000_0096_moderator_operations_overview.sql
-- ============================================================
-- Complete the moderator's permission-scoped operations home and alert counts.
CREATE INDEX IF NOT EXISTS advertisements_pending_created_alert_idx
  ON public.advertisements (status, created_at DESC)
  WHERE status = 'pending';

CREATE OR REPLACE FUNCTION public.get_admin_operational_alerts()
RETURNS TABLE(
  alert_key text,
  severity text,
  affected_count bigint,
  window_start timestamptz
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_role text := public.current_app_role();
BEGIN
  IF auth.uid() IS NULL OR v_role IS NULL OR v_role NOT IN ('super_admin', 'university_admin', 'moderator') THEN
    RAISE EXCEPTION 'Operational alert access required' USING ERRCODE = '42501';
  END IF;
  IF v_role = 'university_admin' AND NOT EXISTS (
    SELECT 1 FROM public.university_admin_memberships membership
    WHERE membership.user_id = auth.uid() AND membership.is_active
  ) THEN
    RAISE EXCEPTION 'Active university administration scope required' USING ERRCODE = '42501';
  END IF;
  IF v_role = 'moderator' AND NOT (
    public.has_permission('can_review_reports')
    OR public.has_permission('can_review_verifications')
    OR public.has_permission('can_manage_support')
    OR public.has_permission('can_manage_communications')
    OR public.has_permission('can_moderate_content')
  ) THEN
    RAISE EXCEPTION 'An operational alert permission is required' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  WITH alerts(alert_key, severity, affected_count, window_start) AS (
    SELECT 'payment_reconciliation'::text, 'critical'::text, count(*)::bigint, NULL::timestamptz
    FROM public.payments payment
    WHERE v_role = 'super_admin' AND payment.status = 'reconciliation_required'
    HAVING count(*) > 0
    UNION ALL
    SELECT 'communication_failures', 'high', count(*)::bigint, now() - interval '24 hours'
    FROM public.communication_deliveries delivery
    WHERE (v_role = 'super_admin' OR (v_role = 'moderator' AND public.has_permission('can_manage_communications')))
      AND delivery.status = 'failed' AND delivery.created_at >= now() - interval '24 hours'
    HAVING count(*) > 0
    UNION ALL
    SELECT 'urgent_support', 'high', count(*)::bigint, NULL::timestamptz
    FROM public.support_tickets ticket
    WHERE (v_role = 'super_admin' OR (v_role = 'moderator' AND public.has_permission('can_manage_support')))
      AND ticket.priority IN ('high', 'urgent') AND ticket.status NOT IN ('resolved', 'closed')
    HAVING count(*) > 0
    UNION ALL
    SELECT 'priority_reports', 'high', count(*)::bigint, NULL::timestamptz
    FROM public.reports report
    WHERE (v_role = 'super_admin' OR (v_role = 'moderator' AND public.has_permission('can_review_reports')))
      AND report.priority IN ('high', 'critical') AND report.status NOT IN ('resolved', 'dismissed', 'closed')
    HAVING count(*) > 0
    UNION ALL
    SELECT 'content_reviews', 'medium', count(*)::bigint, NULL::timestamptz
    FROM public.reviews review
    LEFT JOIN public.review_moderation moderation ON moderation.review_id = review.id
    WHERE (v_role = 'super_admin' OR (v_role = 'moderator' AND public.has_permission('can_moderate_content')))
      AND COALESCE(moderation.moderation_status, CASE WHEN review.is_approved THEN 'published' ELSE 'pending_review' END)
        IN ('pending_review', 'flagged')
    HAVING count(*) > 0
    UNION ALL
    SELECT 'pending_advertisements', 'medium', count(*)::bigint, NULL::timestamptz
    FROM public.advertisements advertisement
    WHERE (v_role = 'super_admin' OR (v_role = 'moderator' AND public.has_permission('can_moderate_content')))
      AND advertisement.status = 'pending'
    HAVING count(*) > 0
    UNION ALL
    SELECT 'stale_vendor_verification', 'medium', count(*)::bigint, now() - interval '72 hours'
    FROM public.vendors vendor
    WHERE NOT vendor.is_verified AND vendor.created_at < now() - interval '72 hours'
      AND (v_role = 'super_admin'
        OR (v_role = 'university_admin' AND public.can_manage_university(vendor.university_id))
        OR (v_role = 'moderator' AND public.has_permission('can_review_verifications')))
    HAVING count(*) > 0
    UNION ALL
    SELECT 'low_stock_products', 'medium', count(*)::bigint, NULL::timestamptz
    FROM public.products product
    JOIN public.businesses business ON business.id = product.business_id
    JOIN public.vendors vendor ON vendor.id = business.vendor_id
    WHERE product.is_active AND NOT product.is_archived AND product.stock <= product.low_stock_threshold
      AND (v_role = 'super_admin'
        OR (v_role = 'university_admin' AND public.can_manage_university(COALESCE(product.university_id, business.university_id, vendor.university_id))))
    HAVING count(*) > 0
  )
  SELECT alert.alert_key, alert.severity, alert.affected_count, alert.window_start
  FROM alerts alert
  ORDER BY CASE alert.severity WHEN 'critical' THEN 1 WHEN 'high' THEN 2 ELSE 3 END, alert.alert_key;
END;
$$;

REVOKE ALL ON FUNCTION public.get_admin_operational_alerts() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_admin_operational_alerts() TO authenticated;

-- ============================================================
-- 20260930070000_0097_secure_support_ticket_owner_columns.sql
-- ============================================================
-- Ticket owners can see their own customer-facing fields, but must not be able
-- to read internal_notes or set operational fields through PostgREST inserts.
-- Staff workflows continue through the existing security-definer read/action RPCs.
REVOKE SELECT, INSERT ON public.support_tickets FROM PUBLIC, anon, authenticated;

GRANT SELECT (
  id,
  ticket_number,
  user_id,
  subject,
  description,
  category,
  status,
  priority,
  created_at,
  updated_at
) ON public.support_tickets TO authenticated;

GRANT INSERT (
  user_id,
  subject,
  description,
  category
) ON public.support_tickets TO authenticated;

DROP POLICY IF EXISTS support_tickets_owner_read ON public.support_tickets;
CREATE POLICY support_tickets_owner_read ON public.support_tickets FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_super_admin() OR public.has_permission('can_manage_support'));

CREATE OR REPLACE FUNCTION public.create_support_ticket(
  p_subject text,
  p_description text,
  p_category text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_ticket_id uuid := gen_random_uuid();
  v_ticket public.support_tickets%ROWTYPE;
  v_subject text := btrim(COALESCE(p_subject, ''));
  v_description text := btrim(COALESCE(p_description, ''));
  v_category text := lower(btrim(COALESCE(p_category, '')));
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;
  IF length(v_subject) NOT BETWEEN 5 AND 200
    OR length(v_description) NOT BETWEEN 10 AND 5000
    OR v_category !~ '^[a-z0-9_-]{1,50}$' THEN
    RAISE EXCEPTION 'Invalid support ticket details' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.support_tickets (
    id, ticket_number, user_id, subject, description, category
  ) VALUES (
    v_ticket_id,
    'SUP-' || upper(replace(v_ticket_id::text, '-', '')),
    v_user_id,
    v_subject,
    v_description,
    v_category
  ) RETURNING * INTO v_ticket;

  RETURN jsonb_build_object(
    'id', v_ticket.id,
    'ticket_number', v_ticket.ticket_number,
    'subject', v_ticket.subject,
    'status', v_ticket.status,
    'priority', v_ticket.priority,
    'created_at', v_ticket.created_at
  );
END;
$$;

REVOKE ALL ON FUNCTION public.create_support_ticket(text, text, text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.create_support_ticket(text, text, text) TO authenticated;

-- ============================================================
-- 20260930100000_0098_require_reason_student_verification_decisions.sql
-- ============================================================
-- Keep identity, tenant, row-lock, and audit authority in the existing RPC;
-- require an audit reason for approval as well as rejection.
CREATE OR REPLACE FUNCTION public.review_student_verification(
  p_student_profile_id uuid,
  p_approved boolean,
  p_reason text DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  target_user_id uuid;
  target_university_id uuid;
  v_role text := public.current_app_role();
  clean_reason text := NULLIF(btrim(p_reason), '');
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authorized to review student verification' USING ERRCODE = '42501';
  END IF;
  IF p_approved IS NULL THEN
    RAISE EXCEPTION 'Verification decision is required' USING ERRCODE = '22023';
  END IF;
  IF clean_reason IS NULL OR length(clean_reason) NOT BETWEEN 10 AND 500 THEN
    RAISE EXCEPTION 'A decision reason between 10 and 500 characters is required' USING ERRCODE = '22023';
  END IF;

  SELECT student.user_id, COALESCE(student.university_id, profile.university_id)
    INTO target_user_id, target_university_id
  FROM public.student_profiles student
  JOIN public.profiles profile ON profile.id = student.user_id
  WHERE student.id = p_student_profile_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Student profile does not exist' USING ERRCODE = 'P0002';
  END IF;

  IF v_role = 'university_admin' THEN
    IF NOT public.can_manage_university(target_university_id) THEN
      RAISE EXCEPTION 'Student verification is outside your university scope' USING ERRCODE = '42501';
    END IF;
  ELSIF NOT (public.is_super_admin() OR public.has_permission('can_review_verifications')) THEN
    RAISE EXCEPTION 'Not authorized to review student verification' USING ERRCODE = '42501';
  END IF;

  UPDATE public.student_profiles
  SET verification_status = CASE WHEN p_approved THEN 'verified' ELSE 'rejected' END,
      is_verified_student = p_approved,
      rejection_reason = CASE WHEN p_approved THEN NULL ELSE clean_reason END,
      updated_at = now()
  WHERE id = p_student_profile_id;

  INSERT INTO public.audit_logs (actor_id, target_id, action, entity_type, entity_id, metadata)
  VALUES (auth.uid(), target_user_id,
    CASE WHEN p_approved THEN 'student_verification_approved' ELSE 'student_verification_rejected' END,
    'student_profiles', p_student_profile_id,
    jsonb_build_object('reason', clean_reason, 'university_id', target_university_id));
END;
$$;

REVOKE ALL ON FUNCTION public.review_student_verification(uuid, boolean, text)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.review_student_verification(uuid, boolean, text) TO authenticated;

-- ============================================================
-- 20260930110000_0099_reasoned_content_deletions.sql
-- ============================================================
-- Retain the existing resource-specific authorization and audit architecture,
-- while removing reasonless API-call paths for destructive content actions.
REVOKE ALL ON FUNCTION public.delete_admin_category(uuid),
  public.delete_admin_cms_page(uuid),
  public.delete_admin_faq(uuid),
  public.delete_admin_announcement(uuid)
FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.delete_admin_category(p_category_id uuid, p_reason text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE
  clean_reason text := NULLIF(btrim(p_reason), '');
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Super administrator access required' USING ERRCODE = '42501';
  END IF;
  IF clean_reason IS NULL OR length(clean_reason) NOT BETWEEN 10 AND 500 THEN
    RAISE EXCEPTION 'A deletion reason between 10 and 500 characters is required' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (SELECT 1 FROM public.categories WHERE parent_id = p_category_id) THEN
    RAISE EXCEPTION 'Category has child categories' USING ERRCODE = '22023';
  END IF;
  DELETE FROM public.categories WHERE id = p_category_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Category not found' USING ERRCODE = 'P0002'; END IF;
  PERFORM public.record_trusted_admin_action('category.delete', 'categories', 'category', p_category_id,
    jsonb_build_object('reason', clean_reason));
END;
$$;

CREATE OR REPLACE FUNCTION public.delete_admin_cms_page(p_page_id uuid, p_reason text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE
  clean_reason text := NULLIF(btrim(p_reason), '');
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Super administrator access required' USING ERRCODE = '42501';
  END IF;
  IF clean_reason IS NULL OR length(clean_reason) NOT BETWEEN 10 AND 500 THEN
    RAISE EXCEPTION 'A deletion reason between 10 and 500 characters is required' USING ERRCODE = '22023';
  END IF;
  DELETE FROM public.cms_pages WHERE id = p_page_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'CMS page not found' USING ERRCODE = 'P0002'; END IF;
  PERFORM public.record_trusted_admin_action('cms.delete', 'cms', 'cms_page', p_page_id,
    jsonb_build_object('reason', clean_reason));
END;
$$;

CREATE OR REPLACE FUNCTION public.delete_admin_faq(p_faq_id uuid, p_reason text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE
  clean_reason text := NULLIF(btrim(p_reason), '');
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Super administrator access required' USING ERRCODE = '42501';
  END IF;
  IF clean_reason IS NULL OR length(clean_reason) NOT BETWEEN 10 AND 500 THEN
    RAISE EXCEPTION 'A deletion reason between 10 and 500 characters is required' USING ERRCODE = '22023';
  END IF;
  DELETE FROM public.cms_faq_entries WHERE id = p_faq_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'FAQ not found' USING ERRCODE = 'P0002'; END IF;
  PERFORM public.record_trusted_admin_action('faq.delete', 'cms', 'cms_faq_entry', p_faq_id,
    jsonb_build_object('reason', clean_reason));
END;
$$;

CREATE OR REPLACE FUNCTION public.delete_admin_announcement(p_announcement_id uuid, p_reason text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE
  university_id uuid;
  clean_reason text := NULLIF(btrim(p_reason), '');
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_staff() THEN
    RAISE EXCEPTION 'Staff access required' USING ERRCODE = '42501';
  END IF;
  IF clean_reason IS NULL OR length(clean_reason) NOT BETWEEN 10 AND 500 THEN
    RAISE EXCEPTION 'A deletion reason between 10 and 500 characters is required' USING ERRCODE = '22023';
  END IF;
  SELECT announcement.university_id INTO university_id
  FROM public.announcements announcement
  WHERE announcement.id = p_announcement_id
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Announcement not found' USING ERRCODE = 'P0002'; END IF;
  IF university_id IS NULL AND NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Super administrator access required' USING ERRCODE = '42501';
  ELSIF university_id IS NOT NULL AND NOT public.can_manage_university(university_id) THEN
    RAISE EXCEPTION 'University scope required' USING ERRCODE = '42501';
  END IF;
  DELETE FROM public.announcements WHERE id = p_announcement_id;
  PERFORM public.record_trusted_admin_action('announcement.delete', 'announcements', 'announcement', p_announcement_id,
    jsonb_build_object('reason', clean_reason, 'university_id', university_id));
END;
$$;

REVOKE ALL ON FUNCTION public.delete_admin_category(uuid, text),
  public.delete_admin_cms_page(uuid, text),
  public.delete_admin_faq(uuid, text),
  public.delete_admin_announcement(uuid, text)
FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.delete_admin_category(uuid, text),
  public.delete_admin_cms_page(uuid, text),
  public.delete_admin_faq(uuid, text),
  public.delete_admin_announcement(uuid, text)
TO authenticated;

-- ============================================================
-- 20260930120000_0100_reasoned_support_ticket_closure.sql
-- ============================================================
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

-- ============================================================
-- 20260930130000_0101_reasoned_broadcast_actions.sql
-- ============================================================
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

-- ============================================================
-- 20260930140000_0102_reasoned_advertisement_decisions.sql
-- ============================================================
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

-- ============================================================
-- 20260930150000_0103_reasoned_announcement_changes.sql
-- ============================================================
-- Replace reasonless announcement RPC signatures so every create/update is
-- scope-checked and leaves a trusted audit reason in the database.
CREATE OR REPLACE FUNCTION public.create_admin_announcement(
  p_title text,
  p_body text,
  p_type text,
  p_target_audience text,
  p_university_id uuid DEFAULT NULL,
  p_starts_at timestamptz DEFAULT NULL,
  p_ends_at timestamptz DEFAULT NULL,
  p_reason text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE
  new_id uuid;
  clean_reason text := NULLIF(btrim(p_reason), '');
  starts_at timestamptz := COALESCE(p_starts_at, now());
  ends_at timestamptz := COALESCE(p_ends_at, now() + interval '7 days');
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_staff() THEN
    RAISE EXCEPTION 'Staff access required' USING ERRCODE = '42501';
  END IF;
  IF clean_reason IS NULL OR length(clean_reason) NOT BETWEEN 10 AND 500 THEN
    RAISE EXCEPTION 'An announcement reason between 10 and 500 characters is required' USING ERRCODE = '22023';
  END IF;
  IF NULLIF(btrim(p_title), '') IS NULL OR length(p_title) > 200
    OR NULLIF(btrim(p_body), '') IS NULL OR length(p_body) > 10000
    OR p_type IS NULL OR p_type NOT IN ('platform', 'university', 'maintenance', 'promotional')
    OR p_target_audience IS NULL OR p_target_audience NOT IN ('all', 'students', 'vendors', 'specific_university') THEN
    RAISE EXCEPTION 'Invalid announcement values' USING ERRCODE = '22023';
  END IF;
  IF ends_at <= starts_at THEN
    RAISE EXCEPTION 'Announcement end must be after start' USING ERRCODE = '22023';
  END IF;
  IF p_type = 'university' OR p_target_audience = 'specific_university' THEN
    IF p_university_id IS NULL OR NOT public.can_manage_university(p_university_id) THEN
      RAISE EXCEPTION 'University scope required' USING ERRCODE = '42501';
    END IF;
  ELSE
    IF p_university_id IS NOT NULL OR NOT public.is_super_admin() THEN
      RAISE EXCEPTION 'Platform-wide announcement requires super administrator authority and no university scope' USING ERRCODE = '42501';
    END IF;
  END IF;

  INSERT INTO public.announcements(title, body, type, target_audience, university_id, starts_at, ends_at, created_by)
  VALUES (btrim(p_title), btrim(p_body), p_type, p_target_audience, p_university_id, starts_at, ends_at, auth.uid())
  RETURNING id INTO new_id;
  PERFORM public.record_trusted_admin_action(
    'announcement.create', 'announcements', 'announcement', new_id,
    jsonb_build_object('reason', clean_reason, 'university_id', p_university_id, 'type', p_type, 'target_audience', p_target_audience)
  );
  RETURN new_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_admin_announcement(
  p_announcement_id uuid,
  p_title text,
  p_body text,
  p_type text,
  p_target_audience text,
  p_university_id uuid,
  p_is_active boolean,
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_reason text
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE
  existing_university_id uuid;
  clean_reason text := NULLIF(btrim(p_reason), '');
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_staff() THEN
    RAISE EXCEPTION 'Staff access required' USING ERRCODE = '42501';
  END IF;
  IF clean_reason IS NULL OR length(clean_reason) NOT BETWEEN 10 AND 500 THEN
    RAISE EXCEPTION 'An announcement reason between 10 and 500 characters is required' USING ERRCODE = '22023';
  END IF;
  SELECT university_id INTO existing_university_id
  FROM public.announcements WHERE id = p_announcement_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Announcement not found' USING ERRCODE = 'P0002'; END IF;
  IF NULLIF(btrim(p_title), '') IS NULL OR length(p_title) > 200
    OR NULLIF(btrim(p_body), '') IS NULL OR length(p_body) > 10000
    OR p_type IS NULL OR p_type NOT IN ('platform', 'university', 'maintenance', 'promotional')
    OR p_target_audience IS NULL OR p_target_audience NOT IN ('all', 'students', 'vendors', 'specific_university')
    OR p_starts_at IS NULL OR p_ends_at IS NULL OR p_ends_at <= p_starts_at THEN
    RAISE EXCEPTION 'Invalid announcement values' USING ERRCODE = '22023';
  END IF;
  IF p_type = 'university' OR p_target_audience = 'specific_university' THEN
    IF p_university_id IS NULL OR NOT public.can_manage_university(p_university_id) THEN
      RAISE EXCEPTION 'University scope required' USING ERRCODE = '42501';
    END IF;
  ELSE
    -- Only a platform super-admin may remove tenant scope or publish platform-wide.
    IF p_university_id IS NOT NULL OR NOT public.is_super_admin() THEN
      RAISE EXCEPTION 'Platform-wide announcement requires super administrator authority and no university scope' USING ERRCODE = '42501';
    END IF;
  END IF;

  UPDATE public.announcements
  SET title = btrim(p_title), body = btrim(p_body), type = p_type,
      target_audience = p_target_audience, university_id = p_university_id,
      is_active = COALESCE(p_is_active, true), starts_at = p_starts_at, ends_at = p_ends_at
  WHERE id = p_announcement_id;
  PERFORM public.record_trusted_admin_action(
    'announcement.update', 'announcements', 'announcement', p_announcement_id,
    jsonb_build_object('reason', clean_reason, 'prior_university_id', existing_university_id, 'university_id', p_university_id, 'type', p_type, 'target_audience', p_target_audience)
  );
END;
$$;

-- Old signatures are removed, not merely hidden, so callers cannot bypass reason validation.
DROP FUNCTION public.create_admin_announcement(text, text, text, text, uuid, timestamptz, timestamptz);
DROP FUNCTION public.update_admin_announcement(uuid, text, text, text, text, uuid, boolean, timestamptz, timestamptz);
REVOKE ALL ON FUNCTION public.create_admin_announcement(text, text, text, text, uuid, timestamptz, timestamptz, text),
  public.update_admin_announcement(uuid, text, text, text, text, uuid, boolean, timestamptz, timestamptz, text)
FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.create_admin_announcement(text, text, text, text, uuid, timestamptz, timestamptz, text),
  public.update_admin_announcement(uuid, text, text, text, text, uuid, boolean, timestamptz, timestamptz, text)
TO authenticated;

-- ============================================================
-- 20260930160000_0104_scoped_university_announcement_operations.sql
-- ============================================================
-- University-admin announcement writes use a narrow audit path rather than
-- widening the platform-staff logger or trusting browser-supplied actors.
CREATE OR REPLACE FUNCTION public.record_trusted_university_announcement_action(
  p_action text,
  p_announcement_id uuid,
  p_university_id uuid,
  p_metadata jsonb
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN
  IF auth.uid() IS NULL OR public.current_app_role() IS DISTINCT FROM 'university_admin'
    OR p_university_id IS NULL OR NOT public.can_manage_university(p_university_id) THEN
    RAISE EXCEPTION 'Assigned university administrator access required' USING ERRCODE = '42501';
  END IF;
  IF p_action NOT IN ('announcement.create', 'announcement.update', 'announcement.delete') THEN
    RAISE EXCEPTION 'Invalid university announcement audit action' USING ERRCODE = '22023';
  END IF;
  INSERT INTO public.admin_actions(admin_id, action, module, target_type, target_id, metadata)
  VALUES (auth.uid(), p_action, 'announcements', 'announcement', p_announcement_id, COALESCE(p_metadata, '{}'::jsonb));
  INSERT INTO public.audit_logs(actor_id, target_id, action, entity_type, entity_id, metadata)
  VALUES (auth.uid(), p_announcement_id, p_action, 'announcement', p_announcement_id, COALESCE(p_metadata, '{}'::jsonb));
END;
$$;
REVOKE ALL ON FUNCTION public.record_trusted_university_announcement_action(text, uuid, uuid, jsonb)
FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.get_admin_announcements(
  p_limit integer DEFAULT 200,
  p_offset integer DEFAULT 0
)
RETURNS TABLE(
  id uuid, title text, body text, type text, target_audience text, university_id uuid,
  is_active boolean, starts_at timestamptz, ends_at timestamptz, created_by uuid,
  created_at timestamptz, university jsonb
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE
  role_name text := public.current_app_role();
  row_limit integer := COALESCE(p_limit, 200);
  row_offset integer := COALESCE(p_offset, 0);
BEGIN
  IF auth.uid() IS NULL OR role_name IS NULL OR role_name NOT IN ('super_admin', 'university_admin') THEN
    RAISE EXCEPTION 'Announcement management access required' USING ERRCODE = '42501';
  END IF;
  IF row_limit < 1 OR row_limit > 200 OR row_offset < 0 OR row_offset > 10000 THEN
    RAISE EXCEPTION 'Invalid announcement page' USING ERRCODE = '22023';
  END IF;
  RETURN QUERY
  SELECT a.id, a.title, a.body, a.type, a.target_audience, a.university_id,
         a.is_active, a.starts_at, a.ends_at, a.created_by, a.created_at,
         CASE WHEN u.id IS NULL THEN NULL ELSE jsonb_build_object('name', u.name, 'short_name', u.short_name) END
  FROM public.announcements a
  LEFT JOIN public.universities u ON u.id = a.university_id
  WHERE role_name = 'super_admin'
     OR (a.university_id IS NOT NULL AND public.can_manage_university(a.university_id))
  ORDER BY a.created_at DESC, a.id
  LIMIT row_limit OFFSET row_offset;
END;
$$;
REVOKE ALL ON FUNCTION public.get_admin_announcements(integer, integer) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_admin_announcements(integer, integer) TO authenticated;

CREATE OR REPLACE FUNCTION public.create_admin_announcement(
  p_title text, p_body text, p_type text, p_target_audience text,
  p_university_id uuid DEFAULT NULL, p_starts_at timestamptz DEFAULT NULL,
  p_ends_at timestamptz DEFAULT NULL, p_reason text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE
  role_name text := public.current_app_role();
  new_id uuid;
  clean_reason text := NULLIF(btrim(p_reason), '');
  start_time timestamptz := COALESCE(p_starts_at, now());
  end_time timestamptz := COALESCE(p_ends_at, now() + interval '7 days');
  audit_metadata jsonb;
BEGIN
  IF auth.uid() IS NULL OR role_name IS NULL OR role_name NOT IN ('super_admin', 'university_admin') THEN
    RAISE EXCEPTION 'Announcement management access required' USING ERRCODE = '42501';
  END IF;
  IF clean_reason IS NULL OR length(clean_reason) NOT BETWEEN 10 AND 500 THEN
    RAISE EXCEPTION 'An announcement reason between 10 and 500 characters is required' USING ERRCODE = '22023';
  END IF;
  IF NULLIF(btrim(p_title), '') IS NULL OR length(p_title) > 200
    OR NULLIF(btrim(p_body), '') IS NULL OR length(p_body) > 10000
    OR p_type IS NULL OR p_type NOT IN ('platform', 'university', 'maintenance', 'promotional')
    OR p_target_audience IS NULL OR p_target_audience NOT IN ('all', 'students', 'vendors', 'specific_university')
    OR end_time <= start_time THEN
    RAISE EXCEPTION 'Invalid announcement values' USING ERRCODE = '22023';
  END IF;
  IF p_type = 'university' OR p_target_audience = 'specific_university' THEN
    IF p_university_id IS NULL OR NOT public.can_manage_university(p_university_id) THEN
      RAISE EXCEPTION 'University scope required' USING ERRCODE = '42501';
    END IF;
  ELSIF p_university_id IS NOT NULL OR role_name <> 'super_admin' THEN
    RAISE EXCEPTION 'Platform-wide announcements require super administrator authority and no university scope' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.announcements(title, body, type, target_audience, university_id, starts_at, ends_at, created_by)
  VALUES (btrim(p_title), btrim(p_body), p_type, p_target_audience, p_university_id, start_time, end_time, auth.uid())
  RETURNING id INTO new_id;
  audit_metadata := jsonb_build_object('reason', clean_reason, 'university_id', p_university_id, 'type', p_type, 'target_audience', p_target_audience);
  IF role_name = 'university_admin' THEN
    PERFORM public.record_trusted_university_announcement_action('announcement.create', new_id, p_university_id, audit_metadata);
  ELSE
    PERFORM public.record_trusted_admin_action('announcement.create', 'announcements', 'announcement', new_id, audit_metadata);
  END IF;
  RETURN new_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_admin_announcement(
  p_announcement_id uuid, p_title text, p_body text, p_type text, p_target_audience text,
  p_university_id uuid, p_is_active boolean, p_starts_at timestamptz, p_ends_at timestamptz, p_reason text
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE
  role_name text := public.current_app_role();
  old_university_id uuid;
  clean_reason text := NULLIF(btrim(p_reason), '');
  audit_metadata jsonb;
BEGIN
  IF auth.uid() IS NULL OR role_name IS NULL OR role_name NOT IN ('super_admin', 'university_admin') THEN
    RAISE EXCEPTION 'Announcement management access required' USING ERRCODE = '42501';
  END IF;
  IF clean_reason IS NULL OR length(clean_reason) NOT BETWEEN 10 AND 500 THEN
    RAISE EXCEPTION 'An announcement reason between 10 and 500 characters is required' USING ERRCODE = '22023';
  END IF;
  SELECT university_id INTO old_university_id FROM public.announcements WHERE id = p_announcement_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Announcement not found' USING ERRCODE = 'P0002'; END IF;
  IF role_name = 'university_admin'
    AND (old_university_id IS NULL OR NOT public.can_manage_university(old_university_id)) THEN
    RAISE EXCEPTION 'Announcement is outside your university scope' USING ERRCODE = '42501';
  END IF;
  IF NULLIF(btrim(p_title), '') IS NULL OR length(p_title) > 200
    OR NULLIF(btrim(p_body), '') IS NULL OR length(p_body) > 10000
    OR p_type IS NULL OR p_type NOT IN ('platform', 'university', 'maintenance', 'promotional')
    OR p_target_audience IS NULL OR p_target_audience NOT IN ('all', 'students', 'vendors', 'specific_university')
    OR p_starts_at IS NULL OR p_ends_at IS NULL OR p_ends_at <= p_starts_at THEN
    RAISE EXCEPTION 'Invalid announcement values' USING ERRCODE = '22023';
  END IF;
  IF p_type = 'university' OR p_target_audience = 'specific_university' THEN
    IF p_university_id IS NULL OR NOT public.can_manage_university(p_university_id) THEN
      RAISE EXCEPTION 'University scope required' USING ERRCODE = '42501';
    END IF;
  ELSIF p_university_id IS NOT NULL OR role_name <> 'super_admin' THEN
    RAISE EXCEPTION 'Platform-wide announcements require super administrator authority and no university scope' USING ERRCODE = '42501';
  END IF;

  UPDATE public.announcements
  SET title = btrim(p_title), body = btrim(p_body), type = p_type,
      target_audience = p_target_audience, university_id = p_university_id,
      is_active = COALESCE(p_is_active, true), starts_at = p_starts_at, ends_at = p_ends_at
  WHERE id = p_announcement_id;
  audit_metadata := jsonb_build_object('reason', clean_reason, 'prior_university_id', old_university_id,
    'university_id', p_university_id, 'type', p_type, 'target_audience', p_target_audience);
  IF role_name = 'university_admin' THEN
    PERFORM public.record_trusted_university_announcement_action('announcement.update', p_announcement_id, old_university_id, audit_metadata);
  ELSE
    PERFORM public.record_trusted_admin_action('announcement.update', 'announcements', 'announcement', p_announcement_id, audit_metadata);
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.delete_admin_announcement(p_announcement_id uuid, p_reason text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE
  role_name text := public.current_app_role();
  target_university_id uuid;
  clean_reason text := NULLIF(btrim(p_reason), '');
  audit_metadata jsonb;
BEGIN
  IF auth.uid() IS NULL OR role_name IS NULL OR role_name NOT IN ('super_admin', 'university_admin') THEN
    RAISE EXCEPTION 'Announcement management access required' USING ERRCODE = '42501';
  END IF;
  IF clean_reason IS NULL OR length(clean_reason) NOT BETWEEN 10 AND 500 THEN
    RAISE EXCEPTION 'A deletion reason between 10 and 500 characters is required' USING ERRCODE = '22023';
  END IF;
  SELECT university_id INTO target_university_id FROM public.announcements WHERE id = p_announcement_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Announcement not found' USING ERRCODE = 'P0002'; END IF;
  IF target_university_id IS NULL OR NOT public.can_manage_university(target_university_id) THEN
    IF role_name <> 'super_admin' OR target_university_id IS NOT NULL THEN
      RAISE EXCEPTION 'Announcement is outside your authorized scope' USING ERRCODE = '42501';
    END IF;
  END IF;
  IF role_name = 'university_admin' AND NOT public.can_manage_university(target_university_id) THEN
    RAISE EXCEPTION 'Announcement is outside your university scope' USING ERRCODE = '42501';
  END IF;
  DELETE FROM public.announcements WHERE id = p_announcement_id;
  audit_metadata := jsonb_build_object('reason', clean_reason, 'university_id', target_university_id);
  IF role_name = 'university_admin' THEN
    PERFORM public.record_trusted_university_announcement_action('announcement.delete', p_announcement_id, target_university_id, audit_metadata);
  ELSE
    PERFORM public.record_trusted_admin_action('announcement.delete', 'announcements', 'announcement', p_announcement_id, audit_metadata);
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.create_admin_announcement(text, text, text, text, uuid, timestamptz, timestamptz, text),
  public.update_admin_announcement(uuid, text, text, text, text, uuid, boolean, timestamptz, timestamptz, text),
  public.delete_admin_announcement(uuid, text)
FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.create_admin_announcement(text, text, text, text, uuid, timestamptz, timestamptz, text),
  public.update_admin_announcement(uuid, text, text, text, text, uuid, boolean, timestamptz, timestamptz, text),
  public.delete_admin_announcement(uuid, text)
TO authenticated;

COMMIT;
