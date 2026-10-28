-- Send active super admins a deduplicated operational summary.
-- The existing communication queue delivers this through email, in-app, and
-- push when the admin has a registered device and has enabled the category.
BEGIN;

CREATE INDEX IF NOT EXISTS student_profiles_verification_status_alert_idx
  ON public.student_profiles (verification_status, created_at DESC);

CREATE INDEX IF NOT EXISTS vendor_profiles_verification_status_alert_idx
  ON public.vendor_profiles (verification_status, created_at DESC);

CREATE OR REPLACE FUNCTION public.queue_admin_governance_digest(p_limit integer DEFAULT 50)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  target record;
  claimed_id uuid;
  counts jsonb;
  fingerprint text;
  body_text text;
  queued_count integer := 0;
  actionable_count bigint;
BEGIN
  IF p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 250 THEN
    RAISE EXCEPTION 'Admin digest limit must be between 1 and 250' USING ERRCODE = '22023';
  END IF;

  SELECT jsonb_build_object(
    'payment_reconciliation', (SELECT count(*) FROM public.payments WHERE status = 'reconciliation_required'),
    'communication_failures', (SELECT count(*) FROM public.communication_deliveries WHERE status = 'failed' AND created_at >= now() - interval '24 hours'),
    'urgent_support', (SELECT count(*) FROM public.support_tickets WHERE priority IN ('high', 'urgent') AND status NOT IN ('resolved', 'closed')),
    'priority_reports', (SELECT count(*) FROM public.reports WHERE priority IN ('high', 'critical') AND status NOT IN ('resolved', 'dismissed', 'closed')),
    'content_reviews', (SELECT count(*)
      FROM public.reviews review
      LEFT JOIN public.review_moderation moderation ON moderation.review_id = review.id
      WHERE COALESCE(moderation.moderation_status, CASE WHEN review.is_approved THEN 'published' ELSE 'pending_review' END)
        IN ('pending_review', 'flagged')),
    'pending_advertisements', (SELECT count(*) FROM public.advertisements WHERE status = 'pending'),
    'pending_student_verification', (SELECT count(*) FROM public.student_profiles WHERE verification_status = 'pending'),
    'pending_vendor_verification', (SELECT count(*) FROM public.vendor_profiles WHERE verification_status = 'pending'),
    'stale_vendor_verification', (SELECT count(*) FROM public.vendors WHERE NOT is_verified AND created_at < now() - interval '72 hours'),
    'low_stock_products', (SELECT count(*)
      FROM public.products product
      JOIN public.businesses business ON business.id = product.business_id
      JOIN public.vendors vendor ON vendor.id = business.vendor_id
      WHERE product.is_active AND NOT product.is_archived
        AND product.stock <= product.low_stock_threshold)
  ) INTO counts;

  SELECT COALESCE(sum(value::bigint), 0)
  INTO actionable_count
  FROM jsonb_each_text(counts);

  IF actionable_count = 0 THEN
    RETURN 0;
  END IF;

  fingerprint := md5(counts::text);
  body_text := concat_ws(E'\n',
    CASE WHEN (counts->>'payment_reconciliation')::bigint > 0 THEN 'Payments needing reconciliation: ' || (counts->>'payment_reconciliation') END,
    CASE WHEN (counts->>'communication_failures')::bigint > 0 THEN 'Communication failures in the last 24 hours: ' || (counts->>'communication_failures') END,
    CASE WHEN (counts->>'urgent_support')::bigint > 0 THEN 'High-priority support tickets: ' || (counts->>'urgent_support') END,
    CASE WHEN (counts->>'priority_reports')::bigint > 0 THEN 'High-priority trust and safety reports: ' || (counts->>'priority_reports') END,
    CASE WHEN (counts->>'content_reviews')::bigint > 0 THEN 'Reviews waiting for moderation: ' || (counts->>'content_reviews') END,
    CASE WHEN (counts->>'pending_advertisements')::bigint > 0 THEN 'Advertisements waiting for review: ' || (counts->>'pending_advertisements') END,
    CASE WHEN (counts->>'pending_student_verification')::bigint > 0 THEN 'Student verifications waiting for review: ' || (counts->>'pending_student_verification') END,
    CASE WHEN (counts->>'pending_vendor_verification')::bigint > 0 THEN 'Vendor verifications waiting for review: ' || (counts->>'pending_vendor_verification') END,
    CASE WHEN (counts->>'stale_vendor_verification')::bigint > 0 THEN 'Vendor verifications waiting over 72 hours: ' || (counts->>'stale_vendor_verification') END,
    CASE WHEN (counts->>'low_stock_products')::bigint > 0 THEN 'Active products at or below low stock: ' || (counts->>'low_stock_products') END,
    'Open the UniEco Ghana management system to review these items.'
  );

  FOR target IN
    SELECT profile.id, profile.full_name
    FROM public.profiles profile
    JOIN public.user_roles role ON role.id = profile.role_id
    WHERE role.name = 'super_admin' AND profile.is_active AND profile.email IS NOT NULL
    ORDER BY profile.created_at
    LIMIT p_limit
  LOOP
    claimed_id := NULL;
    INSERT INTO public.communication_campaign_log(user_id, campaign_key, period_start)
    VALUES (target.id, 'admin_governance_digest', date_trunc('day', now()))
    ON CONFLICT DO NOTHING
    RETURNING id INTO claimed_id;

    IF claimed_id IS NOT NULL THEN
      PERFORM public.queue_user_communication(
        target.id,
        'admin_governance_digest',
        'UniEco Ghana management summary',
        body_text,
        'general',
        'https://www.uniecoghana.com/admin',
        'ShieldCheck',
        'admin_governance_digest',
        counts || jsonb_build_object('alert_fingerprint', fingerprint, 'action_url', 'https://www.uniecoghana.com/admin')
      );
      queued_count := queued_count + 1;
    END IF;
  END LOOP;

  RETURN queued_count;
END;
$$;

REVOKE ALL ON FUNCTION public.queue_admin_governance_digest(integer) FROM PUBLIC, anon, authenticated, service_role;

INSERT INTO public.communication_templates(template_key, name, channel, subject, body, variables, is_active)
VALUES (
  'admin_governance_digest',
  'Admin governance summary',
  'email',
  'UniEco Ghana management summary',
  'There are platform items waiting for your review. Open the management system for the details.',
  '{name}',
  true
)
ON CONFLICT (template_key) DO UPDATE SET
  name = EXCLUDED.name,
  channel = EXCLUDED.channel,
  subject = EXCLUDED.subject,
  body = EXCLUDED.body,
  variables = EXCLUDED.variables,
  is_active = true,
  updated_at = now();

DO $$
BEGIN
  IF to_regnamespace('cron') IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'unieco-admin-governance-digest-hourly') THEN
      PERFORM cron.schedule(
        'unieco-admin-governance-digest-hourly',
        '10 * * * *',
        'SELECT public.queue_admin_governance_digest(50);'
      );
    END IF;
  END IF;
END $$;

COMMIT;
