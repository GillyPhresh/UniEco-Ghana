-- 0203 is already staged. Keep its history intact and harden the three
-- registration lanes with one source of truth for the site and payment API.
BEGIN;
SET LOCAL lock_timeout = '5s';

ALTER TABLE public.buyer_registrations
  ADD COLUMN IF NOT EXISTS seller_upgrade_started_at timestamptz;

CREATE OR REPLACE FUNCTION public.has_verified_student_registration_payment(p_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.student_registration_payments registration
    JOIN public.payments payment ON payment.user_id = registration.user_id
    WHERE registration.user_id = p_user_id AND registration.status = 'paid'
      AND payment.payment_type = 'student_registration' AND payment.entity_id = p_user_id
      AND payment.provider = 'paystack' AND payment.status = 'success' AND payment.currency = 'GHS'
      AND (
        EXISTS (
          SELECT 1 FROM public.student_registration_payment_attempts attempt
          WHERE attempt.registration_id = registration.id AND attempt.payment_id = payment.id
            AND attempt.user_id = p_user_id AND attempt.status = 'success'
            AND attempt.provider = payment.provider AND attempt.payment_purpose = payment.payment_type
            AND attempt.expected_amount = payment.amount AND attempt.expected_currency = payment.currency
            AND attempt.provider_environment IS NOT DISTINCT FROM payment.provider_environment
        )
        -- Preserve valid older registrations from before payment attempts
        -- were recorded. Never accept a failed/mismatched recorded attempt.
        OR (NOT EXISTS (
          SELECT 1 FROM public.student_registration_payment_attempts attempt
          WHERE attempt.registration_id = registration.id OR attempt.payment_id = payment.id
        ) AND payment.amount = (SELECT registration_fee FROM public.student_financial_settings WHERE singleton))
      )
  )
$$;

CREATE OR REPLACE FUNCTION public.has_verified_vendor_registration_payment(p_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.vendor_registration_payment_states state
    JOIN public.vendors vendor ON vendor.id = state.vendor_id AND vendor.owner_id = state.owner_id
    JOIN public.payments payment ON payment.id = state.payment_id AND payment.user_id = state.owner_id
      AND payment.vendor_id = state.vendor_id AND payment.entity_id = state.vendor_id
    WHERE state.owner_id = p_user_id AND state.state = 'paid'
      AND payment.payment_type = 'vendor_registration' AND payment.provider = 'paystack'
      AND payment.status = 'success' AND payment.amount = state.amount
      AND payment.currency = state.currency AND payment.currency = 'GHS'
  )
$$;

