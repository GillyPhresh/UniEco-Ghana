-- Narrow user directory plus reasoned, auditable privileged status/role actions.
BEGIN;

CREATE INDEX IF NOT EXISTS profiles_role_status_created_idx
  ON public.profiles (role_id, status, created_at DESC);

CREATE OR REPLACE FUNCTION public.get_admin_user_directory(
  p_search text DEFAULT NULL,
  p_role_id smallint DEFAULT NULL,
  p_status text DEFAULT NULL,
  p_limit integer DEFAULT 20,
  p_offset integer DEFAULT 0
)
RETURNS TABLE(
  id uuid,
  full_name text,
  email text,
  role_id smallint,
  role_name text,
  status text,
  is_active boolean,
  university_name text,
  created_at timestamptz,
  total_count bigint
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_search text := NULLIF(btrim(p_search), '');
  v_status text := NULLIF(btrim(p_status), '');
  v_limit integer := COALESCE(p_limit, 20);
  v_offset integer := COALESCE(p_offset, 0);
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Super administrator access required' USING ERRCODE = '42501';
  END IF;
  IF v_search IS NOT NULL AND length(v_search) NOT BETWEEN 3 AND 100 THEN
    RAISE EXCEPTION 'Search must be between 3 and 100 characters' USING ERRCODE = '22023';
  END IF;
  IF p_role_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.user_roles WHERE id = p_role_id) THEN
    RAISE EXCEPTION 'Unknown role filter' USING ERRCODE = '22023';
  END IF;
  IF v_status IS NOT NULL AND v_status NOT IN ('active', 'suspended', 'inactive', 'pending') THEN
    RAISE EXCEPTION 'Invalid account status filter' USING ERRCODE = '22023';
  END IF;
  IF v_limit NOT BETWEEN 1 AND 100 OR v_offset < 0 OR v_offset > 10000 THEN
    RAISE EXCEPTION 'Invalid pagination' USING ERRCODE = '22023';
  END IF;

  RETURN QUERY
  SELECT p.id,p.full_name,p.email,p.role_id,r.name,p.status,p.is_active,u.name,p.created_at,count(*) OVER ()
  FROM public.profiles p
  JOIN public.user_roles r ON r.id=p.role_id
  LEFT JOIN public.universities u ON u.id=p.university_id
  WHERE (v_search IS NULL OR position(lower(v_search) in lower(COALESCE(p.full_name, ''))) > 0 OR position(lower(v_search) in lower(p.email)) > 0)
    AND (p_role_id IS NULL OR p.role_id=p_role_id)
    AND (v_status IS NULL OR p.status=v_status)
  ORDER BY p.created_at DESC
  LIMIT v_limit OFFSET v_offset;
END;
$$;

CREATE OR REPLACE FUNCTION public.assign_application_role(
  p_target_user_id uuid,
  p_new_role_id smallint,
  p_reason text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE old_role smallint;
DECLARE clean_reason text := NULLIF(btrim(p_reason), '');
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Only a platform super administrator can assign application roles' USING ERRCODE = '42501';
  END IF;
  IF p_target_user_id = auth.uid() THEN
    RAISE EXCEPTION 'Administrators cannot change their own role' USING ERRCODE = '42501';
  END IF;
  IF clean_reason IS NULL OR length(clean_reason) NOT BETWEEN 10 AND 500 THEN
    RAISE EXCEPTION 'A reason between 10 and 500 characters is required' USING ERRCODE = '22023';
  END IF;
  IF p_new_role_id IN (6,7) THEN
    RAISE EXCEPTION 'Super-admin and university-admin grants require dedicated server-authoritative workflows' USING ERRCODE = '42501';
  END IF;
  PERFORM 1 FROM public.user_roles WHERE id = p_new_role_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Unknown application role' USING ERRCODE = '22023'; END IF;

  SELECT role_id INTO old_role FROM public.profiles WHERE id=p_target_user_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Target profile does not exist' USING ERRCODE = 'P0002'; END IF;
  IF old_role IS NOT DISTINCT FROM p_new_role_id THEN
    RAISE EXCEPTION 'Target already has this role' USING ERRCODE = '22023';
  END IF;
  UPDATE public.profiles SET role_id=p_new_role_id,updated_at=now() WHERE id=p_target_user_id;
  INSERT INTO public.role_transition_audit(target_user_id,old_role_id,new_role_id,actor_id,reason)
  VALUES(p_target_user_id,old_role,p_new_role_id,auth.uid(),clean_reason);
  PERFORM public.record_trusted_admin_action(
    'user.role_assigned','users','profile',p_target_user_id,
    jsonb_build_object('old_role_id',old_role,'new_role_id',p_new_role_id,'reason',clean_reason)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.set_profile_status(
  p_target_user_id uuid,
  p_status text,
  p_is_active boolean,
  p_reason text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE clean_reason text := NULLIF(btrim(p_reason), '');
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_permission('can_manage_users') THEN
    RAISE EXCEPTION 'Not authorized to manage user status' USING ERRCODE = '42501';
  END IF;
  IF p_target_user_id = auth.uid() THEN
    RAISE EXCEPTION 'Administrators cannot change their own status' USING ERRCODE = '42501';
  END IF;
  IF p_status NOT IN ('active', 'suspended', 'inactive', 'pending') THEN
    RAISE EXCEPTION 'Invalid profile status' USING ERRCODE = '22023';
  END IF;
  IF clean_reason IS NULL OR length(clean_reason) NOT BETWEEN 10 AND 500 THEN
    RAISE EXCEPTION 'A reason between 10 and 500 characters is required' USING ERRCODE = '22023';
  END IF;
  UPDATE public.profiles SET status=p_status,is_active=p_is_active,updated_at=now() WHERE id=p_target_user_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Target profile does not exist' USING ERRCODE = 'P0002'; END IF;
  PERFORM public.record_trusted_admin_action(
    'user.status_set','users','profile',p_target_user_id,
    jsonb_build_object('status',p_status,'is_active',p_is_active,'reason',clean_reason)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_admin_user_directory(text,smallint,text,integer,integer) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.assign_application_role(uuid,smallint,text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.set_profile_status(uuid,text,boolean,text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_admin_user_directory(text,smallint,text,integer,integer), public.assign_application_role(uuid,smallint,text), public.set_profile_status(uuid,text,boolean,text) TO authenticated;

COMMIT;
