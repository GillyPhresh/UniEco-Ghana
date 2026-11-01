-- PostgreSQL has no min(uuid) aggregate. Choose an assigned university
-- deterministically instead, preserving the existing authorization checks.
BEGIN;

CREATE OR REPLACE FUNCTION public.get_my_university_admin_dashboard(
  p_university_id uuid DEFAULT NULL,
  p_month_start date DEFAULT date_trunc('month', now())::date
) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $func$
DECLARE
  actor uuid := auth.uid();
  selected_university uuid := p_university_id;
  assignment_ids uuid[];
  result jsonb;
BEGIN
  IF actor IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;
  IF public.is_super_admin() THEN
    IF selected_university IS NULL THEN
      SELECT university_id INTO selected_university
      FROM public.university_admin_assignments
      WHERE status = 'active'
      ORDER BY university_id
      LIMIT 1;
    END IF;
  ELSE
    SELECT array_agg(id), (array_agg(university_id ORDER BY university_id))[1]
    INTO assignment_ids, selected_university
    FROM public.university_admin_assignments
    WHERE user_id = actor AND status = 'active'
      AND (p_university_id IS NULL OR university_id = p_university_id);
    IF assignment_ids IS NULL THEN
      RAISE EXCEPTION 'University administrator access required' USING ERRCODE = '42501';
    END IF;
  END IF;
  IF selected_university IS NULL THEN
    RETURN jsonb_build_object('university_id',NULL,'assignments',0,'current_month',NULL,'monthly_history','[]'::jsonb);
  END IF;
  SELECT jsonb_build_object(
    'university_id', selected_university,
    'assignments', (SELECT count(*) FROM public.university_admin_assignments a WHERE a.university_id=selected_university AND a.status='active'),
    'current_month', jsonb_build_object(
      'month_start', p_month_start,
      'student_count', COALESCE((SELECT sum(e.student_count) FROM public.university_admin_monthly_earnings e WHERE e.university_id=selected_university AND e.month_start=p_month_start),0),
      'vendor_count', COALESCE((SELECT sum(e.vendor_count) FROM public.university_admin_monthly_earnings e WHERE e.university_id=selected_university AND e.month_start=p_month_start),0),
      'qualified_count', COALESCE((SELECT sum(e.qualified_count) FROM public.university_admin_monthly_earnings e WHERE e.university_id=selected_university AND e.month_start=p_month_start),0),
      'amount', COALESCE((SELECT sum(e.amount) FROM public.university_admin_monthly_earnings e WHERE e.university_id=selected_university AND e.month_start=p_month_start),0)
    ),
    'monthly_history', COALESCE((SELECT jsonb_agg(to_jsonb(e) ORDER BY e.month_start DESC) FROM public.university_admin_monthly_earnings e WHERE e.university_id=selected_university AND (public.is_super_admin() OR e.assignment_id=ANY(assignment_ids))),'[]'::jsonb)
  ) INTO result;
  RETURN result;
END $func$;

