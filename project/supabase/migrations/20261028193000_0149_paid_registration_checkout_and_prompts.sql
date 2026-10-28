-- Restore the authoritative paid-registration flow after the temporary free
-- student-registration repair. Paystack/webhook verification remains the only
-- path that unlocks member access; sponsored cash invites remain explicit.
BEGIN;

CREATE OR REPLACE FUNCTION public.get_my_registration_access()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  uid uuid := auth.uid();
  role_name text := public.current_app_role();
  required_amount numeric(12,2);
  paid boolean := false;
  cash_authorized boolean := false;
BEGIN
  IF uid IS NULL THEN
    RETURN jsonb_build_object('allowed', false, 'role', NULL, 'required_amount', NULL, 'status', 'unauthenticated');
  END IF;
  IF role_name IN ('moderator', 'super_admin', 'university_admin') THEN
    RETURN jsonb_build_object('allowed', true, 'role', role_name, 'required_amount', 0, 'status', 'staff_exempt');
  END IF;

  IF role_name = 'student' THEN
    SELECT registration_fee INTO required_amount
    FROM public.student_financial_settings WHERE singleton;
    cash_authorized := EXISTS (
      SELECT 1 FROM public.registration_access_invites
      WHERE redeemed_by = uid AND audience = 'student'
        AND redeemed_at IS NOT NULL AND payment_method = 'cash'
    );
    paid := EXISTS (
      SELECT 1
      FROM public.student_registration_payments registration
      JOIN public.payments payment
        ON payment.user_id = registration.user_id
       AND payment.payment_type = 'student_registration'
       AND payment.entity_id = registration.user_id
       AND payment.status = 'success'
       AND payment.amount = required_amount
       AND payment.currency = 'GHS'
      WHERE registration.user_id = uid AND registration.status = 'paid'
    );
  ELSIF role_name IN ('student_vendor', 'external_vendor') THEN
    SELECT vendor_registration_fee INTO required_amount
    FROM public.student_financial_settings WHERE singleton;
    cash_authorized := EXISTS (
      SELECT 1 FROM public.registration_access_invites
      WHERE redeemed_by = uid AND audience = 'vendor'
        AND redeemed_at IS NOT NULL AND payment_method = 'cash'
    );
    paid := EXISTS (
      SELECT 1
      FROM public.vendors vendor
      JOIN public.vendor_registration_payment_states state
        ON state.vendor_id = vendor.id AND state.owner_id = uid AND state.state = 'paid'
      JOIN public.payments payment
        ON payment.id = state.payment_id
       AND payment.user_id = uid
       AND payment.vendor_id = vendor.id
       AND payment.payment_type = 'vendor_registration'
       AND payment.status = 'success'
       AND payment.amount = required_amount
       AND payment.currency = 'GHS'
      WHERE vendor.owner_id = uid
    );
  ELSE
    RETURN jsonb_build_object('allowed', false, 'role', role_name, 'required_amount', NULL, 'status', 'registration_required');
  END IF;

  RETURN jsonb_build_object(
    'allowed', paid OR cash_authorized,
    'role', role_name,
    'required_amount', required_amount,
    'currency', 'GHS',
    'status', CASE WHEN cash_authorized THEN 'cash_verified' WHEN paid THEN 'paid' ELSE 'payment_required' END,
    'cash_authorized', cash_authorized
  );
END;
$$;

-- Preserve the account type selected on the sign-up form. Supabase places
-- this hint in raw_user_meta_data; without copying it to the profile, the
-- profile triggers below cannot distinguish a vendor registration from a
-- student registration.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  registration_intent text := NEW.raw_user_meta_data ->> 'registration_intent';
BEGIN
  INSERT INTO public.profiles(id, email, role_id, full_name, avatar_url, preferences)
  VALUES (
    NEW.id,
    NEW.email,
    2,
    NEW.raw_user_meta_data ->> 'full_name',
    NEW.raw_user_meta_data ->> 'avatar_url',
    CASE
      WHEN registration_intent IN ('student', 'external_vendor')
        THEN jsonb_build_object('registration_intent', registration_intent)
      ELSE '{}'::jsonb
    END
  );
  RETURN NEW;
END;
$$;

