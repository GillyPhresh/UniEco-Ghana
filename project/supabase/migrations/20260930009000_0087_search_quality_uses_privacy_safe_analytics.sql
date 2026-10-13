-- Use the existing authenticated, query-text-free analytics event stream.
-- The legacy search_queries table has no active writer and stores raw terms.
BEGIN;

DROP INDEX IF EXISTS public.search_queries_created_result_count_idx;
DROP INDEX IF EXISTS public.search_clicks_search_query_id_idx;
DROP FUNCTION public.get_admin_search_quality_metrics(integer);

CREATE FUNCTION public.get_admin_search_quality_metrics(p_days integer DEFAULT 30)
RETURNS TABLE(
  activity_date date,
  searches bigint,
  no_result_searches bigint,
  search_result_clicks bigint
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_days integer := COALESCE(p_days, 30);
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Super administrator access required' USING ERRCODE = '42501';
  END IF;
  IF v_days NOT IN (7, 30, 90) THEN
    RAISE EXCEPTION 'Invalid reporting window' USING ERRCODE = '22023';
  END IF;

  RETURN QUERY
  SELECT event.occurred_at::date,
    count(*) FILTER (WHERE event.event_type = 'search')::bigint,
    count(*) FILTER (WHERE event.event_type = 'search' AND event.result_count = 0)::bigint,
    count(*) FILTER (WHERE event.event_type = 'search_result_click')::bigint
  FROM public.analytics_events event
  WHERE event.event_type IN ('search', 'search_result_click')
    AND event.occurred_at >= current_date - (v_days - 1)
    AND event.occurred_at < current_date + 1
  GROUP BY event.occurred_at::date
  ORDER BY event.occurred_at::date DESC;
END;
$$;

REVOKE ALL ON FUNCTION public.get_admin_search_quality_metrics(integer)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_admin_search_quality_metrics(integer) TO authenticated;

COMMIT;
