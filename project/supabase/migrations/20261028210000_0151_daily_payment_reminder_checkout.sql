-- Send one payment reminder per day at a predictable Ghana-time window and
-- make the reminder open a secure Paystack checkout when saved registration
-- details are available. Payment confirmation and referral delivery remain
-- webhook-authoritative.
BEGIN;

CREATE OR REPLACE FUNCTION public.resume_student_registration_payment(
  p_idempotency_key text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  uid uuid := auth.uid();
  profile_row public.profiles%ROWTYPE;
  student_row public.student_profiles%ROWTYPE;
  referral_code text;
  profile_found boolean := false;
  student_found boolean := false;
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO profile_row FROM public.profiles WHERE id = uid FOR SHARE;
  profile_found := FOUND;
  SELECT * INTO student_row FROM public.student_profiles WHERE user_id = uid FOR SHARE;
  student_found := FOUND;
  SELECT registration.referral_code INTO referral_code
  FROM public.student_registration_payments registration
  WHERE registration.user_id = uid;

  IF NOT profile_found OR NOT student_found OR student_row.university_id IS NULL OR profile_row.phone IS NULL THEN
    RAISE EXCEPTION 'Complete your student profile before starting payment' USING ERRCODE = '22023';
  END IF;

  RETURN public.begin_student_registration_payment(
    student_row.university_id,
    profile_row.phone,
    student_row.student_id_number,
    student_row.program_of_study,
    student_row.faculty,
    student_row.department,
    student_row.level,
    student_row.admission_year,
    student_row.graduation_year,
    student_row.student_id_document_url,
    referral_code,
    p_idempotency_key
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.resume_vendor_registration_payment(
  p_idempotency_key text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  uid uuid := auth.uid();
  vendor_id uuid;
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;

  SELECT vendor.id INTO vendor_id
  FROM public.vendors vendor
  JOIN public.vendor_registration_payment_states state
    ON state.vendor_id = vendor.id AND state.owner_id = uid
  WHERE vendor.owner_id = uid AND state.state <> 'paid'
  ORDER BY vendor.created_at DESC
  LIMIT 1;

  IF vendor_id IS NULL THEN
    RAISE EXCEPTION 'Complete your business profile before starting payment' USING ERRCODE = '22023';
  END IF;

  RETURN public.begin_vendor_registration_payment(vendor_id, p_idempotency_key);
END;
$$;

REVOKE ALL ON FUNCTION public.resume_student_registration_payment(text), public.resume_vendor_registration_payment(text)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.resume_student_registration_payment(text), public.resume_vendor_registration_payment(text)
  TO authenticated;

-- 18:15 UTC is 18:15 in Ghana. Replace the existing six-hourly schedule so a
-- user receives at most one reminder per day, while paid/cash-authorized users
-- stop receiving reminders on the next run.
DO $$
DECLARE
  job_id bigint;
BEGIN
  IF to_regnamespace('cron') IS NOT NULL THEN
    FOR job_id IN SELECT jobid FROM cron.job WHERE jobname = 'unieco-registration-payment-reminders' LOOP
      PERFORM cron.unschedule(job_id);
    END LOOP;
    PERFORM cron.schedule(
      'unieco-registration-payment-reminders',
      '15 18 * * *',
      'SELECT public.queue_registration_payment_reminders(1000);'
    );
  END IF;
END;
$$;

-- 0149 may already be installed in production. Recreate its trigger and
-- reminder functions here so existing accounts also receive the direct
-- resume-checkout URL, not the long onboarding form.
CREATE OR REPLACE FUNCTION public.queue_registration_payment_prompt()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  intent text := NEW.preferences ->> 'registration_intent';
  fee numeric(12,2);
  target_path text;
  title_text text;
  body_text text;
  campaign_id uuid;
BEGIN
  IF NEW.role_id NOT IN (2, 3, 4)
     OR intent IS NULL
     OR intent NOT IN ('student', 'external_vendor') THEN RETURN NEW; END IF;

  IF intent = 'student' THEN
    SELECT registration_fee INTO fee FROM public.student_financial_settings WHERE singleton;
    IF EXISTS (
      SELECT 1
      FROM public.student_registration_payments registration
      JOIN public.payments payment
        ON payment.user_id = registration.user_id
       AND payment.entity_id = registration.user_id
       AND payment.payment_type = 'student_registration'
       AND payment.status = 'success'
       AND payment.amount = fee
       AND payment.currency = 'GHS'
      WHERE registration.user_id = NEW.id AND registration.status = 'paid'
    ) OR EXISTS (
      SELECT 1 FROM public.registration_access_invites
      WHERE redeemed_by = NEW.id AND audience = 'student'
        AND redeemed_at IS NOT NULL AND payment_method = 'cash'
    ) THEN RETURN NEW; END IF;
    target_path := 'https://www.uniecoghana.com/payments/registration-checkout?role=student';
    title_text := 'Complete your UniEco registration';
    body_text := format('Your account is ready. Pay the one-time GH₵%s registration fee to unlock UniEco Ghana and start your student verification.', to_char(fee, 'FM999999990.00'));
  ELSE
    SELECT vendor_registration_fee INTO fee FROM public.student_financial_settings WHERE singleton;
    IF EXISTS (
      SELECT 1
      FROM public.vendors vendor
      JOIN public.vendor_registration_payment_states state
        ON state.vendor_id = vendor.id AND state.owner_id = NEW.id AND state.state = 'paid'
      JOIN public.payments payment
        ON payment.id = state.payment_id
       AND payment.user_id = NEW.id
       AND payment.vendor_id = vendor.id
       AND payment.payment_type = 'vendor_registration'
       AND payment.status = 'success'
       AND payment.amount = fee
       AND payment.currency = 'GHS'
      WHERE vendor.owner_id = NEW.id
    ) OR EXISTS (
      SELECT 1 FROM public.registration_access_invites
      WHERE redeemed_by = NEW.id AND audience = 'vendor'
        AND redeemed_at IS NOT NULL AND payment_method = 'cash'
    ) THEN RETURN NEW; END IF;
    target_path := 'https://www.uniecoghana.com/payments/registration-checkout?role=vendor';
    title_text := 'Complete your UniEco business registration';
    body_text := format('Your business account is ready. Pay the one-time GH₵%s registration fee to unlock vendor tools and submit your business for review.', to_char(fee, 'FM999999990.00'));
  END IF;

  INSERT INTO public.communication_campaign_log(user_id, campaign_key, period_start)
  VALUES (NEW.id, 'registration_payment_required', to_timestamp(0))
  ON CONFLICT DO NOTHING
  RETURNING id INTO campaign_id;
  IF campaign_id IS NULL THEN RETURN NEW; END IF;

  PERFORM public.queue_user_communication(
    NEW.id, 'registration_payment_required', title_text, body_text,
    'payments', target_path, 'CreditCard', 'registration_payment_required',
    jsonb_build_object('registration_intent', intent, 'amount', fee, 'currency', 'GHS')
  );
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.queue_registration_payment_push_after_subscription()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  recipient public.profiles%ROWTYPE;
  intent text;
  fee numeric(12,2);
  target_path text;
  title_text text;
  body_text text;
  already_paid boolean := false;
BEGIN
  SELECT * INTO recipient FROM public.profiles WHERE id = NEW.user_id AND is_active;
  IF NOT FOUND THEN RETURN NEW; END IF;

  intent := COALESCE(recipient.preferences ->> 'registration_intent', CASE WHEN recipient.role_id = 2 THEN 'student' ELSE 'external_vendor' END);
  IF intent = 'student' THEN
    SELECT registration_fee INTO fee FROM public.student_financial_settings WHERE singleton;
    already_paid := EXISTS (
      SELECT 1
      FROM public.student_registration_payments registration
      JOIN public.payments payment
        ON payment.user_id = registration.user_id
       AND payment.entity_id = registration.user_id
       AND payment.payment_type = 'student_registration'
       AND payment.status = 'success'
       AND payment.amount = fee
       AND payment.currency = 'GHS'
      WHERE registration.user_id = NEW.user_id AND registration.status = 'paid'
    ) OR EXISTS (
      SELECT 1 FROM public.registration_access_invites
      WHERE redeemed_by = NEW.user_id AND audience = 'student'
        AND redeemed_at IS NOT NULL AND payment_method = 'cash'
    );
    target_path := 'https://www.uniecoghana.com/payments/registration-checkout?role=student';
    title_text := 'Finish your UniEco registration';
    body_text := format('Pay GH₵%s to unlock your UniEco Ghana student account.', to_char(fee, 'FM999999990.00'));
  ELSE
    SELECT vendor_registration_fee INTO fee FROM public.student_financial_settings WHERE singleton;
    already_paid := EXISTS (
      SELECT 1
      FROM public.vendor_registration_payment_states state
      JOIN public.payments payment
        ON payment.id = state.payment_id
       AND payment.status = 'success'
       AND payment.payment_type = 'vendor_registration'
       AND payment.amount = fee
       AND payment.currency = 'GHS'
      WHERE state.owner_id = NEW.user_id AND state.state = 'paid'
    ) OR EXISTS (
      SELECT 1 FROM public.registration_access_invites
      WHERE redeemed_by = NEW.user_id AND audience = 'vendor'
        AND redeemed_at IS NOT NULL AND payment_method = 'cash'
    );
    target_path := 'https://www.uniecoghana.com/payments/registration-checkout?role=vendor';
    title_text := 'Finish your UniEco business registration';
    body_text := format('Pay GH₵%s to unlock your UniEco Ghana vendor tools.', to_char(fee, 'FM999999990.00'));
  END IF;

  IF already_paid OR NOT public.communication_category_channel_enabled(NEW.user_id, 'payments', 'push') THEN RETURN NEW; END IF;
  INSERT INTO public.notifications(user_id, type, title, body, action_url, category, metadata, icon)
  VALUES (NEW.user_id, 'registration_payment_required', title_text, body_text, target_path, 'payments', jsonb_build_object('source','unieco_lifecycle','amount',fee,'currency','GHS'), 'CreditCard');
  PERFORM public.enqueue_trusted_communication_event(
    'registration_payment_required', NEW.user_id, recipient.email, NULL, title_text,
    ARRAY['push']::text[], jsonb_build_object('body', body_text, 'action_url', target_path, 'amount', fee, 'currency', 'GHS', 'template', 'registration_payment_required')
  );
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.queue_registration_payment_reminders(p_limit integer DEFAULT 500)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  target public.profiles%ROWTYPE;
  intent text;
  fee numeric(12,2);
  campaign_id uuid;
  queued_count integer := 0;
  v_period_start timestamptz := date_trunc('day', now());
  paid boolean;
  cash_authorized boolean;
BEGIN
  FOR target IN
    SELECT profile.*
    FROM public.profiles profile
    WHERE profile.is_active
      AND profile.role_id IN (2, 3, 4)
      AND NOT EXISTS (
        SELECT 1 FROM public.communication_campaign_log log
        WHERE log.user_id = profile.id
          AND log.campaign_key = 'registration_payment_required'
          AND log.period_start = v_period_start
      )
    ORDER BY profile.created_at
    LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 500), 1000))
  LOOP
    intent := COALESCE(target.preferences ->> 'registration_intent', CASE WHEN target.role_id = 2 THEN 'student' ELSE 'external_vendor' END);
    IF intent = 'student' THEN
      SELECT registration_fee INTO fee FROM public.student_financial_settings WHERE singleton;
      paid := EXISTS (
        SELECT 1 FROM public.student_registration_payments registration
        JOIN public.payments payment
          ON payment.user_id = registration.user_id
         AND payment.entity_id = registration.user_id
         AND payment.payment_type = 'student_registration'
         AND payment.status = 'success'
         AND payment.amount = fee
         AND payment.currency = 'GHS'
        WHERE registration.user_id = target.id AND registration.status = 'paid'
      );
      cash_authorized := EXISTS (
        SELECT 1 FROM public.registration_access_invites
        WHERE redeemed_by = target.id AND audience = 'student'
          AND redeemed_at IS NOT NULL AND payment_method = 'cash'
      );
    ELSE
      SELECT vendor_registration_fee INTO fee FROM public.student_financial_settings WHERE singleton;
      paid := EXISTS (
        SELECT 1 FROM public.vendor_registration_payment_states state
        JOIN public.payments payment
          ON payment.id = state.payment_id
         AND payment.status = 'success'
         AND payment.payment_type = 'vendor_registration'
         AND payment.amount = fee
         AND payment.currency = 'GHS'
        WHERE state.owner_id = target.id AND state.state = 'paid'
      );
      cash_authorized := EXISTS (
        SELECT 1 FROM public.registration_access_invites
        WHERE redeemed_by = target.id AND audience = 'vendor'
          AND redeemed_at IS NOT NULL AND payment_method = 'cash'
      );
    END IF;
    IF paid OR cash_authorized THEN CONTINUE; END IF;

    campaign_id := NULL;
    INSERT INTO public.communication_campaign_log(user_id, campaign_key, period_start)
    VALUES (target.id, 'registration_payment_required', v_period_start)
    ON CONFLICT DO NOTHING
    RETURNING id INTO campaign_id;
    IF campaign_id IS NULL THEN CONTINUE; END IF;

    IF intent = 'student' THEN
      PERFORM public.queue_user_communication(
        target.id, 'registration_payment_required', 'Complete your UniEco registration',
        format('Pay the one-time GH₵%s registration fee to unlock UniEco Ghana and start your student verification.', to_char(fee, 'FM999999990.00')),
        'payments', 'https://www.uniecoghana.com/payments/registration-checkout?role=student', 'CreditCard', 'registration_payment_required',
        jsonb_build_object('registration_intent', 'student', 'amount', fee, 'currency', 'GHS')
      );
    ELSE
      PERFORM public.queue_user_communication(
        target.id, 'registration_payment_required', 'Complete your UniEco business registration',
        format('Pay the one-time GH₵%s registration fee to unlock vendor tools and submit your business for review.', to_char(fee, 'FM999999990.00')),
        'payments', 'https://www.uniecoghana.com/payments/registration-checkout?role=vendor', 'CreditCard', 'registration_payment_required',
        jsonb_build_object('registration_intent', 'external_vendor', 'amount', fee, 'currency', 'GHS')
      );
    END IF;
    queued_count := queued_count + 1;
  END LOOP;
  RETURN queued_count;
END;
$$;

REVOKE ALL ON FUNCTION public.queue_registration_payment_prompt() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.queue_registration_payment_push_after_subscription() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.queue_registration_payment_reminders(integer) FROM PUBLIC, anon, authenticated, service_role;

COMMIT;
