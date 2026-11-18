BEGIN;

-- Paystack authorization URLs are private capabilities. Keep them separate
-- from the user-visible payments ledger and scoped to a single payment attempt.
CREATE TABLE public.registration_paystack_checkouts (
  payment_id uuid PRIMARY KEY REFERENCES public.payments(id) ON DELETE CASCADE,
  provider_environment text NOT NULL CHECK (provider_environment IN ('test', 'live')),
  authorization_url text NOT NULL CHECK (authorization_url ~ '^https://checkout[.]paystack[.]com/[a-zA-Z0-9._-]{1,200}/?$'),
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.registration_paystack_checkouts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.registration_paystack_checkouts FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT ON TABLE public.registration_paystack_checkouts TO service_role;

CREATE OR REPLACE FUNCTION public.registration_reminder_context(p_user_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE
  access_state jsonb;
  lane text;
  amount numeric;
BEGIN
  IF p_user_id IS NULL OR public.courier_without_paid_intent(p_user_id)
     OR NOT EXISTS (
       SELECT 1 FROM auth.users u
       WHERE u.id = p_user_id AND u.email_confirmed_at IS NOT NULL AND NULLIF(btrim(u.email), '') IS NOT NULL
     )
     OR EXISTS (
       SELECT 1 FROM public.account_restrictions
       WHERE user_id = p_user_id AND is_active AND (ends_at IS NULL OR ends_at > now())
     ) THEN RETURN NULL; END IF;

  access_state := public.registration_account_state(p_user_id);
  IF access_state ->> 'role' NOT IN ('student', 'student_vendor', 'external_vendor')
     OR (access_state ->> 'allowed')::boolean IS NOT FALSE
     OR (access_state ->> 'buyer_restricted')::boolean IS NOT FALSE THEN RETURN NULL; END IF;

  IF (access_state ->> 'can_pay_student_registration')::boolean IS TRUE
     AND EXISTS (
       SELECT 1 FROM public.student_profiles s JOIN public.profiles p ON p.id = s.user_id
       WHERE s.user_id = p_user_id AND s.university_id IS NOT NULL AND NULLIF(btrim(p.phone), '') IS NOT NULL
     ) THEN
    lane := 'student';
    amount := (access_state ->> 'student_fee')::numeric;
  ELSIF (access_state ->> 'can_pay_vendor_registration')::boolean IS TRUE
     AND EXISTS (
       SELECT 1 FROM public.vendor_registration_payment_states s JOIN public.vendors v ON v.id = s.vendor_id
       WHERE s.owner_id = p_user_id AND v.owner_id = p_user_id AND s.state <> 'paid'
     ) THEN
    lane := 'vendor';
    amount := (access_state ->> 'vendor_fee')::numeric;
  END IF;
  IF lane IS NULL OR amount IS NULL OR amount <= 0 THEN RETURN NULL; END IF;
  RETURN jsonb_build_object(
    'registration_intent', CASE WHEN lane = 'vendor' THEN 'external_vendor' ELSE 'student' END,
    'amount', amount, 'currency', 'GHS', 'template', 'registration_payment_required',
    'reminder_subject', CASE WHEN lane = 'vendor'
      THEN 'Complete your UniEco business registration' ELSE 'Complete your UniEco registration' END,
    'body', format('Complete registration with the one-time GH₵%s fee on Paystack.', to_char(amount, 'FM999999990.00')),
    'action_url', 'https://www.uniecoghana.com/payments/registration-checkout?role=' || lane
  );
END;
$$;
REVOKE ALL ON FUNCTION public.registration_reminder_context(uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.registration_reminder_context(uuid) TO service_role;

-- A profile or push subscription is not evidence that there is a fee due.
-- The daily campaign below is the sole automatic reminder entry point.
CREATE OR REPLACE FUNCTION public.queue_registration_payment_prompt()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN RETURN NEW; END;
$$;
CREATE OR REPLACE FUNCTION public.queue_registration_payment_push_after_subscription()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN RETURN NEW; END;
$$;

CREATE OR REPLACE FUNCTION public.guard_registration_payment_notification()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN
  IF public.registration_reminder_context(NEW.user_id) IS NULL THEN RETURN NULL; END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.guard_registration_payment_notification() FROM PUBLIC, anon, authenticated, service_role;
CREATE TRIGGER guard_registration_payment_notification
  BEFORE INSERT ON public.notifications FOR EACH ROW WHEN (NEW.type = 'registration_payment_required')
  EXECUTE FUNCTION public.guard_registration_payment_notification();

CREATE OR REPLACE FUNCTION public.queue_registration_payment_reminders(p_limit integer DEFAULT 500)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE
  target record;
  campaign_id uuid;
  queued_count integer := 0;
  period_start_utc timestamptz := date_trunc('day', now(), 'UTC');
BEGIN
  FOR target IN
    WITH due AS MATERIALIZED (
      SELECT p.id, p.created_at, public.registration_reminder_context(p.id) AS context
      FROM public.profiles p
      JOIN public.user_roles r ON r.id = p.role_id AND r.name IN ('student', 'student_vendor', 'external_vendor')
      WHERE p.is_active AND NOT EXISTS (
        SELECT 1 FROM public.communication_campaign_log l WHERE l.user_id = p.id
          AND l.campaign_key = 'registration_payment_required' AND l.period_start = period_start_utc
      )
    )
    SELECT id, context FROM due WHERE context IS NOT NULL
    ORDER BY created_at, id LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 500), 1000))
  LOOP
    INSERT INTO public.communication_campaign_log(user_id, campaign_key, period_start)
    VALUES (target.id, 'registration_payment_required', period_start_utc)
    ON CONFLICT DO NOTHING RETURNING id INTO campaign_id;
    IF campaign_id IS NULL THEN CONTINUE; END IF;

    PERFORM public.queue_user_communication(
      target.id, 'registration_payment_required',
      target.context ->> 'reminder_subject', target.context ->> 'body',
      'payments', target.context ->> 'action_url', 'CreditCard', 'registration_payment_required', target.context
    );
    queued_count := queued_count + 1;
  END LOOP;
  RETURN queued_count;
