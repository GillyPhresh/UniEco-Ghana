-- Give Super Admin one authoritative view of both student and vendor referrals.
-- Referral codes, attribution and reward balances remain database-owned.
BEGIN;

CREATE OR REPLACE FUNCTION public.get_admin_referral_overview(
  p_search text DEFAULT NULL,
  p_limit integer DEFAULT 50,
  p_offset integer DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  result jsonb;
  search_term text := NULLIF(btrim(p_search), '');
  search_pattern text;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Super administrator access required' USING ERRCODE = '42501';
  END IF;
  IF p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 100
     OR p_offset IS NULL OR p_offset NOT BETWEEN 0 AND 1000000
     OR length(COALESCE(search_term, '')) > 100 THEN
    RAISE EXCEPTION 'Invalid referral list pagination or search' USING ERRCODE = '22023';
  END IF;
  IF search_term IS NOT NULL THEN
    search_pattern := '%' || replace(replace(replace(lower(search_term), E'\\', E'\\\\'), '%', E'\\%'), '_', E'\\_') || '%';
  END IF;

  WITH student_reward_totals AS (
    SELECT
      COALESCE(sum(amount) FILTER (WHERE status = 'pending'), 0) AS pending_amount,
      COALESCE(sum(amount) FILTER (WHERE status = 'payout_pending'), 0) AS payout_pending_amount,
      COALESCE(sum(amount) FILTER (WHERE status = 'available'), 0) AS available_amount,
      COALESCE(sum(amount) FILTER (WHERE status = 'paid'), 0) AS paid_amount,
      COALESCE(sum(amount) FILTER (WHERE status = 'reconciliation_required'), 0) AS reconciliation_amount,
      COALESCE(sum(amount) FILTER (WHERE status = 'failed'), 0) AS failed_amount,
      count(*) FILTER (WHERE status = 'reversed') AS reversed_count
    FROM public.student_referral_rewards
  ),
  vendor_reward_totals AS (
    SELECT
      COALESCE(sum(amount) FILTER (WHERE status = 'pending'), 0) AS pending_amount,
      COALESCE(sum(amount) FILTER (WHERE status = 'payout_pending'), 0) AS payout_pending_amount,
      COALESCE(sum(amount) FILTER (WHERE status = 'available'), 0) AS available_amount,
      COALESCE(sum(amount) FILTER (WHERE status = 'paid'), 0) AS paid_amount,
      COALESCE(sum(amount) FILTER (WHERE status = 'reconciliation_required'), 0) AS reconciliation_amount,
      COALESCE(sum(amount) FILTER (WHERE status = 'failed'), 0) AS failed_amount,
      count(*) FILTER (WHERE status = 'reversed') AS reversed_count
    FROM public.vendor_referral_rewards
  ),
  student_attribution_totals AS (
    SELECT count(*) FILTER (WHERE status = 'qualified') AS qualified_count
    FROM public.student_referral_attributions
  ),
  vendor_attribution_totals AS (
    SELECT count(*) FILTER (WHERE status = 'qualified') AS qualified_count
    FROM public.vendor_referral_attributions
  ),
  student_payout_totals AS (
    SELECT
      count(*) FILTER (WHERE status IN ('requested', 'processing', 'reconciliation_required')) AS pending_count,
      count(*) FILTER (WHERE status = 'failed') AS failed_count
    FROM public.student_referral_payouts
  )
  SELECT jsonb_build_object(
    'student_referrers', (SELECT count(*) FROM public.student_referral_codes code JOIN public.profiles profile ON profile.id = code.user_id JOIN public.user_roles role ON role.id = profile.role_id WHERE code.revoked_at IS NULL AND profile.is_active AND profile.status = 'active' AND role.name IN ('student', 'student_vendor')),
    'vendor_referrers', (SELECT count(*) FROM public.vendor_referral_codes code JOIN public.profiles profile ON profile.id = code.user_id JOIN public.user_roles role ON role.id = profile.role_id WHERE code.revoked_at IS NULL AND profile.is_active AND profile.status = 'active' AND role.name IN ('student_vendor', 'external_vendor')),
    'qualified_student_referrals', (SELECT qualified_count FROM student_attribution_totals),
    'qualified_vendor_referrals', (SELECT qualified_count FROM vendor_attribution_totals),
    'pending_rewards',
      (SELECT pending_amount FROM student_reward_totals) + (SELECT pending_amount FROM vendor_reward_totals),
    'payout_pending_rewards',
      (SELECT payout_pending_amount FROM student_reward_totals) + (SELECT payout_pending_amount FROM vendor_reward_totals),
    'available_rewards',
      (SELECT available_amount FROM student_reward_totals) + (SELECT available_amount FROM vendor_reward_totals),
    'paid_rewards',
      (SELECT paid_amount FROM student_reward_totals) + (SELECT paid_amount FROM vendor_reward_totals),
    'reconciliation_rewards',
      (SELECT reconciliation_amount FROM student_reward_totals) + (SELECT reconciliation_amount FROM vendor_reward_totals),
    'failed_rewards',
      (SELECT failed_amount FROM student_reward_totals) + (SELECT failed_amount FROM vendor_reward_totals),
    'reversed_rewards',
      (SELECT reversed_count FROM student_reward_totals) + (SELECT reversed_count FROM vendor_reward_totals),
    'payouts_pending', (SELECT pending_count FROM student_payout_totals),
    'payouts_failed', (SELECT failed_count FROM student_payout_totals),
    'referrers_count', (SELECT count(*) FROM (
      SELECT code.user_id
      FROM public.student_referral_codes code JOIN public.profiles profile ON profile.id = code.user_id JOIN public.user_roles role ON role.id = profile.role_id
      WHERE code.revoked_at IS NULL AND profile.is_active AND profile.status = 'active'
        AND role.name IN ('student', 'student_vendor')
        AND (search_term IS NULL OR lower(profile.full_name) LIKE search_pattern ESCAPE E'\\' OR lower(profile.email) LIKE search_pattern ESCAPE E'\\' OR lower(code.code) LIKE search_pattern ESCAPE E'\\')
      UNION ALL
      SELECT code.user_id
      FROM public.vendor_referral_codes code JOIN public.profiles profile ON profile.id = code.user_id JOIN public.user_roles role ON role.id = profile.role_id
      WHERE code.revoked_at IS NULL AND profile.is_active AND profile.status = 'active'
        AND role.name IN ('student_vendor', 'external_vendor')
        AND (search_term IS NULL OR lower(profile.full_name) LIKE search_pattern ESCAPE E'\\' OR lower(profile.email) LIKE search_pattern ESCAPE E'\\' OR lower(code.code) LIKE search_pattern ESCAPE E'\\')
    ) matching_referrers),
    'referrers', COALESCE((
      SELECT jsonb_agg(to_jsonb(row_data) ORDER BY row_data.referrer_name, row_data.audience)
      FROM (
        SELECT * FROM (SELECT
          'student'::text AS audience,
          code.user_id,
          COALESCE(profile.full_name, 'Student') AS referrer_name,
          profile.email AS referrer_email,
          code.code,
          'https://www.uniecoghana.com/signup?ref=' || code.code || '&intent=student' AS referral_link,
          (SELECT count(*) FROM public.student_referral_attributions attribution
            WHERE attribution.referrer_user_id = code.user_id AND attribution.status = 'qualified') AS qualified_referrals,
          (SELECT count(*) FROM public.student_referral_attributions attribution
            WHERE attribution.referrer_user_id = code.user_id AND attribution.status = 'pending') AS pending_referrals,
          (SELECT count(*) FROM public.student_referral_attributions attribution
            WHERE attribution.referrer_user_id = code.user_id AND attribution.status = 'qualified'
              AND attribution.qualified_at >= date_trunc('month', now() AT TIME ZONE 'Africa/Accra') AT TIME ZONE 'Africa/Accra') AS qualified_this_month,
          COALESCE((SELECT sum(reward.amount) FROM public.student_referral_rewards reward
            WHERE reward.referrer_user_id = code.user_id AND reward.status = 'pending'), 0) AS pending_amount,
          COALESCE((SELECT sum(reward.amount) FROM public.student_referral_rewards reward
            WHERE reward.referrer_user_id = code.user_id AND reward.status = 'payout_pending'), 0) AS payout_pending_amount,
          COALESCE((SELECT sum(reward.amount) FROM public.student_referral_rewards reward
            WHERE reward.referrer_user_id = code.user_id AND reward.status = 'available'), 0) AS available_amount,
          COALESCE((SELECT sum(reward.amount) FROM public.student_referral_rewards reward
            WHERE reward.referrer_user_id = code.user_id AND reward.status = 'paid'), 0) AS paid_amount
        FROM public.student_referral_codes code
        JOIN public.profiles profile ON profile.id = code.user_id
        JOIN public.user_roles role ON role.id = profile.role_id
        WHERE code.revoked_at IS NULL AND profile.is_active AND profile.status = 'active'
          AND role.name IN ('student', 'student_vendor')
          AND (search_term IS NULL OR lower(profile.full_name) LIKE search_pattern ESCAPE E'\\' OR lower(profile.email) LIKE search_pattern ESCAPE E'\\' OR lower(code.code) LIKE search_pattern ESCAPE E'\\')

        UNION ALL

        SELECT
          'vendor'::text AS audience,
          code.user_id,
          COALESCE(profile.full_name, 'Vendor') AS referrer_name,
          profile.email AS referrer_email,
          code.code,
          'https://www.uniecoghana.com/signup?ref=' || code.code || '&intent=external_vendor' AS referral_link,
          (SELECT count(*) FROM public.vendor_referral_attributions attribution
            WHERE attribution.referrer_user_id = code.user_id AND attribution.status = 'qualified') AS qualified_referrals,
          (SELECT count(*) FROM public.vendor_referral_attributions attribution
            WHERE attribution.referrer_user_id = code.user_id AND attribution.status = 'pending') AS pending_referrals,
          (SELECT count(*) FROM public.vendor_referral_attributions attribution
            WHERE attribution.referrer_user_id = code.user_id AND attribution.status = 'qualified'
              AND attribution.qualified_at >= date_trunc('month', now() AT TIME ZONE 'Africa/Accra') AT TIME ZONE 'Africa/Accra') AS qualified_this_month,
          COALESCE((SELECT sum(reward.amount) FROM public.vendor_referral_rewards reward
            WHERE reward.referrer_user_id = code.user_id AND reward.status = 'pending'), 0) AS pending_amount,
          COALESCE((SELECT sum(reward.amount) FROM public.vendor_referral_rewards reward
            WHERE reward.referrer_user_id = code.user_id AND reward.status = 'payout_pending'), 0) AS payout_pending_amount,
          COALESCE((SELECT sum(reward.amount) FROM public.vendor_referral_rewards reward
            WHERE reward.referrer_user_id = code.user_id AND reward.status = 'available'), 0) AS available_amount,
          COALESCE((SELECT sum(reward.amount) FROM public.vendor_referral_rewards reward
            WHERE reward.referrer_user_id = code.user_id AND reward.status = 'paid'), 0) AS paid_amount
        FROM public.vendor_referral_codes code
        JOIN public.profiles profile ON profile.id = code.user_id
        JOIN public.user_roles role ON role.id = profile.role_id
        WHERE code.revoked_at IS NULL AND profile.is_active AND profile.status = 'active'
          AND role.name IN ('student_vendor', 'external_vendor')
          AND (search_term IS NULL OR lower(profile.full_name) LIKE search_pattern ESCAPE E'\\' OR lower(profile.email) LIKE search_pattern ESCAPE E'\\' OR lower(code.code) LIKE search_pattern ESCAPE E'\\')
        ) AS matching_accounts
        ORDER BY referrer_name, audience
        LIMIT p_limit OFFSET p_offset
      ) AS row_data
    ), '[]'::jsonb),
    'recent_referrals', COALESCE((
      SELECT jsonb_agg(to_jsonb(row_data) ORDER BY row_data.created_at DESC)
      FROM (
        SELECT * FROM (
          SELECT
            attribution.id,
            'student'::text AS audience,
            attribution.created_at,
            attribution.qualified_at,
            attribution.status,
            COALESCE(referrer.full_name, 'Student') AS referrer_name,
            COALESCE(referred.full_name, 'Student') AS referred_name,
            attribution.code,
            reward.amount AS reward_amount,
            reward.currency,
            reward.status AS reward_status,
            payment.payment_reference
          FROM public.student_referral_attributions attribution
          JOIN public.profiles referrer ON referrer.id = attribution.referrer_user_id
          JOIN public.profiles referred ON referred.id = attribution.referred_user_id
          LEFT JOIN public.student_referral_rewards reward ON reward.attribution_id = attribution.id
          LEFT JOIN public.payments payment ON payment.id = reward.payment_id

          UNION ALL

          SELECT
            attribution.id,
            'vendor'::text AS audience,
            attribution.created_at,
            attribution.qualified_at,
            attribution.status,
            COALESCE(referrer.full_name, 'Vendor') AS referrer_name,
            COALESCE(referred.full_name, 'Vendor') AS referred_name,
            attribution.code,
            reward.amount AS reward_amount,
            reward.currency,
            reward.status AS reward_status,
            payment.payment_reference
          FROM public.vendor_referral_attributions attribution
          JOIN public.profiles referrer ON referrer.id = attribution.referrer_user_id
          JOIN public.profiles referred ON referred.id = attribution.referred_user_id
          LEFT JOIN public.vendor_referral_rewards reward ON reward.attribution_id = attribution.id
          LEFT JOIN public.payments payment ON payment.id = reward.payment_id
        ) AS combined
        ORDER BY created_at DESC
        LIMIT 150
      ) AS row_data
    ), '[]'::jsonb),
    'payout_queue', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'created_at', payout.created_at,
        'reference', payout.reference,
        'amount', payout.amount,
        'currency', payout.currency,
        'status', payout.status,
        'user_id', payout.user_id,
        'user_name', COALESCE(profile.full_name, 'Student')
      ) ORDER BY payout.created_at DESC)
      FROM (
        SELECT * FROM public.student_referral_payouts
        WHERE status IN ('requested', 'processing', 'failed', 'reconciliation_required')
        ORDER BY created_at DESC LIMIT 100
      ) payout
      JOIN public.profiles profile ON profile.id = payout.user_id
    ), '[]'::jsonb)
  ) INTO result;

  RETURN result;
END;
$$;

REVOKE ALL ON FUNCTION public.get_admin_referral_overview(text, integer, integer) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_admin_referral_overview(text, integer, integer) TO authenticated;

COMMIT;
