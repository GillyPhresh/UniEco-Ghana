-- Let active, assigned university administrators participate in the campus
-- community as members, without granting them moderation or platform-admin powers.
BEGIN;

CREATE OR REPLACE FUNCTION public.can_publish_campus_community(p_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT p_user_id IS NOT NULL AND EXISTS (
    SELECT 1
    FROM public.profiles AS profile
    JOIN public.user_roles AS role ON role.id = profile.role_id
    WHERE profile.id = p_user_id
      AND profile.is_active AND profile.status = 'active'
      AND NOT EXISTS (
        SELECT 1 FROM public.account_restrictions AS restriction
        WHERE restriction.user_id = profile.id AND restriction.is_active
          AND (restriction.ends_at IS NULL OR restriction.ends_at > now())
      )
      AND (
        (role.name = 'university_admin' AND EXISTS (
          SELECT 1 FROM public.university_admin_assignments AS assignment
          WHERE assignment.user_id = profile.id AND assignment.status = 'active'
        ))
        OR (role.name = 'student' AND EXISTS (
          SELECT 1 FROM public.student_profiles AS student
          WHERE student.user_id = profile.id AND student.is_verified_student
            AND student.verification_status = 'verified'
        ))
        OR (role.name = 'student_vendor' AND (
          EXISTS (
            SELECT 1 FROM public.student_profiles AS student
            WHERE student.user_id = profile.id AND student.is_verified_student
              AND student.verification_status = 'verified'
          ) OR EXISTS (
            SELECT 1 FROM public.vendors AS vendor
            WHERE vendor.owner_id = profile.id AND vendor.is_active
              AND vendor.verification_status IN ('active', 'verified')
          )
        ))
        OR (role.name = 'external_vendor' AND EXISTS (
          SELECT 1 FROM public.vendors AS vendor
          WHERE vendor.owner_id = profile.id AND vendor.is_active
            AND vendor.verification_status IN ('active', 'verified')
        ))
      )
  )
$$;

CREATE OR REPLACE FUNCTION public.can_use_campus_community(p_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT p_user_id IS NOT NULL AND EXISTS (
    SELECT 1
    FROM public.profiles AS profile
    JOIN public.user_roles AS role ON role.id = profile.role_id
    WHERE profile.id = p_user_id
      AND profile.is_active AND profile.status = 'active'
      AND (
        role.name IN ('student', 'student_vendor', 'external_vendor')
        OR (role.name = 'university_admin' AND EXISTS (
          SELECT 1 FROM public.university_admin_assignments AS assignment
          WHERE assignment.user_id = profile.id AND assignment.status = 'active'
        ))
      )
      AND NOT EXISTS (
        SELECT 1 FROM public.account_restrictions AS restriction
        WHERE restriction.user_id = profile.id AND restriction.is_active
          AND (restriction.ends_at IS NULL OR restriction.ends_at > now())
      )
  )
$$;

CREATE OR REPLACE FUNCTION public.can_upload_campus_community_media()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles AS profile
    JOIN public.user_roles AS role ON role.id = profile.role_id
    WHERE profile.id = auth.uid()
      AND profile.is_active AND profile.status = 'active'
      AND (
        role.name IN ('student', 'student_vendor', 'external_vendor')
        OR (role.name = 'university_admin' AND EXISTS (
          SELECT 1 FROM public.university_admin_assignments AS assignment
          WHERE assignment.user_id = profile.id AND assignment.status = 'active'
        ))
      )
      AND NOT EXISTS (
        SELECT 1 FROM public.account_restrictions AS restriction
        WHERE restriction.user_id = profile.id AND restriction.is_active
          AND (restriction.ends_at IS NULL OR restriction.ends_at > now())
      )
  )
$$;

REVOKE ALL ON FUNCTION public.can_publish_campus_community(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.can_use_campus_community(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.can_upload_campus_community_media() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_publish_campus_community(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.can_use_campus_community(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.can_upload_campus_community_media() TO authenticated, service_role;

COMMIT;