-- Keep the legacy completion RPC safe for older clients that still call it.
-- The new client starts Paystack first and the webhook activates the account.
CREATE OR REPLACE FUNCTION public.complete_student_registration(
  p_university_id uuid,
  p_phone text,
  p_student_id_number text,
  p_program text,
  p_faculty text,
  p_department text,
  p_level text,
  p_admission_year integer,
  p_graduation_year integer DEFAULT NULL,
  p_student_document_path text DEFAULT NULL,
  p_referral_code text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  uid uuid := auth.uid();
  profile_row public.profiles%ROWTYPE;
  registration_row public.student_registration_payments%ROWTYPE;
  required_amount numeric(12,2);
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501'; END IF;
  SELECT * INTO profile_row FROM public.profiles WHERE id = uid FOR UPDATE;
  IF NOT FOUND OR NOT profile_row.is_active OR profile_row.status = 'suspended'
     OR public.current_app_role() NOT IN ('student', 'student_vendor') THEN
    RAISE EXCEPTION 'Student registration is unavailable' USING ERRCODE = '42501';
  END IF;
  SELECT registration_fee INTO required_amount FROM public.student_financial_settings WHERE singleton;
  SELECT * INTO registration_row
  FROM public.student_registration_payments
  WHERE user_id = uid AND status = 'paid'
  FOR UPDATE;
  IF NOT FOUND OR NOT EXISTS (
    SELECT 1 FROM public.payments payment
    WHERE payment.user_id = uid
      AND payment.payment_type = 'student_registration'
      AND payment.entity_id = uid
      AND payment.status = 'success'
      AND payment.amount = required_amount
      AND payment.currency = 'GHS'
  ) THEN
    RAISE EXCEPTION 'Registration payment is required before account activation' USING ERRCODE = '42501';
  END IF;
  IF p_phone IS NULL OR p_phone !~ '^\+?[0-9 ()-]{9,20}$'
     OR length(btrim(p_student_id_number)) NOT BETWEEN 2 AND 80
     OR length(btrim(p_program)) NOT BETWEEN 2 AND 120
     OR length(btrim(p_faculty)) NOT BETWEEN 2 AND 120
     OR length(btrim(p_department)) NOT BETWEEN 2 AND 120
     OR length(btrim(p_level)) NOT BETWEEN 1 AND 30
     OR p_admission_year NOT BETWEEN 1950 AND extract(year FROM now())::integer + 1
     OR NOT EXISTS (SELECT 1 FROM public.universities WHERE id = p_university_id AND is_enabled)
     OR (p_student_document_path IS NOT NULL AND p_student_document_path NOT LIKE uid::text || '/%') THEN
    RAISE EXCEPTION 'Student information is invalid' USING ERRCODE = '22023';
  END IF;
  UPDATE public.profiles
  SET phone = btrim(p_phone), university_id = p_university_id, status = 'active', is_active = true, updated_at = now()
  WHERE id = uid;
  INSERT INTO public.student_profiles(
    user_id, profile_id, university_id, student_id_number, program_of_study,
    faculty, department, level, admission_year, graduation_year,
    student_id_document_url, verification_status
  ) VALUES (
    uid, uid, p_university_id, btrim(p_student_id_number), btrim(p_program),
    btrim(p_faculty), btrim(p_department), btrim(p_level), p_admission_year,
    p_graduation_year, p_student_document_path, 'pending'
  ) ON CONFLICT (user_id) DO UPDATE SET
    university_id = excluded.university_id,
    student_id_number = excluded.student_id_number,
    program_of_study = excluded.program_of_study,
    faculty = excluded.faculty,
    department = excluded.department,
    level = excluded.level,
    admission_year = excluded.admission_year,
    graduation_year = excluded.graduation_year,
    student_id_document_url = excluded.student_id_document_url,
    updated_at = now();
  RETURN jsonb_build_object('status', 'active', 'registration_status', registration_row.status, 'payment_required', false, 'verification_status', 'pending');
END;
$$;

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
    target_path := 'https://www.uniecoghana.com/onboarding/student?payment_required=1';
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
    target_path := 'https://www.uniecoghana.com/onboarding/vendor?payment_required=1';
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

DROP TRIGGER IF EXISTS queue_registration_payment_prompt_after_profile ON public.profiles;
CREATE TRIGGER queue_registration_payment_prompt_after_profile
AFTER INSERT OR UPDATE OF preferences ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.queue_registration_payment_prompt();

-- If a user enables push after signup, deliver the pending payment reminder to
-- that device as well. Email is sent only by the profile trigger above.
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
    already_paid := EXISTS (SELECT 1 FROM public.student_registration_payments registration JOIN public.payments payment ON payment.user_id = registration.user_id AND payment.entity_id = registration.user_id AND payment.payment_type = 'student_registration' AND payment.status = 'success' AND payment.amount = fee AND payment.currency = 'GHS' WHERE registration.user_id = NEW.user_id AND registration.status = 'paid');
    target_path := 'https://www.uniecoghana.com/onboarding/student?payment_required=1';
    title_text := 'Finish your UniEco registration';
    body_text := format('Pay GH₵%s to unlock your UniEco Ghana student account.', to_char(fee, 'FM999999990.00'));
  ELSE
    SELECT vendor_registration_fee INTO fee FROM public.student_financial_settings WHERE singleton;
    already_paid := EXISTS (SELECT 1 FROM public.vendor_registration_payment_states state JOIN public.payments payment ON payment.id = state.payment_id AND payment.status = 'success' AND payment.payment_type = 'vendor_registration' AND payment.amount = fee AND payment.currency = 'GHS' WHERE state.owner_id = NEW.user_id AND state.state = 'paid');
    target_path := 'https://www.uniecoghana.com/onboarding/vendor?payment_required=1';
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

DROP TRIGGER IF EXISTS queue_registration_payment_push_after_subscription ON public.push_subscriptions;
CREATE TRIGGER queue_registration_payment_push_after_subscription
AFTER INSERT ON public.push_subscriptions
FOR EACH ROW EXECUTE FUNCTION public.queue_registration_payment_push_after_subscription();

-- A daily reminder covers accounts that signed up before push was enabled or
-- left registration unfinished. The campaign log prevents repeated sends.
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
  period_start timestamptz := date_trunc('day', now());
  paid boolean;
  cash_authorized boolean;
BEGIN
  FOR target IN
    SELECT * FROM public.profiles
    WHERE is_active AND role_id IN (2, 3, 4)
    ORDER BY created_at
    LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 500), 1000))
  LOOP
    intent := COALESCE(target.preferences ->> 'registration_intent', CASE WHEN target.role_id = 2 THEN 'student' ELSE 'external_vendor' END);
    IF intent = 'student' THEN
      SELECT registration_fee INTO fee FROM public.student_financial_settings WHERE singleton;
      paid := EXISTS (SELECT 1 FROM public.student_registration_payments registration JOIN public.payments payment ON payment.user_id = registration.user_id AND payment.entity_id = registration.user_id AND payment.payment_type = 'student_registration' AND payment.status = 'success' AND payment.amount = fee AND payment.currency = 'GHS' WHERE registration.user_id = target.id AND registration.status = 'paid');
      cash_authorized := EXISTS (SELECT 1 FROM public.registration_access_invites WHERE redeemed_by = target.id AND audience = 'student' AND redeemed_at IS NOT NULL AND payment_method = 'cash');
    ELSE
      SELECT vendor_registration_fee INTO fee FROM public.student_financial_settings WHERE singleton;
      paid := EXISTS (SELECT 1 FROM public.vendor_registration_payment_states state JOIN public.payments payment ON payment.id = state.payment_id AND payment.status = 'success' AND payment.payment_type = 'vendor_registration' AND payment.amount = fee AND payment.currency = 'GHS' WHERE state.owner_id = target.id AND state.state = 'paid');
      cash_authorized := EXISTS (SELECT 1 FROM public.registration_access_invites WHERE redeemed_by = target.id AND audience = 'vendor' AND redeemed_at IS NOT NULL AND payment_method = 'cash');
    END IF;
    IF paid OR cash_authorized THEN CONTINUE; END IF;
    INSERT INTO public.communication_campaign_log(user_id, campaign_key, period_start)
    VALUES (target.id, 'registration_payment_required', period_start)
    ON CONFLICT DO NOTHING
    RETURNING id INTO campaign_id;
    IF campaign_id IS NULL THEN CONTINUE; END IF;
    IF intent = 'student' THEN
      PERFORM public.queue_user_communication(target.id, 'registration_payment_required', 'Complete your UniEco registration', format('Pay the one-time GH₵%s registration fee to unlock UniEco Ghana and start your student verification.', to_char(fee, 'FM999999990.00')), 'payments', 'https://www.uniecoghana.com/onboarding/student?payment_required=1', 'CreditCard', 'registration_payment_required', jsonb_build_object('registration_intent', 'student', 'amount', fee, 'currency', 'GHS'));
    ELSE
      PERFORM public.queue_user_communication(target.id, 'registration_payment_required', 'Complete your UniEco business registration', format('Pay the one-time GH₵%s registration fee to unlock vendor tools and submit your business for review.', to_char(fee, 'FM999999990.00')), 'payments', 'https://www.uniecoghana.com/onboarding/vendor?payment_required=1', 'CreditCard', 'registration_payment_required', jsonb_build_object('registration_intent', 'external_vendor', 'amount', fee, 'currency', 'GHS'));
    END IF;
    queued_count := queued_count + 1;
  END LOOP;
  RETURN queued_count;
