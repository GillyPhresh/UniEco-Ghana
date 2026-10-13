-- Read-only student operations directory with DB-derived tenant scope.
-- Restricted academic identifiers and private verification paths are omitted.
BEGIN;

CREATE INDEX IF NOT EXISTS profiles_student_directory_idx
  ON public.profiles (role_id, created_at DESC, id);
CREATE INDEX IF NOT EXISTS profiles_student_name_trgm_idx
  ON public.profiles USING gin (lower(full_name) gin_trgm_ops)
  WHERE role_id IN (2, 3);
CREATE INDEX IF NOT EXISTS student_profiles_directory_scope_idx
  ON public.student_profiles (university_id, user_id);
CREATE INDEX IF NOT EXISTS support_tickets_student_status_idx
  ON public.support_tickets (user_id, status);
CREATE INDEX IF NOT EXISTS account_restrictions_active_student_idx
  ON public.account_restrictions (user_id, ends_at)
  WHERE is_active;

CREATE OR REPLACE FUNCTION public.get_admin_student_directory(
  p_search text DEFAULT NULL,
  p_verification_status text DEFAULT 'all',
  p_account_status text DEFAULT 'all',
  p_limit integer DEFAULT 25,
  p_offset integer DEFAULT 0
)
RETURNS TABLE (
  student_id uuid,
  full_name text,
  university_id uuid,
  university_name text,
  role_name text,
  verification_status text,
  account_status text,
  is_active boolean,
  vendor_status text,
  total_orders bigint,
  completed_orders bigint,
  unresolved_support_tickets bigint,
  active_account_flags bigint,
  registered_at timestamptz,
  total_count bigint
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_role text := public.current_app_role();
  v_search text := NULLIF(lower(btrim(COALESCE(p_search, ''))), '');
  v_search_pattern text;
  v_verification text := COALESCE(NULLIF(btrim(p_verification_status), ''), 'all');
  v_account_status text := COALESCE(NULLIF(btrim(p_account_status), ''), 'all');
  v_limit integer := COALESCE(p_limit, 25);
  v_offset integer := COALESCE(p_offset, 0);
BEGIN
  IF auth.uid() IS NULL OR v_role IS NULL OR v_role NOT IN ('super_admin', 'university_admin') THEN
    RAISE EXCEPTION 'Student directory access required' USING ERRCODE = '42501';
  END IF;
  IF v_search IS NOT NULL AND length(v_search) NOT BETWEEN 3 AND 100 THEN
    RAISE EXCEPTION 'Search must be between 3 and 100 characters' USING ERRCODE = '22023';
  END IF;
  IF v_search IS NOT NULL THEN
    v_search_pattern := '%' || replace(replace(replace(v_search, E'\\', E'\\\\'), '%', E'\\%'), '_', E'\\_') || '%';
  END IF;
  IF v_verification NOT IN ('all', 'unsubmitted', 'pending', 'verified', 'rejected') THEN
    RAISE EXCEPTION 'Invalid verification filter' USING ERRCODE = '22023';
  END IF;
  IF v_account_status NOT IN ('all', 'active', 'suspended', 'inactive', 'pending') THEN
    RAISE EXCEPTION 'Invalid account status filter' USING ERRCODE = '22023';
  END IF;
  IF v_limit NOT BETWEEN 1 AND 100 OR v_offset NOT BETWEEN 0 AND 10000 THEN
    RAISE EXCEPTION 'Invalid student page range' USING ERRCODE = '22023';
  END IF;

  RETURN QUERY
  WITH students AS (
    SELECT profile.id,
      profile.full_name,
      profile.university_id AS profile_university_id,
      COALESCE(student.university_id, profile.university_id) AS university_id,
      CASE WHEN NOT profile.is_active AND profile.status = 'active' THEN 'inactive' ELSE profile.status END AS account_status,
      profile.is_active,
      profile.created_at,
      role.name AS role_name,
      CASE
        WHEN student.user_id IS NULL THEN 'unsubmitted'
        WHEN student.is_verified_student THEN 'verified'
        ELSE COALESCE(NULLIF(student.verification_status, ''), 'pending')
      END AS verification_status
    FROM public.profiles AS profile
    JOIN public.user_roles AS role ON role.id = profile.role_id
    LEFT JOIN public.student_profiles AS student ON student.user_id = profile.id
    WHERE role.name IN ('student', 'student_vendor')
      AND (v_role = 'super_admin' OR public.can_manage_university(COALESCE(student.university_id, profile.university_id)))
  ), filtered_students AS (
    SELECT student.*
    FROM students AS student
    WHERE (v_search_pattern IS NULL OR lower(student.full_name) LIKE v_search_pattern ESCAPE E'\\')
      AND (v_verification = 'all' OR student.verification_status = v_verification)
      AND (v_account_status = 'all' OR student.account_status = v_account_status)
  ), order_activity AS (
    SELECT order_row.buyer_id, count(*) AS total_orders,
      count(*) FILTER (WHERE order_row.status = 'completed') AS completed_orders
    FROM public.orders AS order_row
    JOIN filtered_students AS student ON student.id = order_row.buyer_id
    GROUP BY order_row.buyer_id
  ), support_activity AS (
    SELECT ticket.user_id, count(*) AS unresolved_support_tickets
    FROM public.support_tickets AS ticket
    JOIN filtered_students AS student ON student.id = ticket.user_id
    WHERE ticket.status NOT IN ('resolved', 'closed')
    GROUP BY ticket.user_id
  ), active_flags AS (
    SELECT restriction.user_id, count(*) AS active_account_flags
    FROM public.account_restrictions AS restriction
    JOIN filtered_students AS student ON student.id = restriction.user_id
    WHERE restriction.is_active AND (restriction.ends_at IS NULL OR restriction.ends_at > now())
    GROUP BY restriction.user_id
  ), vendor_activity AS (
    SELECT vendor.owner_id,
      CASE WHEN bool_or(vendor.is_active) THEN 'active' ELSE 'inactive' END AS vendor_status
    FROM public.vendors AS vendor
    JOIN filtered_students AS student ON student.id = vendor.owner_id
    GROUP BY vendor.owner_id
  )
  SELECT student.id,
    student.full_name,
    student.university_id,
    university.name,
    student.role_name,
    student.verification_status,
    student.account_status,
    student.is_active,
    vendor.vendor_status,
    COALESCE(orders.total_orders, 0),
    COALESCE(orders.completed_orders, 0),
    COALESCE(support.unresolved_support_tickets, 0),
    COALESCE(flags.active_account_flags, 0),
    student.created_at,
    count(*) OVER ()
  FROM filtered_students AS student
  LEFT JOIN public.universities AS university ON university.id = student.university_id
  LEFT JOIN order_activity AS orders ON orders.buyer_id = student.id
  LEFT JOIN support_activity AS support ON support.user_id = student.id
  LEFT JOIN active_flags AS flags ON flags.user_id = student.id
  LEFT JOIN vendor_activity AS vendor ON vendor.owner_id = student.id
  ORDER BY student.created_at DESC, student.id DESC
  LIMIT v_limit OFFSET v_offset;
END;
$$;

REVOKE ALL ON FUNCTION public.get_admin_student_directory(text,text,text,integer,integer) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_admin_student_directory(text,text,text,integer,integer) TO authenticated;

COMMIT;
