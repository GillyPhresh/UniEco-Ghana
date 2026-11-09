-- Keep optional welcome/referral messages in the app, while reserving email
-- for account, payment, verification, and other actionable service updates.
BEGIN;

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
DECLARE
  v_event_id uuid;
  v_channels text[] := COALESCE(p_channels, ARRAY[]::text[]);
BEGIN
  IF cardinality(v_channels) = 0
     OR EXISTS (SELECT 1 FROM unnest(v_channels) AS channel_name WHERE channel_name NOT IN ('in_app','email','push','whatsapp','sms')) THEN
    RAISE EXCEPTION 'Invalid communication channels' USING ERRCODE = '22023';
  END IF;
  IF NULLIF(btrim(p_event_type), '') IS NULL THEN
    RAISE EXCEPTION 'Event type is required' USING ERRCODE = '22023';
  END IF;

  -- These are useful in-app milestones, but duplicate or low-urgency email
  -- versions are not needed during signup. Payment and verification messages
  -- are intentionally unaffected.
  IF p_event_type IN ('registration_welcome','student_welcome','vendor_welcome','referral_link_ready') THEN
    v_channels := array_remove(v_channels, 'email');
    IF cardinality(v_channels) = 0 THEN RETURN NULL; END IF;
  END IF;

  INSERT INTO public.communication_events(event_type,recipient_id,recipient_email,recipient_phone,subject,channels,status,metadata)
  VALUES (btrim(p_event_type),p_recipient_id,NULLIF(btrim(p_recipient_email),''),NULLIF(btrim(p_recipient_phone),''),NULLIF(btrim(p_subject),''),v_channels,'queued',COALESCE(p_metadata,'{}'::jsonb))
  RETURNING id INTO v_event_id;
  INSERT INTO public.communication_deliveries(event_id,channel,status)
  SELECT v_event_id, channel_name, 'queued'
  FROM unnest(v_channels) AS channel_name
  WHERE channel_name <> 'in_app';
  IF NOT EXISTS (SELECT 1 FROM public.communication_deliveries WHERE event_id=v_event_id) THEN
    UPDATE public.communication_events SET status='delivered', updated_at=now() WHERE id=v_event_id;
  END IF;
  RETURN v_event_id;
END;
$$;

REVOKE ALL ON FUNCTION public.enqueue_trusted_communication_event(text,uuid,text,text,text,text[],jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.enqueue_trusted_communication_event(text,uuid,text,text,text,text[],jsonb) TO service_role;

COMMIT;
