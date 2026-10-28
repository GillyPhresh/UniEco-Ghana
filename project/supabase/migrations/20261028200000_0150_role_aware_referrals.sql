-- Role-aware referral delivery and vendor referrals.
-- Student referrals keep their existing ledger and qualification rules. Vendor
-- referrals use a separate ledger so a student code can never be used to
-- create a vendor reward (or the reverse).
BEGIN;

CREATE TABLE IF NOT EXISTS public.vendor_referral_codes (
  user_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE RESTRICT,
  code text NOT NULL UNIQUE CHECK (code ~ '^UEV-[A-F0-9]{20}$'),
  created_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz
);
ALTER TABLE public.vendor_referral_codes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.vendor_referral_codes FROM PUBLIC, anon, authenticated, service_role;

CREATE TABLE IF NOT EXISTS public.vendor_referral_attributions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  referred_user_id uuid NOT NULL UNIQUE REFERENCES public.profiles(id) ON DELETE RESTRICT,
  code text NOT NULL REFERENCES public.vendor_referral_codes(code) ON UPDATE RESTRICT ON DELETE RESTRICT,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','qualified','rejected','reversed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  qualified_at timestamptz,
  CHECK (referrer_user_id <> referred_user_id)
);
CREATE INDEX IF NOT EXISTS vendor_referral_attributions_referrer_idx
  ON public.vendor_referral_attributions(referrer_user_id, status, created_at DESC);
ALTER TABLE public.vendor_referral_attributions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.vendor_referral_attributions FROM PUBLIC, anon, authenticated, service_role;

CREATE TABLE IF NOT EXISTS public.vendor_referral_rewards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  attribution_id uuid NOT NULL UNIQUE REFERENCES public.vendor_referral_attributions(id) ON DELETE RESTRICT,
  payment_id uuid NOT NULL UNIQUE REFERENCES public.payments(id) ON DELETE RESTRICT,
  referrer_user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  referred_user_id uuid NOT NULL UNIQUE REFERENCES public.profiles(id) ON DELETE RESTRICT,
  amount numeric(12,2) NOT NULL CHECK (amount > 0),
  currency text NOT NULL DEFAULT 'GHS' CHECK (currency = 'GHS'),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','available','payout_pending','paid','failed','reversed','reconciliation_required')),
  available_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  paid_at timestamptz,
  reversed_at timestamptz
);
CREATE INDEX IF NOT EXISTS vendor_referral_rewards_owner_status_idx
  ON public.vendor_referral_rewards(referrer_user_id, status, available_at);
ALTER TABLE public.vendor_referral_rewards ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.vendor_referral_rewards FROM PUBLIC, anon, authenticated, service_role;

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
  notification_exists boolean;
