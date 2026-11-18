BEGIN;

-- Private, aggregate-only signal read. Never expose actors, raw events,
-- security metadata, webhook payloads, or individual search activity.
CREATE FUNCTION public.get_admin_platform_intelligence(p_days integer DEFAULT 7)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE
  v_data jsonb;
  v_end timestamptz := date_trunc('day', now(), 'UTC');
  v_start timestamptz;
BEGIN
  IF auth.uid() IS NULL OR public.is_super_admin() IS DISTINCT FROM TRUE THEN
    RAISE EXCEPTION 'Super administrator access required' USING ERRCODE = '42501';
  END IF;
  IF p_days IS NULL OR p_days NOT IN (7, 30) THEN
    RAISE EXCEPTION 'Use a 7 or 30 day window' USING ERRCODE = '22023';
  END IF;
  v_start := v_end - make_interval(hours => p_days * 24);

  WITH search_days AS (
    SELECT e.actor_id, COALESCE(e.university_id, p.university_id) AS campus_id,
      (e.occurred_at AT TIME ZONE 'UTC')::date AS event_day,
      bool_or(e.result_count = 0) AS had_no_match
    FROM public.analytics_events e
    JOIN public.profiles p ON p.id = e.actor_id
    WHERE e.event_type = 'search'
      AND e.result_count IS NOT NULL
      AND e.occurred_at >= v_start AND e.occurred_at < v_end
    GROUP BY e.actor_id, COALESCE(e.university_id, p.university_id), event_day
  ), campuses AS (
    SELECT u.slug, u.name, count(*) AS search_days,
      CASE WHEN count(DISTINCT s.actor_id) FILTER (WHERE s.had_no_match) >= 5
        THEN count(*) FILTER (WHERE s.had_no_match) END AS no_match_days
    FROM search_days s
    JOIN public.universities u ON u.id = s.campus_id AND u.is_enabled
    GROUP BY u.slug, u.name
    HAVING count(DISTINCT s.actor_id) >= 5
    ORDER BY no_match_days DESC NULLS LAST, search_days DESC, u.slug
    LIMIT 12
  )
  SELECT jsonb_build_object(
    'windowStart', v_start,
    'windowEnd', v_end,
    'campuses', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('slug', slug, 'name', name,
        'searchDays', search_days, 'noMatchDays', no_match_days)
        ORDER BY no_match_days DESC NULLS LAST, search_days DESC, slug)
      FROM campuses
    ), '[]'::jsonb),
    'security', jsonb_build_object(
      'recordedEvents', (SELECT count(*) FROM public.unieco_security_events
        WHERE created_at >= now() - make_interval(hours => p_days * 24) AND created_at <= now()),
      'paymentsNeedingReview', (SELECT count(*) FROM public.payments WHERE status = 'reconciliation_required')
    )
  ) INTO v_data;

  RETURN v_data;
END;
$$;

REVOKE ALL ON FUNCTION public.get_admin_platform_intelligence(integer)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_admin_platform_intelligence(integer) TO authenticated;

COMMIT;
