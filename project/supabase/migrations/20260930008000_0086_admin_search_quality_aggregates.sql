-- Search quality reporting exposes aggregate operational counts only.
-- Raw query text/session identifiers remain unavailable to the management UI.
BEGIN;

CREATE INDEX IF NOT EXISTS search_queries_created_result_count_idx
  ON public.search_queries (created_at DESC, result_count);
CREATE INDEX IF NOT EXISTS search_clicks_search_query_id_idx
  ON public.search_clicks (search_query_id)
  WHERE search_query_id IS NOT NULL;

-- Production may already contain the later analytics-backed version of this
-- function. Drop the prior return shape before recreating the legacy shape;
-- PostgreSQL cannot change OUT columns with CREATE OR REPLACE.
DROP FUNCTION IF EXISTS public.get_admin_search_quality_metrics(integer);
CREATE OR REPLACE FUNCTION public.get_admin_search_quality_metrics(p_days integer DEFAULT 30)
RETURNS TABLE(
  activity_date date,
  searches bigint,
  no_result_searches bigint,
  searches_with_clicks bigint
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
  SELECT q.created_at::date,
    count(*)::bigint,
    count(*) FILTER (WHERE q.result_count = 0)::bigint,
    count(*) FILTER (WHERE click.search_query_id IS NOT NULL)::bigint
  FROM public.search_queries q
  LEFT JOIN (
    SELECT DISTINCT search_query_id
    FROM public.search_clicks
    WHERE search_query_id IS NOT NULL
  ) click ON click.search_query_id = q.id
  WHERE q.created_at >= current_date - (v_days - 1)
    AND q.created_at < current_date + 1
  GROUP BY q.created_at::date
  ORDER BY q.created_at::date DESC;
END;
$$;

REVOKE ALL ON FUNCTION public.get_admin_search_quality_metrics(integer)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_admin_search_quality_metrics(integer) TO authenticated;

COMMIT;
