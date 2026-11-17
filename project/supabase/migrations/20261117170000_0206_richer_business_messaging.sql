-- Voice notes, shared locations, and catalog links remain participant-only
-- message payloads. This migration does not turn on any communication provider.
BEGIN;
SET LOCAL lock_timeout = '5s';

UPDATE storage.buckets
SET allowed_mime_types = ARRAY(
  SELECT DISTINCT unnest(allowed_mime_types || ARRAY['audio/webm','audio/ogg','audio/mp4','audio/mpeg'])
  ORDER BY 1
)
WHERE id = 'message-attachments' AND public IS FALSE AND allowed_mime_types IS NOT NULL;

-- Push and email are prompts only; never put private chat text, audio or
-- coordinates into an external notification. The link opens the exact chat.
CREATE OR REPLACE FUNCTION public.queue_direct_message_notification()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE
  action_url text := '/dashboard/messages?conversation=' || NEW.conversation_id::text;
BEGIN
  IF NEW.recipient_id IS NULL OR NEW.sender_id IS NULL OR NEW.sender_id=NEW.recipient_id THEN RETURN NEW; END IF;
  PERFORM public.queue_user_communication(
    NEW.recipient_id,'new_message','You have a new UniEco message',
    'Open UniEco to view your message.', 'messages',action_url,'MessageSquare','new_message',
    jsonb_build_object('message_id',NEW.id,'conversation_id',NEW.conversation_id)
  );
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.queue_direct_message_notification() FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION public.send_direct_message(
  p_conversation_id uuid,
  p_body text DEFAULT NULL,
  p_message_type text DEFAULT 'text',
  p_attachment_url text DEFAULT NULL
)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_recipient uuid;
  v_order_id uuid;
  v_message_id uuid;
  v_body text := NULLIF(btrim(p_body), '');
  v_recent_messages integer;
  v_payload jsonb;
  v_latitude numeric;
  v_longitude numeric;
BEGIN
  IF v_caller IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501'; END IF;
  SELECT CASE WHEN c.participant_one=v_caller THEN c.participant_two ELSE c.participant_one END, c.order_id
    INTO v_recipient,v_order_id FROM public.conversations c
    WHERE c.id=p_conversation_id AND v_caller IN (c.participant_one,c.participant_two);
  IF NOT FOUND THEN RAISE EXCEPTION 'Conversation access denied' USING ERRCODE='42501'; END IF;
  IF EXISTS (
    SELECT 1 FROM public.blocked_users b
    WHERE (b.blocker_id=v_caller AND b.blocked_id=v_recipient)
       OR (b.blocker_id=v_recipient AND b.blocked_id=v_caller)
  ) THEN RAISE EXCEPTION 'Messaging is not available for these users' USING ERRCODE='42501'; END IF;
  IF p_message_type IS NULL OR p_message_type NOT IN ('text','image','document','link','audio','location','product') THEN
    RAISE EXCEPTION 'Invalid message type' USING ERRCODE='22023';
  END IF;
  IF v_body IS NULL AND p_attachment_url IS NULL THEN RAISE EXCEPTION 'A message or attachment is required' USING ERRCODE='22023'; END IF;
  IF v_body IS NOT NULL AND char_length(v_body)>4000 THEN RAISE EXCEPTION 'Message exceeds 4000 characters' USING ERRCODE='22023'; END IF;
  IF p_message_type IN ('location','product') THEN
    BEGIN
      v_payload := v_body::jsonb;
    EXCEPTION WHEN OTHERS THEN
      RAISE EXCEPTION 'Invalid shared item' USING ERRCODE='22023';
    END;
    IF jsonb_typeof(v_payload) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'Invalid shared item' USING ERRCODE='22023'; END IF;
    IF p_message_type='location' THEN
      IF jsonb_typeof(v_payload->'latitude') IS DISTINCT FROM 'number'
        OR jsonb_typeof(v_payload->'longitude') IS DISTINCT FROM 'number'
      THEN RAISE EXCEPTION 'Invalid location coordinates' USING ERRCODE='22023'; END IF;
      BEGIN
        v_latitude := (v_payload->>'latitude')::numeric;
        v_longitude := (v_payload->>'longitude')::numeric;
      EXCEPTION WHEN OTHERS THEN
        RAISE EXCEPTION 'Invalid location coordinates' USING ERRCODE='22023';
      END;
      IF v_latitude IS NULL OR v_longitude IS NULL
        OR v_latitude NOT BETWEEN -90 AND 90 OR v_longitude NOT BETWEEN -180 AND 180
        OR COALESCE(v_payload->>'url','') !~ '^https://www\.google\.com/maps/search/\?api=1&query='
      THEN RAISE EXCEPTION 'Invalid location share' USING ERRCODE='22023'; END IF;
    ELSE
      IF NOT COALESCE(v_payload->>'title' = ANY(ARRAY['UniEco Ghana Marketplace','UniEco business catalogue']),false)
        OR COALESCE(v_payload->>'url','') !~ '^https://(www\.)?uniecoghana\.com/(marketplace|business/[A-Za-z0-9][A-Za-z0-9_-]*/?)$'
      THEN RAISE EXCEPTION 'Only UniEco catalogue links can be shared' USING ERRCODE='22023'; END IF;
    END IF;
  END IF;
  IF p_attachment_url IS NOT NULL AND (
    p_attachment_url NOT LIKE 'attachment://'||p_conversation_id::text||'/'||v_caller::text||'/%'
    OR NOT EXISTS(SELECT 1 FROM storage.objects o WHERE o.bucket_id='message-attachments' AND o.name=substring(p_attachment_url FROM 14))
  ) THEN RAISE EXCEPTION 'Attachment is not authorized for this message' USING ERRCODE='42501'; END IF;
  IF p_message_type IN ('location','product') AND p_attachment_url IS NOT NULL THEN
    RAISE EXCEPTION 'Shared links must stay in the message body' USING ERRCODE='22023';
  END IF;
  IF p_message_type='audio' AND (p_attachment_url IS NULL OR NOT EXISTS (
    SELECT 1 FROM storage.objects o WHERE o.bucket_id='message-attachments'
      AND o.name=substring(p_attachment_url FROM 14)
      AND o.metadata->>'mimetype' IN ('audio/webm','audio/ogg','audio/mp4','audio/mpeg')
  )) THEN RAISE EXCEPTION 'A supported voice attachment is required' USING ERRCODE='22023'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(v_caller::text,54054));
  SELECT count(*) INTO v_recent_messages FROM public.messages m
    WHERE m.sender_id=v_caller AND m.created_at>now()-interval '1 minute';
  IF v_recent_messages>=20 THEN RAISE EXCEPTION 'Message rate limit exceeded. Please wait before sending another message.' USING ERRCODE='53300'; END IF;
  INSERT INTO public.messages(conversation_id,sender_id,recipient_id,body,message_type,attachment_url,order_id)
    VALUES(p_conversation_id,v_caller,v_recipient,v_body,p_message_type,p_attachment_url,v_order_id)
    RETURNING id INTO v_message_id;
  UPDATE public.conversations SET updated_at=now(),last_message_at=now() WHERE id=p_conversation_id;
  RETURN v_message_id;
END $$;

REVOKE ALL ON FUNCTION public.send_direct_message(uuid,text,text,text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.send_direct_message(uuid,text,text,text) TO authenticated;
COMMIT;
