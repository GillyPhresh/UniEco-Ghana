-- Phase A3.2L: narrow, participant-scoped messaging write surface.
-- Direct browser table writes remain denied by RLS; callers use these RPCs.
BEGIN;

CREATE OR REPLACE FUNCTION public.get_or_create_direct_conversation(
  p_target_user_id uuid,
  p_order_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_conversation_id uuid;
  v_first uuid;
  v_second uuid;
  v_buyer_id uuid;
  v_vendor_owner_id uuid;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;
  IF p_target_user_id IS NULL OR p_target_user_id = v_caller THEN
    RAISE EXCEPTION 'A direct conversation requires another user' USING ERRCODE = '22023';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = v_caller AND p.is_active AND p.status = 'active'
  ) OR NOT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = p_target_user_id AND p.is_active AND p.status = 'active'
  ) THEN
    RAISE EXCEPTION 'A participant is unavailable for messaging' USING ERRCODE = '42501';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.blocked_users b
    WHERE (b.blocker_id = v_caller AND b.blocked_id = p_target_user_id)
       OR (b.blocker_id = p_target_user_id AND b.blocked_id = v_caller)
  ) THEN
    RAISE EXCEPTION 'Messaging is not available for these users' USING ERRCODE = '42501';
  END IF;

  IF p_order_id IS NOT NULL THEN
    SELECT o.buyer_id, v.owner_id
      INTO v_buyer_id, v_vendor_owner_id
    FROM public.orders o
    LEFT JOIN public.vendors v ON v.id = o.vendor_id
    WHERE o.id = p_order_id;

    IF NOT FOUND
       OR v_buyer_id IS NULL
       OR v_vendor_owner_id IS NULL
       OR (v_caller <> v_buyer_id AND v_caller <> v_vendor_owner_id)
       OR (v_caller = v_buyer_id AND p_target_user_id <> v_vendor_owner_id)
       OR (v_caller = v_vendor_owner_id AND p_target_user_id <> v_buyer_id) THEN
      RAISE EXCEPTION 'Order conversations require the buyer and vendor owner' USING ERRCODE = '42501';
    END IF;
  END IF;

  v_first := LEAST(v_caller, p_target_user_id);
  v_second := GREATEST(v_caller, p_target_user_id);
  PERFORM pg_advisory_xact_lock(hashtext(v_first::text), hashtext(v_second::text));

  SELECT c.id INTO v_conversation_id
  FROM public.conversations c
  WHERE c.participant_one = v_first AND c.participant_two = v_second
  LIMIT 1;

  IF v_conversation_id IS NULL THEN
    INSERT INTO public.conversations (participant_one, participant_two, order_id)
    VALUES (v_first, v_second, p_order_id)
    RETURNING id INTO v_conversation_id;
  END IF;

  RETURN v_conversation_id;
END
$$;

CREATE OR REPLACE FUNCTION public.search_message_recipients(
  p_query text,
  p_limit integer DEFAULT 10
)
RETURNS TABLE (id uuid, full_name text, avatar_url text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_university_id uuid;
  v_query text := btrim(COALESCE(p_query, ''));
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;
  IF char_length(v_query) < 2 THEN
    RAISE EXCEPTION 'Enter at least two characters' USING ERRCODE = '22023';
  END IF;

  SELECT university_id INTO v_university_id
  FROM public.profiles
  WHERE id = v_caller AND role_id = 2 AND is_active AND status = 'active';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Student recipient search is unavailable for this account' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT p.id, p.full_name, p.avatar_url
  FROM public.profiles p
  WHERE p.id <> v_caller
    AND p.role_id = 2
    AND p.is_active
    AND p.status = 'active'
    AND p.university_id IS NOT DISTINCT FROM v_university_id
    AND p.full_name ILIKE '%' || v_query || '%'
    AND NOT EXISTS (
      SELECT 1 FROM public.account_restrictions r
      WHERE r.user_id = p.id AND r.is_active AND (r.ends_at IS NULL OR r.ends_at > now())
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.blocked_users b
      WHERE (b.blocker_id = v_caller AND b.blocked_id = p.id)
         OR (b.blocker_id = p.id AND b.blocked_id = v_caller)
    )
  ORDER BY p.full_name NULLS LAST, p.id
  LIMIT LEAST(GREATEST(COALESCE(p_limit, 10), 1), 10);
END
$$;

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

  INSERT INTO public.messages (conversation_id, sender_id, recipient_id, body, message_type, attachment_url, order_id)
  VALUES (p_conversation_id, v_caller, v_recipient, v_body, p_message_type, p_attachment_url, v_order_id)
  RETURNING id INTO v_message_id;
  UPDATE public.conversations SET updated_at = now(), last_message_at = now() WHERE id = p_conversation_id;
  RETURN v_message_id;
END
$$;

CREATE OR REPLACE FUNCTION public.mark_direct_messages_read(p_conversation_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE v_caller uuid := auth.uid(); v_count integer;
BEGIN
  IF v_caller IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.conversations c WHERE c.id = p_conversation_id AND v_caller IN (c.participant_one, c.participant_two)) THEN RAISE EXCEPTION 'Conversation access denied' USING ERRCODE = '42501'; END IF;
  UPDATE public.messages SET is_read = true
  WHERE conversation_id = p_conversation_id AND recipient_id = v_caller AND NOT is_read AND NOT is_deleted;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END
$$;

CREATE OR REPLACE FUNCTION public.soft_delete_direct_message(p_message_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE v_caller uuid := auth.uid();
BEGIN
  IF v_caller IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501'; END IF;
  UPDATE public.messages SET is_deleted = true, deleted_at = now()
  WHERE id = p_message_id AND sender_id = v_caller AND NOT is_deleted;
  RETURN FOUND;
END
$$;

CREATE OR REPLACE FUNCTION public.clear_direct_message_attachment(p_message_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE v_caller uuid := auth.uid();
BEGIN
  IF v_caller IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501'; END IF;
  UPDATE public.messages SET attachment_url = NULL
  WHERE id = p_message_id AND sender_id = v_caller AND attachment_url IS NOT NULL;
  RETURN FOUND;
END
$$;

-- No direct browser DML is introduced for conversations or messages.
REVOKE ALL ON FUNCTION public.get_or_create_direct_conversation(uuid, uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.search_message_recipients(text, integer) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.send_direct_message(uuid, text, text, text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.mark_direct_messages_read(uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.soft_delete_direct_message(uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.clear_direct_message_attachment(uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_or_create_direct_conversation(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.search_message_recipients(text, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.send_direct_message(uuid, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mark_direct_messages_read(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.soft_delete_direct_message(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.clear_direct_message_attachment(uuid) TO authenticated;

COMMIT;
