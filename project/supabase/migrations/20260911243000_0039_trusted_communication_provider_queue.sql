BEGIN;

-- A3.15: delivery attempts are server-owned. Existing status values are kept:
-- queued (pending), processing, delivered/sent, and failed. No browser role
-- receives a mutation policy or EXECUTE grant for this queue.
ALTER TABLE public.communication_events
  ADD COLUMN IF NOT EXISTS attempt_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS next_attempt_at timestamptz,
  ADD COLUMN IF NOT EXISTS processing_started_at timestamptz;

ALTER TABLE public.communication_deliveries
  ADD COLUMN IF NOT EXISTS attempt_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_attempt_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_error_at timestamptz;

CREATE INDEX IF NOT EXISTS communication_events_dispatch_queue_idx
  ON public.communication_events(status, next_attempt_at, created_at)
  WHERE status IN ('queued', 'failed');

REVOKE INSERT, UPDATE, DELETE ON public.communication_events, public.communication_deliveries, public.communication_logs FROM anon, authenticated;
DROP POLICY IF EXISTS communication_events_browser_write ON public.communication_events;
DROP POLICY IF EXISTS communication_deliveries_browser_write ON public.communication_deliveries;
DROP POLICY IF EXISTS communication_logs_browser_write ON public.communication_logs;

CREATE OR REPLACE FUNCTION public.enqueue_trusted_communication_event(
  p_event_type text,
  p_recipient_id uuid DEFAULT NULL,
  p_recipient_email text DEFAULT NULL,
  p_recipient_phone text DEFAULT NULL,
  p_subject text DEFAULT NULL,
  p_channels text[] DEFAULT ARRAY['in_app'],
  p_metadata jsonb DEFAULT '{}'::jsonb
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE v_event_id uuid;
BEGIN
  IF COALESCE(cardinality(p_channels), 0) = 0
     OR EXISTS (SELECT 1 FROM unnest(p_channels) AS c WHERE c NOT IN ('in_app','email','push','whatsapp','sms')) THEN
    RAISE EXCEPTION 'Invalid communication channels' USING ERRCODE = '22023';
  END IF;
  IF NULLIF(btrim(p_event_type), '') IS NULL THEN
    RAISE EXCEPTION 'Event type is required' USING ERRCODE = '22023';
  END IF;
  INSERT INTO public.communication_events(event_type,recipient_id,recipient_email,recipient_phone,subject,channels,status,metadata)
  VALUES (btrim(p_event_type),p_recipient_id,NULLIF(btrim(p_recipient_email),''),NULLIF(btrim(p_recipient_phone),''),NULLIF(btrim(p_subject),''),p_channels,'queued',COALESCE(p_metadata,'{}'::jsonb))
  RETURNING id INTO v_event_id;
  INSERT INTO public.communication_deliveries(event_id,channel,status)
  SELECT v_event_id, channel, 'queued'
  FROM unnest(p_channels) AS channel
  WHERE channel <> 'in_app';
  -- In-app-only events have no external provider delivery to claim. Their
  -- application notification is created by the trusted producer itself.
  IF NOT EXISTS (SELECT 1 FROM public.communication_deliveries WHERE event_id=v_event_id) THEN
    UPDATE public.communication_events SET status='delivered', updated_at=now() WHERE id=v_event_id;
  END IF;
  RETURN v_event_id;
END $$;

CREATE OR REPLACE FUNCTION public.claim_trusted_communication_events(p_limit integer DEFAULT 10)
RETURNS TABLE(
  event_id uuid, event_type text, recipient_id uuid, recipient_email text,
  recipient_phone text, subject text, metadata jsonb, delivery_id uuid, channel text
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN
  IF p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 25 THEN
    RAISE EXCEPTION 'Queue limit must be between 1 and 25' USING ERRCODE = '22023';
  END IF;
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
    SET status='processing', attempt_count=e.attempt_count+1,
        processing_started_at=now(), updated_at=now()
    FROM candidates c WHERE e.id=c.id
    RETURNING e.id,e.event_type,e.recipient_id,e.recipient_email,e.recipient_phone,e.subject,e.metadata
  )
  SELECT c.id,c.event_type,c.recipient_id,c.recipient_email,c.recipient_phone,c.subject,c.metadata,d.id,d.channel
  FROM claimed c
  JOIN public.communication_deliveries d ON d.event_id=c.id AND d.status='queued'
  ORDER BY c.id,d.created_at;
END $$;

CREATE OR REPLACE FUNCTION public.complete_trusted_communication_delivery(
  p_event_id uuid, p_delivery_id uuid, p_status text, p_provider text DEFAULT NULL,
  p_provider_reference text DEFAULT NULL, p_error_message text DEFAULT NULL
) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE v_all_delivered boolean;
BEGIN
  IF p_status NOT IN ('sent','delivered','failed') THEN
    RAISE EXCEPTION 'Invalid delivery status' USING ERRCODE = '22023';
  END IF;
  UPDATE public.communication_deliveries
  SET status=p_status, provider=NULLIF(btrim(p_provider),''), provider_reference=NULLIF(btrim(p_provider_reference),''),
      error_message=CASE WHEN p_status='failed' THEN NULLIF(btrim(p_error_message),'') ELSE NULL END,
      attempt_count=attempt_count+1, last_attempt_at=now(),
      last_error_at=CASE WHEN p_status='failed' THEN now() ELSE NULL END,
      sent_at=CASE WHEN p_status IN ('sent','delivered') THEN now() ELSE sent_at END,
      delivered_at=CASE WHEN p_status='delivered' THEN now() ELSE delivered_at END
  WHERE id=p_delivery_id AND event_id=p_event_id AND status='queued';
  IF NOT FOUND THEN RAISE EXCEPTION 'Delivery is not claimable' USING ERRCODE = '42501'; END IF;

  SELECT bool_and(status IN ('sent','delivered')) INTO v_all_delivered
  FROM public.communication_deliveries WHERE event_id=p_event_id;
  UPDATE public.communication_events
  SET status=CASE WHEN v_all_delivered THEN 'delivered' WHEN p_status='failed' THEN 'failed' ELSE 'processing' END,
      next_attempt_at=CASE WHEN p_status='failed' THEN now() + interval '15 minutes' ELSE NULL END,
      updated_at=now()
  WHERE id=p_event_id AND status='processing';
  INSERT INTO public.communication_logs(event_type,channel,recipient_id,recipient_identifier,status,provider,provider_reference)
  SELECT e.event_type,d.channel,e.recipient_id,COALESCE(e.recipient_email,e.recipient_phone),d.status,d.provider,d.provider_reference
  FROM public.communication_events e JOIN public.communication_deliveries d ON d.id=p_delivery_id
  WHERE e.id=p_event_id;
  RETURN true;
END $$;

REVOKE ALL ON FUNCTION public.enqueue_trusted_communication_event(text,uuid,text,text,text,text[],jsonb), public.claim_trusted_communication_events(integer), public.complete_trusted_communication_delivery(uuid,uuid,text,text,text,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.enqueue_trusted_communication_event(text,uuid,text,text,text,text[],jsonb), public.claim_trusted_communication_events(integer), public.complete_trusted_communication_delivery(uuid,uuid,text,text,text,text) TO service_role;

COMMIT;