BEGIN
  IF p_user_id IS NULL OR code_value !~ '^UE-[A-F0-9]{20}$' THEN RETURN; END IF;

  SELECT * INTO recipient
  FROM public.profiles
  WHERE id = p_user_id;
  IF NOT FOUND THEN RETURN; END IF;

  referral_link := 'https://www.uniecoghana.com/signup?ref=' || code_value || '&intent=student';
  SELECT EXISTS (
    SELECT 1 FROM public.notifications notification
    WHERE notification.user_id = recipient.id
      AND notification.type = 'referral_link_ready'
      AND notification.metadata->>'referral_code' = code_value
  ) INTO notification_exists;

  IF NOT notification_exists THEN
    PERFORM public.queue_user_communication(
      recipient.id,
      'referral_link_ready',
      'Your student referral link is ready',
      'Share your UniEco Ghana student link with another genuine student. You can earn GH₵2 when the registration is completed and verified.',
      'general',
      'https://www.uniecoghana.com/dashboard/referrals',
      'Gift',
      'referral_link_ready',
      jsonb_build_object(
        'referral_audience', 'student',
        'referral_code', code_value,
        'referral_link', referral_link,
        'reward_amount', 2,
        'currency', 'GHS'
      )
    );
  ELSE
    UPDATE public.notifications
    SET action_url = 'https://www.uniecoghana.com/dashboard/referrals',
        metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
          'referral_audience', 'student',
          'referral_code', code_value,
          'referral_link', referral_link,
          'reward_amount', 2,
          'currency', 'GHS'
        )
    WHERE user_id = recipient.id
      AND type = 'referral_link_ready'
      AND metadata->>'referral_code' = code_value;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.queue_vendor_referral_link_message_for_user(
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
  notification_exists boolean;
BEGIN
  IF p_user_id IS NULL OR code_value !~ '^UEV-[A-F0-9]{20}$' THEN RETURN; END IF;

  SELECT * INTO recipient
  FROM public.profiles
  WHERE id = p_user_id;
  IF NOT FOUND THEN RETURN; END IF;

  referral_link := 'https://www.uniecoghana.com/signup?ref=' || code_value || '&intent=external_vendor';
  SELECT EXISTS (
    SELECT 1 FROM public.notifications notification
    WHERE notification.user_id = recipient.id
      AND notification.type = 'referral_link_ready'
      AND notification.metadata->>'referral_code' = code_value
  ) INTO notification_exists;

  IF NOT notification_exists THEN
    PERFORM public.queue_user_communication(
      recipient.id,
      'referral_link_ready',
      'Your vendor referral link is ready',
      'Share your UniEco Ghana vendor link with another genuine business owner. You can earn GH₵2 when the vendor registration is completed and the payment is confirmed.',
      'businesses',
      'https://www.uniecoghana.com/vendor-dashboard/referrals',
      'Gift',
      'referral_link_ready',
      jsonb_build_object(
        'referral_audience', 'vendor',
        'referral_code', code_value,
        'referral_link', referral_link,
        'reward_amount', 2,
        'currency', 'GHS'
      )
    );
  ELSE
    UPDATE public.notifications
    SET action_url = 'https://www.uniecoghana.com/vendor-dashboard/referrals',
        metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
          'referral_audience', 'vendor',
          'referral_code', code_value,
          'referral_link', referral_link,
          'reward_amount', 2,
          'currency', 'GHS'
        )
    WHERE user_id = recipient.id
      AND type = 'referral_link_ready'
      AND metadata->>'referral_code' = code_value;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.ensure_my_vendor_referral_link()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  uid uuid := auth.uid();
  role_name text := public.current_app_role();
  code_value text;
  referral_link text;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501'; END IF;
  IF role_name NOT IN ('student_vendor', 'external_vendor') THEN
    RETURN jsonb_build_object('eligible', false, 'code', NULL, 'message', 'Complete vendor registration first');
  END IF;
  PERFORM public.ensure_my_vendor_referral_link_for_user(uid);
  SELECT code INTO code_value FROM public.vendor_referral_codes WHERE user_id = uid AND revoked_at IS NULL;
  IF code_value IS NULL THEN
    RETURN jsonb_build_object('eligible', false, 'code', NULL, 'message', 'Complete verified vendor payment before sharing referrals');
  END IF;
  referral_link := 'https://www.uniecoghana.com/signup?ref=' || code_value || '&intent=external_vendor';
  RETURN jsonb_build_object('eligible', true, 'code', code_value, 'referral_link', referral_link, 'reward_amount', 2, 'currency', 'GHS');
END;
$$;

CREATE OR REPLACE FUNCTION public.attach_my_vendor_referral_code(p_referral_code text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  uid uuid := auth.uid();
  code_value text := upper(NULLIF(btrim(p_referral_code), ''));
  referrer_id uuid;
  existing public.vendor_referral_attributions%ROWTYPE;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501'; END IF;
  IF code_value IS NULL OR code_value !~ '^UEV-[A-F0-9]{20}$' THEN
    RAISE EXCEPTION 'Vendor referral code is invalid' USING ERRCODE = '22023';
  END IF;

  SELECT code.user_id INTO referrer_id
  FROM public.vendor_referral_codes code
  JOIN public.profiles referrer ON referrer.id = code.user_id
  JOIN public.user_roles role ON role.id = referrer.role_id
  WHERE code.code = code_value
    AND code.revoked_at IS NULL
    AND referrer.is_active
    AND referrer.status = 'active'
    AND role.name IN ('student_vendor', 'external_vendor')
  FOR SHARE;
  IF referrer_id IS NULL OR referrer_id = uid THEN
    RAISE EXCEPTION 'Vendor referral code is invalid' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO existing
  FROM public.vendor_referral_attributions
  WHERE referred_user_id = uid
  FOR UPDATE;
  IF FOUND AND existing.code <> code_value THEN
    RAISE EXCEPTION 'A vendor referral code is already locked to this registration' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.vendor_referral_attributions(referrer_user_id, referred_user_id, code)
  VALUES (referrer_id, uid, code_value)
  ON CONFLICT (referred_user_id) DO NOTHING;
  RETURN jsonb_build_object('attached', true, 'code', code_value, 'audience', 'vendor');
END;
$$;

CREATE OR REPLACE FUNCTION public.get_my_vendor_referral_summary()
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE uid uuid := auth.uid(); result jsonb;
BEGIN
  IF uid IS NULL OR public.current_app_role() NOT IN ('student_vendor', 'external_vendor') THEN
    RAISE EXCEPTION 'Vendor access required' USING ERRCODE = '42501';
  END IF;
  SELECT jsonb_build_object(
    'code', code.code,
    'successful_referrals', (SELECT count(*) FROM public.vendor_referral_attributions a WHERE a.referrer_user_id = uid AND a.status = 'qualified'),
    'pending_amount', COALESCE((SELECT sum(amount) FROM public.vendor_referral_rewards WHERE referrer_user_id = uid AND status = 'pending'), 0),
    'available_amount', COALESCE((SELECT sum(amount) FROM public.vendor_referral_rewards WHERE referrer_user_id = uid AND status = 'available'), 0),
    'paid_amount', COALESCE((SELECT sum(amount) FROM public.vendor_referral_rewards WHERE referrer_user_id = uid AND status = 'paid'), 0),
    'total_earned', COALESCE((SELECT sum(amount) FROM public.vendor_referral_rewards WHERE referrer_user_id = uid AND status IN ('pending','available','payout_pending','paid')), 0),
    'minimum_payout', (SELECT minimum_payout FROM public.student_financial_settings WHERE singleton),
    'history', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'created_at', a.created_at,
        'referred_name', left(COALESCE(p.full_name, 'Vendor'), 1) || '.',
        'registration_status', CASE WHEN reward.id IS NULL THEN 'pending' ELSE 'paid' END,
        'reward_amount', reward.amount,
        'reward_status', reward.status
      ) ORDER BY a.created_at DESC)
      FROM public.vendor_referral_attributions a
      JOIN public.profiles p ON p.id = a.referred_user_id
      LEFT JOIN public.vendor_referral_rewards reward ON reward.referred_user_id = a.referred_user_id
      WHERE a.referrer_user_id = uid
    ), '[]'::jsonb)
  ) INTO result
  FROM public.vendor_referral_codes code
  WHERE code.user_id = uid AND code.revoked_at IS NULL;
  RETURN COALESCE(result, jsonb_build_object('code', NULL, 'successful_referrals', 0, 'pending_amount', 0, 'available_amount', 0, 'paid_amount', 0, 'total_earned', 0, 'minimum_payout', 10, 'history', '[]'::jsonb));
