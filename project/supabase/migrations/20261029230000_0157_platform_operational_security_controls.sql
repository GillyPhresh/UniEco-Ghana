-- UniEco Ghana operational security controls.
-- These tables are intentionally private. Edge Functions/workers use the
-- service role to write them; clients receive only safe, scoped API results.

BEGIN;

CREATE TABLE IF NOT EXISTS public.unieco_webhook_inbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL CHECK (provider IN ('paystack')),
  provider_event_id text NOT NULL,
  payload_hash text NOT NULL,
  signature_verified boolean NOT NULL DEFAULT false,
  payload jsonb NOT NULL,
  status text NOT NULL DEFAULT 'received'
    CHECK (status IN ('received','processing','processed','failed','reconciliation_required')),
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0 AND attempts <= 50),
  received_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz,
  last_error text,
  UNIQUE(provider, provider_event_id)
);
CREATE INDEX IF NOT EXISTS unieco_webhook_inbox_status_idx
  ON public.unieco_webhook_inbox(status, received_at);
ALTER TABLE public.unieco_webhook_inbox ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.unieco_webhook_inbox FROM PUBLIC, anon, authenticated, service_role;

CREATE TABLE IF NOT EXISTS public.unieco_notification_outbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  channel text NOT NULL CHECK (channel IN ('email','push')),
  event_type text NOT NULL CHECK (length(trim(event_type)) BETWEEN 2 AND 80),
  title text NOT NULL CHECK (length(trim(title)) BETWEEN 1 AND 180),
  body text NOT NULL CHECK (length(trim(body)) BETWEEN 1 AND 4000),
  destination_path text NOT NULL CHECK (
    (left(destination_path,1)='/' AND left(destination_path,2)<>'//')
    OR destination_path LIKE 'https://www.uniecoghana.com/%'
  ),
  dedupe_key text NOT NULL CHECK (length(trim(dedupe_key)) BETWEEN 3 AND 180),
  status text NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued','sending','sent','delivered','failed','cancelled')),
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0 AND attempts <= 20),
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  provider_message_id text,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz,
  delivered_at timestamptz,
  UNIQUE(recipient_user_id, channel, dedupe_key)
);
CREATE INDEX IF NOT EXISTS unieco_notification_outbox_worker_idx
  ON public.unieco_notification_outbox(status, next_attempt_at);
ALTER TABLE public.unieco_notification_outbox ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.unieco_notification_outbox FROM PUBLIC, anon, authenticated, service_role;

CREATE TABLE IF NOT EXISTS public.unieco_security_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  action text NOT NULL CHECK (length(trim(action)) BETWEEN 2 AND 120),
  entity_type text NOT NULL CHECK (length(trim(entity_type)) BETWEEN 2 AND 80),
  entity_id uuid,
  request_id text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS unieco_security_events_created_idx
  ON public.unieco_security_events(created_at DESC);
CREATE INDEX IF NOT EXISTS unieco_security_events_entity_idx
  ON public.unieco_security_events(entity_type, entity_id, created_at DESC);
ALTER TABLE public.unieco_security_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.unieco_security_events FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.record_unieco_webhook_event(
  p_provider text,
  p_provider_event_id text,
  p_payload_hash text,
  p_signature_verified boolean,
  p_payload jsonb
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $func$
DECLARE event_row public.unieco_webhook_inbox%ROWTYPE; inserted boolean := false;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'Webhook worker required' USING ERRCODE = '42501';
  END IF;
  IF p_provider <> 'paystack' OR NOT p_signature_verified
     OR length(trim(COALESCE(p_provider_event_id,''))) < 4
     OR length(trim(COALESCE(p_payload_hash,''))) < 16 THEN
    RAISE EXCEPTION 'Unverified or invalid webhook event' USING ERRCODE = '22023';
  END IF;
  INSERT INTO public.unieco_webhook_inbox(
    provider, provider_event_id, payload_hash, signature_verified, payload
  ) VALUES (
    p_provider, trim(p_provider_event_id), trim(p_payload_hash), true, p_payload
  ) ON CONFLICT (provider, provider_event_id) DO NOTHING
  RETURNING * INTO event_row;
  IF FOUND THEN
    inserted := true;
  ELSE
    SELECT * INTO event_row FROM public.unieco_webhook_inbox
    WHERE provider=p_provider AND provider_event_id=trim(p_provider_event_id);
  END IF;
  RETURN jsonb_build_object(
    'event_id',event_row.id,
    'provider',event_row.provider,
    'provider_event_id',event_row.provider_event_id,
    'status',event_row.status,
    'duplicate',NOT inserted
  );
END $func$;

CREATE OR REPLACE FUNCTION public.enqueue_unieco_notification(
  p_recipient_user_id uuid,
  p_channel text,
  p_event_type text,
  p_title text,
  p_body text,
  p_destination_path text,
  p_dedupe_key text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $func$
DECLARE notification public.unieco_notification_outbox%ROWTYPE;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'Notification worker required' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id=p_recipient_user_id) THEN
    RAISE EXCEPTION 'Notification recipient not found' USING ERRCODE = '22023';
  END IF;
  INSERT INTO public.unieco_notification_outbox(
    recipient_user_id, channel, event_type, title, body, destination_path, dedupe_key
  ) VALUES (
    p_recipient_user_id, p_channel, trim(p_event_type), trim(p_title), trim(p_body),
    trim(p_destination_path), trim(p_dedupe_key)
  ) ON CONFLICT (recipient_user_id, channel, dedupe_key) DO NOTHING
  RETURNING * INTO notification;
  IF NOT FOUND THEN
    SELECT * INTO notification FROM public.unieco_notification_outbox
    WHERE recipient_user_id=p_recipient_user_id AND channel=p_channel AND dedupe_key=trim(p_dedupe_key);
  END IF;
  RETURN jsonb_build_object(
    'notification_id',notification.id,
    'channel',notification.channel,
    'status',notification.status,
    'destination_path',notification.destination_path
  );
END $func$;

CREATE OR REPLACE FUNCTION public.record_unieco_security_event(
  p_actor_user_id uuid,
  p_action text,
  p_entity_type text,
  p_entity_id uuid DEFAULT NULL,
  p_request_id text DEFAULT NULL,
  p_metadata jsonb DEFAULT '{}'::jsonb
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $func$
DECLARE event_id uuid;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'Security event writer required' USING ERRCODE = '42501';
  END IF;
  INSERT INTO public.unieco_security_events(
    actor_user_id, action, entity_type, entity_id, request_id, metadata
  ) VALUES (
    p_actor_user_id, trim(p_action), trim(p_entity_type), p_entity_id, trim(p_request_id), p_metadata
  ) RETURNING id INTO event_id;
  RETURN event_id;
END $func$;

REVOKE ALL ON FUNCTION public.record_unieco_webhook_event(text,text,text,boolean,jsonb) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.enqueue_unieco_notification(uuid,text,text,text,text,text,text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.record_unieco_security_event(uuid,text,text,uuid,text,jsonb) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.record_unieco_webhook_event(text,text,text,boolean,jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.enqueue_unieco_notification(uuid,text,text,text,text,text,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.record_unieco_security_event(uuid,text,text,uuid,text,jsonb) TO service_role;

COMMIT;



