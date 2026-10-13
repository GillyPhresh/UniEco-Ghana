-- Complete the moderator's permission-scoped operations home and alert counts.
BEGIN;

CREATE INDEX IF NOT EXISTS advertisements_pending_created_alert_idx
  ON public.advertisements (status, created_at DESC)
  WHERE status = 'pending';

CREATE OR REPLACE FUNCTION public.get_admin_operational_alerts()
RETURNS TABLE(
  alert_key text,
  severity text,
  affected_count bigint,
  window_start timestamptz
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_role text := public.current_app_role();
BEGIN
  IF auth.uid() IS NULL OR v_role IS NULL OR v_role NOT IN ('super_admin', 'university_admin', 'moderator') THEN
    RAISE EXCEPTION 'Operational alert access required' USING ERRCODE = '42501';
  END IF;
  IF v_role = 'university_admin' AND NOT EXISTS (
    SELECT 1 FROM public.university_admin_memberships membership
    WHERE membership.user_id = auth.uid() AND membership.is_active
  ) THEN
    RAISE EXCEPTION 'Active university administration scope required' USING ERRCODE = '42501';
  END IF;
  IF v_role = 'moderator' AND NOT (
    public.has_permission('can_review_reports')
    OR public.has_permission('can_review_verifications')
    OR public.has_permission('can_manage_support')
    OR public.has_permission('can_manage_communications')
    OR public.has_permission('can_moderate_content')
  ) THEN
    RAISE EXCEPTION 'An operational alert permission is required' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  WITH alerts(alert_key, severity, affected_count, window_start) AS (
    SELECT 'payment_reconciliation'::text, 'critical'::text, count(*)::bigint, NULL::timestamptz
    FROM public.payments payment
    WHERE v_role = 'super_admin' AND payment.status = 'reconciliation_required'
    HAVING count(*) > 0
    UNION ALL
    SELECT 'communication_failures', 'high', count(*)::bigint, now() - interval '24 hours'
    FROM public.communication_deliveries delivery
    WHERE (v_role = 'super_admin' OR (v_role = 'moderator' AND public.has_permission('can_manage_communications')))
      AND delivery.status = 'failed' AND delivery.created_at >= now() - interval '24 hours'
    HAVING count(*) > 0
    UNION ALL
    SELECT 'urgent_support', 'high', count(*)::bigint, NULL::timestamptz
    FROM public.support_tickets ticket
    WHERE (v_role = 'super_admin' OR (v_role = 'moderator' AND public.has_permission('can_manage_support')))
      AND ticket.priority IN ('high', 'urgent') AND ticket.status NOT IN ('resolved', 'closed')
    HAVING count(*) > 0
    UNION ALL
    SELECT 'priority_reports', 'high', count(*)::bigint, NULL::timestamptz
    FROM public.reports report
    WHERE (v_role = 'super_admin' OR (v_role = 'moderator' AND public.has_permission('can_review_reports')))
      AND report.priority IN ('high', 'critical') AND report.status NOT IN ('resolved', 'dismissed', 'closed')
    HAVING count(*) > 0
    UNION ALL
    SELECT 'content_reviews', 'medium', count(*)::bigint, NULL::timestamptz
    FROM public.reviews review
    LEFT JOIN public.review_moderation moderation ON moderation.review_id = review.id
    WHERE (v_role = 'super_admin' OR (v_role = 'moderator' AND public.has_permission('can_moderate_content')))
      AND COALESCE(moderation.moderation_status, CASE WHEN review.is_approved THEN 'published' ELSE 'pending_review' END)
        IN ('pending_review', 'flagged')
    HAVING count(*) > 0
    UNION ALL
    SELECT 'pending_advertisements', 'medium', count(*)::bigint, NULL::timestamptz
    FROM public.advertisements advertisement
    WHERE (v_role = 'super_admin' OR (v_role = 'moderator' AND public.has_permission('can_moderate_content')))
      AND advertisement.status = 'pending'
    HAVING count(*) > 0
    UNION ALL
    SELECT 'stale_vendor_verification', 'medium', count(*)::bigint, now() - interval '72 hours'
    FROM public.vendors vendor
    WHERE NOT vendor.is_verified AND vendor.created_at < now() - interval '72 hours'
      AND (v_role = 'super_admin'
        OR (v_role = 'university_admin' AND public.can_manage_university(vendor.university_id))
        OR (v_role = 'moderator' AND public.has_permission('can_review_verifications')))
    HAVING count(*) > 0
    UNION ALL
    SELECT 'low_stock_products', 'medium', count(*)::bigint, NULL::timestamptz
    FROM public.products product
    JOIN public.businesses business ON business.id = product.business_id
    JOIN public.vendors vendor ON vendor.id = business.vendor_id
    WHERE product.is_active AND NOT product.is_archived AND product.stock <= product.low_stock_threshold
      AND (v_role = 'super_admin'
        OR (v_role = 'university_admin' AND public.can_manage_university(COALESCE(product.university_id, business.university_id, vendor.university_id))))
    HAVING count(*) > 0
  )
  SELECT alert.alert_key, alert.severity, alert.affected_count, alert.window_start
  FROM alerts alert
  ORDER BY CASE alert.severity WHEN 'critical' THEN 1 WHEN 'high' THEN 2 ELSE 3 END, alert.alert_key;
END;
$$;

REVOKE ALL ON FUNCTION public.get_admin_operational_alerts() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_admin_operational_alerts() TO authenticated;

COMMIT;
