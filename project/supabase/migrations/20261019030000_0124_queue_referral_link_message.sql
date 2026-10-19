-- Send each newly-registered student their unique referral link through the
-- in-app notification centre and the trusted email delivery queue.
BEGIN;

CREATE OR REPLACE FUNCTION public.queue_referral_link_message()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  recipient public.profiles%ROWTYPE;
  referral_link text;
BEGIN
  SELECT * INTO recipient FROM public.profiles WHERE id = NEW.user_id;
  IF NOT FOUND THEN RETURN NEW; END IF;

  referral_link := 'https://uniecoghana.com/signup?ref=' || NEW.code;

  INSERT INTO public.notifications(
    user_id, type, title, body, action_url, category, metadata, icon
  ) VALUES (
    recipient.id,
    'referral_link_ready',
    'Your UniEco referral link is ready',
    'Share your unique UniEco Ghana link with genuine students. Eligible registrations can earn you GH₵2 after payment and verification.',
    'https://uniecoghana.com/dashboard/referrals',
    'general',
    jsonb_build_object('referral_code', NEW.code, 'referral_link', referral_link, 'reward_amount', 2),
    'Gift'
  );

  PERFORM public.enqueue_trusted_communication_event(
    'referral_link_ready',
    recipient.id,
    recipient.email,
    NULL,
    'Your UniEco referral link is ready',
    ARRAY['email']::text[],
    jsonb_build_object(
      'template', 'referral_link_ready',
      'name', COALESCE(recipient.full_name, 'there'),
      'referral_link', referral_link,
      'reward_amount', 2,
      'action_url', 'https://uniecoghana.com/dashboard/referrals'
    )
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS queue_referral_link_message_after_insert
  ON public.student_referral_codes;
CREATE TRIGGER queue_referral_link_message_after_insert
  AFTER INSERT ON public.student_referral_codes
  FOR EACH ROW
  EXECUTE FUNCTION public.queue_referral_link_message();

-- Backfill existing eligible registrars once. The metadata check makes this
-- safe if the migration is reapplied or a code was already notified.
DO $$
DECLARE
  existing_code record;
  existing_link text;
BEGIN
  FOR existing_code IN
    SELECT c.user_id, c.code, p.full_name, p.email
    FROM public.student_referral_codes AS c
    JOIN public.profiles AS p ON p.id = c.user_id
    WHERE p.email IS NOT NULL
      AND NOT EXISTS (
        SELECT 1
        FROM public.notifications AS n
        WHERE n.user_id = c.user_id
          AND n.type = 'referral_link_ready'
          AND n.metadata->>'referral_code' = c.code
      )
  LOOP
    existing_link := 'https://uniecoghana.com/signup?ref=' || existing_code.code;
    INSERT INTO public.notifications(user_id,type,title,body,action_url,category,metadata,icon)
    VALUES (
      existing_code.user_id, 'referral_link_ready',
      'Your UniEco referral link is ready',
      'Share your unique UniEco Ghana link with genuine students. Eligible registrations can earn you GH₵2 after payment and verification.',
      'https://uniecoghana.com/dashboard/referrals', 'general',
      jsonb_build_object('referral_code', existing_code.code, 'referral_link', existing_link, 'reward_amount', 2),
      'Gift'
    );
    PERFORM public.enqueue_trusted_communication_event(
      'referral_link_ready', existing_code.user_id, existing_code.email, NULL,
      'Your UniEco referral link is ready', ARRAY['email']::text[],
      jsonb_build_object(
        'template', 'referral_link_ready', 'name', COALESCE(existing_code.full_name, 'there'),
        'referral_link', existing_link, 'reward_amount', 2,
        'action_url', 'https://uniecoghana.com/dashboard/referrals'
      )
    );
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.queue_referral_link_message() FROM PUBLIC, anon, authenticated, service_role;

COMMIT;
