-- Restore the explicitly authorised cash-registration exception.
-- Normal registrations still require a verified Paystack payment. Only a
-- single-use token created by a super administrator can use this path.
BEGIN;

ALTER TABLE public.registration_access_invites
  ADD COLUMN IF NOT EXISTS payment_method text NOT NULL DEFAULT 'cash',
  ADD COLUMN IF NOT EXISTS cash_confirmed_at timestamptz;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'registration_access_invites_payment_method_check'
      AND conrelid = 'public.registration_access_invites'::regclass
  ) THEN
    ALTER TABLE public.registration_access_invites
      ADD CONSTRAINT registration_access_invites_payment_method_check
      CHECK (payment_method IN ('cash'));
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.get_registration_access_invite(p_token text)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  invite public.registration_access_invites%ROWTYPE;
  required_amount numeric(12,2);
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('valid', false, 'message', 'Authentication required');
  END IF;
  SELECT * INTO invite
  FROM public.registration_access_invites
  WHERE token_hash = encode(extensions.digest(btrim(p_token), 'sha256'), 'hex')
    AND redeemed_at IS NULL
    AND expires_at > now()
  FOR SHARE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('valid', false, 'message', 'This cash registration link is invalid, expired, or already used');
  END IF;
  IF invite.audience = 'student' THEN
    SELECT registration_fee INTO required_amount FROM public.student_financial_settings WHERE singleton;
  ELSE
    SELECT vendor_registration_fee INTO required_amount FROM public.student_financial_settings WHERE singleton;
  END IF;
  RETURN jsonb_build_object(
    'valid', true,
    'audience', invite.audience,
    'payment_method', 'cash',
    'amount', required_amount,
    'currency', 'GHS',
    'expires_at', invite.expires_at
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.redeem_cash_student_registration(
  p_token text,
  p_university_id uuid,
  p_phone text,
  p_student_id_number text,
  p_program text,
  p_faculty text,
  p_department text,
  p_level text,
  p_admission_year integer,
  p_graduation_year integer DEFAULT NULL,
  p_student_document_path text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  uid uuid := auth.uid();
  invite_id uuid;
  existing_redeemer uuid;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501'; END IF;
  SELECT id, redeemed_by INTO invite_id, existing_redeemer
  FROM public.registration_access_invites
  WHERE token_hash = encode(extensions.digest(btrim(p_token), 'sha256'), 'hex')
    AND audience = 'student' AND redeemed_at IS NULL AND expires_at > now()
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'This cash registration link is invalid, expired, or already used' USING ERRCODE = '42501'; END IF;

  -- The existing trusted completion function validates every student field,
  -- ownership of the private document path, institution status, and role.
  PERFORM public.complete_student_registration_with_invite(
    p_token, p_university_id, p_phone, p_student_id_number, p_program,
    p_faculty, p_department, p_level, p_admission_year, p_graduation_year,
    p_student_document_path
  );
  UPDATE public.registration_access_invites
  SET payment_method = 'cash', cash_confirmed_at = now()
  WHERE id = invite_id AND redeemed_by = uid;
  INSERT INTO public.audit_logs(actor_id, target_id, action, entity_type, entity_id, metadata)
  VALUES (uid, uid, 'cash_student_registration_redeemed', 'registration_access_invites', invite_id,
    jsonb_build_object('payment_method', 'cash', 'university_id', p_university_id));
  RETURN jsonb_build_object('status', 'paid', 'payment_method', 'cash', 'invite_id', invite_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.redeem_cash_vendor_registration(
  p_token text,
  p_vendor_id uuid
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  uid uuid := auth.uid();
  invite_id uuid;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501'; END IF;
  SELECT id INTO invite_id
  FROM public.registration_access_invites
  WHERE token_hash = encode(extensions.digest(btrim(p_token), 'sha256'), 'hex')
    AND audience = 'vendor' AND redeemed_at IS NULL AND expires_at > now()
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'This cash registration link is invalid, expired, or already used' USING ERRCODE = '42501'; END IF;
  IF public.current_app_role() NOT IN ('student_vendor', 'external_vendor') THEN
    RAISE EXCEPTION 'Vendor registration is unavailable' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.vendors WHERE id = p_vendor_id AND owner_id = uid) THEN
    RAISE EXCEPTION 'Vendor registration access denied' USING ERRCODE = '42501';
  END IF;

  UPDATE public.vendor_registration_payment_states state
  SET payment_requirement = 'paid', state = 'paid',
      amount = (SELECT vendor_registration_fee FROM public.student_financial_settings WHERE singleton),
      currency = 'GHS', updated_at = now()
  WHERE state.vendor_id = p_vendor_id AND state.owner_id = uid;
  IF NOT FOUND THEN RAISE EXCEPTION 'Vendor payment state was not found' USING ERRCODE = '22023'; END IF;
  UPDATE public.profiles SET status = 'active', is_active = true, updated_at = now() WHERE id = uid;
  UPDATE public.registration_access_invites
  SET redeemed_at = now(), redeemed_by = uid, payment_method = 'cash', cash_confirmed_at = now()
  WHERE id = invite_id;
  INSERT INTO public.audit_logs(actor_id, target_id, action, entity_type, entity_id, metadata)
  VALUES (uid, uid, 'cash_vendor_registration_redeemed', 'registration_access_invites', invite_id,
    jsonb_build_object('payment_method', 'cash', 'vendor_id', p_vendor_id));
  RETURN jsonb_build_object('status', 'paid', 'payment_method', 'cash', 'invite_id', invite_id, 'vendor_id', p_vendor_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.get_my_registration_access()
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
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
    SELECT registration_fee INTO required_amount FROM public.student_financial_settings WHERE singleton;
    cash_authorized := EXISTS (
      SELECT 1 FROM public.registration_access_invites
      WHERE redeemed_by = uid AND audience = 'student' AND redeemed_at IS NOT NULL AND payment_method = 'cash'
    );
    paid := EXISTS (
      SELECT 1
      FROM public.student_registration_payments registration
      JOIN public.payments payment ON payment.user_id = registration.user_id
        AND payment.payment_type = 'student_registration'
        AND payment.entity_id = registration.user_id
        AND payment.status = 'success'
        AND payment.amount = required_amount
        AND payment.currency = 'GHS'
      WHERE registration.user_id = uid AND registration.status = 'paid'
    );
  ELSIF role_name IN ('student_vendor', 'external_vendor') THEN
    SELECT vendor_registration_fee INTO required_amount FROM public.student_financial_settings WHERE singleton;
    cash_authorized := EXISTS (
      SELECT 1 FROM public.registration_access_invites
      WHERE redeemed_by = uid AND audience = 'vendor' AND redeemed_at IS NOT NULL AND payment_method = 'cash'
    );
    paid := EXISTS (
      SELECT 1
      FROM public.vendors vendor
      JOIN public.vendor_registration_payment_states state
        ON state.vendor_id = vendor.id AND state.owner_id = uid AND state.state = 'paid'
      JOIN public.payments payment ON payment.id = state.payment_id
        AND payment.user_id = uid AND payment.vendor_id = vendor.id
        AND payment.payment_type = 'vendor_registration'
        AND payment.status = 'success' AND payment.amount = required_amount AND payment.currency = 'GHS'
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

REVOKE ALL ON FUNCTION public.get_registration_access_invite(text), public.redeem_cash_student_registration(text,uuid,text,text,text,text,text,text,integer,integer,text), public.redeem_cash_vendor_registration(text,uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_registration_access_invite(text), public.redeem_cash_student_registration(text,uuid,text,text,text,text,text,text,integer,integer,text), public.redeem_cash_vendor_registration(text,uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.complete_student_registration_with_invite(text,uuid,text,text,text,text,text,text,integer,integer,text), public.redeem_vendor_registration_invite(text,uuid) FROM PUBLIC, anon, authenticated, service_role;

COMMIT;
