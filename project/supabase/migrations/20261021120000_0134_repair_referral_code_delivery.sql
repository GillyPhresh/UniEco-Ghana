-- Repair the referral handoff for paid students and make delivery retryable.
-- Referral rewards remain authoritative: the referred student must still pay
-- and pass student verification before the GH₵2 reward is created.
BEGIN;

CREATE OR REPLACE FUNCTION public.queue_referral_link_message_for_user(
  p_user_id uuid,
  p_code text
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  recipient public.profiles%ROWTYPE;
  code_value text := upper(btrim(p_code));
  referral_link text;
  existing_event_id uuid;
  existing_event_status text;
  existing_next_attempt_at timestamptz;
BEGIN
  IF p_user_id IS NULL OR code_value !~ '^UE-[A-F0-9]{20}$' THEN
    RETURN;
  END IF;

  SELECT * INTO recipient
  FROM public.profiles
  WHERE id = p_user_id;
  IF NOT FOUND THEN
    RETURN;
  END IF;

  referral_link := 'https://uniecoghana.com/signup?ref=' || code_value;

  INSERT INTO public.notifications(
    user_id, type, title, body, action_url, category, metadata, icon
  )
  SELECT
    recipient.id,
    'referral_link_ready',
    'Your UniEco referral link is ready',
    'Share your unique UniEco Ghana link with genuine students. Eligible registrations can earn you GH₵2 after payment and verification.',
    'https://uniecoghana.com/dashboard/referrals',
    'general',
    jsonb_build_object(
      'referral_code', code_value,
      'referral_link', referral_link,
      'reward_amount', 2,
      'currency', 'GHS'
    ),
    'Gift'
  WHERE NOT EXISTS (
    SELECT 1
    FROM public.notifications notification
    WHERE notification.user_id = recipient.id
      AND notification.type = 'referral_link_ready'
      AND notification.metadata->>'referral_code' = code_value
  );

  UPDATE public.notifications
  SET body = 'Share your unique UniEco Ghana link with genuine students. Eligible registrations can earn you GH' || chr(8373) || '2 after payment and verification.'
  WHERE user_id = recipient.id
    AND type = 'referral_link_ready'
    AND metadata->>'referral_code' = code_value;

  IF recipient.email IS NULL THEN
    RETURN;
  END IF;

  SELECT event.id, event.status, event.next_attempt_at
  INTO existing_event_id, existing_event_status, existing_next_attempt_at
  FROM public.communication_events event
  WHERE event.event_type = 'referral_link_ready'
    AND event.recipient_id = recipient.id
    AND event.metadata->>'referral_code' = code_value
  ORDER BY event.created_at DESC
  LIMIT 1;

  IF existing_event_id IS NULL THEN
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
        'referral_code', code_value,
        'referral_link', referral_link,
        'reward_amount', 2,
        'currency', 'GHS',
        'action_url', 'https://uniecoghana.com/dashboard/referrals'
      )
    );
  ELSIF existing_event_status = 'failed'
        AND (existing_next_attempt_at IS NULL OR existing_next_attempt_at <= now()) THEN
    -- Re-open a failed referral email without creating duplicates on every
    -- dashboard visit. The trusted queue will apply its normal retry rules.
    UPDATE public.communication_deliveries
    SET status = 'queued', error_message = NULL
    WHERE event_id = existing_event_id
      AND status = 'failed';
    UPDATE public.communication_events
    SET status = 'queued', next_attempt_at = NULL,
        processing_started_at = NULL, updated_at = now()
    WHERE id = existing_event_id
      AND status = 'failed';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.queue_referral_link_message()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  PERFORM public.queue_referral_link_message_for_user(NEW.user_id, NEW.code);
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.ensure_my_student_referral_link()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  uid uuid := auth.uid();
  role_name text;
  profile_active boolean;
  profile_status text;
  code_value text;
  referral_link text;
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;

  SELECT role.name, profile.is_active, profile.status
  INTO role_name, profile_active, profile_status
  FROM public.profiles profile
  JOIN public.user_roles role ON role.id = profile.role_id
  WHERE profile.id = uid;

  IF role_name NOT IN ('student', 'student_vendor')
     OR profile_active IS NOT TRUE
     OR profile_status IS DISTINCT FROM 'active' THEN
    RETURN jsonb_build_object(
      'eligible', false,
      'code', NULL,
      'message', 'Complete paid student registration before using referrals'
    );
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.student_registration_payments
    WHERE user_id = uid
      AND status = 'paid'
  ) THEN
    RETURN jsonb_build_object(
      'eligible', false,
      'code', NULL,
      'message', 'Complete paid student registration before using referrals'
    );
  END IF;

  SELECT code INTO code_value
  FROM public.student_referral_codes
  WHERE user_id = uid
    AND revoked_at IS NULL
  FOR UPDATE;

  IF code_value IS NULL THEN
    INSERT INTO public.student_referral_codes(user_id, code)
    VALUES (uid, 'UE-' || upper(encode(extensions.gen_random_bytes(10), 'hex')))
    ON CONFLICT (user_id) DO UPDATE SET revoked_at = NULL
    RETURNING code INTO code_value;
  END IF;

  referral_link := 'https://uniecoghana.com/signup?ref=' || code_value;
  PERFORM public.queue_referral_link_message_for_user(uid, code_value);

  RETURN jsonb_build_object(
    'eligible', true,
    'code', code_value,
    'referral_link', referral_link,
    'reward_amount', 2,
    'currency', 'GHS'
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.attach_my_referral_code(p_referral_code text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  uid uuid := auth.uid();
  code_value text := upper(NULLIF(btrim(p_referral_code), ''));
  referrer_id uuid;
  registration_row public.student_registration_payments%ROWTYPE;
  existing_attribution public.student_referral_attributions%ROWTYPE;
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;
  IF code_value IS NULL OR code_value !~ '^UE-[A-F0-9]{20}$' THEN
    RAISE EXCEPTION 'Referral code is invalid' USING ERRCODE = '22023';
  END IF;

  SELECT code.user_id INTO referrer_id
  FROM public.student_referral_codes code
  JOIN public.profiles referrer ON referrer.id = code.user_id
  JOIN public.user_roles role ON role.id = referrer.role_id
  WHERE code.code = code_value
    AND code.revoked_at IS NULL
    AND referrer.is_active
    AND referrer.status = 'active'
    AND role.name IN ('student', 'student_vendor')
  FOR SHARE;

  IF referrer_id IS NULL OR referrer_id = uid THEN
    RAISE EXCEPTION 'Referral code is invalid' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO registration_row
  FROM public.student_registration_payments
  WHERE user_id = uid
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('attached', false, 'code', code_value);
  END IF;

  IF registration_row.status IN ('paid', 'reversed') THEN
    RAISE EXCEPTION 'Referral code cannot be added after registration payment is complete' USING ERRCODE = '22023';
  END IF;

  IF registration_row.referral_code IS NOT NULL
     AND registration_row.referral_code <> code_value THEN
    RAISE EXCEPTION 'Registration referral code is already locked' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO existing_attribution
  FROM public.student_referral_attributions
  WHERE referred_user_id = uid
  FOR UPDATE;

  IF FOUND AND existing_attribution.code <> code_value THEN
    RAISE EXCEPTION 'Registration referral code is already locked' USING ERRCODE = '22023';
  END IF;

  UPDATE public.student_registration_payments
  SET referral_code = code_value, updated_at = now()
  WHERE id = registration_row.id
    AND referral_code IS NULL;

  INSERT INTO public.student_referral_attributions(
    referrer_user_id, referred_user_id, code, university_id
  )
  VALUES (referrer_id, uid, code_value, registration_row.university_id)
  ON CONFLICT (referred_user_id) DO NOTHING;

  RETURN jsonb_build_object('attached', true, 'code', code_value);
END;
$$;

-- Internal helper for the repair block. It is deliberately not exposed to
-- browser roles; the authenticated wrapper below is the only client path.
CREATE OR REPLACE FUNCTION public.ensure_my_student_referral_link_for_user(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE code_value text;
BEGIN
  SELECT code INTO code_value
  FROM public.student_referral_codes
  WHERE user_id = p_user_id AND revoked_at IS NULL
  FOR UPDATE;
  IF code_value IS NULL THEN
    INSERT INTO public.student_referral_codes(user_id, code)
    VALUES (p_user_id, 'UE-' || upper(encode(extensions.gen_random_bytes(10), 'hex')))
    ON CONFLICT (user_id) DO UPDATE SET revoked_at = NULL
    RETURNING code INTO code_value;
  END IF;
  PERFORM public.queue_referral_link_message_for_user(p_user_id, code_value);
END;
$$;

-- Repair paid active accounts that completed payment before the delivery
-- trigger was installed or while the queue was unavailable.
DO $$
DECLARE
  paid_student record;
BEGIN
  FOR paid_student IN
    SELECT registration.user_id
    FROM public.student_registration_payments registration
    JOIN public.profiles profile ON profile.id = registration.user_id
    JOIN public.user_roles role ON role.id = profile.role_id
    WHERE registration.status = 'paid'
      AND profile.is_active
      AND profile.status = 'active'
      AND role.name IN ('student', 'student_vendor')
  LOOP
    PERFORM public.ensure_my_student_referral_link_for_user(paid_student.user_id);
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.queue_referral_link_message_for_user(uuid,text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.ensure_my_student_referral_link_for_user(uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.ensure_my_student_referral_link() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.attach_my_referral_code(text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.ensure_my_student_referral_link() TO authenticated;
GRANT EXECUTE ON FUNCTION public.attach_my_referral_code(text) TO authenticated;

COMMIT;
