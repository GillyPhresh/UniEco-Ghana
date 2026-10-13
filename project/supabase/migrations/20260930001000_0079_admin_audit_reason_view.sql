-- Expose only a bounded reason field from audit metadata, never the full
-- metadata object (which may contain operational details unsuitable for UI).
BEGIN;

CREATE OR REPLACE FUNCTION public.get_admin_action_log_with_reason(
  p_module text DEFAULT NULL,
  p_action_search text DEFAULT NULL,
  p_limit integer DEFAULT 50,
  p_offset integer DEFAULT 0
)
RETURNS TABLE(
  id uuid,
  admin_id uuid,
  admin_full_name text,
  admin_email text,
  action text,
  module text,
  target_type text,
  target_id uuid,
  reason text,
  result text,
  created_at timestamptz,
  total_count bigint
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_module text := NULLIF(btrim(p_module), '');
  v_action_search text := NULLIF(btrim(p_action_search), '');
  v_limit integer := COALESCE(p_limit, 50);
  v_offset integer := COALESCE(p_offset, 0);
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Super administrator access required' USING ERRCODE = '42501';
  END IF;
  IF v_module IS NOT NULL AND length(v_module) > 100 THEN
    RAISE EXCEPTION 'Module filter is too long' USING ERRCODE = '22023';
  END IF;
  IF v_action_search IS NOT NULL AND length(v_action_search) NOT BETWEEN 3 AND 100 THEN
    RAISE EXCEPTION 'Action search must be between 3 and 100 characters' USING ERRCODE = '22023';
  END IF;
  IF v_limit NOT BETWEEN 1 AND 100 OR v_offset < 0 OR v_offset > 10000 THEN
    RAISE EXCEPTION 'Invalid pagination' USING ERRCODE = '22023';
  END IF;

  RETURN QUERY
  SELECT entry.id, entry.admin_id, admin.full_name, admin.email, entry.action,
    entry.module, entry.target_type, entry.target_id,
    NULLIF(left(regexp_replace(COALESCE(entry.metadata->>'reason', ''), '[[:cntrl:]]', ' ', 'g'), 500), ''),
    entry.result, entry.created_at, count(*) OVER ()
  FROM public.admin_actions entry
  JOIN public.profiles admin ON admin.id = entry.admin_id
  WHERE (v_module IS NULL OR entry.module = v_module)
    AND (v_action_search IS NULL OR position(lower(v_action_search) IN lower(entry.action)) > 0)
  ORDER BY entry.created_at DESC
  LIMIT v_limit OFFSET v_offset;
END;
$$;

REVOKE ALL ON FUNCTION public.get_admin_action_log_with_reason(text,text,integer,integer) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_admin_action_log_with_reason(text,text,integer,integer) TO authenticated;

COMMIT;
