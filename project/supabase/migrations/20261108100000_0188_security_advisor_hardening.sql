-- Address two verified staging advisor findings without changing application
-- behavior: pin the private-attachment path helper's search_path and remove
-- anonymous execution of the super-admin-only campus launch RPC.
BEGIN;

ALTER FUNCTION public.message_attachment_conversation_id(text)
  SET search_path = pg_catalog, storage;
REVOKE ALL ON FUNCTION public.message_attachment_conversation_id(text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.message_attachment_conversation_id(text)
  TO authenticated;

REVOKE ALL ON FUNCTION public.set_admin_university_launch_status(uuid, text)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.set_admin_university_launch_status(uuid, text)
  TO authenticated;

COMMIT;
