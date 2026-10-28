-- Role-aware UniEco Ghana communication catalogue and lifecycle delivery.
-- In-app notices are always created. Email and push respect the user's saved
-- category preferences; push is queued only when a device is registered.
BEGIN;

CREATE TABLE IF NOT EXISTS public.communication_campaign_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  campaign_key text NOT NULL,
  period_start timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, campaign_key, period_start)
);
ALTER TABLE public.communication_campaign_log ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.communication_campaign_log FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.communication_category_channel_enabled(
  p_user_id uuid, p_category text, p_channel text
) RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE
  stored_value text;
  default_value boolean;
BEGIN
  IF p_user_id IS NULL OR p_category IS NULL OR p_channel IS NULL THEN RETURN false; END IF;
  default_value := CASE
    WHEN p_channel IN ('email','push') AND p_category IN ('orders','payments','messages','businesses','events','reviews','subscriptions','verification','announcements','general') THEN true
    WHEN p_channel = 'in_app' THEN true
    ELSE false
  END;
  SELECT preferences #>> ARRAY[p_category, p_channel] INTO stored_value
  FROM public.notification_preferences WHERE user_id = p_user_id;
  IF lower(COALESCE(stored_value, '')) IN ('true','false') THEN RETURN lower(stored_value) = 'true'; END IF;
  RETURN default_value;
END $$;

CREATE OR REPLACE FUNCTION public.user_push_notifications_enabled(p_user_id uuid, p_category text)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
  SELECT public.communication_category_channel_enabled(p_user_id, p_category, 'push')
$$;

