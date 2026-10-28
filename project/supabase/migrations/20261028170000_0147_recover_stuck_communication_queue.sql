-- Recover provider jobs left in processing after a worker timeout or crash.
-- A claim is safe to retry while its delivery rows are still queued. Events
-- that already reached the retry limit stay failed and visible as exhausted.
BEGIN;

CREATE OR REPLACE FUNCTION public.recover_stuck_trusted_communication_events(
  p_stale_after interval DEFAULT interval '15 minutes'
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  recovered_count integer := 0;
  changed_count integer;
BEGIN
  IF p_stale_after IS NULL OR p_stale_after < interval '5 minutes' THEN
    RAISE EXCEPTION 'Stale queue interval must be at least 5 minutes' USING ERRCODE = '22023';
  END IF;

  UPDATE public.communication_events
  SET status = 'failed',
      processing_started_at = NULL,
      next_attempt_at = NULL,
      updated_at = now()
  WHERE status = 'processing'
    AND processing_started_at IS NOT NULL
    AND processing_started_at < now() - p_stale_after
    AND attempt_count >= 3;
  GET DIAGNOSTICS changed_count = ROW_COUNT;
  recovered_count := recovered_count + changed_count;

  UPDATE public.communication_events
  SET status = 'queued',
      processing_started_at = NULL,
      next_attempt_at = now(),
      updated_at = now()
  WHERE status = 'processing'
    AND processing_started_at IS NOT NULL
    AND processing_started_at < now() - p_stale_after
    AND attempt_count < 3;
  GET DIAGNOSTICS changed_count = ROW_COUNT;
  recovered_count := recovered_count + changed_count;

  RETURN recovered_count;
END;
$$;

CREATE OR REPLACE FUNCTION public.claim_trusted_communication_events(p_limit integer DEFAULT 10)
RETURNS TABLE(
  event_id uuid, event_type text, recipient_id uuid, recipient_email text,
  recipient_phone text, subject text, metadata jsonb, delivery_id uuid, channel text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 25 THEN
    RAISE EXCEPTION 'Queue limit must be between 1 and 25' USING ERRCODE = '22023';
  END IF;

  PERFORM public.recover_stuck_trusted_communication_events();

  RETURN QUERY
  WITH candidates AS (
    SELECT e.id
    FROM public.communication_events e
    WHERE e.status = 'queued'
       OR (e.status = 'failed' AND e.attempt_count < 3 AND e.next_attempt_at <= now())
    ORDER BY e.created_at
    FOR UPDATE SKIP LOCKED
    LIMIT p_limit
  ), claimed AS (
    UPDATE public.communication_events e
    SET status = 'processing',
        attempt_count = e.attempt_count + 1,
        processing_started_at = now(),
        updated_at = now()
    FROM candidates c
    WHERE e.id = c.id
    RETURNING e.id, e.event_type, e.recipient_id, e.recipient_email,
      e.recipient_phone, e.subject, e.metadata
  )
  SELECT c.id, c.event_type, c.recipient_id, c.recipient_email,
    c.recipient_phone, c.subject, c.metadata, d.id, d.channel
  FROM claimed c
  JOIN public.communication_deliveries d ON d.event_id = c.id AND d.status = 'queued'
  ORDER BY c.id, d.created_at;
END;
$$;

REVOKE ALL ON FUNCTION public.recover_stuck_trusted_communication_events(interval) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.recover_stuck_trusted_communication_events(interval) TO service_role;
REVOKE ALL ON FUNCTION public.claim_trusted_communication_events(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_trusted_communication_events(integer) TO service_role;

-- Clear any already-stale claims as part of this repair. The normal worker
-- continues to call the same recovery through the claim function.
SELECT public.recover_stuck_trusted_communication_events();

COMMIT;
