-- Phase A3.2I.1: remove explicit Supabase API-role grants left on the
-- SECURITY INVOKER helper used only by authenticated attachment policies.
BEGIN;

REVOKE ALL ON FUNCTION public.message_attachment_conversation_id(text)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.message_attachment_conversation_id(text)
  TO authenticated;

COMMIT;