END;
$$;

INSERT INTO public.communication_templates(template_key, name, channel, subject, body, variables, is_active)
VALUES ('registration_payment_required', 'Registration payment reminder', 'email', 'Complete your UniEco Ghana registration', 'Pay the one-time registration fee to unlock your UniEco Ghana account.', '{name,amount,currency,registration_intent}', true)
ON CONFLICT (template_key) DO UPDATE SET name = EXCLUDED.name, channel = EXCLUDED.channel, subject = EXCLUDED.subject, body = EXCLUDED.body, variables = EXCLUDED.variables, is_active = true, updated_at = now();

DO $$
BEGIN
  IF to_regnamespace('cron') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'unieco-registration-payment-reminders') THEN
    PERFORM cron.schedule('unieco-registration-payment-reminders', '15 */6 * * *', 'SELECT public.queue_registration_payment_reminders(500);');
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.get_my_registration_access() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_my_registration_access() TO authenticated;
REVOKE ALL ON FUNCTION public.complete_student_registration(uuid, text, text, text, text, text, text, integer, integer, text, text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.complete_student_registration(uuid, text, text, text, text, text, text, integer, integer, text, text) TO authenticated;
REVOKE ALL ON FUNCTION public.queue_registration_payment_prompt() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.queue_registration_payment_push_after_subscription() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.queue_registration_payment_reminders(integer) FROM PUBLIC, anon, authenticated, service_role;

COMMIT;