END;
$$;

CREATE OR REPLACE FUNCTION public.try_qualify_vendor_referral(p_referred_user_id uuid)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  attribution public.vendor_referral_attributions%ROWTYPE;
  payment_row public.payments%ROWTYPE;
  settings public.student_financial_settings%ROWTYPE;
  reward_id uuid;
BEGIN
  SELECT * INTO attribution
  FROM public.vendor_referral_attributions
  WHERE referred_user_id = p_referred_user_id AND status = 'pending'
  FOR UPDATE;
  IF NOT FOUND OR attribution.referrer_user_id = p_referred_user_id THEN RETURN NULL; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles referrer
    JOIN public.user_roles role ON role.id = referrer.role_id
    WHERE referrer.id = attribution.referrer_user_id
      AND referrer.is_active AND referrer.status = 'active'
      AND role.name IN ('student_vendor', 'external_vendor')
  ) THEN RETURN NULL; END IF;

  SELECT payment.* INTO payment_row
  FROM public.vendor_registration_payment_states state
  JOIN public.vendors vendor ON vendor.id = state.vendor_id AND vendor.owner_id = p_referred_user_id
  JOIN public.payments payment ON payment.id = state.payment_id
  WHERE state.owner_id = p_referred_user_id
    AND state.state = 'paid'
    AND payment.user_id = p_referred_user_id
    AND payment.payment_type = 'vendor_registration'
    AND payment.status = 'success'
    AND payment.currency = 'GHS'
  ORDER BY payment.created_at DESC
  LIMIT 1;
  IF NOT FOUND THEN RETURN NULL; END IF;

  SELECT * INTO settings FROM public.student_financial_settings WHERE singleton;
  UPDATE public.vendor_referral_attributions
  SET status = 'qualified', qualified_at = COALESCE(qualified_at, now())
  WHERE id = attribution.id AND status = 'pending';
  IF NOT FOUND THEN RETURN NULL; END IF;

  INSERT INTO public.vendor_referral_rewards(
    attribution_id, payment_id, referrer_user_id, referred_user_id,
    amount, currency, status, available_at
  ) VALUES (
    attribution.id, payment_row.id, attribution.referrer_user_id, p_referred_user_id,
    settings.referral_reward, settings.currency, 'pending',
    now() + make_interval(hours => settings.reward_settlement_hours)
  ) ON CONFLICT DO NOTHING RETURNING id INTO reward_id;

  PERFORM public.queue_user_communication(
    attribution.referrer_user_id,
    'vendor_referral_qualified',
    'Your vendor referral qualified',
    'A vendor you invited completed registration payment. GH₵2 has been recorded and will settle after the referral review period.',
    'businesses',
    'https://www.uniecoghana.com/vendor-dashboard/referrals',
    'Gift',
    'vendor_referral_qualified',
    jsonb_build_object('reward_amount', settings.referral_reward, 'currency', settings.currency, 'referred_user_id', p_referred_user_id)
  );
  RETURN reward_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.ensure_my_vendor_referral_link_for_user(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE code_value text;
BEGIN
  IF p_user_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.profiles profile
    JOIN public.user_roles role ON role.id = profile.role_id
    WHERE profile.id = p_user_id AND profile.is_active AND profile.status = 'active'
      AND role.name IN ('student_vendor', 'external_vendor')
  ) THEN RETURN; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.vendor_registration_payment_states state
    JOIN public.payments payment ON payment.id = state.payment_id
    WHERE state.owner_id = p_user_id AND state.state = 'paid'
      AND payment.user_id = p_user_id AND payment.payment_type = 'vendor_registration'
      AND payment.status = 'success' AND payment.currency = 'GHS'
  ) THEN RETURN; END IF;
  SELECT code INTO code_value FROM public.vendor_referral_codes
  WHERE user_id = p_user_id AND revoked_at IS NULL FOR UPDATE;
  IF code_value IS NULL THEN
    INSERT INTO public.vendor_referral_codes(user_id, code)
    VALUES (p_user_id, 'UEV-' || upper(encode(extensions.gen_random_bytes(10), 'hex')))
    ON CONFLICT (user_id) DO UPDATE SET revoked_at = NULL
    RETURNING code INTO code_value;
  END IF;
  PERFORM public.queue_vendor_referral_link_message_for_user(p_user_id, code_value);
