-- Free buyer accounts are separate from the paid seller activation path.
-- Upgrade promotions are queued only after explicit buyer opt-in.
BEGIN;

CREATE TABLE IF NOT EXISTS public.buyer_registrations (
  user_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE RESTRICT,
  university_id uuid NOT NULL REFERENCES public.universities(id) ON DELETE RESTRICT,
  promotional_email_opt_in boolean NOT NULL DEFAULT false,
  promotional_email_opted_in_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((promotional_email_opt_in AND promotional_email_opted_in_at IS NOT NULL)
      OR (NOT promotional_email_opt_in AND promotional_email_opted_in_at IS NULL))
);
ALTER TABLE public.buyer_registrations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.buyer_registrations FROM PUBLIC, anon, authenticated, service_role;

-- Defense in depth: even a direct RPC/client call cannot create a student
-- registration charge for a buyer account.
CREATE OR REPLACE FUNCTION public.prevent_buyer_student_registration_payment()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF NEW.payment_type = 'student_registration' AND (
    EXISTS (SELECT 1 FROM public.profiles profile
      WHERE profile.id = NEW.user_id AND profile.preferences ->> 'registration_intent' = 'buyer')
    OR EXISTS (SELECT 1 FROM public.buyer_registrations buyer WHERE buyer.user_id = NEW.user_id)
  ) THEN
    RAISE EXCEPTION 'Buyer accounts do not have a student registration fee' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.prevent_buyer_student_registration_payment() FROM PUBLIC, anon, authenticated, service_role;
DROP TRIGGER IF EXISTS prevent_buyer_student_registration_payment ON public.payments;
CREATE TRIGGER prevent_buyer_student_registration_payment
BEFORE INSERT ON public.payments
FOR EACH ROW EXECUTE FUNCTION public.prevent_buyer_student_registration_payment();

-- New users can select buyer from the signup screen. This metadata is only an
-- onboarding hint; free access is granted only after the authenticated RPC
-- creates a buyer_registrations row.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE registration_intent text := NEW.raw_user_meta_data ->> 'registration_intent';
BEGIN
  IF registration_intent IS NULL OR registration_intent NOT IN ('buyer', 'student', 'external_vendor') THEN
    registration_intent := 'student';
  END IF;
  INSERT INTO public.profiles(id, email, role_id, full_name, avatar_url, preferences)
  VALUES (
    NEW.id, NEW.email, 2, NEW.raw_user_meta_data ->> 'full_name',
    NEW.raw_user_meta_data ->> 'avatar_url',
    jsonb_build_object('registration_intent', registration_intent)
  )
  ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    is_active = true,
    status = CASE WHEN public.profiles.status IN ('pending', 'pending_approval')
      THEN 'active' ELSE public.profiles.status END,
    updated_at = now();
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.set_my_registration_intent(p_intent text)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501'; END IF;
  IF p_intent IS NULL OR p_intent NOT IN ('buyer', 'student', 'external_vendor') THEN
    RAISE EXCEPTION 'Invalid registration intent' USING ERRCODE = '22023';
  END IF;
  UPDATE public.profiles
  SET preferences = COALESCE(preferences, '{}'::jsonb) || jsonb_build_object('registration_intent', p_intent),
      updated_at = now()
  WHERE id = auth.uid();
  RETURN FOUND;
