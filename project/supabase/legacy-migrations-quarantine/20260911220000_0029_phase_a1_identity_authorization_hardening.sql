-- Phase A1: Identity, authorization, and RLS hardening.
--
-- Application roles are deliberately sourced from public.profiles.role_id, not
-- from auth user metadata or JWT custom claims. JWTs may still carry Supabase's
-- database role, but they are never an authority for UniEco application access.

BEGIN;

INSERT INTO public.user_roles (id, name, description)
VALUES (7, 'university_admin', 'Administrator scoped to one or more assigned universities')
ON CONFLICT (id) DO UPDATE
SET name = EXCLUDED.name,
    description = EXCLUDED.description;

CREATE TABLE IF NOT EXISTS public.university_admin_memberships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  university_id uuid NOT NULL REFERENCES public.universities(id) ON DELETE CASCADE,
  is_active boolean NOT NULL DEFAULT true,
  assigned_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  assigned_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, university_id)
);

CREATE INDEX IF NOT EXISTS university_admin_memberships_active_lookup_idx
  ON public.university_admin_memberships (user_id, university_id)
  WHERE is_active;

ALTER TABLE public.university_admin_memberships ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.role_transition_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  target_user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  old_role_id smallint REFERENCES public.user_roles(id) ON DELETE RESTRICT,
  new_role_id smallint NOT NULL REFERENCES public.user_roles(id) ON DELETE RESTRICT,
  actor_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS role_transition_audit_target_created_idx
  ON public.role_transition_audit (target_user_id, created_at DESC);

ALTER TABLE public.role_transition_audit ENABLE ROW LEVEL SECURITY;

-- SECURITY DEFINER is narrowly used so policies can safely determine the
-- caller's own database-backed role even when the profiles table is protected
-- by RLS. None of these helpers accept an arbitrary user id.
CREATE OR REPLACE FUNCTION public.current_app_role()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT role.name
  FROM public.profiles profile
  JOIN public.user_roles role ON role.id = profile.role_id
  WHERE profile.id = auth.uid()
  LIMIT 1
$$;

CREATE OR REPLACE FUNCTION public.has_app_role(p_roles text[])
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT COALESCE(public.current_app_role() = ANY (p_roles), false)
$$;

CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT public.has_app_role(ARRAY['super_admin'])
$$;

CREATE OR REPLACE FUNCTION public.is_staff()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT public.has_app_role(ARRAY['moderator', 'super_admin'])
$$;

CREATE OR REPLACE FUNCTION public.has_permission(p_permission text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.role_permissions permission
    WHERE permission.role = public.current_app_role()
      AND permission.permission = p_permission
  )
$$;

