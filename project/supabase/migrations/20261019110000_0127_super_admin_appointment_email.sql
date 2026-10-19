-- Allow only Super Admins to send formal, audited appointment emails to any
-- internal or external recipient through the trusted communication queue.
BEGIN;

CREATE OR REPLACE FUNCTION public.send_super_admin_appointment_email(
  p_recipient_email text,
  p_recipient_name text,
  p_appointment_title text,
  p_message text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE
  uid uuid := auth.uid();
  email_value text := lower(btrim(p_recipient_email));
  name_value text := btrim(p_recipient_name);
  title_value text := btrim(p_appointment_title);
  message_value text := NULLIF(btrim(p_message), '');
  event_id uuid;
BEGIN
  IF uid IS NULL OR NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Super administrator access required' USING ERRCODE = '42501';
  END IF;
  IF email_value !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' THEN
    RAISE EXCEPTION 'A valid recipient email is required' USING ERRCODE = '22023';
  END IF;
  IF length(name_value) NOT BETWEEN 2 AND 120 THEN
    RAISE EXCEPTION 'Recipient name must be between 2 and 120 characters' USING ERRCODE = '22023';
  END IF;
  IF length(title_value) NOT BETWEEN 2 AND 160 THEN
    RAISE EXCEPTION 'Appointment title must be between 2 and 160 characters' USING ERRCODE = '22023';
  END IF;
  IF message_value IS NOT NULL AND length(message_value) > 5000 THEN
    RAISE EXCEPTION 'The optional message cannot exceed 5000 characters' USING ERRCODE = '22023';
  END IF;

  event_id := public.enqueue_trusted_communication_event(
    'managing_director_appointment', NULL, email_value, NULL,
    'Congratulations on your appointment as ' || title_value || ' at UniEco Ghana',
    ARRAY['email']::text[],
    jsonb_build_object(
      'template', 'managing_director_appointment',
      'appointment_title', title_value,
      'name', name_value,
      'message', message_value,
      'action_url', 'https://uniecoghana.com'
    )
  );

  INSERT INTO public.audit_logs(actor_id, target_id, action, entity_type, entity_id, metadata)
  VALUES (uid, uid, 'super_admin_appointment_email_queued', 'communication_events', event_id,
    jsonb_build_object('recipient_email', email_value, 'recipient_name', name_value, 'appointment_title', title_value));

  RETURN jsonb_build_object('queued', true, 'event_id', event_id, 'recipient_email', email_value);
END;
$$;

REVOKE ALL ON FUNCTION public.send_super_admin_appointment_email(text,text,text,text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.send_super_admin_appointment_email(text,text,text,text) TO authenticated;

COMMIT;