END;
$$;
REVOKE ALL ON FUNCTION public.set_my_registration_intent(text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.set_my_registration_intent(text) TO authenticated;

CREATE OR REPLACE FUNCTION public.complete_buyer_registration(
  p_university_id uuid,
  p_phone text,
  p_promotional_email_opt_in boolean DEFAULT false
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE uid uuid := auth.uid(); profile_row public.profiles%ROWTYPE; campaign_id uuid;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501'; END IF;
  SELECT * INTO profile_row FROM public.profiles WHERE id = uid FOR UPDATE;
  IF NOT FOUND OR profile_row.role_id <> 2 OR NOT profile_row.is_active
     OR profile_row.status <> 'active'
     OR profile_row.preferences ->> 'registration_intent' IS DISTINCT FROM 'buyer' THEN
    RAISE EXCEPTION 'Buyer registration is unavailable for this account' USING ERRCODE = '42501';
  END IF;
  IF p_phone IS NULL OR p_phone !~ '^0[0-9]{9}$'
     OR NOT EXISTS (SELECT 1 FROM public.universities WHERE id = p_university_id AND is_enabled) THEN
    RAISE EXCEPTION 'Buyer registration details are invalid' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (SELECT 1 FROM public.student_registration_payments WHERE user_id = uid)
     OR EXISTS (SELECT 1 FROM public.vendors WHERE owner_id = uid) THEN
    RAISE EXCEPTION 'This account already has a registration in progress' USING ERRCODE = '22023';
  END IF;

  UPDATE public.profiles
  SET phone = p_phone, university_id = p_university_id,
      preferences = COALESCE(preferences, '{}'::jsonb) || jsonb_build_object('registration_intent', 'buyer'),
      updated_at = now()
  WHERE id = uid;

  INSERT INTO public.buyer_registrations(user_id, university_id, promotional_email_opt_in, promotional_email_opted_in_at)
  VALUES (uid, p_university_id, COALESCE(p_promotional_email_opt_in, false),
    CASE WHEN COALESCE(p_promotional_email_opt_in, false) THEN now() ELSE NULL END)
  ON CONFLICT (user_id) DO UPDATE SET
    university_id = EXCLUDED.university_id,
    promotional_email_opt_in = EXCLUDED.promotional_email_opt_in,
    promotional_email_opted_in_at = EXCLUDED.promotional_email_opted_in_at,
    updated_at = now();

  IF COALESCE(p_promotional_email_opt_in, false) THEN
    INSERT INTO public.communication_campaign_log(user_id, campaign_key, period_start)
    VALUES (uid, 'buyer_seller_upgrade_promotion', to_timestamp(0))
    ON CONFLICT DO NOTHING RETURNING id INTO campaign_id;
    IF campaign_id IS NOT NULL THEN
      PERFORM public.queue_user_communication(
        uid,
        'buyer_seller_upgrade_promotion',
        'Ready to start selling on UniEco Ghana?',
        'Your buyer account is free. When you are ready to start a business, upgrade to a seller account for a one-time GH₵10 registration fee. You can then set up your business and publish product or service listings. Seller features become available after Paystack confirms payment. Manage or stop promotional emails at https://www.uniecoghana.com/dashboard/notifications/preferences.',
        'businesses',
        'https://www.uniecoghana.com/onboarding/vendor',
        'Store',
        'buyer_seller_upgrade_promotion',
        jsonb_build_object('registration_type', 'buyer', 'seller_registration_fee', 10, 'currency', 'GHS',
          'email_preferences_url', 'https://www.uniecoghana.com/dashboard/notifications/preferences')
      );
    END IF;
  END IF;

  INSERT INTO public.audit_logs(actor_id, target_id, action, entity_type, entity_id, metadata)
  VALUES (uid, uid, 'free_buyer_registration_completed', 'profiles', uid,
    jsonb_build_object('university_id', p_university_id, 'marketing_email_opt_in', COALESCE(p_promotional_email_opt_in, false)));
  RETURN jsonb_build_object('status', 'active', 'registration_type', 'buyer', 'registration_fee', 0,
    'promotional_email_opt_in', COALESCE(p_promotional_email_opt_in, false));
END;
$$;
REVOKE ALL ON FUNCTION public.complete_buyer_registration(uuid, text, boolean) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.complete_buyer_registration(uuid, text, boolean) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_my_registration_access()
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  uid uuid := auth.uid();
  role_name text := public.current_app_role();
  registration_intent text;
  required_amount numeric(12,2);
  paid boolean := false;
  cash_authorized boolean := false;
BEGIN
  IF uid IS NULL THEN
    RETURN jsonb_build_object('allowed', false, 'role', NULL, 'required_amount', NULL, 'status', 'unauthenticated');
  END IF;
  SELECT profile.preferences ->> 'registration_intent' INTO registration_intent
  FROM public.profiles profile WHERE profile.id = uid;
  IF role_name IN ('moderator', 'super_admin', 'university_admin') THEN
    RETURN jsonb_build_object('allowed', true, 'role', role_name, 'required_amount', 0, 'status', 'staff_exempt');
  END IF;
  IF role_name = 'student' AND EXISTS (SELECT 1 FROM public.buyer_registrations WHERE user_id = uid)
     AND EXISTS (SELECT 1 FROM public.profiles WHERE id = uid AND is_active AND status = 'active') THEN
    RETURN jsonb_build_object('allowed', true, 'role', role_name, 'registration_intent', registration_intent, 'required_amount', 0, 'currency', 'GHS', 'status', 'free_buyer');
  END IF;
  IF role_name = 'student' THEN
    SELECT registration_fee INTO required_amount FROM public.student_financial_settings WHERE singleton;
    cash_authorized := EXISTS (
      SELECT 1 FROM public.registration_access_invites
      WHERE redeemed_by = uid AND audience = 'student' AND redeemed_at IS NOT NULL AND payment_method = 'cash'
    );
    paid := EXISTS (
      SELECT 1 FROM public.student_registration_payments registration
      JOIN public.payments payment ON payment.user_id = registration.user_id
        AND payment.payment_type = 'student_registration' AND payment.entity_id = registration.user_id
        AND payment.status = 'success' AND payment.amount = required_amount AND payment.currency = 'GHS'
      WHERE registration.user_id = uid AND registration.status = 'paid'
    );
  ELSIF role_name IN ('student_vendor', 'external_vendor') THEN
    SELECT vendor_registration_fee INTO required_amount FROM public.student_financial_settings WHERE singleton;
    SELECT state.amount INTO required_amount
    FROM public.vendor_registration_payment_states state
    WHERE state.owner_id = uid AND state.amount IS NOT NULL
    ORDER BY state.updated_at DESC LIMIT 1;
    IF required_amount IS NULL THEN
      SELECT vendor_registration_fee INTO required_amount FROM public.student_financial_settings WHERE singleton;
    END IF;
    cash_authorized := EXISTS (
      SELECT 1 FROM public.registration_access_invites
      WHERE redeemed_by = uid AND audience = 'vendor' AND redeemed_at IS NOT NULL AND payment_method = 'cash'
    );
    paid := EXISTS (
      SELECT 1 FROM public.vendors vendor
      JOIN public.vendor_registration_payment_states state ON state.vendor_id = vendor.id AND state.owner_id = uid AND state.state = 'paid'
      JOIN public.payments payment ON payment.id = state.payment_id AND payment.user_id = uid AND payment.vendor_id = vendor.id
        AND payment.payment_type = 'vendor_registration' AND payment.status = 'success'
        AND payment.amount = state.amount AND payment.currency = state.currency AND state.currency = 'GHS'
      WHERE vendor.owner_id = uid
    );
  ELSE
    RETURN jsonb_build_object('allowed', false, 'role', role_name, 'required_amount', NULL, 'status', 'registration_required');
  END IF;
  RETURN jsonb_build_object('allowed', paid OR cash_authorized, 'role', role_name, 'registration_intent', registration_intent,
    'required_amount', required_amount, 'currency', 'GHS',
    'status', CASE WHEN cash_authorized THEN 'cash_verified' WHEN paid THEN 'paid' ELSE 'payment_required' END,
    'cash_authorized', cash_authorized);
END;
$$;
REVOKE ALL ON FUNCTION public.get_my_registration_access() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_my_registration_access() TO authenticated;

-- Buyers have no student referral code or student referral payouts. Vendor
-- referrals remain available after the user completes paid seller onboarding.
CREATE OR REPLACE FUNCTION public.ensure_my_student_referral_link()
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE uid uuid := auth.uid(); role_name text; profile_active boolean; profile_status text; code_value text; referral_link text;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501'; END IF;
  IF EXISTS (SELECT 1 FROM public.buyer_registrations WHERE user_id = uid) THEN
    RETURN jsonb_build_object('eligible', false, 'code', NULL, 'message', 'Buyer accounts are not eligible for referral rewards');
  END IF;
  SELECT role.name, profile.is_active, profile.status INTO role_name, profile_active, profile_status
  FROM public.profiles profile JOIN public.user_roles role ON role.id = profile.role_id WHERE profile.id = uid;
  IF role_name NOT IN ('student', 'student_vendor') OR profile_active IS NOT TRUE OR profile_status IS DISTINCT FROM 'active'
     OR NOT EXISTS (SELECT 1 FROM public.student_registration_payments WHERE user_id = uid AND status = 'paid') THEN
    RETURN jsonb_build_object('eligible', false, 'code', NULL, 'message', 'Complete eligible student registration before using referrals');
  END IF;
  SELECT code INTO code_value FROM public.student_referral_codes WHERE user_id = uid AND revoked_at IS NULL FOR UPDATE;
  IF code_value IS NULL THEN
    INSERT INTO public.student_referral_codes(user_id, code)
    VALUES (uid, 'UE-' || upper(encode(extensions.gen_random_bytes(10), 'hex')))
    ON CONFLICT (user_id) DO UPDATE SET revoked_at = NULL RETURNING code INTO code_value;
  END IF;
  referral_link := 'https://uniecoghana.com/signup?ref=' || code_value;
  PERFORM public.queue_referral_link_message_for_user(uid, code_value);
  RETURN jsonb_build_object('eligible', true, 'code', code_value, 'referral_link', referral_link, 'reward_amount', 2, 'currency', 'GHS');
END;
$$;
REVOKE ALL ON FUNCTION public.ensure_my_student_referral_link() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.ensure_my_student_referral_link() TO authenticated;

CREATE OR REPLACE FUNCTION public.get_my_referral_summary()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE uid uuid := auth.uid(); result jsonb;
BEGIN
  IF uid IS NULL OR public.current_app_role() NOT IN ('student','student_vendor')
     OR EXISTS (SELECT 1 FROM public.buyer_registrations WHERE user_id = uid) THEN
    RAISE EXCEPTION 'Eligible student referral access required' USING ERRCODE = '42501';
  END IF;
  SELECT jsonb_build_object(
    'code',code.code,
    'successful_referrals',(SELECT count(*) FROM public.student_referral_attributions a WHERE a.referrer_user_id=uid AND a.status='qualified'),
    'pending_amount',COALESCE((SELECT sum(amount) FROM public.student_referral_rewards WHERE referrer_user_id=uid AND status='pending'),0),
    'available_amount',COALESCE((SELECT sum(amount) FROM public.student_referral_rewards WHERE referrer_user_id=uid AND status='available'),0),
    'paid_amount',COALESCE((SELECT sum(amount) FROM public.student_referral_rewards WHERE referrer_user_id=uid AND status='paid'),0),
    'total_earned',COALESCE((SELECT sum(amount) FROM public.student_referral_rewards WHERE referrer_user_id=uid AND status IN ('pending','available','payout_pending','paid')),0),
    'minimum_payout',(SELECT minimum_payout FROM public.student_financial_settings WHERE singleton),
    'history',COALESCE((SELECT jsonb_agg(jsonb_build_object('created_at',a.created_at,'referred_name',left(COALESCE(p.full_name,'Student'),1)||'.','registration_status',r.status,'reward_amount',rw.amount,'reward_status',rw.status) ORDER BY a.created_at DESC) FROM public.student_referral_attributions a JOIN public.profiles p ON p.id=a.referred_user_id LEFT JOIN public.student_registration_payments r ON r.user_id=a.referred_user_id LEFT JOIN public.student_referral_rewards rw ON rw.referred_user_id=a.referred_user_id WHERE a.referrer_user_id=uid),'[]'::jsonb)
  ) INTO result FROM public.student_referral_codes code WHERE code.user_id=uid AND code.revoked_at IS NULL;
  RETURN COALESCE(result,jsonb_build_object('code',NULL,'successful_referrals',0,'pending_amount',0,'available_amount',0,'paid_amount',0,'total_earned',0,'minimum_payout',10,'history','[]'::jsonb));
END;
$$;
REVOKE ALL ON FUNCTION public.get_my_referral_summary() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_my_referral_summary() TO authenticated;

-- The requested seller price is GH₵10. A new immutable payment attempt still
-- snapshots the configured fee; existing payments and attempts are untouched.
UPDATE public.student_financial_settings
SET vendor_registration_fee = 10.00,
    updated_at = now()
WHERE singleton AND vendor_registration_fee IS DISTINCT FROM 10.00;

COMMIT;
