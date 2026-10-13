-- Enforce an authenticated sender limit in the trusted messaging write path.
-- The transaction-scoped lock serializes each sender's check-and-insert so
-- concurrent calls cannot race around the limit.
BEGIN;

CREATE INDEX IF NOT EXISTS messages_sender_created_at_idx
  ON public.messages (sender_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.send_direct_message(
  p_conversation_id uuid,
  p_body text DEFAULT NULL,
  p_message_type text DEFAULT 'text',
  p_attachment_url text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_recipient uuid;
  v_order_id uuid;
  v_message_id uuid;
  v_body text := NULLIF(btrim(p_body), '');
  v_recent_messages integer;
BEGIN
  IF v_caller IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501'; END IF;

  SELECT CASE WHEN c.participant_one = v_caller THEN c.participant_two ELSE c.participant_one END, c.order_id
    INTO v_recipient, v_order_id
  FROM public.conversations c
  WHERE c.id = p_conversation_id AND v_caller IN (c.participant_one, c.participant_two);
  IF NOT FOUND THEN RAISE EXCEPTION 'Conversation access denied' USING ERRCODE = '42501'; END IF;

  IF p_message_type NOT IN ('text', 'image', 'document', 'link') THEN RAISE EXCEPTION 'Invalid message type' USING ERRCODE = '22023'; END IF;
  IF v_body IS NULL AND p_attachment_url IS NULL THEN RAISE EXCEPTION 'A message or attachment is required' USING ERRCODE = '22023'; END IF;
  IF v_body IS NOT NULL AND char_length(v_body) > 4000 THEN RAISE EXCEPTION 'Message exceeds 4000 characters' USING ERRCODE = '22023'; END IF;
  IF p_attachment_url IS NOT NULL AND (
    p_attachment_url NOT LIKE 'attachment://' || p_conversation_id::text || '/' || v_caller::text || '/%'
    OR NOT EXISTS (SELECT 1 FROM storage.objects o WHERE o.bucket_id = 'message-attachments' AND o.name = substring(p_attachment_url FROM 14))
  ) THEN RAISE EXCEPTION 'Attachment is not authorized for this message' USING ERRCODE = '42501'; END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(v_caller::text, 54054));
  SELECT count(*) INTO v_recent_messages
  FROM public.messages m
  WHERE m.sender_id = v_caller AND m.created_at > now() - interval '1 minute';
  IF v_recent_messages >= 20 THEN
    RAISE EXCEPTION 'Message rate limit exceeded. Please wait before sending another message.' USING ERRCODE = '53300';
  END IF;

  INSERT INTO public.messages (conversation_id, sender_id, recipient_id, body, message_type, attachment_url, order_id)
  VALUES (p_conversation_id, v_caller, v_recipient, v_body, p_message_type, p_attachment_url, v_order_id)
  RETURNING id INTO v_message_id;
  UPDATE public.conversations SET updated_at = now(), last_message_at = now() WHERE id = p_conversation_id;
  RETURN v_message_id;
END
$$;

REVOKE ALL ON FUNCTION public.send_direct_message(uuid, text, text, text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.send_direct_message(uuid, text, text, text) TO authenticated;

COMMIT;
