-- Private Super Admin follow-ups for completed and stalled registrations.
-- Contact details stay in the protected management read-model, not push text.
BEGIN;

CREATE TABLE IF NOT EXISTS public.admin_registration_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  alert_type text NOT NULL CHECK (alert_type IN ('student_completed','vendor_completed','student_incomplete','vendor_incomplete')),
  created_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  UNIQUE (user_id, alert_type)
);
ALTER TABLE public.admin_registration_alerts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.admin_registration_alerts FROM PUBLIC, anon, authenticated;
CREATE INDEX IF NOT EXISTS admin_registration_alerts_created_idx
  ON public.admin_registration_alerts(created_at DESC);

CREATE OR REPLACE FUNCTION public.queue_admin_registration_alert(
  p_user_id uuid,
  p_alert_type text
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE
  alert_id uuid;
  recipient public.profiles%ROWTYPE;
  role_name text;
  university_name text;
  business_name text;
  alert_title text;
  alert_body text;
  action_url text := 'https://www.uniecoghana.com/admin/registration-alerts';
  admin_row record;
BEGIN
  IF p_alert_type NOT IN ('student_completed','vendor_completed','student_incomplete','vendor_incomplete') THEN
    RAISE EXCEPTION 'Invalid registration alert type' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO recipient FROM public.profiles WHERE id = p_user_id;
  IF NOT FOUND THEN RETURN NULL; END IF;
  SELECT name INTO role_name FROM public.user_roles WHERE id = recipient.role_id;
  SELECT name INTO university_name FROM public.universities WHERE id = recipient.university_id;
  SELECT vendor.business_name INTO business_name FROM public.vendors vendor WHERE vendor.owner_id = recipient.id ORDER BY vendor.created_at DESC LIMIT 1;

  INSERT INTO public.admin_registration_alerts(user_id, alert_type)
  VALUES (p_user_id, p_alert_type)
  ON CONFLICT (user_id, alert_type) DO NOTHING
  RETURNING id INTO alert_id;
  IF alert_id IS NULL THEN RETURN NULL; END IF;

  IF p_alert_type IN ('student_completed','vendor_completed') THEN
    UPDATE public.admin_registration_alerts
    SET resolved_at = COALESCE(resolved_at, now())
    WHERE user_id = p_user_id
      AND alert_type IN ('student_incomplete','vendor_incomplete')
      AND resolved_at IS NULL;
    alert_title := CASE WHEN p_alert_type = 'student_completed' THEN 'Student registration completed' ELSE 'Vendor registration completed' END;
    alert_body := 'A new member has completed registration. Open Registration Follow-ups to view their contact details.';
  ELSE
    alert_title := CASE WHEN p_alert_type = 'student_incomplete' THEN 'Student registration needs follow-up' ELSE 'Vendor registration needs follow-up' END;
    alert_body := 'A registration has been unfinished for at least 30 minutes. Open Registration Follow-ups to view available contact details.';
  END IF;

  FOR admin_row IN
    SELECT profile.id, profile.email
    FROM public.profiles profile
    JOIN public.user_roles role ON role.id = profile.role_id
    WHERE role.name = 'super_admin' AND profile.is_active AND profile.status = 'active'
  LOOP
    INSERT INTO public.notifications(user_id, type, title, body, action_url, category, metadata, icon)
    VALUES (
      admin_row.id, 'registration_followup', alert_title, alert_body, action_url,
      'general', jsonb_build_object('alert_id', alert_id, 'alert_type', p_alert_type), 'UserCheck'
    );
    IF public.communication_category_channel_enabled(admin_row.id, 'general', 'push')
       AND EXISTS (SELECT 1 FROM public.push_subscriptions subscription WHERE subscription.user_id = admin_row.id AND subscription.is_active) THEN
      PERFORM public.enqueue_trusted_communication_event(
        'registration_followup', admin_row.id, admin_row.email, NULL, alert_title,
        ARRAY['push']::text[],
        jsonb_build_object('body', alert_body, 'action_url', action_url, 'alert_id', alert_id, 'category', 'general')
      );
    END IF;
  END LOOP;
  RETURN alert_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.notify_admin_of_completed_student_registration()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE
  fee numeric(12,2);
  completed boolean := false;
BEGIN
  IF NEW.status <> 'paid' OR (TG_OP = 'UPDATE' AND OLD.status = 'paid') THEN RETURN NEW; END IF;
  SELECT registration_fee INTO fee FROM public.student_financial_settings WHERE singleton;
  completed := EXISTS (
    SELECT 1 FROM public.payments payment
    WHERE payment.user_id = NEW.user_id AND payment.entity_id = NEW.user_id
      AND payment.payment_type = 'student_registration' AND payment.status = 'success'
      AND payment.amount = fee AND payment.currency = 'GHS'
  ) OR EXISTS (
    SELECT 1 FROM public.registration_access_invites invite
    WHERE invite.redeemed_by = NEW.user_id AND invite.audience = 'student'
      AND invite.redeemed_at IS NOT NULL AND invite.payment_method = 'cash'
  );
  IF completed THEN PERFORM public.queue_admin_registration_alert(NEW.user_id, 'student_completed'); END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS notify_admin_student_registration_completed ON public.student_registration_payments;
CREATE TRIGGER notify_admin_student_registration_completed
AFTER INSERT OR UPDATE OF status ON public.student_registration_payments
FOR EACH ROW EXECUTE FUNCTION public.notify_admin_of_completed_student_registration();

CREATE OR REPLACE FUNCTION public.notify_admin_of_completed_vendor_registration()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE
  fee numeric(12,2);
  completed boolean := false;
BEGIN
  IF NOT (
    NEW.state = 'paid'
    OR (NEW.payment_requirement = 'not_required' AND NEW.state = 'awaiting_verification')
  ) OR (
    TG_OP = 'UPDATE'
    AND OLD.state IN ('paid','awaiting_verification')
    AND OLD.payment_requirement = NEW.payment_requirement
  ) THEN
    RETURN NEW;
  END IF;
  SELECT vendor_registration_fee INTO fee FROM public.student_financial_settings WHERE singleton;
  completed := EXISTS (
    SELECT 1 FROM public.payments payment
    WHERE payment.id = NEW.payment_id AND payment.user_id = NEW.owner_id
      AND payment.vendor_id = NEW.vendor_id AND payment.payment_type = 'vendor_registration'
      AND payment.status = 'success' AND payment.amount = fee AND payment.currency = 'GHS'
  ) OR EXISTS (
    SELECT 1 FROM public.registration_access_invites invite
    WHERE invite.redeemed_by = NEW.owner_id AND invite.audience = 'vendor'
      AND invite.redeemed_at IS NOT NULL AND invite.payment_method = 'cash'
  ) OR (NEW.payment_requirement = 'not_required' AND NEW.state = 'awaiting_verification');
  IF completed THEN PERFORM public.queue_admin_registration_alert(NEW.owner_id, 'vendor_completed'); END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS notify_admin_vendor_registration_completed ON public.vendor_registration_payment_states;
CREATE TRIGGER notify_admin_vendor_registration_completed
AFTER INSERT OR UPDATE OF state ON public.vendor_registration_payment_states
FOR EACH ROW EXECUTE FUNCTION public.notify_admin_of_completed_vendor_registration();

CREATE OR REPLACE FUNCTION public.notify_admin_of_cash_registration_completion()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN
  IF NEW.redeemed_at IS NULL OR NEW.payment_method <> 'cash'
     OR (TG_OP = 'UPDATE' AND OLD.redeemed_at IS NOT NULL) THEN
    RETURN NEW;
  END IF;
  IF NEW.audience = 'student' THEN
    PERFORM public.queue_admin_registration_alert(NEW.redeemed_by, 'student_completed');
  ELSIF NEW.audience = 'vendor' THEN
    PERFORM public.queue_admin_registration_alert(NEW.redeemed_by, 'vendor_completed');
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS notify_admin_cash_registration_completed ON public.registration_access_invites;
CREATE TRIGGER notify_admin_cash_registration_completed
AFTER INSERT OR UPDATE OF redeemed_at, payment_method ON public.registration_access_invites
FOR EACH ROW EXECUTE FUNCTION public.notify_admin_of_cash_registration_completion();

CREATE OR REPLACE FUNCTION public.queue_admin_incomplete_registration_followups(p_limit integer DEFAULT 500)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE
  candidate record;
  intent text;
  fee numeric(12,2);
  is_complete boolean;
  queued_count integer := 0;
BEGIN
  IF p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 1000 THEN
    RAISE EXCEPTION 'Follow-up limit must be from 1 to 1000' USING ERRCODE = '22023';
  END IF;
  FOR candidate IN
    SELECT profile.id, profile.role_id, profile.preferences, role.name AS role_name
    FROM public.profiles profile
    JOIN public.user_roles role ON role.id = profile.role_id
    WHERE profile.created_at <= now() - interval '30 minutes'
      AND profile.created_at >= now() - interval '90 days'
      AND profile.is_active
      AND profile.status IN ('active','pending','pending_payment')
      AND profile.role_id NOT IN (
        SELECT id FROM public.user_roles WHERE name IN ('super_admin','moderator','university_admin','visitor')
      )
    ORDER BY profile.created_at
    LIMIT p_limit
  LOOP
    intent := COALESCE(candidate.preferences ->> 'registration_intent', CASE WHEN candidate.role_name IN ('student','student_vendor') THEN 'student' ELSE 'external_vendor' END);
    IF intent = 'student' THEN
      SELECT registration_fee INTO fee FROM public.student_financial_settings WHERE singleton;
      is_complete := EXISTS (
        SELECT 1 FROM public.student_registration_payments registration
        JOIN public.payments payment ON payment.user_id = registration.user_id AND payment.entity_id = registration.user_id
        WHERE registration.user_id = candidate.id AND registration.status = 'paid'
          AND payment.payment_type = 'student_registration' AND payment.status = 'success'
          AND payment.amount = fee AND payment.currency = 'GHS'
      ) OR EXISTS (
        SELECT 1 FROM public.registration_access_invites invite
        WHERE invite.redeemed_by = candidate.id AND invite.audience = 'student'
          AND invite.redeemed_at IS NOT NULL AND invite.payment_method = 'cash'
      );
      IF NOT is_complete AND public.queue_admin_registration_alert(candidate.id, 'student_incomplete') IS NOT NULL THEN
        queued_count := queued_count + 1;
      END IF;
    ELSIF intent = 'external_vendor' THEN
      SELECT vendor_registration_fee INTO fee FROM public.student_financial_settings WHERE singleton;
      is_complete := EXISTS (
        SELECT 1 FROM public.vendor_registration_payment_states state
        JOIN public.payments payment ON payment.id = state.payment_id
        WHERE state.owner_id = candidate.id AND state.state = 'paid'
          AND payment.user_id = candidate.id AND payment.vendor_id = state.vendor_id
          AND payment.payment_type = 'vendor_registration' AND payment.status = 'success'
          AND payment.amount = fee AND payment.currency = 'GHS'
      ) OR EXISTS (
        SELECT 1 FROM public.registration_access_invites invite
        WHERE invite.redeemed_by = candidate.id AND invite.audience = 'vendor'
          AND invite.redeemed_at IS NOT NULL AND invite.payment_method = 'cash'
      );
      IF NOT is_complete AND public.queue_admin_registration_alert(candidate.id, 'vendor_incomplete') IS NOT NULL THEN
        queued_count := queued_count + 1;
      END IF;
    END IF;
  END LOOP;
  RETURN queued_count;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_admin_registration_followups(p_limit integer DEFAULT 100)
RETURNS TABLE(
  id uuid, user_id uuid, alert_type text, created_at timestamptz, resolved_at timestamptz,
  full_name text, email text, phone text, role_name text, university_name text, business_name text
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN
  IF public.current_app_role() <> 'super_admin' THEN
    RAISE EXCEPTION 'Super Admin access required' USING ERRCODE = '42501';
  END IF;
  IF p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 200 THEN
    RAISE EXCEPTION 'Follow-up limit must be from 1 to 200' USING ERRCODE = '22023';
  END IF;
  RETURN QUERY
  SELECT alert.id, alert.user_id, alert.alert_type, alert.created_at, alert.resolved_at,
    profile.full_name, profile.email, profile.phone, role.name,
    university.name, vendor.business_name
  FROM public.admin_registration_alerts alert
  JOIN public.profiles profile ON profile.id = alert.user_id
  JOIN public.user_roles role ON role.id = profile.role_id
  LEFT JOIN public.universities university ON university.id = profile.university_id
  LEFT JOIN LATERAL (
    SELECT v.business_name FROM public.vendors v
    WHERE v.owner_id = profile.id ORDER BY v.created_at DESC LIMIT 1
  ) vendor ON true
  ORDER BY alert.created_at DESC
  LIMIT p_limit;
END;
$$;

REVOKE ALL ON FUNCTION public.queue_admin_registration_alert(uuid,text), public.notify_admin_of_completed_student_registration(), public.notify_admin_of_completed_vendor_registration(), public.notify_admin_of_cash_registration_completion(), public.queue_admin_incomplete_registration_followups(integer), public.get_admin_registration_followups(integer) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_admin_registration_followups(integer) TO authenticated;

DO $$
BEGIN
  IF to_regnamespace('cron') IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'unieco-admin-registration-followups') THEN
    PERFORM cron.schedule(
      'unieco-admin-registration-followups', '*/15 * * * *',
      'SELECT public.queue_admin_incomplete_registration_followups(500);'
    );
  END IF;
END;
$$;

COMMIT;
