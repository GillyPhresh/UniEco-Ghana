-- Super-admin-only management of university-scoped administrator memberships.
-- The existing A1 assignment procedure is tightened to require a reason.
BEGIN;

CREATE OR REPLACE FUNCTION public.assign_university_administrator(
  p_target_user_id uuid,
  p_university_id uuid,
  p_reason text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE old_role smallint;
DECLARE target_is_active boolean;
DECLARE target_status text;
DECLARE clean_reason text := NULLIF(btrim(p_reason), '');
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Only a platform super administrator can assign university administrators' USING ERRCODE = '42501';
  END IF;
  IF p_target_user_id = auth.uid() THEN
    RAISE EXCEPTION 'Administrators cannot assign their own university scope' USING ERRCODE = '42501';
  END IF;
  IF clean_reason IS NULL OR length(clean_reason) NOT BETWEEN 10 AND 500 THEN
    RAISE EXCEPTION 'A reason between 10 and 500 characters is required' USING ERRCODE = '22023';
  END IF;
  PERFORM 1 FROM public.universities WHERE id = p_university_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'University does not exist' USING ERRCODE = 'P0002'; END IF;

  SELECT role_id,is_active,status INTO old_role,target_is_active,target_status FROM public.profiles WHERE id = p_target_user_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Target profile does not exist' USING ERRCODE = 'P0002'; END IF;
  IF NOT target_is_active OR target_status <> 'active' THEN
    RAISE EXCEPTION 'Only active accounts may be assigned university administration' USING ERRCODE = '22023';
  END IF;
  IF old_role NOT IN (2,7) THEN
    RAISE EXCEPTION 'Assign a student or existing university administrator account' USING ERRCODE = '22023';
  END IF;

  UPDATE public.profiles SET role_id=7,updated_at=now() WHERE id=p_target_user_id;
  INSERT INTO public.university_admin_memberships(user_id,university_id,is_active,assigned_by,assigned_at,revoked_at)
  VALUES(p_target_user_id,p_university_id,true,auth.uid(),now(),NULL)
  ON CONFLICT(user_id,university_id) DO UPDATE
    SET is_active=true,assigned_by=EXCLUDED.assigned_by,assigned_at=EXCLUDED.assigned_at,revoked_at=NULL,updated_at=now();

  IF old_role IS DISTINCT FROM 7 THEN
    INSERT INTO public.role_transition_audit(target_user_id,old_role_id,new_role_id,actor_id,reason)
    VALUES(p_target_user_id,old_role,7,auth.uid(),clean_reason);
  END IF;
  INSERT INTO public.audit_logs(actor_id,target_id,action,entity_type,entity_id,metadata)
  VALUES(auth.uid(),p_target_user_id,'university_administrator_assigned','university_admin_membership',p_target_user_id,
    jsonb_build_object('university_id',p_university_id,'reason',clean_reason));
  INSERT INTO public.admin_actions(admin_id,action,module,target_type,target_id,metadata)
  VALUES(auth.uid(),'university_admin.assign','universities','university_admin_membership',p_target_user_id,
    jsonb_build_object('university_id',p_university_id,'reason',clean_reason));
END;
$$;

CREATE OR REPLACE FUNCTION public.revoke_university_administrator(
  p_target_user_id uuid,
  p_university_id uuid,
  p_reason text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE clean_reason text := NULLIF(btrim(p_reason), '');
DECLARE old_role smallint;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Only a platform super administrator can revoke university administrators' USING ERRCODE = '42501';
  END IF;
  IF p_target_user_id = auth.uid() THEN
    RAISE EXCEPTION 'Administrators cannot revoke their own university scope' USING ERRCODE = '42501';
  END IF;
  IF clean_reason IS NULL OR length(clean_reason) NOT BETWEEN 10 AND 500 THEN
    RAISE EXCEPTION 'A reason between 10 and 500 characters is required' USING ERRCODE = '22023';
  END IF;
  PERFORM 1 FROM public.universities WHERE id=p_university_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'University does not exist' USING ERRCODE = 'P0002'; END IF;
  SELECT role_id INTO old_role FROM public.profiles WHERE id=p_target_user_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Target profile does not exist' USING ERRCODE = 'P0002'; END IF;
  PERFORM 1 FROM public.university_admin_memberships
    WHERE user_id=p_target_user_id AND university_id=p_university_id AND is_active FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Active university administrator membership not found' USING ERRCODE = 'P0002'; END IF;

  UPDATE public.university_admin_memberships
    SET is_active=false,revoked_at=now(),updated_at=now()
    WHERE user_id=p_target_user_id AND university_id=p_university_id AND is_active;
  IF old_role=7 AND NOT EXISTS (
    SELECT 1 FROM public.university_admin_memberships WHERE user_id=p_target_user_id AND is_active
  ) THEN
    UPDATE public.profiles SET role_id=2,updated_at=now() WHERE id=p_target_user_id;
    INSERT INTO public.role_transition_audit(target_user_id,old_role_id,new_role_id,actor_id,reason)
    VALUES(p_target_user_id,7,2,auth.uid(),clean_reason);
  END IF;

  INSERT INTO public.audit_logs(actor_id,target_id,action,entity_type,entity_id,metadata)
  VALUES(auth.uid(),p_target_user_id,'university_administrator_revoked','university_admin_membership',p_target_user_id,
    jsonb_build_object('university_id',p_university_id,'reason',clean_reason));
  INSERT INTO public.admin_actions(admin_id,action,module,target_type,target_id,metadata)
  VALUES(auth.uid(),'university_admin.revoke','universities','university_admin_membership',p_target_user_id,
    jsonb_build_object('university_id',p_university_id,'reason',clean_reason));
END;
$$;

CREATE OR REPLACE FUNCTION public.get_admin_university_memberships(p_university_id uuid)
RETURNS TABLE(user_id uuid, full_name text, email text, is_active boolean, assigned_at timestamptz, revoked_at timestamptz)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Super administrator access required' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM public.universities WHERE id=p_university_id) THEN
    RAISE EXCEPTION 'University does not exist' USING ERRCODE = 'P0002';
  END IF;
  RETURN QUERY
  SELECT m.user_id,p.full_name,p.email,m.is_active,m.assigned_at,m.revoked_at
  FROM public.university_admin_memberships m
  JOIN public.profiles p ON p.id=m.user_id
  WHERE m.university_id=p_university_id
  ORDER BY m.is_active DESC,m.assigned_at DESC;
END;
$$;

CREATE OR REPLACE FUNCTION public.search_university_admin_candidates(p_university_id uuid,p_search text)
RETURNS TABLE(user_id uuid,full_name text,email text,"current_role" text)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE clean_search text := NULLIF(btrim(p_search), '');
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Super administrator access required' USING ERRCODE = '42501';
  END IF;
  IF clean_search IS NULL OR length(clean_search) NOT BETWEEN 3 AND 100 THEN
    RAISE EXCEPTION 'Search must be between 3 and 100 characters' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM public.universities WHERE id=p_university_id) THEN
    RAISE EXCEPTION 'University does not exist' USING ERRCODE = 'P0002';
  END IF;
  RETURN QUERY
  SELECT p.id,p.full_name,p.email,r.name
  FROM public.profiles p
  JOIN public.user_roles r ON r.id=p.role_id
  WHERE p.role_id IN (2,7) AND p.is_active AND p.status='active'
    AND (position(lower(clean_search) in lower(COALESCE(p.full_name,''))) > 0 OR position(lower(clean_search) in lower(p.email)) > 0)
    AND NOT EXISTS(SELECT 1 FROM public.university_admin_memberships m WHERE m.user_id=p.id AND m.university_id=p_university_id AND m.is_active)
  ORDER BY p.full_name NULLS LAST,p.email
  LIMIT 20;
END;
$$;

REVOKE ALL ON FUNCTION public.assign_university_administrator(uuid,uuid,text) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.revoke_university_administrator(uuid,uuid,text) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.get_admin_university_memberships(uuid) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.search_university_admin_candidates(uuid,text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.assign_university_administrator(uuid,uuid,text),public.revoke_university_administrator(uuid,uuid,text),public.get_admin_university_memberships(uuid),public.search_university_admin_candidates(uuid,text) TO authenticated;

COMMIT;
