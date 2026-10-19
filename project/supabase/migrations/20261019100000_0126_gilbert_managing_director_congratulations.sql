-- Queue the official UniEco Ghana appointment congratulations email once.
-- The event is idempotent so a repeated migration cannot duplicate delivery.
BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.communication_events
    WHERE event_type = 'managing_director_appointment'
      AND recipient_email = 'gilbertasare01@gmail.com'
      AND metadata->>'appointment' = 'managing_director'
  ) THEN
    PERFORM public.enqueue_trusted_communication_event(
      'managing_director_appointment',
      NULL,
      'gilbertasare01@gmail.com',
      NULL,
      'Congratulations on your appointment as Managing Director of UniEco Ghana',
      ARRAY['email']::text[],
      jsonb_build_object(
        'template', 'managing_director_appointment',
        'appointment', 'managing_director',
        'name', 'Gilbert Asare Marfo',
        'action_url', 'https://uniecoghana.com'
      )
    );
  END IF;
END;
$$;

COMMIT;