END;
$$;

-- Recheck already-queued outbound reminders before any email or push can
-- leave for a recently paid, exempt, or otherwise ineligible account.
CREATE OR REPLACE FUNCTION public.claim_trusted_communication_events(p_limit integer DEFAULT 10)
RETURNS TABLE(
  event_id uuid, event_type text, recipient_id uuid, recipient_email text,
  recipient_phone text, subject text, metadata jsonb, delivery_id uuid, channel text
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN
  IF p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 25 THEN
    RAISE EXCEPTION 'Queue limit must be between 1 and 25' USING ERRCODE = '22023';
  END IF;
  PERFORM public.recover_stuck_trusted_communication_events();

  -- Skip claimed work (including concurrent workers); retain audit history.
  WITH obsolete AS (
    SELECT e.id
    FROM public.communication_events e
    WHERE e.event_type = 'registration_payment_required' AND e.status IN ('queued', 'failed')
      AND e.attempt_count < 3 AND public.registration_reminder_context(e.recipient_id) IS NULL
    ORDER BY e.created_at LIMIT p_limit
    FOR UPDATE SKIP LOCKED
  ), suppressed AS (
    UPDATE public.communication_events e SET status = 'cancelled', updated_at = now(), processing_started_at = NULL
    FROM obsolete o WHERE e.id = o.id RETURNING e.id
  )
  UPDATE public.communication_deliveries d SET status = 'failed', last_error_at = now(),
    error_message = 'Suppressed: registration payment is no longer due or cannot be resumed'
  FROM suppressed s WHERE d.event_id = s.id AND d.status = 'queued';

  RETURN QUERY
  WITH candidates AS (
    SELECT e.id
    FROM public.communication_events e
    WHERE (e.status = 'queued' OR (e.status = 'failed' AND e.attempt_count < 3 AND e.next_attempt_at <= now()))
      AND (e.event_type <> 'registration_payment_required' OR public.registration_reminder_context(e.recipient_id) IS NOT NULL)
    ORDER BY e.created_at
    FOR UPDATE SKIP LOCKED
    LIMIT p_limit
  ), claimed AS (
    UPDATE public.communication_events e
    SET status = 'processing', attempt_count = e.attempt_count + 1, processing_started_at = now(), updated_at = now()
    FROM candidates c
    WHERE e.id = c.id
    RETURNING e.id, e.event_type, e.recipient_id, e.recipient_email, e.recipient_phone, e.subject, e.metadata
  )
  SELECT c.id, c.event_type, c.recipient_id,
    CASE WHEN c.event_type = 'registration_payment_required' THEN u.email ELSE c.recipient_email END,
    c.recipient_phone,
    CASE WHEN c.event_type = 'registration_payment_required' THEN reminder.context ->> 'reminder_subject' ELSE c.subject END,
    CASE WHEN c.event_type = 'registration_payment_required'
      THEN COALESCE(c.metadata, '{}'::jsonb) || reminder.context
      ELSE c.metadata END, d.id, d.channel
  FROM claimed c
  JOIN public.communication_deliveries d ON d.event_id = c.id AND d.status = 'queued'
  LEFT JOIN auth.users u ON c.event_type = 'registration_payment_required' AND u.id = c.recipient_id
  LEFT JOIN LATERAL (SELECT public.registration_reminder_context(c.recipient_id) AS context) reminder
    ON c.event_type = 'registration_payment_required'
  ORDER BY c.id, d.created_at;
END;
$$;

COMMIT;
