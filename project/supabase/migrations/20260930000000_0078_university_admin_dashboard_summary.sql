-- A separate overview for university administrators. Tenant scope is derived
-- exclusively from active memberships; no caller-supplied university is trusted.
BEGIN;

CREATE OR REPLACE FUNCTION public.get_admin_university_control_center_summary(p_days integer DEFAULT 30)
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
  IF auth.uid() IS NULL OR public.current_app_role() IS DISTINCT FROM 'university_admin' THEN
    RAISE EXCEPTION 'University administrator access required' USING ERRCODE = '42501';
  END IF;
  IF p_days IS NULL OR p_days NOT BETWEEN 7 AND 90 THEN
    RAISE EXCEPTION 'Analytics period must be between 7 and 90 days' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM public.university_admin_memberships membership
    WHERE membership.user_id = auth.uid()
      AND membership.is_active
      AND public.can_manage_university(membership.university_id)
  ) THEN
    RAISE EXCEPTION 'No active university administration scope' USING ERRCODE = '42501';
  END IF;

  v_first_day := v_today - (p_days - 1);
  WITH scoped_universities AS MATERIALIZED (
    SELECT university.id, university.name
    FROM public.university_admin_memberships membership
    JOIN public.universities university ON university.id = membership.university_id
    WHERE membership.user_id = auth.uid()
      AND membership.is_active
      AND public.can_manage_university(university.id)
  )
  SELECT jsonb_build_object(
    'stats', jsonb_build_object(
      'universities', (SELECT count(*) FROM scoped_universities),
      'students', (
        SELECT count(*)
        FROM public.profiles profile
        JOIN public.user_roles role ON role.id = profile.role_id
        LEFT JOIN public.student_profiles student ON student.user_id = profile.id
        WHERE role.name IN ('student', 'student_vendor')
          AND EXISTS (SELECT 1 FROM scoped_universities university
            WHERE university.id = COALESCE(student.university_id, profile.university_id))
      ),
      'activeStudents', (
        SELECT count(*)
        FROM public.profiles profile
        JOIN public.user_roles role ON role.id = profile.role_id
        LEFT JOIN public.student_profiles student ON student.user_id = profile.id
        WHERE role.name IN ('student', 'student_vendor')
          AND profile.is_active
          AND EXISTS (SELECT 1 FROM scoped_universities university
            WHERE university.id = COALESCE(student.university_id, profile.university_id))
      ),
      'verifiedStudents', (
        SELECT count(*)
        FROM public.student_profiles student
        JOIN public.profiles profile ON profile.id = student.user_id
        WHERE student.is_verified_student
          AND EXISTS (SELECT 1 FROM scoped_universities university
            WHERE university.id = COALESCE(student.university_id, profile.university_id))
      ),
      'studentVendors', (
        SELECT count(*) FROM public.vendors vendor
        WHERE vendor.is_student_business
          AND EXISTS (SELECT 1 FROM scoped_universities university WHERE university.id = vendor.university_id)
      ),
      'externalVendors', (
        SELECT count(*) FROM public.vendors vendor
        WHERE NOT vendor.is_student_business
          AND EXISTS (SELECT 1 FROM scoped_universities university WHERE university.id = vendor.university_id)
      ),
      'activeVendors', (
        SELECT count(*) FROM public.vendors vendor
        WHERE vendor.is_active
          AND EXISTS (SELECT 1 FROM scoped_universities university WHERE university.id = vendor.university_id)
      ),
      'businesses', (
        SELECT count(*)
        FROM public.businesses business
        JOIN public.vendors vendor ON vendor.id = business.vendor_id
        WHERE EXISTS (SELECT 1 FROM scoped_universities university
          WHERE university.id = COALESCE(business.university_id, vendor.university_id))
      ),
      'activeBusinesses', (
        SELECT count(*)
        FROM public.businesses business
        JOIN public.vendors vendor ON vendor.id = business.vendor_id
        WHERE business.is_active
          AND EXISTS (SELECT 1 FROM scoped_universities university
            WHERE university.id = COALESCE(business.university_id, vendor.university_id))
      ),
      'products', (
        SELECT count(*)
        FROM public.products product
        JOIN public.businesses business ON business.id = product.business_id
        JOIN public.vendors vendor ON vendor.id = business.vendor_id
        WHERE EXISTS (SELECT 1 FROM scoped_universities university
          WHERE university.id = COALESCE(product.university_id, business.university_id, vendor.university_id))
      ),
      'activeProducts', (
        SELECT count(*)
        FROM public.products product
        JOIN public.businesses business ON business.id = product.business_id
        JOIN public.vendors vendor ON vendor.id = business.vendor_id
        WHERE product.is_active AND NOT product.is_archived
          AND EXISTS (SELECT 1 FROM scoped_universities university
            WHERE university.id = COALESCE(product.university_id, business.university_id, vendor.university_id))
      ),
      'services', (
        SELECT count(*)
        FROM public.services service
        JOIN public.businesses business ON business.id = service.business_id
        JOIN public.vendors vendor ON vendor.id = business.vendor_id
        WHERE EXISTS (SELECT 1 FROM scoped_universities university
          WHERE university.id = COALESCE(service.university_id, business.university_id, vendor.university_id))
      ),
      'activeServices', (
        SELECT count(*)
        FROM public.services service
        JOIN public.businesses business ON business.id = service.business_id
        JOIN public.vendors vendor ON vendor.id = business.vendor_id
        WHERE service.is_active AND NOT service.is_archived
          AND EXISTS (SELECT 1 FROM scoped_universities university
            WHERE university.id = COALESCE(service.university_id, business.university_id, vendor.university_id))
      ),
      'orders', (
        SELECT count(*) FROM public.orders orders
        LEFT JOIN public.vendors vendor ON vendor.id = orders.vendor_id
        WHERE EXISTS (SELECT 1 FROM scoped_universities university
          WHERE university.id = COALESCE(orders.university_id, vendor.university_id))
      ),
      'ordersToday', (
        SELECT count(*) FROM public.orders orders
        LEFT JOIN public.vendors vendor ON vendor.id = orders.vendor_id
        WHERE orders.created_at >= v_today::timestamptz
          AND orders.created_at < (v_today + 1)::timestamptz
          AND EXISTS (SELECT 1 FROM scoped_universities university
            WHERE university.id = COALESCE(orders.university_id, vendor.university_id))
      ),
      'ordersThisMonth', (
        SELECT count(*) FROM public.orders orders
        LEFT JOIN public.vendors vendor ON vendor.id = orders.vendor_id
        WHERE orders.created_at >= date_trunc('month', now())
          AND EXISTS (SELECT 1 FROM scoped_universities university
            WHERE university.id = COALESCE(orders.university_id, vendor.university_id))
      ),
      'pendingOrders', (
        SELECT count(*) FROM public.orders orders
        LEFT JOIN public.vendors vendor ON vendor.id = orders.vendor_id
        WHERE orders.status IN ('pending', 'confirmed', 'processing', 'ready')
          AND EXISTS (SELECT 1 FROM scoped_universities university
            WHERE university.id = COALESCE(orders.university_id, vendor.university_id))
      ),
      'completedOrders', (
        SELECT count(*) FROM public.orders orders
        LEFT JOIN public.vendors vendor ON vendor.id = orders.vendor_id
        WHERE orders.status = 'completed'
          AND EXISTS (SELECT 1 FROM scoped_universities university
            WHERE university.id = COALESCE(orders.university_id, vendor.university_id))
      ),
      'events', (
        SELECT count(*) FROM public.events event
        WHERE EXISTS (SELECT 1 FROM scoped_universities university WHERE university.id = event.university_id)
      ),
      'pendingVendorVerification', (
        SELECT count(*)
        FROM public.vendor_profiles profile
        JOIN public.vendors vendor ON vendor.owner_id = profile.profile_id
        WHERE profile.verification_status = 'pending'
          AND EXISTS (SELECT 1 FROM scoped_universities university WHERE university.id = vendor.university_id)
      ),
      'unresolvedSupportTickets', (
        SELECT count(*)
        FROM public.support_tickets ticket
        JOIN public.profiles requester ON requester.id = ticket.user_id
        LEFT JOIN public.student_profiles student ON student.user_id = requester.id
        WHERE ticket.status IN ('open', 'assigned', 'in_progress')
          AND EXISTS (SELECT 1 FROM scoped_universities university
            WHERE university.id = COALESCE(student.university_id, requester.university_id))
      )
    ),
    'registrationTrend', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('date', to_char(day.day, 'YYYY-MM-DD'), 'count', COALESCE(registrations.count, 0)) ORDER BY day.day)
      FROM generate_series(v_first_day::timestamp, v_today::timestamp, interval '1 day') day(day)
      LEFT JOIN (
        SELECT profile.created_at::date AS day, count(*) AS count
        FROM public.profiles profile
        JOIN public.user_roles role ON role.id = profile.role_id
        LEFT JOIN public.student_profiles student ON student.user_id = profile.id
        WHERE role.name IN ('student', 'student_vendor')
          AND profile.created_at >= v_first_day::timestamptz
          AND profile.created_at < (v_today + 1)::timestamptz
          AND EXISTS (SELECT 1 FROM scoped_universities university
            WHERE university.id = COALESCE(student.university_id, profile.university_id))
        GROUP BY profile.created_at::date
      ) registrations ON registrations.day = day.day::date
    ), '[]'::jsonb),
    'orderTrend', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('date', to_char(day.day, 'YYYY-MM-DD'), 'count', COALESCE(orders.count, 0)) ORDER BY day.day)
      FROM generate_series(v_first_day::timestamp, v_today::timestamp, interval '1 day') day(day)
      LEFT JOIN (
        SELECT order_record.created_at::date AS day, count(*) AS count
        FROM public.orders order_record
        LEFT JOIN public.vendors vendor ON vendor.id = order_record.vendor_id
        WHERE order_record.created_at >= v_first_day::timestamptz
          AND order_record.created_at < (v_today + 1)::timestamptz
          AND EXISTS (SELECT 1 FROM scoped_universities university
            WHERE university.id = COALESCE(order_record.university_id, vendor.university_id))
        GROUP BY order_record.created_at::date
      ) orders ON orders.day = day.day::date
    ), '[]'::jsonb),
    'businessCategories', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('category', grouped.category, 'count', grouped.count) ORDER BY grouped.count DESC, grouped.category)
      FROM (
        SELECT COALESCE(NULLIF(trim(business.category), ''), 'Uncategorized') AS category, count(*) AS count
        FROM public.businesses business
        JOIN public.vendors vendor ON vendor.id = business.vendor_id
        WHERE business.is_active
          AND EXISTS (SELECT 1 FROM scoped_universities university
            WHERE university.id = COALESCE(business.university_id, vendor.university_id))
        GROUP BY COALESCE(NULLIF(trim(business.category), ''), 'Uncategorized')
      ) grouped
    ), '[]'::jsonb),
    'universityActivity', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('name', university.name, 'students', university_metrics.students,
        'vendors', university_metrics.vendors, 'businesses', university_metrics.businesses)
        ORDER BY university.name)
      FROM (
        SELECT university.id, university.name,
          (SELECT count(*) FROM public.profiles profile
            JOIN public.user_roles role ON role.id = profile.role_id
            LEFT JOIN public.student_profiles student ON student.user_id = profile.id
            WHERE role.name IN ('student', 'student_vendor')
              AND COALESCE(student.university_id, profile.university_id) = university.id) AS students,
          (SELECT count(*) FROM public.vendors vendor WHERE vendor.university_id = university.id) AS vendors,
          (SELECT count(*) FROM public.businesses business JOIN public.vendors vendor ON vendor.id = business.vendor_id
            WHERE COALESCE(business.university_id, vendor.university_id) = university.id) AS businesses
        FROM scoped_universities university
      ) university_metrics
    ), '[]'::jsonb)
  ) INTO v_result;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.get_admin_university_control_center_summary(integer) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_admin_university_control_center_summary(integer) TO authenticated;

COMMIT;
