-- Bounded operational signals only; queue contents and provider secrets remain private.
BEGIN;

CREATE OR REPLACE FUNCTION public.get_admin_system_health_summary()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE v_result jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Super administrator access required' USING ERRCODE = '42501';
  END IF;

  SELECT jsonb_build_object(
    'communicationQueue', jsonb_build_object(
      'queued', (SELECT count(*) FROM public.communication_events WHERE status='queued'),
      'failed', (SELECT count(*) FROM public.communication_events WHERE status='failed'),
      'exhausted', (SELECT count(*) FROM public.communication_events WHERE status='failed' AND attempt_count >= 3),
      'stuckProcessing', (SELECT count(*) FROM public.communication_events WHERE status='processing' AND processing_started_at < now() - interval '15 minutes'),
      'agedQueued', (SELECT count(*) FROM public.communication_events WHERE status='queued' AND created_at < now() - interval '15 minutes')
    ),
    'paymentProviders', jsonb_build_object(
      'externalConfigured', (SELECT count(*) FROM public.payment_providers WHERE name <> 'manual'),
      'externalEnabled', (SELECT count(*) FROM public.payment_providers WHERE name <> 'manual' AND is_enabled)
    )
  ) INTO v_result;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.get_admin_system_health_summary() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_admin_system_health_summary() TO authenticated;

COMMIT;
