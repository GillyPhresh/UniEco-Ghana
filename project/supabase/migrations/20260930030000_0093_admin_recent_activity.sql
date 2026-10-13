-- Privacy-minimized recent activity for the management home, derived only
-- from trusted audit records and database-authorized university memberships.
BEGIN;

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

COMMIT;