END;
$$;

-- The existing payment trigger remains the authority for vendor access. Add
-- referral creation and qualification after Paystack has marked the payment
-- successful; never award from a browser callback or client request.
CREATE OR REPLACE FUNCTION public.apply_vendor_registration_payment_result()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF NEW.payment_type <> 'vendor_registration'
     OR NEW.status IS NOT DISTINCT FROM OLD.status THEN
    RETURN NEW;
  END IF;

  IF NEW.status = 'success' THEN
    IF NEW.amount = (SELECT vendor_registration_fee FROM public.student_financial_settings WHERE singleton)
       AND NEW.currency = 'GHS'
       AND NEW.vendor_id IS NOT NULL THEN
      UPDATE public.vendor_registration_payment_states
      SET payment_requirement = 'paid', state = 'paid', payment_id = NEW.id,
          amount = NEW.amount, currency = NEW.currency, updated_at = now()
      WHERE vendor_id = NEW.vendor_id AND owner_id = NEW.user_id;
      UPDATE public.profiles SET status = 'active', is_active = true, updated_at = now() WHERE id = NEW.user_id;
      PERFORM public.ensure_my_vendor_referral_link_for_user(NEW.user_id);
      PERFORM public.try_qualify_vendor_referral(NEW.user_id);
    END IF;
  ELSIF NEW.status IN ('failed', 'cancelled', 'refunded', 'partially_refunded') THEN
    UPDATE public.vendor_registration_payment_states
    SET payment_requirement = 'required', state = 'awaiting_payment', updated_at = now()
    WHERE vendor_id = NEW.vendor_id AND owner_id = NEW.user_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS apply_vendor_registration_payment_result ON public.payments;
CREATE TRIGGER apply_vendor_registration_payment_result
AFTER UPDATE OF status ON public.payments
FOR EACH ROW EXECUTE FUNCTION public.apply_vendor_registration_payment_result();

-- Repair paid vendors that existed before this migration.
DO $$
DECLARE paid_vendor record;
BEGIN
  FOR paid_vendor IN
    SELECT DISTINCT state.owner_id
    FROM public.vendor_registration_payment_states state
    JOIN public.payments payment ON payment.id = state.payment_id
    JOIN public.profiles profile ON profile.id = state.owner_id
    JOIN public.user_roles role ON role.id = profile.role_id
    WHERE state.state = 'paid' AND payment.status = 'success'
      AND role.name IN ('student_vendor', 'external_vendor')
  LOOP
    PERFORM public.ensure_my_vendor_referral_link_for_user(paid_vendor.owner_id);
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.queue_referral_link_message_for_user(uuid,text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.queue_vendor_referral_link_message_for_user(uuid,text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.ensure_my_vendor_referral_link_for_user(uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.ensure_my_vendor_referral_link() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.attach_my_vendor_referral_code(text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.get_my_vendor_referral_summary() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.try_qualify_vendor_referral(uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.apply_vendor_registration_payment_result() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.ensure_my_vendor_referral_link() TO authenticated;
GRANT EXECUTE ON FUNCTION public.attach_my_vendor_referral_code(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_vendor_referral_summary() TO authenticated;

COMMIT;
