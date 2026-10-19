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

REVOKE ALL ON FUNCTION public.queue_referral_link_message() FROM PUBLIC, anon, authenticated, service_role;

COMMIT;