CREATE OR REPLACE FUNCTION public.get_my_university_admin_score(p_university_id uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $func$
DECLARE
  actor uuid := auth.uid();
  selected_university uuid;
  total_count integer := 0;
  student_count integer := 0;
  vendor_count integer := 0;
  current_month_count integer := 0;
  monthly_rank integer;
  university_admin_count integer;
  achievement text;
  next_milestone integer;
  result jsonb;
BEGIN
  IF actor IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;
  SELECT assignment.university_id INTO selected_university
  FROM public.university_admin_assignments assignment
  WHERE assignment.user_id=actor AND assignment.status IN ('active','suspended')
    AND (p_university_id IS NULL OR assignment.university_id=p_university_id)
  ORDER BY assignment.university_id
  LIMIT 1;
  IF selected_university IS NULL THEN
    RAISE EXCEPTION 'Active university administrator assignment required' USING ERRCODE = '42501';
  END IF;
  SELECT count(*)::integer,
         count(*) FILTER (WHERE registration_type IN ('student','student_vendor'))::integer,
         count(*) FILTER (WHERE registration_type IN ('vendor','student_vendor'))::integer,
         count(*) FILTER (WHERE qualified_at >= date_trunc('month',now()) AND qualified_at < date_trunc('month',now()) + interval '1 month')::integer
  INTO total_count, student_count, vendor_count, current_month_count
  FROM public.university_admin_referrals referral
  JOIN public.university_admin_assignments assignment ON assignment.id=referral.assignment_id
  WHERE assignment.user_id=actor AND assignment.university_id=selected_university AND referral.status='qualified';
  WITH monthly AS (
    SELECT assignment.user_id, count(referral.id)::integer AS qualified_count
    FROM public.university_admin_assignments assignment
    LEFT JOIN public.university_admin_referrals referral
      ON referral.assignment_id=assignment.id
     AND referral.status='qualified'
     AND referral.qualified_at >= date_trunc('month',now())
     AND referral.qualified_at < date_trunc('month',now()) + interval '1 month'
    WHERE assignment.university_id=selected_university AND assignment.status IN ('active','suspended')
    GROUP BY assignment.user_id
  )
  SELECT 1 + count(*) FILTER (WHERE qualified_count > current_month_count), count(*)
  INTO monthly_rank, university_admin_count
  FROM monthly;
  achievement := CASE
    WHEN total_count >= 100 THEN 'UniEco Leader'
    WHEN total_count >= 50 THEN 'Community Builder'
    WHEN total_count >= 25 THEN 'Campus Champion'
    WHEN total_count >= 10 THEN 'Rising Star'
    ELSE 'Getting Started'
  END;
  next_milestone := CASE
    WHEN total_count < 10 THEN 10
    WHEN total_count < 25 THEN 25
    WHEN total_count < 50 THEN 50
    WHEN total_count < 100 THEN 100
    ELSE total_count + 25
  END;
  SELECT jsonb_build_object(
    'university_id',selected_university,
    'points',total_count,
    'qualified_registrations',total_count,
    'students',student_count,
    'vendors',vendor_count,
    'current_month',current_month_count,
    'monthly_rank',monthly_rank,
    'active_admins_in_university',university_admin_count,
    'achievement',achievement,
    'next_milestone',next_milestone,
    'progress_to_next_milestone',LEAST(100,round((total_count::numeric / NULLIF(next_milestone,0))*100)),
    'message',CASE WHEN current_month_count=0 THEN 'Your next verified registration starts your monthly score.' ELSE 'Keep going. Every verified student or vendor you help onboard moves your university community forward.' END,
    'monthly_history',COALESCE((SELECT jsonb_agg(jsonb_build_object('month',month_value,'qualified_registrations',month_count) ORDER BY month_value DESC) FROM (SELECT date_trunc('month',referral.qualified_at)::date AS month_value,count(*)::integer AS month_count FROM public.university_admin_referrals referral JOIN public.university_admin_assignments assignment ON assignment.id=referral.assignment_id WHERE assignment.user_id=actor AND assignment.university_id=selected_university AND referral.status='qualified' GROUP BY date_trunc('month',referral.qualified_at)::date ORDER BY month_value DESC LIMIT 6) history),'[]'::jsonb)
  ) INTO result;
  RETURN result;
END $func$;

CREATE OR REPLACE FUNCTION public.get_my_university_admin_earnings(p_university_id uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $func$
DECLARE
  actor uuid := auth.uid();
  selected_university uuid;
  assignment_ids uuid[];
  rate numeric(12,2);
  student_total integer;
  vendor_total integer;
  qualified_total integer;
  past_rows jsonb;
BEGIN
  IF actor IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;
  SELECT assignment.university_id INTO selected_university
  FROM public.university_admin_assignments assignment
  WHERE assignment.user_id=actor AND assignment.status='active'
    AND (p_university_id IS NULL OR assignment.university_id=p_university_id)
  ORDER BY assignment.university_id, assignment.id
  LIMIT 1;
  IF selected_university IS NULL THEN
    RAISE EXCEPTION 'Active university administrator assignment required' USING ERRCODE = '42501';
  END IF;
  SELECT array_agg(id) INTO assignment_ids
  FROM public.university_admin_assignments
  WHERE user_id=actor AND status='active' AND university_id=selected_university;
  SELECT rate_per_qualified_registration INTO rate
  FROM public.university_admin_compensation_settings WHERE singleton;
  SELECT
    count(*) FILTER (WHERE registration_type IN ('student','student_vendor'))::integer,
    count(*) FILTER (WHERE registration_type IN ('vendor','student_vendor'))::integer,
    count(*)::integer
  INTO student_total,vendor_total,qualified_total
  FROM public.university_admin_referrals referral
  WHERE referral.assignment_id=ANY(assignment_ids)
    AND referral.status='qualified'
    AND referral.qualified_at >= date_trunc('month',now())
    AND referral.qualified_at < date_trunc('month',now()) + interval '1 month';
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'month_start',earning.month_start,
    'qualified_count',earning.qualified_count,
    'student_count',earning.student_count,
    'vendor_count',earning.vendor_count,
    'rate_per_registration',earning.rate_per_registration,
    'amount',earning.amount,
    'currency',earning.currency,
    'status',earning.status,
    'payout_reference',earning.payout_reference,
    'paid_at',earning.paid_at
  ) ORDER BY earning.month_start DESC),'[]'::jsonb)
  INTO past_rows
  FROM public.university_admin_monthly_earnings earning
  WHERE earning.assignment_id=ANY(assignment_ids);
  RETURN jsonb_build_object(
    'university_id',selected_university,
    'month_start',date_trunc('month',now())::date,
    'student_count',COALESCE(student_total,0),
    'vendor_count',COALESCE(vendor_total,0),
    'qualified_count',COALESCE(qualified_total,0),
    'rate_per_registration',COALESCE(rate,0),
    'estimated_amount',round(COALESCE(qualified_total,0)*COALESCE(rate,0),2),
    'currency','GHS',
    'rate_configured',COALESCE(rate,0)>0,
    'history',past_rows
  );
END $func$;

GRANT EXECUTE ON FUNCTION public.get_my_university_admin_dashboard(uuid,date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_university_admin_score(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_university_admin_earnings(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.get_my_university_admin_dashboard(uuid,date) FROM PUBLIC, anon, service_role;
REVOKE ALL ON FUNCTION public.get_my_university_admin_score(uuid) FROM PUBLIC, anon, service_role;
REVOKE ALL ON FUNCTION public.get_my_university_admin_earnings(uuid) FROM PUBLIC, anon, service_role;

COMMIT;