CREATE OR REPLACE FUNCTION public.can_manage_university(p_university_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT public.is_super_admin()
    OR (
      public.current_app_role() = 'university_admin'
      AND EXISTS (
        SELECT 1
        FROM public.university_admin_memberships membership
        WHERE membership.user_id = auth.uid()
          AND membership.university_id = p_university_id
          AND membership.is_active
      )
    )
$$;

REVOKE ALL ON FUNCTION public.current_app_role() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.has_app_role(text[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_super_admin() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_staff() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.has_permission(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.can_manage_university(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.current_app_role() TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_app_role(text[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_super_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_staff() TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_permission(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_manage_university(uuid) TO authenticated;

-- New public sign-ups are always ordinary students. Account intent belongs in
-- onboarding data, not in user-controlled auth metadata. Privileged roles are
-- granted only by the audited workflows below.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, role_id, full_name, avatar_url)
  VALUES (
    NEW.id,
    NEW.email,
    2,
    NEW.raw_user_meta_data ->> 'full_name',
    NEW.raw_user_meta_data ->> 'avatar_url'
  );
  RETURN NEW;
END
$$;

-- Replace legacy policies that trusted auth.jwt()->>'role'. The normal
-- Supabase JWT role is only 'authenticated'; a user-controllable custom claim
-- must never decide application privileges. This rewrites every existing
-- policy using that legacy expression while retaining its command, grantees,
-- permissiveness and other conditions.
DO $$
DECLARE
  policy_record record;
  policy_definition text;
BEGIN
  FOR policy_record IN
    SELECT policy.oid, policy.polname, namespace.nspname, relation.relname
    FROM pg_policy policy
    JOIN pg_class relation ON relation.oid = policy.polrelid
    JOIN pg_namespace namespace ON namespace.oid = relation.relnamespace
    WHERE namespace.nspname IN ('public', 'storage')
      AND pg_get_policydef(policy.oid, true) ~ 'auth\\.jwt\\(\\)\\s*->>\\s*''role'''
  LOOP
    policy_definition := pg_get_policydef(policy_record.oid, true);
    policy_definition := regexp_replace(
      policy_definition,
      'auth\\.jwt\\(\\)\\s*->>\\s*''role''(::text)?',
      'public.current_app_role()',
      'g'
    );

    EXECUTE format(
      'DROP POLICY %I ON %I.%I',
      policy_record.polname,
      policy_record.nspname,
      policy_record.relname
    );
    EXECUTE format(
      'CREATE POLICY %I ON %I.%I %s',
      policy_record.polname,
      policy_record.nspname,
      policy_record.relname,
      policy_definition
    );
  END LOOP;
END
$$;

-- A signed-in user can update only ordinary profile details. Role, status,
-- university, verification and activation fields are server-controlled.
DROP POLICY IF EXISTS users_insert_own_profile ON public.profiles;
DROP POLICY IF EXISTS users_update_own_profile ON public.profiles;
DROP POLICY IF EXISTS users_update_safe_profile_fields ON public.profiles;
CREATE POLICY users_update_safe_profile_fields ON public.profiles
  FOR UPDATE TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

REVOKE INSERT, UPDATE ON public.profiles FROM authenticated;
GRANT UPDATE (
  full_name,
  phone,
  avatar_url,
  bio,
  university_id,
  preferences,
  notification_settings
) ON public.profiles TO authenticated;

-- Vendor records cannot be marked verified/active or reassigned by their
-- owner. They may still manage commercial details for a vendor they own.
DROP POLICY IF EXISTS owners_insert_vendors ON public.vendors;
DROP POLICY IF EXISTS owners_update_vendors ON public.vendors;
CREATE POLICY owners_insert_vendors ON public.vendors
  FOR INSERT TO authenticated
  WITH CHECK (
    owner_id = auth.uid()
    AND COALESCE(is_verified, false) = false
    AND COALESCE(is_active, false) = false
  );
CREATE POLICY owners_update_vendors ON public.vendors
  FOR UPDATE TO authenticated
  USING (owner_id = auth.uid())
  WITH CHECK (owner_id = auth.uid());

REVOKE UPDATE ON public.vendors FROM authenticated;
GRANT UPDATE (
  business_name,
  description,
  business_type,
  logo_url,
  cover_image_url,
  contact_phone,
  contact_email,
  website_url,
  whatsapp_number,
  social_links,
  delivery_available,
  service_radius_km,
  gps_latitude,
  gps_longitude,
  is_temporarily_closed
) ON public.vendors TO authenticated;

-- Student verification flags remain controlled by staff. Owners can maintain
-- their academic information without being able to self-verify.
DROP POLICY IF EXISTS students_insert_own_profile ON public.student_profiles;
DROP POLICY IF EXISTS students_update_own_profile ON public.student_profiles;
CREATE POLICY students_insert_own_profile ON public.student_profiles
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND COALESCE(is_verified_student, false) = false
    AND COALESCE(verification_status, 'pending') = 'pending'
  );
CREATE POLICY students_update_own_profile ON public.student_profiles
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

REVOKE UPDATE ON public.student_profiles FROM authenticated;
GRANT UPDATE (
  university_id,
  student_id_number,
  program_of_study,
  faculty,
  department,
  level,
  admission_year,
  graduation_year,
  student_id_document_url
) ON public.student_profiles TO authenticated;

-- Vendor onboarding begins pending/unsubscribed. Approvals and subscriptions
-- must be performed by an authorized server-side workflow.
DROP POLICY IF EXISTS owners_insert_vendor_profiles ON public.vendor_profiles;
DROP POLICY IF EXISTS owners_update_vendor_profiles ON public.vendor_profiles;
CREATE POLICY owners_insert_vendor_profiles ON public.vendor_profiles
  FOR INSERT TO authenticated
  WITH CHECK (
    profile_id = auth.uid()
    AND COALESCE(verification_status, 'pending') = 'pending'
    AND COALESCE(subscription_status, 'none') = 'none'
    AND approved_at IS NULL
    AND approved_by IS NULL
  );
CREATE POLICY owners_update_vendor_profiles ON public.vendor_profiles
  FOR UPDATE TO authenticated
  USING (profile_id = auth.uid())
  WITH CHECK (profile_id = auth.uid());

REVOKE UPDATE ON public.vendor_profiles FROM authenticated;
GRANT UPDATE (
  business_category,
  location_address,
  location_city,
  location_region,
  product_service_type,
  verification_document_url,
  rejection_reason
) ON public.vendor_profiles TO authenticated;

-- Audit rows are append-only server evidence. Direct browser writes are no
-- longer permitted; controlled SECURITY DEFINER workflows below create them.
DROP POLICY IF EXISTS users_insert_audit_logs ON public.audit_logs;
REVOKE INSERT, UPDATE, DELETE ON public.audit_logs FROM authenticated;

CREATE OR REPLACE FUNCTION public.log_profile_status_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF OLD.status IS DISTINCT FROM NEW.status OR OLD.is_active IS DISTINCT FROM NEW.is_active THEN
    INSERT INTO public.audit_logs (actor_id, target_id, action, entity_type, entity_id, metadata)
    VALUES (
      auth.uid(),
      NEW.id,
      'profile_status_changed',
      'profiles',
      NEW.id,
      jsonb_build_object(
        'old_status', OLD.status,
        'old_is_active', OLD.is_active,
        'new_status', NEW.status,
        'new_is_active', NEW.is_active
      )
    );
  END IF;
  RETURN NEW;
END
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
DECLARE
  old_role smallint;
BEGIN
  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Only a platform super administrator can assign application roles'
      USING ERRCODE = '42501';
  END IF;

  IF p_target_user_id = auth.uid() THEN
    RAISE EXCEPTION 'Administrators cannot change their own role' USING ERRCODE = '42501';
  END IF;

  PERFORM 1 FROM public.user_roles WHERE id = p_new_role_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Unknown application role' USING ERRCODE = '22023';
  END IF;
  IF p_new_role_id = 7 THEN
    RAISE EXCEPTION 'Use assign_university_administrator to grant a university-scoped role'
      USING ERRCODE = '22023';
  END IF;

  SELECT role_id INTO old_role FROM public.profiles WHERE id = p_target_user_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Target profile does not exist' USING ERRCODE = 'P0002';
  END IF;

  IF old_role IS DISTINCT FROM p_new_role_id THEN
    UPDATE public.profiles SET role_id = p_new_role_id WHERE id = p_target_user_id;
    INSERT INTO public.role_transition_audit (target_user_id, old_role_id, new_role_id, actor_id, reason)
    VALUES (p_target_user_id, old_role, p_new_role_id, auth.uid(), p_reason);
    INSERT INTO public.audit_logs (actor_id, target_id, action, entity_type, entity_id, metadata)
    VALUES (
      auth.uid(),
      p_target_user_id,
      'application_role_assigned',
      'profiles',
      p_target_user_id,
      jsonb_build_object('old_role_id', old_role, 'new_role_id', p_new_role_id, 'reason', p_reason)
    );
  END IF;
END
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
BEGIN
  IF NOT public.has_permission('can_manage_users') THEN
    RAISE EXCEPTION 'Not authorized to manage user status' USING ERRCODE = '42501';
  END IF;

  IF p_target_user_id = auth.uid() THEN
    RAISE EXCEPTION 'Administrators cannot change their own status' USING ERRCODE = '42501';
  END IF;

  IF p_status NOT IN ('active', 'suspended', 'inactive', 'pending') THEN
    RAISE EXCEPTION 'Invalid profile status' USING ERRCODE = '22023';
  END IF;

  UPDATE public.profiles
  SET status = p_status, is_active = p_is_active
  WHERE id = p_target_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Target profile does not exist' USING ERRCODE = 'P0002';
  END IF;

  INSERT INTO public.audit_logs (actor_id, target_id, action, entity_type, entity_id, metadata)
  VALUES (
    auth.uid(),
    p_target_user_id,
    'profile_status_set',
    'profiles',
    p_target_user_id,
    jsonb_build_object('status', p_status, 'is_active', p_is_active, 'reason', p_reason)
  );
END
$$;

CREATE OR REPLACE FUNCTION public.request_vendor_role(p_vendor_type text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  old_role smallint;
  next_role smallint;
BEGIN
  IF p_vendor_type NOT IN ('student_vendor', 'external_vendor') THEN
    RAISE EXCEPTION 'Invalid vendor type' USING ERRCODE = '22023';
  END IF;

  SELECT role_id INTO old_role FROM public.profiles WHERE id = auth.uid() FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Profile does not exist' USING ERRCODE = 'P0002';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.vendor_profiles vendor_profile
    WHERE vendor_profile.profile_id = auth.uid()
      AND vendor_profile.vendor_type = p_vendor_type
  ) OR NOT EXISTS (
    SELECT 1 FROM public.vendors vendor WHERE vendor.owner_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Vendor onboarding must be completed before requesting a vendor role'
      USING ERRCODE = '42501';
  END IF;

  next_role := CASE WHEN p_vendor_type = 'student_vendor' THEN 3 ELSE 4 END;
  IF old_role NOT IN (2, 3, 4) THEN
    RAISE EXCEPTION 'Current role is not eligible for vendor onboarding' USING ERRCODE = '42501';
  END IF;

  IF old_role IS DISTINCT FROM next_role THEN
    UPDATE public.profiles SET role_id = next_role WHERE id = auth.uid();
    INSERT INTO public.role_transition_audit (target_user_id, old_role_id, new_role_id, actor_id, reason)
    VALUES (auth.uid(), old_role, next_role, auth.uid(), 'vendor_onboarding_completed');
    INSERT INTO public.audit_logs (actor_id, target_id, action, entity_type, entity_id, metadata)
    VALUES (
      auth.uid(),
      auth.uid(),
      'vendor_role_requested',
      'profiles',
      auth.uid(),
      jsonb_build_object('old_role_id', old_role, 'new_role_id', next_role, 'vendor_type', p_vendor_type)
    );
  END IF;
END
$$;

CREATE OR REPLACE FUNCTION public.review_student_verification(
  p_student_profile_id uuid,
  p_approved boolean,
  p_reason text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  target_user_id uuid;
BEGIN
  IF NOT public.has_permission('can_review_verifications') THEN
    RAISE EXCEPTION 'Not authorized to review student verification' USING ERRCODE = '42501';
  END IF;

  SELECT user_id INTO target_user_id
  FROM public.student_profiles
  WHERE id = p_student_profile_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Student profile does not exist' USING ERRCODE = 'P0002';
  END IF;

  UPDATE public.student_profiles
  SET verification_status = CASE WHEN p_approved THEN 'verified' ELSE 'rejected' END,
      is_verified_student = p_approved,
      rejection_reason = CASE WHEN p_approved THEN NULL ELSE NULLIF(trim(p_reason), '') END
  WHERE id = p_student_profile_id;

  INSERT INTO public.audit_logs (actor_id, target_id, action, entity_type, entity_id, metadata)
  VALUES (
    auth.uid(),
    target_user_id,
    CASE WHEN p_approved THEN 'student_verification_approved' ELSE 'student_verification_rejected' END,
    'student_profiles',
    p_student_profile_id,
    jsonb_build_object('reason', p_reason)
  );
END
$$;

CREATE OR REPLACE FUNCTION public.review_vendor_verification(
  p_vendor_id uuid,
  p_approved boolean,
  p_reason text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  target_user_id uuid;
BEGIN
  IF NOT public.has_permission('can_review_verifications') THEN
    RAISE EXCEPTION 'Not authorized to review vendor verification' USING ERRCODE = '42501';
  END IF;

  SELECT owner_id INTO target_user_id
  FROM public.vendors
  WHERE id = p_vendor_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Vendor does not exist' USING ERRCODE = 'P0002';
  END IF;

  UPDATE public.vendors
  SET is_verified = p_approved
  WHERE id = p_vendor_id;

  UPDATE public.vendor_profiles
  SET verification_status = CASE WHEN p_approved THEN 'active' ELSE 'rejected' END,
      approved_at = CASE WHEN p_approved THEN now() ELSE NULL END,
      approved_by = CASE WHEN p_approved THEN auth.uid() ELSE NULL END,
      rejection_reason = CASE WHEN p_approved THEN NULL ELSE NULLIF(trim(p_reason), '') END
  WHERE profile_id = target_user_id;

  INSERT INTO public.audit_logs (actor_id, target_id, action, entity_type, entity_id, metadata)
  VALUES (
    auth.uid(),
    target_user_id,
    CASE WHEN p_approved THEN 'vendor_verification_approved' ELSE 'vendor_verification_rejected' END,
    'vendors',
    p_vendor_id,
    jsonb_build_object('reason', p_reason)
  );
END
$$;

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
  target_user_id uuid;
BEGIN
  IF NOT public.has_app_role(ARRAY['moderator', 'super_admin']) THEN
    RAISE EXCEPTION 'Not authorized to manage vendor status' USING ERRCODE = '42501';
  END IF;

  SELECT owner_id INTO target_user_id
  FROM public.vendors
  WHERE id = p_vendor_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Vendor does not exist' USING ERRCODE = 'P0002';
  END IF;

  UPDATE public.vendors SET is_active = p_is_active WHERE id = p_vendor_id;
  INSERT INTO public.audit_logs (actor_id, target_id, action, entity_type, entity_id, metadata)
  VALUES (
    auth.uid(),
    target_user_id,
    CASE WHEN p_is_active THEN 'vendor_reactivated' ELSE 'vendor_suspended' END,
    'vendors',
    p_vendor_id,
    jsonb_build_object('reason', p_reason)
  );
END
$$;

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
DECLARE
  old_role smallint;
BEGIN
  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Only a platform super administrator can assign university administrators'
      USING ERRCODE = '42501';
  END IF;

  IF p_target_user_id = auth.uid() THEN
    RAISE EXCEPTION 'Administrators cannot assign their own university scope' USING ERRCODE = '42501';
  END IF;

  PERFORM 1 FROM public.universities WHERE id = p_university_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'University does not exist' USING ERRCODE = 'P0002';
  END IF;

  SELECT role_id INTO old_role FROM public.profiles WHERE id = p_target_user_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Target profile does not exist' USING ERRCODE = 'P0002';
  END IF;

  IF old_role NOT IN (2, 7) THEN
    RAISE EXCEPTION 'Assign a dedicated student or university administrator account to a university'
      USING ERRCODE = '22023';
  END IF;

  UPDATE public.profiles SET role_id = 7 WHERE id = p_target_user_id;
  INSERT INTO public.university_admin_memberships (user_id, university_id, is_active, assigned_by, assigned_at, revoked_at)
  VALUES (p_target_user_id, p_university_id, true, auth.uid(), now(), NULL)
  ON CONFLICT (user_id, university_id) DO UPDATE
  SET is_active = true,
      assigned_by = EXCLUDED.assigned_by,
      assigned_at = EXCLUDED.assigned_at,
      revoked_at = NULL,
      updated_at = now();

  IF old_role IS DISTINCT FROM 7 THEN
    INSERT INTO public.role_transition_audit (target_user_id, old_role_id, new_role_id, actor_id, reason)
    VALUES (p_target_user_id, old_role, 7, auth.uid(), p_reason);
  END IF;

  INSERT INTO public.audit_logs (actor_id, target_id, action, entity_type, entity_id, metadata)
  VALUES (
    auth.uid(),
    p_target_user_id,
    'university_administrator_assigned',
    'university_admin_membership',
    p_target_user_id,
    jsonb_build_object('university_id', p_university_id, 'reason', p_reason)
  );
END
$$;

REVOKE ALL ON FUNCTION public.assign_application_role(uuid, smallint, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.set_profile_status(uuid, text, boolean, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.request_vendor_role(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.review_student_verification(uuid, boolean, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.review_vendor_verification(uuid, boolean, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.set_vendor_active(uuid, boolean, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.assign_university_administrator(uuid, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.assign_application_role(uuid, smallint, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_profile_status(uuid, text, boolean, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.request_vendor_role(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.review_student_verification(uuid, boolean, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.review_vendor_verification(uuid, boolean, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_vendor_active(uuid, boolean, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.assign_university_administrator(uuid, uuid, text) TO authenticated;

-- A university administrator receives no platform-wide authority. They are
-- allowed only to update a university to which the membership above applies.
DROP POLICY IF EXISTS admin_insert_universities ON public.universities;
DROP POLICY IF EXISTS staff_insert_universities ON public.universities;
DROP POLICY IF EXISTS admin_update_universities ON public.universities;
DROP POLICY IF EXISTS staff_update_universities ON public.universities;
DROP POLICY IF EXISTS university_admin_update_assigned_university ON public.universities;
CREATE POLICY platform_admin_insert_universities ON public.universities
  FOR INSERT TO authenticated
  WITH CHECK (public.is_super_admin());
CREATE POLICY platform_admin_update_universities ON public.universities
  FOR UPDATE TO authenticated
  USING (public.is_super_admin())
  WITH CHECK (public.is_super_admin());
CREATE POLICY university_admin_update_assigned_university ON public.universities
  FOR UPDATE TO authenticated
  USING (public.can_manage_university(id))
  WITH CHECK (public.can_manage_university(id));

CREATE POLICY university_admin_memberships_select_own ON public.university_admin_memberships
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_super_admin());

CREATE POLICY role_transition_audit_select_own_or_super_admin ON public.role_transition_audit
  FOR SELECT TO authenticated
  USING (target_user_id = auth.uid() OR public.is_super_admin());

-- Locations are no longer globally writable by every authenticated user.
-- Public discovery is limited to university and vendor locations; profile
-- locations stay private to their owner.
DROP POLICY IF EXISTS public_select_locations ON public.locations;
DROP POLICY IF EXISTS public_read_locations ON public.locations;
DROP POLICY IF EXISTS users_insert_locations ON public.locations;
DROP POLICY IF EXISTS users_update_locations ON public.locations;
DROP POLICY IF EXISTS authenticated_read_public_locations ON public.locations;
CREATE POLICY public_read_locations ON public.locations
  FOR SELECT USING (owner_type IN ('vendor', 'university'));
CREATE POLICY users_read_own_profile_locations ON public.locations
  FOR SELECT TO authenticated USING (owner_type = 'profile' AND owner_id = auth.uid());
CREATE POLICY users_insert_authorized_locations ON public.locations
  FOR INSERT TO authenticated
  WITH CHECK (
    (owner_type = 'profile' AND owner_id = auth.uid())
    OR (owner_type = 'vendor' AND EXISTS (
      SELECT 1 FROM public.vendors vendor WHERE vendor.id = owner_id AND vendor.owner_id = auth.uid()
    ))
    OR (owner_type = 'university' AND owner_id = university_id AND public.can_manage_university(university_id))
  );
CREATE POLICY users_update_authorized_locations ON public.locations
  FOR UPDATE TO authenticated
  USING (
    (owner_type = 'profile' AND owner_id = auth.uid())
    OR (owner_type = 'vendor' AND EXISTS (
      SELECT 1 FROM public.vendors vendor WHERE vendor.id = owner_id AND vendor.owner_id = auth.uid()
    ))
    OR (owner_type = 'university' AND owner_id = university_id AND public.can_manage_university(university_id))
  )
  WITH CHECK (
    (owner_type = 'profile' AND owner_id = auth.uid())
    OR (owner_type = 'vendor' AND EXISTS (
      SELECT 1 FROM public.vendors vendor WHERE vendor.id = owner_id AND vendor.owner_id = auth.uid()
    ))
    OR (owner_type = 'university' AND owner_id = university_id AND public.can_manage_university(university_id))
  );

COMMIT;
