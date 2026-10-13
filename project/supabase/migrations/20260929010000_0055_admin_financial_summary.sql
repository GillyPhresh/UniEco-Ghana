-- Finance dashboard data is aggregated inside PostgreSQL and is visible only
-- to platform super administrators. No transaction-level rows reach the UI.
BEGIN;

CREATE OR REPLACE FUNCTION public.get_admin_financial_summary()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_start_month timestamptz := date_trunc('month', now()) - interval '11 months';
  v_month_start timestamptz := date_trunc('month', now());
  v_day_start timestamptz := date_trunc('day', now());
  v_result jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Super administrator access required' USING ERRCODE = '42501';
  END IF;

  SELECT jsonb_build_object(
    'totalRevenue', COALESCE((SELECT sum(p.amount) FROM public.payments p WHERE p.status='success' AND p.currency='GHS'), 0),
    'monthlyRevenue', COALESCE((SELECT sum(p.amount) FROM public.payments p WHERE p.status='success' AND p.currency='GHS' AND p.paid_at >= v_month_start AND p.paid_at < v_month_start + interval '1 month'), 0),
    'dailyRevenue', COALESCE((SELECT sum(p.amount) FROM public.payments p WHERE p.status='success' AND p.currency='GHS' AND p.paid_at >= v_day_start AND p.paid_at < v_day_start + interval '1 day'), 0),
    'subscriptionRevenue', COALESCE((SELECT sum(p.amount) FROM public.payments p WHERE p.status='success' AND p.currency='GHS' AND p.payment_type='subscription'), 0),
    'adRevenue', COALESCE((SELECT sum(p.amount) FROM public.payments p WHERE p.status='success' AND p.currency='GHS' AND p.payment_type IN ('advertisement','advertising')), 0),
    'marketplaceRevenue', COALESCE((SELECT sum(p.amount) FROM public.payments p WHERE p.status='success' AND p.currency='GHS' AND p.payment_type='marketplace'), 0),
    'failedPayments', (SELECT count(*) FROM public.payments p WHERE p.status='failed'),
    'outstandingPayments', (SELECT count(*) FROM public.payments p WHERE p.status IN ('pending','initiated')),
    'pendingRefunds', (SELECT count(*) FROM public.refunds r WHERE r.status='requested' AND r.currency='GHS'),
    'monthlyData', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('month', to_char(m.month_start, 'Mon YY'), 'revenue', COALESCE(p.revenue, 0)) ORDER BY m.month_start)
      FROM generate_series(v_start_month, v_month_start, interval '1 month') AS m(month_start)
      LEFT JOIN (
        SELECT date_trunc('month', paid_at) AS month_start, sum(amount) AS revenue
        FROM public.payments
        WHERE status='success' AND currency='GHS' AND paid_at >= v_start_month AND paid_at < v_month_start + interval '1 month'
        GROUP BY date_trunc('month', paid_at)
      ) p USING (month_start)
    ), '[]'::jsonb),
    'revenueByType', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('type', initcap(replace(payment_type, '_', ' ')), 'revenue', revenue) ORDER BY payment_type)
      FROM (SELECT payment_type, sum(amount) AS revenue FROM public.payments WHERE status='success' AND currency='GHS' GROUP BY payment_type) grouped_types
    ), '[]'::jsonb),
    'universityRevenue', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('name', university_name, 'revenue', revenue, 'count', payment_count) ORDER BY revenue DESC, university_name)
      FROM (
        SELECT COALESCE(u.name, 'Unassigned') AS university_name, sum(p.amount) AS revenue, count(*) AS payment_count
        FROM public.payments p
        LEFT JOIN public.orders o ON o.id=p.order_id
        LEFT JOIN public.vendors v ON v.id=COALESCE(p.vendor_id,o.vendor_id)
        LEFT JOIN public.universities u ON u.id=v.university_id
        WHERE p.status='success' AND p.currency='GHS'
        GROUP BY COALESCE(u.name, 'Unassigned')
      ) grouped_universities
    ), '[]'::jsonb)
  ) INTO v_result;

  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.export_admin_financial_summary()
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE v_result jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Super administrator access required' USING ERRCODE = '42501';
  END IF;
  v_result := public.get_admin_financial_summary();
  PERFORM public.record_trusted_admin_action(
    'financial.export', 'financial', 'financial_summary', NULL,
    jsonb_build_object('currency', 'GHS', 'format', 'csv')
  );
  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.get_admin_financial_summary() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.export_admin_financial_summary() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_admin_financial_summary() TO authenticated;
GRANT EXECUTE ON FUNCTION public.export_admin_financial_summary() TO authenticated;

COMMIT;
