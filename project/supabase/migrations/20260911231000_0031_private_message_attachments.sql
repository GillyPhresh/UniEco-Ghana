-- Phase A2 focused communication hardening: private, participant-scoped files.
BEGIN;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'message-attachments',
  'message-attachments',
  false,
  10485760,
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document']
)
ON CONFLICT (id) DO UPDATE
SET public = false,
    file_size_limit = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;

CREATE OR REPLACE FUNCTION public.message_attachment_conversation_id(p_name text)
RETURNS uuid
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
  RETURN (storage.foldername(p_name))[1]::uuid;
EXCEPTION WHEN others THEN
  RETURN NULL;
END
$$;

DROP POLICY IF EXISTS message_attachment_participants_read ON storage.objects;
CREATE POLICY message_attachment_participants_read ON storage.objects
FOR SELECT TO authenticated
USING (
  bucket_id = 'message-attachments'
  AND EXISTS (
    SELECT 1 FROM public.conversations conversation
    WHERE conversation.id = public.message_attachment_conversation_id(name)
      AND auth.uid() IN (conversation.participant_one, conversation.participant_two)
  )
);

DROP POLICY IF EXISTS message_attachment_participants_upload ON storage.objects;
CREATE POLICY message_attachment_participants_upload ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'message-attachments'
  AND (storage.foldername(name))[2] = auth.uid()::text
  AND EXISTS (
    SELECT 1 FROM public.conversations conversation
    WHERE conversation.id = public.message_attachment_conversation_id(name)
      AND auth.uid() IN (conversation.participant_one, conversation.participant_two)
  )
);

DROP POLICY IF EXISTS message_attachment_owner_delete ON storage.objects;
CREATE POLICY message_attachment_owner_delete ON storage.objects
FOR DELETE TO authenticated
USING (
  bucket_id = 'message-attachments'
  AND (storage.foldername(name))[2] = auth.uid()::text
  AND EXISTS (
    SELECT 1 FROM public.conversations conversation
    WHERE conversation.id = public.message_attachment_conversation_id(name)
      AND auth.uid() IN (conversation.participant_one, conversation.participant_two)
  )
);

REVOKE ALL ON FUNCTION public.message_attachment_conversation_id(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.message_attachment_conversation_id(text) TO authenticated;

COMMIT;