CREATE OR REPLACE FUNCTION public.registration_account_state(p_user_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE
  member public.profiles%ROWTYPE;
  role_name text;
  intent text;
  lane text;
  result_status text := 'registration_required';
  allowed boolean := false;
  buyer_enrolled boolean := false;
  restricted_buyer boolean := false;
  upgrade_started boolean := false;
  student_history boolean := false;
  vendor_role boolean := false;
  student_paid boolean := false;
  vendor_paid boolean := false;
  student_cash boolean := false;
  vendor_cash boolean := false;
  covered_business boolean := false;
  student_fee numeric;
  vendor_fee numeric;
BEGIN
  SELECT profile.* INTO member FROM public.profiles profile WHERE id = p_user_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('allowed', false, 'role', NULL, 'status', 'profile_unavailable', 'buyer_restricted', false);
  END IF;
  SELECT name INTO role_name FROM public.user_roles WHERE id = member.role_id;
  IF NOT member.is_active OR member.status NOT IN ('active', 'pending_payment', 'pending', 'pending_approval') THEN
    RETURN jsonb_build_object('allowed', false, 'role', role_name, 'status', 'account_unavailable', 'buyer_restricted', false);
  END IF;
  IF role_name IN ('moderator', 'super_admin', 'university_admin') THEN
    RETURN jsonb_build_object('allowed', true, 'role', role_name, 'status', 'staff_exempt',
      'buyer_restricted', false, 'can_paystack', true, 'required_amount', 0);
  END IF;

  intent := member.preferences ->> 'registration_intent';
  vendor_role := COALESCE(role_name IN ('student_vendor', 'external_vendor'), false);
  SELECT true, buyer.seller_upgrade_started_at IS NOT NULL INTO buyer_enrolled, upgrade_started
    FROM public.buyer_registrations buyer WHERE buyer.user_id = p_user_id;
  buyer_enrolled := COALESCE(buyer_enrolled, false);
  upgrade_started := COALESCE(upgrade_started, false);
  student_history := EXISTS (SELECT 1 FROM public.student_registration_payments WHERE user_id = p_user_id)
    OR EXISTS (SELECT 1 FROM public.payments WHERE user_id = p_user_id AND payment_type = 'student_registration'
      AND status NOT IN ('failed', 'cancelled'));
  student_paid := public.has_verified_student_registration_payment(p_user_id);
  IF vendor_role THEN vendor_paid := public.has_verified_vendor_registration_payment(p_user_id); END IF;
  SELECT
    COALESCE(bool_or(audience = 'student'), false),
    COALESCE(bool_or(audience = 'vendor'), false)
  INTO student_cash, vendor_cash
  FROM public.registration_access_invites
  WHERE redeemed_by = p_user_id AND redeemed_at IS NOT NULL AND payment_method = 'cash';
  restricted_buyer := NOT (student_paid OR vendor_paid OR (vendor_role AND vendor_cash)
    OR (student_cash AND NOT buyer_enrolled))
    AND (buyer_enrolled OR (role_name = 'student' AND intent IS NOT DISTINCT FROM 'buyer'));

  -- A student seller's verified registration covers their student business.
  -- Leave independently initiated vendor checkouts to their existing lane.
  covered_business := student_paid AND role_name IN ('student', 'student_vendor')
    AND NOT EXISTS (
      SELECT 1 FROM public.payments
      WHERE user_id = p_user_id AND payment_type = 'vendor_registration'
        AND status NOT IN ('failed', 'cancelled')
    );

  SELECT registration_fee, vendor_registration_fee INTO student_fee, vendor_fee
  FROM public.student_financial_settings WHERE singleton;
  SELECT COALESCE((
    SELECT attempt.expected_amount
    FROM public.student_registration_payment_attempts attempt
    JOIN public.payments payment ON payment.id = attempt.payment_id
    WHERE attempt.user_id = p_user_id AND payment.status IN ('initiated', 'pending')
    ORDER BY attempt.created_at DESC LIMIT 1
  ), student_fee) INTO student_fee;
  IF vendor_role THEN
    SELECT COALESCE((
      SELECT state.amount FROM public.vendor_registration_payment_states state
      WHERE state.owner_id = p_user_id AND state.state IN ('payment_pending', 'paid')
      ORDER BY state.updated_at DESC LIMIT 1
    ), vendor_fee) INTO vendor_fee;
  END IF;

  IF restricted_buyer THEN
    allowed := buyer_enrolled;
    result_status := CASE WHEN allowed THEN 'free_buyer' ELSE 'buyer_setup_required' END;
    lane := CASE WHEN NOT allowed THEN '/onboarding/buyer'
      WHEN upgrade_started THEN CASE WHEN vendor_role THEN '/onboarding/vendor' ELSE '/onboarding/student' END
      ELSE NULL END;
  ELSIF vendor_role OR (role_name = 'student' AND intent = 'external_vendor' AND NOT student_paid AND NOT student_cash) THEN
    lane := '/onboarding/vendor';
    allowed := vendor_role AND (vendor_paid OR vendor_cash OR (role_name = 'student_vendor' AND covered_business));
    IF allowed THEN result_status := CASE WHEN vendor_cash THEN 'cash_verified' ELSE 'paid' END; END IF;
  ELSIF role_name = 'student' AND (intent = 'student' OR student_history OR student_cash) THEN
    lane := '/onboarding/student';
    allowed := student_paid OR student_cash;
    IF allowed THEN result_status := CASE WHEN student_cash AND NOT student_paid THEN 'cash_verified' ELSE 'paid' END; END IF;
  ELSIF role_name = 'student' THEN
    result_status := 'choice_required';
  END IF;

  RETURN jsonb_build_object(
    'allowed', allowed, 'role', role_name, 'status', result_status, 'registration_path', lane,
    'registration_intent', CASE WHEN restricted_buyer THEN 'buyer' WHEN lane = '/onboarding/vendor' THEN 'external_vendor'
      WHEN lane = '/onboarding/student' THEN 'student' END,
    'buyer_restricted', restricted_buyer, 'seller_upgrade_started', upgrade_started AND restricted_buyer,
    'can_paystack', allowed AND NOT restricted_buyer,
    'can_pay_student_registration', COALESCE(lane = '/onboarding/student' AND NOT student_paid AND NOT student_cash
      AND (NOT restricted_buyer OR (buyer_enrolled AND upgrade_started)), false),
    'can_pay_vendor_registration', COALESCE(lane = '/onboarding/vendor' AND NOT vendor_paid AND NOT vendor_cash AND NOT covered_business
      AND (NOT restricted_buyer OR (buyer_enrolled AND upgrade_started AND vendor_role)), false),
    'can_student_referral', NOT restricted_buyer AND member.status = 'active' AND student_paid AND role_name IN ('student', 'student_vendor')
      AND NOT EXISTS (SELECT 1 FROM public.student_referral_codes WHERE user_id = p_user_id AND revoked_at IS NOT NULL),
    'can_vendor_referral', NOT restricted_buyer AND member.status = 'active' AND vendor_role AND vendor_paid,
    'student_registration_paid', student_paid,
    'student_business_covered', covered_business,
    'required_amount', CASE WHEN restricted_buyer THEN 0 WHEN lane = '/onboarding/vendor' THEN vendor_fee
      WHEN lane = '/onboarding/student' THEN student_fee END,
    'student_fee', student_fee, 'vendor_fee', vendor_fee, 'currency', 'GHS', 'cash_authorized', student_cash OR vendor_cash
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.registration_can_publish(p_user_id uuid, access_state jsonb)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = p_user_id AND is_active AND status = 'active')
     OR EXISTS (SELECT 1 FROM public.account_restrictions
       WHERE user_id = p_user_id AND is_active AND (ends_at IS NULL OR ends_at > now())) THEN
    RETURN false;
  END IF;
  IF (access_state ->> 'buyer_restricted')::boolean OR NOT (access_state ->> 'allowed')::boolean THEN
    RETURN false;
  END IF;
  IF access_state ->> 'role' = 'university_admin' THEN
    -- Older staging lacks the community/assignment rollout. An absent
    -- assignment table can never authorize a university administrator.
    IF to_regclass('public.university_admin_assignments') IS NULL THEN RETURN false; END IF;
    RETURN EXISTS (SELECT 1 FROM public.university_admin_assignments
      WHERE user_id = p_user_id AND status = 'active');
  END IF;
  IF access_state ->> 'role' IN ('student', 'student_vendor')
     AND ((access_state ->> 'student_registration_paid')::boolean
          OR (access_state ->> 'status' = 'cash_verified' AND EXISTS (
            SELECT 1 FROM public.student_profiles WHERE user_id = p_user_id
              AND is_verified_student AND verification_status = 'verified'
          ))) THEN
    RETURN true;
  END IF;
  RETURN COALESCE(access_state ->> 'role' IN ('student_vendor', 'external_vendor'), false) AND EXISTS (
    SELECT 1 FROM public.vendor_profiles vendor_profile
    JOIN public.vendors vendor ON vendor.owner_id = vendor_profile.profile_id
    WHERE vendor_profile.profile_id = p_user_id AND vendor_profile.verification_status IN ('active', 'verified')
      AND vendor.is_verified AND vendor.is_active
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.can_publish_campus_community(p_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
  SELECT public.registration_can_publish(p_user_id, public.registration_account_state(p_user_id))
$$;

CREATE OR REPLACE FUNCTION public.can_upload_campus_community_media()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
  SELECT public.can_publish_campus_community(auth.uid())
$$;

CREATE OR REPLACE FUNCTION public.get_my_registration_access()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
  WITH account AS MATERIALIZED (SELECT auth.uid() AS uid, public.registration_account_state(auth.uid()) AS state)
  SELECT state || jsonb_build_object('can_publish', public.registration_can_publish(uid, state)) FROM account
$$;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE intent text := NEW.raw_user_meta_data ->> 'registration_intent';
BEGIN
  INSERT INTO public.profiles(id, email, role_id, full_name, avatar_url, preferences)
  VALUES (NEW.id, NEW.email, 2, NEW.raw_user_meta_data ->> 'full_name', NEW.raw_user_meta_data ->> 'avatar_url',
    CASE WHEN intent IN ('buyer', 'student', 'external_vendor') THEN jsonb_build_object('registration_intent', intent)
      ELSE '{}'::jsonb END)
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_my_registration_intent(p_intent text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE uid uuid := auth.uid(); member public.profiles%ROWTYPE;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501'; END IF;
  IF p_intent IS NULL OR p_intent NOT IN ('buyer', 'student', 'external_vendor') THEN
    RAISE EXCEPTION 'Invalid registration choice' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO member FROM public.profiles WHERE id = uid FOR UPDATE;
  IF NOT FOUND THEN RETURN false; END IF;
  IF member.preferences ->> 'registration_intent' = p_intent THEN RETURN true; END IF;
  IF public.registration_account_state(uid) ->> 'status' IS DISTINCT FROM 'choice_required'
     OR member.preferences ->> 'registration_intent' IN ('buyer', 'student', 'external_vendor') THEN
    RETURN false;
  END IF;
  UPDATE public.profiles SET preferences = preferences || jsonb_build_object('registration_intent', p_intent),
    updated_at = now() WHERE id = uid;
  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.keep_profile_registration_choice()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog, public AS $$
BEGIN
  IF current_user IN ('authenticated', 'anon') THEN
    NEW.preferences := (CASE WHEN jsonb_typeof(NEW.preferences) = 'object' THEN NEW.preferences ELSE '{}'::jsonb END
      - 'registration_intent') || CASE WHEN OLD.preferences ? 'registration_intent'
        THEN jsonb_build_object('registration_intent', OLD.preferences -> 'registration_intent') ELSE '{}'::jsonb END;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS keep_profile_registration_choice ON public.profiles;
CREATE TRIGGER keep_profile_registration_choice BEFORE UPDATE OF preferences ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.keep_profile_registration_choice();

CREATE OR REPLACE FUNCTION public.start_my_student_seller_upgrade()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE uid uuid := auth.uid(); access_state jsonb;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501'; END IF;
  PERFORM 1 FROM public.profiles WHERE id = uid FOR UPDATE;
  access_state := public.registration_account_state(uid);
  IF access_state ->> 'status' IS DISTINCT FROM 'free_buyer' THEN
    RAISE EXCEPTION 'Finish your buyer setup before upgrading' USING ERRCODE = '42501';
  END IF;
  UPDATE public.buyer_registrations SET seller_upgrade_started_at = now(), updated_at = now()
  WHERE user_id = uid AND seller_upgrade_started_at IS NULL;
  RETURN public.registration_account_state(uid);
END;
$$;

CREATE OR REPLACE FUNCTION public.guard_buyer_role_and_access()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE access_state jsonb;
BEGIN
  IF OLD.role_id = 2 AND NEW.role_id IN (3, 4) AND auth.uid() = OLD.id THEN
    access_state := public.registration_account_state(OLD.id);
    IF (access_state ->> 'buyer_restricted')::boolean THEN
      RAISE EXCEPTION 'Complete your seller upgrade before registering a business' USING ERRCODE = '42501';
    END IF;
    IF (NEW.role_id = 3 AND (access_state ->> 'allowed')::boolean IS NOT TRUE)
       OR (NEW.role_id = 4 AND access_state ->> 'registration_path' IS DISTINCT FROM '/onboarding/vendor') THEN
      RAISE EXCEPTION 'Finish the registration selected for this account' USING ERRCODE = '42501';
    END IF;
  END IF;
  -- Starting a seller payment is not a reason to take away an established
  -- buyer's access to orders, chats or community interactions.
  IF NEW.role_id = 2 AND OLD.status = 'active' AND NEW.status = 'pending_payment' AND EXISTS (
    SELECT 1 FROM public.buyer_registrations WHERE user_id = OLD.id AND seller_upgrade_started_at IS NOT NULL
  ) THEN
    NEW.status := 'active';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_buyer_role_and_access ON public.profiles;
CREATE TRIGGER guard_buyer_role_and_access BEFORE UPDATE OF role_id, status ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.guard_buyer_role_and_access();

CREATE OR REPLACE FUNCTION public.complete_buyer_registration(
  p_university_id uuid, p_phone text, p_promotional_email_opt_in boolean DEFAULT false
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE
  uid uuid := auth.uid();
  member public.profiles%ROWTYPE;
  account_status text;
  campaign_id uuid;
  opted_in boolean := COALESCE(p_promotional_email_opt_in, false);
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501'; END IF;
  SELECT * INTO member FROM public.profiles WHERE id = uid FOR UPDATE;
  account_status := public.registration_account_state(uid) ->> 'status';
  IF account_status = 'free_buyer' THEN
    RETURN jsonb_build_object('status', 'active', 'registration_type', 'buyer', 'registration_fee', 0);
  END IF;
  IF account_status IS DISTINCT FROM 'buyer_setup_required'
     OR EXISTS (SELECT 1 FROM public.student_registration_payments WHERE user_id = uid)
     OR EXISTS (SELECT 1 FROM public.vendors WHERE owner_id = uid) THEN
    RAISE EXCEPTION 'Buyer setup is unavailable for this account' USING ERRCODE = '42501';
  END IF;
  IF p_phone IS NULL OR p_phone !~ '^0[0-9]{9}$'
     OR NOT EXISTS (SELECT 1 FROM public.universities WHERE id = p_university_id AND is_enabled) THEN
    RAISE EXCEPTION 'Choose an active school and enter a valid Ghana phone number' USING ERRCODE = '22023';
  END IF;
  UPDATE public.profiles SET phone = p_phone, university_id = p_university_id,
    status = 'active', updated_at = now() WHERE id = uid;
  INSERT INTO public.buyer_registrations(user_id, university_id, promotional_email_opt_in, promotional_email_opted_in_at)
  VALUES (uid, p_university_id, opted_in, CASE WHEN opted_in THEN now() END);
  INSERT INTO public.audit_logs(actor_id, target_id, action, entity_type, entity_id, metadata)
  VALUES (uid, uid, 'free_buyer_registration_completed', 'profiles', uid,
    jsonb_build_object('university_id', p_university_id, 'marketing_email_opt_in', opted_in));

  -- The signup is complete even if the optional email subsystem is down.
  -- Never enqueue push/WhatsApp, or contact an unconfirmed email address.
  IF opted_in AND EXISTS (SELECT 1 FROM auth.users WHERE id = uid AND email_confirmed_at IS NOT NULL
                          AND email = member.email) THEN
    BEGIN
      IF public.communication_category_channel_enabled(uid, 'businesses', 'email') THEN
        INSERT INTO public.communication_campaign_log(user_id, campaign_key, period_start)
        VALUES (uid, 'buyer_seller_upgrade_promotion', to_timestamp(0))
        ON CONFLICT DO NOTHING RETURNING id INTO campaign_id;
        IF campaign_id IS NOT NULL THEN
          PERFORM public.enqueue_trusted_communication_event(
            'buyer_seller_upgrade_promotion', uid, member.email, NULL, 'Start selling on UniEco Ghana', ARRAY['email'],
            jsonb_build_object('body', 'Your buyer account is free. If you want to sell, publish campus posts or share a referral link, you can choose to upgrade and pay a one-time seller registration fee. Manage business emails in your UniEco notification preferences.',
              'category', 'businesses', 'action_url', 'https://www.uniecoghana.com/onboarding/upgrade',
              'email_preferences_url', 'https://www.uniecoghana.com/dashboard/notifications/preferences')
          );
        END IF;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'Optional buyer upgrade email was not queued (SQLSTATE %)', SQLSTATE;
    END;
  END IF;
  RETURN jsonb_build_object('status', 'active', 'registration_type', 'buyer', 'registration_fee', 0);
END;
$$;

CREATE OR REPLACE FUNCTION public.guard_registration_cash_invite_lane()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN
  IF NEW.redeemed_by IS NOT NULL AND NEW.redeemed_by IS DISTINCT FROM OLD.redeemed_by AND (
    EXISTS (SELECT 1 FROM public.buyer_registrations WHERE user_id = NEW.redeemed_by)
    OR EXISTS (SELECT 1 FROM public.profiles WHERE id = NEW.redeemed_by AND preferences ->> 'registration_intent' = 'buyer')
  ) THEN
    RAISE EXCEPTION 'Buyer accounts cannot redeem a paid registration invitation' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_registration_cash_invite_lane ON public.registration_access_invites;
CREATE TRIGGER guard_registration_cash_invite_lane BEFORE UPDATE OF redeemed_by ON public.registration_access_invites
FOR EACH ROW EXECUTE FUNCTION public.guard_registration_cash_invite_lane();

CREATE OR REPLACE FUNCTION public.prevent_buyer_student_registration_payment()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE access_state jsonb;
BEGIN
  IF NEW.provider IS DISTINCT FROM 'paystack' THEN RETURN NEW; END IF;
  IF NEW.payment_type IN ('student_registration', 'vendor_registration') THEN
    -- Serialize a registration charge with choosing or completing free setup.
    PERFORM 1 FROM public.profiles WHERE id = NEW.user_id FOR UPDATE;
  END IF;
  access_state := public.registration_account_state(NEW.user_id);
  IF (NEW.payment_type = 'student_registration' AND (access_state ->> 'can_pay_student_registration')::boolean IS NOT TRUE)
     OR (NEW.payment_type = 'vendor_registration' AND (access_state ->> 'can_pay_vendor_registration')::boolean IS NOT TRUE)
     OR (NEW.payment_type NOT IN ('student_registration', 'vendor_registration') AND NEW.user_id IS NOT NULL
         AND (access_state ->> 'can_paystack')::boolean IS NOT TRUE) THEN
    RAISE EXCEPTION 'Paystack is not available for this account or payment type' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

-- Close all Paystack entry points with the existing 0203 insert trigger.
-- Verify the trigger still owns the canonical guard in older staging slots.
DROP TRIGGER IF EXISTS prevent_buyer_student_registration_payment ON public.payments;
CREATE TRIGGER prevent_buyer_student_registration_payment BEFORE INSERT ON public.payments
FOR EACH ROW EXECUTE FUNCTION public.prevent_buyer_student_registration_payment();

-- Older vendor referral rollout (0150) compares with today's global price.
-- Approve only the linked payment at the amount/currency saved at checkout.
CREATE OR REPLACE FUNCTION public.apply_vendor_registration_payment_result()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE registration_state public.vendor_registration_payment_states%ROWTYPE;
BEGIN
  IF NEW.payment_type IS DISTINCT FROM 'vendor_registration' OR NEW.status IS NOT DISTINCT FROM OLD.status
     OR NEW.provider IS DISTINCT FROM 'paystack' THEN RETURN NEW; END IF;
  SELECT * INTO registration_state FROM public.vendor_registration_payment_states
  WHERE vendor_id = NEW.vendor_id AND owner_id = NEW.user_id AND payment_id = NEW.id FOR UPDATE;
  IF NOT FOUND OR NEW.entity_id IS DISTINCT FROM registration_state.vendor_id THEN RETURN NEW; END IF;
  IF NEW.status = 'success' AND NEW.amount = registration_state.amount
     AND NEW.currency = registration_state.currency AND NEW.currency = 'GHS' THEN
    UPDATE public.vendor_registration_payment_states SET payment_requirement = 'paid', state = 'paid', updated_at = now()
    WHERE vendor_id = registration_state.vendor_id;
    UPDATE public.profiles SET status = 'active', updated_at = now()
    WHERE id = NEW.user_id AND is_active AND status IN ('pending', 'pending_payment');
    PERFORM public.ensure_my_vendor_referral_link_for_user(NEW.user_id);
    PERFORM public.try_qualify_vendor_referral(NEW.user_id);
  ELSIF NEW.status IN ('failed', 'cancelled', 'refunded', 'partially_refunded', 'reconciliation_required') THEN
    UPDATE public.vendor_registration_payment_states SET payment_requirement = 'required', state = 'awaiting_payment', updated_at = now()
    WHERE vendor_id = registration_state.vendor_id;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.confirm_student_seller_business_coverage(p_vendor_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE uid uuid := auth.uid();
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501'; END IF;
  PERFORM 1 FROM public.vendor_registration_payment_states WHERE vendor_id = p_vendor_id AND owner_id = uid FOR UPDATE;
  IF NOT FOUND OR public.current_app_role() IS DISTINCT FROM 'student_vendor'
     OR (public.registration_account_state(uid) ->> 'student_business_covered')::boolean IS NOT TRUE THEN
    RAISE EXCEPTION 'No existing student seller payment covers this business' USING ERRCODE = '42501';
  END IF;
  UPDATE public.vendor_registration_payment_states
  SET state = 'awaiting_verification', payment_requirement = 'not_required', payment_id = NULL,
      amount = NULL, currency = 'GHS', updated_at = now()
  WHERE vendor_id = p_vendor_id AND owner_id = uid
    AND (state <> 'awaiting_verification' OR payment_requirement <> 'not_required' OR payment_id IS NOT NULL OR amount IS NOT NULL);
  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.ensure_my_student_referral_link()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE uid uuid := auth.uid(); code_value text; reward numeric;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501'; END IF;
  IF (public.registration_account_state(uid) ->> 'can_student_referral')::boolean IS NOT TRUE THEN
    RETURN jsonb_build_object('eligible', false, 'code', NULL);
  END IF;
  INSERT INTO public.student_referral_codes(user_id, code)
  VALUES (uid, 'UE-' || upper(encode(extensions.gen_random_bytes(10), 'hex')))
  ON CONFLICT (user_id) DO NOTHING;
  SELECT code INTO code_value FROM public.student_referral_codes WHERE user_id = uid AND revoked_at IS NULL;
  IF code_value IS NULL THEN RETURN jsonb_build_object('eligible', false, 'code', NULL); END IF;
  SELECT referral_reward INTO reward FROM public.student_financial_settings WHERE singleton;
  PERFORM public.queue_referral_link_message_for_user(uid, code_value);
  RETURN jsonb_build_object('eligible', true, 'code', code_value, 'reward_amount', reward, 'currency', 'GHS',
    'referral_link', 'https://www.uniecoghana.com/signup?ref=' || code_value || '&intent=student');
END;
$$;

CREATE OR REPLACE FUNCTION public.get_my_referral_summary()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE uid uuid := auth.uid(); result jsonb;
BEGIN
  IF uid IS NULL OR (public.registration_account_state(uid) ->> 'can_student_referral')::boolean IS NOT TRUE THEN
    RAISE EXCEPTION 'Eligible student referral access required' USING ERRCODE = '42501';
  END IF;
  SELECT jsonb_build_object(
    'code', (SELECT code FROM public.student_referral_codes WHERE user_id = uid AND revoked_at IS NULL),
    'successful_referrals', (SELECT count(*) FROM public.student_referral_attributions a WHERE a.referrer_user_id = uid AND a.status = 'qualified'),
    'pending_amount', COALESCE((SELECT sum(amount) FROM public.student_referral_rewards WHERE referrer_user_id = uid AND status = 'pending'), 0),
    'available_amount', COALESCE((SELECT sum(amount) FROM public.student_referral_rewards WHERE referrer_user_id = uid AND status = 'available'), 0),
    'paid_amount', COALESCE((SELECT sum(amount) FROM public.student_referral_rewards WHERE referrer_user_id = uid AND status = 'paid'), 0),
    'total_earned', COALESCE((SELECT sum(amount) FROM public.student_referral_rewards WHERE referrer_user_id = uid AND status IN ('pending', 'available', 'payout_pending', 'paid')), 0),
    'minimum_payout', (SELECT minimum_payout FROM public.student_financial_settings WHERE singleton),
    'history', COALESCE((SELECT jsonb_agg(jsonb_build_object('created_at', a.created_at,
      'referred_name', left(COALESCE(p.full_name, 'Student'), 1) || '.', 'registration_status', r.status,
      'reward_amount', rw.amount, 'reward_status', rw.status) ORDER BY a.created_at DESC)
      FROM public.student_referral_attributions a JOIN public.profiles p ON p.id = a.referred_user_id
      LEFT JOIN public.student_registration_payments r ON r.user_id = a.referred_user_id
      LEFT JOIN public.student_referral_rewards rw ON rw.referred_user_id = a.referred_user_id
      WHERE a.referrer_user_id = uid), '[]'::jsonb)
  ) INTO result;
  RETURN result;
END;
$$;

CREATE OR REPLACE FUNCTION public.ensure_my_vendor_referral_link()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE uid uuid := auth.uid(); code_value text; reward numeric;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501'; END IF;
  IF (public.registration_account_state(uid) ->> 'can_vendor_referral')::boolean IS NOT TRUE THEN
    RETURN jsonb_build_object('eligible', false, 'code', NULL);
  END IF;
  PERFORM public.ensure_my_vendor_referral_link_for_user(uid);
  SELECT code INTO code_value FROM public.vendor_referral_codes WHERE user_id = uid AND revoked_at IS NULL;
  IF code_value IS NULL THEN RETURN jsonb_build_object('eligible', false, 'code', NULL); END IF;
  SELECT referral_reward INTO reward FROM public.student_financial_settings WHERE singleton;
  RETURN jsonb_build_object('eligible', true, 'code', code_value, 'reward_amount', reward, 'currency', 'GHS',
    'referral_link', 'https://www.uniecoghana.com/signup?ref=' || code_value || '&intent=external_vendor');
END;
$$;

CREATE OR REPLACE FUNCTION public.get_my_vendor_referral_summary()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE uid uuid := auth.uid(); result jsonb;
BEGIN
  IF uid IS NULL OR (public.registration_account_state(uid) ->> 'can_vendor_referral')::boolean IS NOT TRUE THEN
    RAISE EXCEPTION 'Eligible vendor referral access required' USING ERRCODE = '42501';
  END IF;
  SELECT jsonb_build_object(
    'code', (SELECT code FROM public.vendor_referral_codes WHERE user_id = uid AND revoked_at IS NULL),
    'successful_referrals', (SELECT count(*) FROM public.vendor_referral_attributions a WHERE a.referrer_user_id = uid AND a.status = 'qualified'),
    'pending_amount', COALESCE((SELECT sum(amount) FROM public.vendor_referral_rewards WHERE referrer_user_id = uid AND status = 'pending'), 0),
    'available_amount', COALESCE((SELECT sum(amount) FROM public.vendor_referral_rewards WHERE referrer_user_id = uid AND status = 'available'), 0),
    'paid_amount', COALESCE((SELECT sum(amount) FROM public.vendor_referral_rewards WHERE referrer_user_id = uid AND status = 'paid'), 0),
    'total_earned', COALESCE((SELECT sum(amount) FROM public.vendor_referral_rewards WHERE referrer_user_id = uid AND status IN ('pending', 'available', 'payout_pending', 'paid')), 0),
    'minimum_payout', (SELECT minimum_payout FROM public.student_financial_settings WHERE singleton),
    'history', COALESCE((SELECT jsonb_agg(jsonb_build_object('created_at', a.created_at,
      'referred_name', left(COALESCE(p.full_name, 'Vendor'), 1) || '.',
      'registration_status', CASE WHEN rw.id IS NULL THEN 'pending' ELSE 'paid' END,
      'reward_amount', rw.amount, 'reward_status', rw.status) ORDER BY a.created_at DESC)
      FROM public.vendor_referral_attributions a JOIN public.profiles p ON p.id = a.referred_user_id
      LEFT JOIN public.vendor_referral_rewards rw ON rw.referred_user_id = a.referred_user_id
      WHERE a.referrer_user_id = uid), '[]'::jsonb)
  ) INTO result;
  RETURN result;
END;
$$;

-- Older staging copies called pgcrypto without qualifying its schema. The
-- existing payment functions must compile even when an idempotency key exists.
ALTER FUNCTION public.begin_student_registration_payment(uuid,text,text,text,text,text,text,integer,integer,text,text,text)
  SET search_path = pg_catalog, extensions, public;
ALTER FUNCTION public.begin_vendor_registration_payment(uuid,text)
  SET search_path = pg_catalog, extensions, public;
ALTER FUNCTION public.apply_student_registration_payment_result() SET search_path = pg_catalog, extensions, public;

-- Older staging was missing the 0173 self-only lookup used by checkout.
CREATE OR REPLACE FUNCTION public.get_my_student_registration_referral_code()
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
  SELECT NULLIF(upper(btrim(referral_code)), '')
  FROM public.student_registration_payments WHERE user_id = auth.uid()
$$;

REVOKE ALL ON FUNCTION public.has_verified_student_registration_payment(uuid),
  public.has_verified_vendor_registration_payment(uuid), public.registration_account_state(uuid),
  public.handle_new_user(), public.keep_profile_registration_choice(), public.guard_buyer_role_and_access(),
  public.guard_registration_cash_invite_lane(), public.prevent_buyer_student_registration_payment(),
  public.apply_vendor_registration_payment_result(), public.registration_can_publish(uuid,jsonb)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.can_publish_campus_community(uuid), public.can_upload_campus_community_media(),
  public.get_my_registration_access(), public.set_my_registration_intent(text), public.start_my_student_seller_upgrade(),
  public.confirm_student_seller_business_coverage(uuid), public.complete_buyer_registration(uuid,text,boolean),
  public.ensure_my_student_referral_link(), public.get_my_referral_summary(),
  public.ensure_my_vendor_referral_link(), public.get_my_vendor_referral_summary(),
  public.get_my_student_registration_referral_code()
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.can_publish_campus_community(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.can_upload_campus_community_media() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_my_registration_access(), public.set_my_registration_intent(text),
  public.start_my_student_seller_upgrade(), public.confirm_student_seller_business_coverage(uuid),
  public.complete_buyer_registration(uuid,text,boolean), public.ensure_my_student_referral_link(), public.get_my_referral_summary(),
  public.ensure_my_vendor_referral_link(), public.get_my_vendor_referral_summary(), public.get_my_student_registration_referral_code()
  TO authenticated;

COMMIT;
