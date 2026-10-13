-- Server-side, aggregate-only data for the platform control-center overview.
-- This is platform-wide operational data and is intentionally super-admin only.
BEGIN;

CREATE OR REPLACE FUNCTION public.get_admin_control_center_summary(p_days integer DEFAULT 30)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_today date := current_date;
  v_first_day date;
  v_result jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Super administrator access required' USING ERRCODE = '42501';
  END IF;
  IF p_days NOT BETWEEN 7 AND 90 THEN
    RAISE EXCEPTION 'Analytics period must be between 7 and 90 days' USING ERRCODE = '22023';
  END IF;

  v_first_day := v_today - (p_days - 1);
  SELECT jsonb_build_object(
    'stats', jsonb_build_object(
      'totalUsers', (SELECT count(*) FROM public.profiles),
      'verifiedStudents', (SELECT count(*) FROM public.student_profiles WHERE is_verified_student),
      'studentVendors', (SELECT count(*) FROM public.vendors WHERE is_student_business),
      'externalVendors', (SELECT count(*) FROM public.vendors WHERE NOT is_student_business),
      'businesses', (SELECT count(*) FROM public.businesses),
      'products', (SELECT count(*) FROM public.products),
      'activeProducts', (SELECT count(*) FROM public.products WHERE is_active AND NOT is_archived),
      'services', (SELECT count(*) FROM public.services),
      'activeServices', (SELECT count(*) FROM public.services WHERE is_active AND NOT is_archived),
      'orders', (SELECT count(*) FROM public.orders),
      'ordersToday', (SELECT count(*) FROM public.orders WHERE created_at >= v_today::timestamptz AND created_at < (v_today + 1)::timestamptz),
      'ordersThisWeek', (SELECT count(*) FROM public.orders WHERE created_at >= date_trunc('week', now())),
      'ordersThisMonth', (SELECT count(*) FROM public.orders WHERE created_at >= date_trunc('month', now())),
      'pendingOrders', (SELECT count(*) FROM public.orders WHERE status IN ('pending','confirmed','processing','ready')),
      'completedOrders', (SELECT count(*) FROM public.orders WHERE status='completed'),
      'cancelledOrders', (SELECT count(*) FROM public.orders WHERE status='cancelled'),
      'universities', (SELECT count(*) FROM public.universities),
      'activeUniversities', (SELECT count(*) FROM public.universities WHERE is_enabled),
      'events', (SELECT count(*) FROM public.events),
      'activeSubscriptions', (SELECT count(*) FROM public.subscriptions WHERE status='active'),
      'pendingVendorVerification', (SELECT count(*) FROM public.vendor_profiles WHERE verification_status='pending'),
      'pendingAdApprovals', (SELECT count(*) FROM public.advertisements WHERE status='pending'),
      'unresolvedSupportTickets', (SELECT count(*) FROM public.support_tickets WHERE status IN ('open','assigned','in_progress'))
    ),
    'registrationTrend', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('date', to_char(d.day, 'YYYY-MM-DD'), 'count', COALESCE(p.count, 0)) ORDER BY d.day)
      FROM generate_series(v_first_day::timestamp, v_today::timestamp, interval '1 day') AS d(day)
      LEFT JOIN (SELECT created_at::date AS day, count(*) AS count FROM public.profiles WHERE created_at >= v_first_day::timestamptz AND created_at < (v_today + 1)::timestamptz GROUP BY created_at::date) p ON p.day=d.day::date
    ), '[]'::jsonb),
    'orderTrend', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('date', to_char(d.day, 'YYYY-MM-DD'), 'count', COALESCE(o.count, 0)) ORDER BY d.day)
      FROM generate_series(v_first_day::timestamp, v_today::timestamp, interval '1 day') AS d(day)
      LEFT JOIN (SELECT created_at::date AS day, count(*) AS count FROM public.orders WHERE created_at >= v_first_day::timestamptz AND created_at < (v_today + 1)::timestamptz GROUP BY created_at::date) o ON o.day=d.day::date
    ), '[]'::jsonb),
    'businessCategories', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('category', category_name, 'count', category_count) ORDER BY category_count DESC, category_name)
      FROM (SELECT COALESCE(NULLIF(trim(category), ''), 'Uncategorized') AS category_name, count(*) AS category_count FROM public.businesses WHERE is_active GROUP BY COALESCE(NULLIF(trim(category), ''), 'Uncategorized')) c
    ), '[]'::jsonb),
    'universityGrowth', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('name', u.name, 'students', COALESCE(s.student_count, 0), 'vendors', COALESCE(v.vendor_count, 0), 'businesses', COALESCE(b.business_count, 0)) ORDER BY u.name)
      FROM public.universities u
      LEFT JOIN (SELECT university_id, count(*) AS student_count FROM public.profiles WHERE role_id IN (2,3) GROUP BY university_id) s ON s.university_id=u.id
      LEFT JOIN (SELECT university_id, count(*) AS vendor_count FROM public.vendors GROUP BY university_id) v ON v.university_id=u.id
      LEFT JOIN (SELECT COALESCE(business.university_id, vendor.university_id) AS university_id, count(*) AS business_count FROM public.businesses business JOIN public.vendors vendor ON vendor.id=business.vendor_id GROUP BY COALESCE(business.university_id, vendor.university_id)) b ON b.university_id=u.id
    ), '[]'::jsonb)
  ) INTO v_result;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.get_admin_control_center_summary(integer) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_admin_control_center_summary(integer) TO authenticated;

COMMIT;