CREATE OR REPLACE FUNCTION public.queue_user_communication(
  p_user_id uuid,
  p_event_type text,
  p_title text,
  p_body text,
  p_category text,
  p_action_url text DEFAULT 'https://www.uniecoghana.com/dashboard/notifications',
  p_icon text DEFAULT 'Bell',
  p_template text DEFAULT NULL,
  p_metadata jsonb DEFAULT '{}'::jsonb
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE
  recipient public.profiles%ROWTYPE;
  channels text[] := ARRAY[]::text[];
  metadata jsonb;
BEGIN
  SELECT * INTO recipient FROM public.profiles WHERE id = p_user_id AND is_active;
  IF NOT FOUND THEN RETURN; END IF;

  INSERT INTO public.notifications(user_id, type, title, body, action_url, category, metadata, icon)
  VALUES (
    recipient.id, p_event_type, p_title, p_body, p_action_url, p_category,
    jsonb_build_object('source','unieco_lifecycle','event_type',p_event_type) || COALESCE(p_metadata,'{}'::jsonb), p_icon
  );

  metadata := jsonb_build_object(
    'body', p_body,
    'name', COALESCE(recipient.full_name, 'there'),
    'action_url', p_action_url,
    'template', COALESCE(p_template, p_event_type),
    'category', p_category
  ) || COALESCE(p_metadata,'{}'::jsonb);

  IF public.communication_category_channel_enabled(recipient.id, p_category, 'email') THEN
    channels := array_append(channels, 'email');
  END IF;
  IF public.communication_category_channel_enabled(recipient.id, p_category, 'push')
     AND EXISTS (SELECT 1 FROM public.push_subscriptions WHERE user_id = recipient.id AND is_active) THEN
    channels := array_append(channels, 'push');
  END IF;

  IF cardinality(channels) > 0 THEN
    PERFORM public.enqueue_trusted_communication_event(
      p_event_type, recipient.id, recipient.email, NULL, p_title, channels, metadata
    );
  END IF;
END $$;

-- Keep the account welcome message useful and different for students and vendors.
CREATE OR REPLACE FUNCTION public.queue_registration_welcome()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN
  IF NEW.role_id = 2 THEN
    PERFORM public.queue_user_communication(
      NEW.id, 'student_welcome', 'Welcome to UniEco Ghana',
      'Your student account is ready. Find campus businesses, events, services, and useful places around your university.',
      'general', 'https://www.uniecoghana.com/discover', 'GraduationCap', 'student_welcome'
    );
  ELSIF NEW.role_id IN (3,4) THEN
    PERFORM public.queue_user_communication(
      NEW.id, 'vendor_welcome', 'Welcome to UniEco Ghana for Vendors',
      'Your vendor account is ready. Add your shop details, location, products, and photos so students can find you.',
      'businesses', 'https://www.uniecoghana.com/vendor-dashboard', 'Store', 'vendor_welcome'
    );
  ELSE
    PERFORM public.queue_user_communication(
      NEW.id, 'registration_welcome', 'Welcome to UniEco Ghana',
      'Your UniEco Ghana account is ready. Complete your profile to get started.',
      'general', 'https://www.uniecoghana.com/profile', 'Sparkles', 'registration_welcome'
    );
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS queue_registration_welcome_after_profile ON public.profiles;
CREATE TRIGGER queue_registration_welcome_after_profile
AFTER INSERT ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.queue_registration_welcome();

CREATE OR REPLACE FUNCTION public.queue_student_verification_communication()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE
  title_text text;
  body_text text;
  event_name text;
BEGIN
  IF TG_OP = 'INSERT' AND NEW.verification_status = 'pending' THEN
    event_name := 'student_verification_submitted';
    title_text := 'Student verification received';
    body_text := 'We received your student verification details. We will update you when the review is complete.';
  ELSIF NEW.verification_status IS DISTINCT FROM OLD.verification_status AND NEW.verification_status = 'verified' THEN
    event_name := 'student_verification_approved';
    title_text := 'Student verification approved';
    body_text := 'Your student profile has been verified. You can now use more of UniEco Ghana with confidence.';
  ELSIF NEW.verification_status IS DISTINCT FROM OLD.verification_status AND NEW.verification_status = 'rejected' THEN
    event_name := 'student_verification_rejected';
    title_text := 'Student verification needs attention';
    body_text := 'Your student verification was not approved yet. Review the note in your account and submit the correct details.';
  ELSE
    RETURN NEW;
  END IF;
  PERFORM public.queue_user_communication(NEW.user_id, event_name, title_text, body_text, 'verification', 'https://www.uniecoghana.com/profile', 'BadgeCheck', 'student_verification', jsonb_build_object('verification_status', NEW.verification_status, 'reason', NEW.rejection_reason));
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS queue_student_verification_communication_after_change ON public.student_profiles;
CREATE TRIGGER queue_student_verification_communication_after_change
AFTER INSERT OR UPDATE OF verification_status ON public.student_profiles
FOR EACH ROW EXECUTE FUNCTION public.queue_student_verification_communication();

CREATE OR REPLACE FUNCTION public.queue_vendor_verification_communication()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE
  title_text text;
  body_text text;
  event_name text;
BEGIN
  IF TG_OP = 'INSERT' AND NEW.verification_status = 'pending' THEN
    event_name := 'vendor_verification_submitted';
    title_text := 'Vendor application received';
    body_text := 'We received your vendor application. Add your shop details and wait for the UniEco Ghana review.';
  ELSIF NEW.verification_status IS DISTINCT FROM OLD.verification_status AND NEW.verification_status = 'active' THEN
    event_name := 'vendor_verification_approved';
    title_text := 'Your vendor account is approved';
    body_text := 'Your shop can now appear on UniEco Ghana. Add products, services, photos, and your exact location.';
  ELSIF NEW.verification_status IS DISTINCT FROM OLD.verification_status AND NEW.verification_status = 'rejected' THEN
    event_name := 'vendor_verification_rejected';
    title_text := 'Vendor application needs attention';
    body_text := 'Your vendor application was not approved yet. Open your account to review the note and try again.';
  ELSE
    RETURN NEW;
  END IF;
  PERFORM public.queue_user_communication(NEW.profile_id, event_name, title_text, body_text, 'verification', 'https://www.uniecoghana.com/vendor-dashboard', 'BadgeCheck', 'vendor_verification', jsonb_build_object('verification_status', NEW.verification_status, 'reason', NEW.rejection_reason));
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS queue_vendor_verification_communication_after_change ON public.vendor_profiles;
CREATE TRIGGER queue_vendor_verification_communication_after_change
AFTER INSERT OR UPDATE OF verification_status ON public.vendor_profiles
FOR EACH ROW EXECUTE FUNCTION public.queue_vendor_verification_communication();

CREATE OR REPLACE FUNCTION public.queue_order_status_communication()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE
  vendor_owner uuid;
  vendor_name text;
  order_label text := COALESCE(NULLIF(NEW.order_number,''), 'your order');
  status_label text := replace(NEW.status, '_', ' ');
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.vendor_id IS NOT NULL THEN
      SELECT owner_id, business_name INTO vendor_owner, vendor_name FROM public.vendors WHERE id = NEW.vendor_id;
      IF vendor_owner IS NOT NULL THEN
        PERFORM public.queue_user_communication(vendor_owner, 'order_received', 'New order received', format('You have a new order at %s. Open your vendor dashboard to review it.', COALESCE(vendor_name, 'your shop')), 'orders', 'https://www.uniecoghana.com/vendor-dashboard/orders', 'ShoppingBag', 'order_received', jsonb_build_object('order_id', NEW.id, 'order_number', order_label));
      END IF;
    END IF;
    RETURN NEW;
  END IF;
  IF NEW.status IS NOT DISTINCT FROM OLD.status THEN RETURN NEW; END IF;
  PERFORM public.queue_user_communication(NEW.buyer_id, 'order_status_update', 'Order update', format('%s is now %s.', order_label, status_label), 'orders', 'https://www.uniecoghana.com/dashboard/orders', 'ShoppingBag', 'order_status_update', jsonb_build_object('order_id', NEW.id, 'order_number', order_label, 'status', NEW.status));
  IF NEW.vendor_id IS NOT NULL THEN
    SELECT owner_id, business_name INTO vendor_owner, vendor_name FROM public.vendors WHERE id = NEW.vendor_id;
    IF vendor_owner IS NOT NULL AND vendor_owner <> NEW.buyer_id THEN
      PERFORM public.queue_user_communication(vendor_owner, 'order_status_update', 'Order status changed', format('%s at %s is now %s.', order_label, COALESCE(vendor_name, 'your shop'), status_label), 'orders', 'https://www.uniecoghana.com/vendor-dashboard/orders', 'ShoppingBag', 'order_status_update', jsonb_build_object('order_id', NEW.id, 'order_number', order_label, 'status', NEW.status));
    END IF;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS queue_order_status_communication_after_change ON public.orders;
CREATE TRIGGER queue_order_status_communication_after_change
AFTER INSERT OR UPDATE OF status ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.queue_order_status_communication();

CREATE OR REPLACE FUNCTION public.queue_event_published_communication()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE target public.profiles%ROWTYPE;
BEGIN
  IF NEW.is_published IS NOT TRUE OR (TG_OP = 'UPDATE' AND OLD.is_published IS TRUE) OR NEW.university_id IS NULL THEN RETURN NEW; END IF;
  FOR target IN SELECT * FROM public.profiles WHERE is_active AND role_id IN (2,3,4) AND university_id = NEW.university_id LOOP
    PERFORM public.queue_user_communication(target.id, 'event_published', 'New campus event', format('%s is now listed on UniEco Ghana%s.', NEW.title, CASE WHEN NEW.location IS NOT NULL THEN ' at ' || NEW.location ELSE '' END), 'events', 'https://www.uniecoghana.com/events/' || NEW.slug, 'Calendar', 'event_published', jsonb_build_object('event_id', NEW.id, 'event_slug', NEW.slug));
  END LOOP;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS queue_event_published_communication_after_change ON public.events;
CREATE TRIGGER queue_event_published_communication_after_change
AFTER INSERT OR UPDATE OF is_published ON public.events
FOR EACH ROW EXECUTE FUNCTION public.queue_event_published_communication();

CREATE OR REPLACE FUNCTION public.queue_business_announcement_communication()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE target public.profiles%ROWTYPE; vendor_row public.vendors%ROWTYPE;
BEGIN
  IF NEW.is_approved IS NOT TRUE OR NEW.is_active IS NOT TRUE OR (TG_OP = 'UPDATE' AND OLD.is_approved IS TRUE AND OLD.is_active IS TRUE) THEN RETURN NEW; END IF;
  SELECT * INTO vendor_row FROM public.vendors WHERE id = NEW.vendor_id;
  IF vendor_row.university_id IS NULL THEN RETURN NEW; END IF;
  FOR target IN SELECT * FROM public.profiles WHERE is_active AND role_id IN (2,3,4) AND university_id = vendor_row.university_id LOOP
    PERFORM public.queue_user_communication(target.id, 'business_announcement', COALESCE(vendor_row.business_name, 'A campus business') || ' has an update', NEW.title || ' — ' || left(NEW.body, 220), 'businesses', 'https://www.uniecoghana.com/business/' || vendor_row.business_slug, 'Store', 'business_announcement', jsonb_build_object('announcement_id', NEW.id, 'vendor_id', vendor_row.id));
  END LOOP;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS queue_business_announcement_communication_after_change ON public.business_announcements;
CREATE TRIGGER queue_business_announcement_communication_after_change
AFTER INSERT OR UPDATE OF is_approved, is_active ON public.business_announcements
FOR EACH ROW EXECUTE FUNCTION public.queue_business_announcement_communication();

CREATE OR REPLACE FUNCTION public.queue_review_received_communication()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE vendor_owner uuid; vendor_name text;
BEGIN
  IF NEW.vendor_id IS NULL OR NEW.is_approved IS NOT TRUE OR (TG_OP = 'UPDATE' AND OLD.is_approved IS TRUE) THEN RETURN NEW; END IF;
  SELECT owner_id, business_name INTO vendor_owner, vendor_name FROM public.vendors WHERE id = NEW.vendor_id;
  IF vendor_owner IS NOT NULL THEN
    PERFORM public.queue_user_communication(vendor_owner, 'review_received', 'New review for your shop', format('%s left a %s-star review for %s. Open your vendor dashboard to read it.', 'A customer', NEW.rating, COALESCE(vendor_name, 'your shop')), 'reviews', 'https://www.uniecoghana.com/vendor-dashboard/reviews', 'Star', 'review_received', jsonb_build_object('review_id', NEW.id, 'vendor_id', NEW.vendor_id, 'rating', NEW.rating));
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS queue_review_received_communication_after_change ON public.reviews;
CREATE TRIGGER queue_review_received_communication_after_change
AFTER INSERT OR UPDATE OF is_approved ON public.reviews
FOR EACH ROW EXECUTE FUNCTION public.queue_review_received_communication();

-- Direct messages now use the same email and push preference rules.
CREATE OR REPLACE FUNCTION public.queue_direct_message_notification()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE sender_name text; body_preview text; action_url text := '/dashboard/messages?conversation=' || NEW.conversation_id::text;
BEGIN
  IF NEW.recipient_id IS NULL OR NEW.sender_id IS NULL OR NEW.sender_id = NEW.recipient_id THEN RETURN NEW; END IF;
  SELECT COALESCE(NULLIF(btrim(full_name), ''), 'A UniEco user') INTO sender_name FROM public.profiles WHERE id = NEW.sender_id;
  body_preview := left(COALESCE(NULLIF(btrim(NEW.body), ''), CASE WHEN NEW.attachment_url IS NOT NULL THEN 'Sent an attachment' ELSE 'New message' END), 240);
  PERFORM public.queue_user_communication(NEW.recipient_id, 'new_message', sender_name || ' sent you a message', body_preview, 'messages', action_url, 'MessageSquare', 'new_message', jsonb_build_object('message_id', NEW.id, 'conversation_id', NEW.conversation_id));
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS queue_direct_message_notification_after_insert ON public.messages;
CREATE TRIGGER queue_direct_message_notification_after_insert
AFTER INSERT ON public.messages FOR EACH ROW EXECUTE FUNCTION public.queue_direct_message_notification();

-- Dedupe recurring messages so useful reminders do not become spam.
CREATE OR REPLACE FUNCTION public.queue_lifecycle_communications(p_limit integer DEFAULT 250)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE
  target public.profiles%ROWTYPE;
  event_row public.events%ROWTYPE;
  subscription_row record;
  claimed_id uuid;
  queued_count integer := 0;
  week_start timestamptz := date_trunc('week', now());
  day_start timestamptz := date_trunc('day', now());
BEGIN
  IF p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 1000 THEN RAISE EXCEPTION 'Lifecycle limit must be between 1 and 1000' USING ERRCODE = '22023'; END IF;

  FOR target IN SELECT * FROM public.profiles WHERE is_active AND role_id IN (2,3,4) ORDER BY created_at DESC LIMIT p_limit LOOP
    claimed_id := NULL;
    IF target.role_id = 2 THEN
      INSERT INTO public.communication_campaign_log(user_id,campaign_key,period_start) VALUES(target.id,'weekly_student_digest',week_start) ON CONFLICT DO NOTHING RETURNING id INTO claimed_id;
      IF claimed_id IS NOT NULL THEN
        PERFORM public.queue_user_communication(target.id,'weekly_student_digest','Your UniEco week','Check what is happening around campus: new businesses, events, services, and useful places are waiting for you on UniEco Ghana.','announcements','https://www.uniecoghana.com/discover','Compass','weekly_student_digest');
        queued_count := queued_count + 1;
      END IF;
    ELSIF target.role_id IN (3,4) THEN
      claimed_id := NULL;
      INSERT INTO public.communication_campaign_log(user_id,campaign_key,period_start) VALUES(target.id,'weekly_vendor_digest',week_start) ON CONFLICT DO NOTHING RETURNING id INTO claimed_id;
      IF claimed_id IS NOT NULL THEN
        PERFORM public.queue_user_communication(target.id,'weekly_vendor_digest','Your UniEco vendor check-in','Keep your shop active this week: update your products, check your location, and reply to students who have contacted you.','businesses','https://www.uniecoghana.com/vendor-dashboard','Store','weekly_vendor_digest');
        queued_count := queued_count + 1;
      END IF;
    END IF;
    IF target.full_name IS NULL OR target.university_id IS NULL THEN
      claimed_id := NULL;
      INSERT INTO public.communication_campaign_log(user_id,campaign_key,period_start) VALUES(target.id,'profile_complete_nudge',week_start) ON CONFLICT DO NOTHING RETURNING id INTO claimed_id;
      IF claimed_id IS NOT NULL THEN
        PERFORM public.queue_user_communication(target.id,'profile_complete_nudge','Finish your UniEco profile','A few profile details are still missing. Complete them so UniEco can show you the right campus information and opportunities.','general','https://www.uniecoghana.com/profile','UserRound','profile_complete_nudge');
        queued_count := queued_count + 1;
      END IF;
    END IF;
  END LOOP;

  FOR event_row IN SELECT * FROM public.events WHERE is_published AND university_id IS NOT NULL AND start_time > now() + interval '23 hours' AND start_time <= now() + interval '25 hours' ORDER BY start_time LIMIT p_limit LOOP
    FOR target IN SELECT * FROM public.profiles WHERE is_active AND role_id IN (2,3,4) AND university_id = event_row.university_id LOOP
      claimed_id := NULL;
      INSERT INTO public.communication_campaign_log(user_id,campaign_key,period_start) VALUES(target.id,'event_reminder_24h:' || event_row.id::text,date_trunc('hour',event_row.start_time)) ON CONFLICT DO NOTHING RETURNING id INTO claimed_id;
      IF claimed_id IS NOT NULL THEN
        PERFORM public.queue_user_communication(target.id,'event_reminder','Event tomorrow: ' || event_row.title,format('%s starts tomorrow%s. Open UniEco Ghana for the time and location.',event_row.title,CASE WHEN event_row.location IS NOT NULL THEN ' at ' || event_row.location ELSE '' END),'events','https://www.uniecoghana.com/events/' || event_row.slug,'Calendar','event_reminder',jsonb_build_object('event_id',event_row.id,'event_slug',event_row.slug));
        queued_count := queued_count + 1;
      END IF;
    END LOOP;
  END LOOP;

  FOR subscription_row IN
    SELECT s.id, s.ends_at, v.owner_id, v.business_name
    FROM public.subscriptions s JOIN public.vendors v ON v.id = s.vendor_id
    WHERE s.status = 'active' AND s.ends_at > now() AND s.ends_at <= now() + interval '7 days'
    ORDER BY s.ends_at LIMIT p_limit
  LOOP
    claimed_id := NULL;
    INSERT INTO public.communication_campaign_log(user_id,campaign_key,period_start) VALUES(subscription_row.owner_id,'subscription_expiring:' || subscription_row.id::text,date_trunc('day',subscription_row.ends_at)) ON CONFLICT DO NOTHING RETURNING id INTO claimed_id;
    IF claimed_id IS NOT NULL THEN
      PERFORM public.queue_user_communication(subscription_row.owner_id,'subscription_expiring','Your vendor subscription ends soon',format('%s expires on %s. Renew from your vendor dashboard to keep your shop active.',COALESCE(subscription_row.business_name,'Your vendor account'),to_char(subscription_row.ends_at AT TIME ZONE 'Africa/Accra','FMDD FMMonth YYYY')),'subscriptions','https://www.uniecoghana.com/vendor-dashboard','RefreshCw','subscription_expiring');
      queued_count := queued_count + 1;
    END IF;
  END LOOP;
  RETURN queued_count;
END $$;

REVOKE ALL ON FUNCTION public.communication_category_channel_enabled(uuid,text,text), public.user_push_notifications_enabled(uuid,text), public.queue_user_communication(uuid,text,text,text,text,text,text,text,jsonb), public.queue_lifecycle_communications(integer) FROM PUBLIC, anon, authenticated, service_role;

-- A readable catalogue for the management system and future message editing.
INSERT INTO public.communication_templates(template_key,name,channel,subject,body,variables,is_active) VALUES
  ('student_welcome','Student welcome','email','Welcome to UniEco Ghana','Your student account is ready. Find campus businesses, events, services, and useful places around your university.','{name}',true),
  ('vendor_welcome','Vendor welcome','email','Welcome to UniEco Ghana for Vendors','Your vendor account is ready. Add your shop details, location, products, and photos so students can find you.','{name}',true),
  ('student_verification','Student verification update','email','Student verification update','Your student verification has been updated. Open your UniEco account for the details.','{name,reason}',true),
  ('vendor_verification','Vendor verification update','email','Vendor application update','Your vendor application has been updated. Open your vendor dashboard for the details.','{name,reason}',true),
  ('order_received','New vendor order','email','New order received','You have a new order. Open your vendor dashboard to review it.','{name,order_number}',true),
  ('order_status_update','Order status update','email','Order update','Your order status has changed. Open UniEco Ghana for the latest details.','{name,order_number,status}',true),
  ('event_published','New campus event','email','New campus event','A new event has been listed for your university community.','{name,event_title}',true),
  ('event_reminder','Event reminder','email','Event tomorrow','An event from your university community starts tomorrow.','{name,event_title,location}',true),
  ('business_announcement','Business update','email','A campus business has an update','A business near your campus has shared an update.','{name,business_name}',true),
  ('review_received','New review','email','New review for your shop','A customer has left a review for your shop.','{name,rating}',true),
  ('weekly_student_digest','Student weekly check-in','email','Your UniEco week','Check what is happening around campus this week.','{name}',true),
  ('weekly_vendor_digest','Vendor weekly check-in','email','Your UniEco vendor check-in','Keep your shop active and easy for students to find this week.','{name}',true),
  ('profile_complete_nudge','Profile reminder','email','Finish your UniEco profile','Complete your profile so UniEco can show you the right campus information.','{name}',true),
  ('subscription_expiring','Vendor subscription reminder','email','Your vendor subscription ends soon','Your vendor subscription ends soon. Open your dashboard to renew.','{name}',true)
ON CONFLICT (template_key) DO UPDATE SET name=EXCLUDED.name, channel=EXCLUDED.channel, subject=EXCLUDED.subject, body=EXCLUDED.body, variables=EXCLUDED.variables, is_active=true, updated_at=now();

DO $$
BEGIN
  IF to_regnamespace('cron') IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'unieco-lifecycle-communications-hourly') THEN
      PERFORM cron.schedule('unieco-lifecycle-communications-hourly','5 * * * *','SELECT public.queue_lifecycle_communications(500);');
    END IF;
  END IF;
END $$;

COMMIT;
