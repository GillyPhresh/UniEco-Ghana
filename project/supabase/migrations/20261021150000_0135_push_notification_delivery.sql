-- Reliable browser-push delivery for direct messages.
-- In-app notifications remain available even when a device has no push
-- subscription; external push is queued only for subscribed users.
BEGIN;

CREATE OR REPLACE FUNCTION public.user_push_notifications_enabled(
  p_user_id uuid,
  p_category text
) RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public AS $$
DECLARE
  preference_value text;
  default_enabled boolean := p_category IN ('orders', 'payments', 'messages', 'events', 'subscriptions');
BEGIN
  IF p_user_id IS NULL OR p_category IS NULL THEN
    RETURN false;
  END IF;

  SELECT preferences #>> ARRAY[p_category, 'push']
  INTO preference_value
  FROM public.notification_preferences
  WHERE user_id = p_user_id;

  IF lower(COALESCE(preference_value, '')) IN ('true', 'false') THEN
    RETURN lower(preference_value) = 'true';
  END IF;
  RETURN default_enabled;
END $$;

CREATE OR REPLACE FUNCTION public.queue_direct_message_notification()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public AS $$
DECLARE
  sender_name text;
  recipient_email text;
  body_preview text;
  action_url text := '/dashboard/messages?conversation=' || NEW.conversation_id::text;
BEGIN
  IF NEW.recipient_id IS NULL OR NEW.sender_id IS NULL OR NEW.sender_id = NEW.recipient_id THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(NULLIF(btrim(full_name), ''), 'A UniEco user')
  INTO sender_name
  FROM public.profiles
  WHERE id = NEW.sender_id;

  SELECT email INTO recipient_email
  FROM public.profiles
  WHERE id = NEW.recipient_id;

  body_preview := left(
    COALESCE(NULLIF(btrim(NEW.body), ''), CASE WHEN NEW.attachment_url IS NOT NULL THEN 'Sent an attachment' ELSE 'New message' END),
    240
  );

  INSERT INTO public.notifications(user_id, type, title, body, action_url, category, metadata, icon)
  VALUES (
    NEW.recipient_id,
    'new_message',
    sender_name || ' sent you a message',
    body_preview,
    action_url,
    'messages',
    jsonb_build_object('message_id', NEW.id, 'conversation_id', NEW.conversation_id),
    'MessageSquare'
  );

  IF public.user_push_notifications_enabled(NEW.recipient_id, 'messages')
     AND EXISTS (
       SELECT 1
       FROM public.push_subscriptions
       WHERE user_id = NEW.recipient_id AND is_active
     ) THEN
    PERFORM public.enqueue_trusted_communication_event(
      'new_message',
      NEW.recipient_id,
      recipient_email,
      NULL,
      sender_name || ' sent you a message',
      ARRAY['push']::text[],
      jsonb_build_object(
        'body', body_preview,
        'action_url', action_url,
        'message_id', NEW.id,
        'conversation_id', NEW.conversation_id
      )
    );
  END IF;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS queue_direct_message_notification_after_insert ON public.messages;
CREATE TRIGGER queue_direct_message_notification_after_insert
AFTER INSERT ON public.messages
FOR EACH ROW EXECUTE FUNCTION public.queue_direct_message_notification();

REVOKE ALL ON FUNCTION public.user_push_notifications_enabled(uuid, text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.queue_direct_message_notification() FROM PUBLIC, anon, authenticated, service_role;

COMMIT;
