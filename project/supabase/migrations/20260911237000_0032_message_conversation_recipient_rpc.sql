-- Resolve a conversation's other participant without broadening profile RLS.
BEGIN;

CREATE OR REPLACE FUNCTION public.get_message_conversation_recipient(
  p_conversation_id uuid
)
RETURNS TABLE (id uuid, full_name text, avatar_url text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_other_user_id uuid;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;

  SELECT CASE
    WHEN conversation.participant_one = v_caller THEN conversation.participant_two
    WHEN conversation.participant_two = v_caller THEN conversation.participant_one
  END
  INTO v_other_user_id
  FROM public.conversations AS conversation
  WHERE conversation.id = p_conversation_id
    AND v_caller IN (conversation.participant_one, conversation.participant_two);

  IF NOT FOUND OR v_other_user_id IS NULL THEN
    RAISE EXCEPTION 'Conversation access denied' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT profile.id, profile.full_name, profile.avatar_url
  FROM public.profiles AS profile
  WHERE profile.id = v_other_user_id
    AND profile.is_active
    AND profile.status = 'active';
END
$$;

REVOKE ALL ON FUNCTION public.get_message_conversation_recipient(uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_message_conversation_recipient(uuid) TO authenticated;

COMMIT;
