-- Make vendor onboarding resumable after checkout failures and ensure only an
-- amount-matched, successful Paystack payment can unlock vendor registration.
BEGIN;

CREATE OR REPLACE FUNCTION public.create_vendor_registration_application(
  p_business_name text, p_business_category text, p_description text,
  p_location_address text, p_location_city text, p_location_region text,
  p_product_service_type text, p_contact_phone text, p_contact_email text,
  p_vendor_type text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, extensions, public
AS $$
DECLARE
  uid uuid := auth.uid();
  vendor_row public.vendors%ROWTYPE;
  state_row public.vendor_registration_payment_states%ROWTYPE;
  vendor_profile_row public.vendor_profiles%ROWTYPE;
  vendor_id_value uuid;
  vendor_slug text;
  is_student_vendor boolean;
  current_role_id smallint;
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;
  IF p_vendor_type NOT IN ('student_vendor', 'external_vendor')
     OR NULLIF(btrim(p_business_name), '') IS NULL
     OR NULLIF(btrim(p_business_category), '') IS NULL
     OR NULLIF(btrim(p_description), '') IS NULL
     OR NULLIF(btrim(p_location_address), '') IS NULL
     OR NULLIF(btrim(p_location_city), '') IS NULL
     OR NULLIF(btrim(p_location_region), '') IS NULL
     OR NULLIF(btrim(p_product_service_type), '') IS NULL
     OR NULLIF(btrim(p_contact_phone), '') IS NULL THEN
    RAISE EXCEPTION 'Complete all required business details' USING ERRCODE = '22023';
  END IF;

  is_student_vendor := p_vendor_type = 'student_vendor';
  IF is_student_vendor AND NOT EXISTS (
    SELECT 1 FROM public.student_profiles
    WHERE user_id = uid AND is_verified_student
  ) THEN
    RAISE EXCEPTION 'Verified student status is required for a student vendor application' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO vendor_row
  FROM public.vendors
  WHERE owner_id = uid
  FOR UPDATE;

  IF FOUND THEN
    SELECT * INTO state_row
    FROM public.vendor_registration_payment_states
    WHERE vendor_id = vendor_row.id AND owner_id = uid
    FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Vendor registration payment state is missing' USING ERRCODE = '55000';
    END IF;
    SELECT * INTO vendor_profile_row
    FROM public.vendor_profiles
    WHERE profile_id = uid
    FOR UPDATE;
    IF NOT FOUND OR vendor_profile_row.vendor_type IS DISTINCT FROM p_vendor_type THEN
      RAISE EXCEPTION 'An application of a different vendor type already exists for this account' USING ERRCODE = '22023';
    END IF;

    -- Preserve completed/verified business records. An unpaid application is
    -- updated in place so a retry resumes the same vendor, never a duplicate.
    IF state_row.state <> 'paid' AND NOT vendor_row.is_active AND NOT vendor_row.is_verified THEN
      vendor_slug := lower(regexp_replace(btrim(p_business_name), '[^a-z0-9]+', '-', 'g'))
        || '-' || substr(uid::text, 1, 8);
      UPDATE public.vendor_profiles
      SET vendor_type = p_vendor_type,
          verification_status = 'pending',
          business_category = btrim(p_business_category),
          location_address = btrim(p_location_address),
          location_city = btrim(p_location_city),
          location_region = btrim(p_location_region),
          product_service_type = btrim(p_product_service_type)
      WHERE profile_id = uid;
      UPDATE public.vendors
      SET business_name = btrim(p_business_name),
          business_slug = vendor_slug,
          business_type = btrim(p_business_category),
          description = btrim(p_description),
          is_student_business = is_student_vendor,
          contact_phone = btrim(p_contact_phone),
          contact_email = NULLIF(btrim(p_contact_email), ''),
          updated_at = now()
      WHERE id = vendor_row.id AND owner_id = uid;
    END IF;

    RETURN jsonb_build_object(
      'vendor_id', vendor_row.id,
      'payment_requirement', state_row.payment_requirement,
      'state', state_row.state,
      'resumed', true
    );
  END IF;

  SELECT role_id INTO current_role_id
  FROM public.profiles
  WHERE id = uid
  FOR UPDATE;
  IF current_role_id IS NULL OR current_role_id NOT IN (2, 3, 4) THEN
    RAISE EXCEPTION 'Current role is not eligible for vendor onboarding' USING ERRCODE = '42501';
  END IF;

  vendor_slug := lower(regexp_replace(btrim(p_business_name), '[^a-z0-9]+', '-', 'g'))
    || '-' || substr(uid::text, 1, 8);
  INSERT INTO public.vendor_profiles(
    profile_id, vendor_type, verification_status, subscription_status,
    business_category, location_address, location_city, location_region,
    product_service_type
  ) VALUES (
    uid, p_vendor_type, 'pending', 'none', btrim(p_business_category),
    btrim(p_location_address), btrim(p_location_city), btrim(p_location_region),
    btrim(p_product_service_type)
  );
  INSERT INTO public.vendors(
    university_id, owner_id, business_name, business_slug, business_type,
    description, is_student_business, is_verified, is_active,
    contact_phone, contact_email
  )
  SELECT university_id, uid, btrim(p_business_name), vendor_slug,
         btrim(p_business_category), btrim(p_description), is_student_vendor,
         false, false, btrim(p_contact_phone), NULLIF(btrim(p_contact_email), '')
  FROM public.profiles
  WHERE id = uid
  RETURNING id INTO vendor_id_value;

  INSERT INTO public.vendor_registration_payment_states(vendor_id, owner_id)
  VALUES (vendor_id_value, uid);

  UPDATE public.profiles
  SET role_id = CASE WHEN is_student_vendor THEN 3 ELSE 4 END,
      updated_at = now()
  WHERE id = uid;
  INSERT INTO public.role_transition_audit(target_user_id, old_role_id, new_role_id, actor_id, reason)
  VALUES (uid, current_role_id, CASE WHEN is_student_vendor THEN 3 ELSE 4 END, uid, 'vendor_onboarding_completed')
  ON CONFLICT DO NOTHING;
  INSERT INTO public.audit_logs(actor_id, target_id, action, entity_type, entity_id, metadata)
  VALUES (
    uid, uid, 'vendor_registration_submitted', 'vendors', vendor_id_value,
    jsonb_build_object('vendor_type', p_vendor_type, 'payment_requirement', 'required', 'payment_purpose', 'vendor_registration')
  );

  RETURN jsonb_build_object(
    'vendor_id', vendor_id_value,
    'payment_requirement', 'required',
    'state', 'awaiting_payment',
    'resumed', false
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.begin_vendor_registration_payment(
  p_vendor_id uuid,
  p_idempotency_key text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, extensions, public
AS $$
DECLARE
  uid uuid := auth.uid();
  vendor_row public.vendors%ROWTYPE;
  state_row public.vendor_registration_payment_states%ROWTYPE;
  payment_row public.payments%ROWTYPE;
  fee numeric(12,2);
  expected_fee numeric(12,2);
  effective_key text;
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;
  IF public.current_app_role() NOT IN ('student_vendor', 'external_vendor') THEN
    RAISE EXCEPTION 'Vendor registration payment is unavailable' USING ERRCODE = '42501';
  END IF;
  IF p_idempotency_key IS NOT NULL
     AND (length(p_idempotency_key) NOT BETWEEN 8 AND 120
          OR p_idempotency_key !~ '^[A-Za-z0-9._=-]+$') THEN
    RAISE EXCEPTION 'Invalid payment request key' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO vendor_row
  FROM public.vendors
  WHERE id = p_vendor_id AND owner_id = uid
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Vendor registration access denied' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO state_row
  FROM public.vendor_registration_payment_states
  WHERE vendor_id = p_vendor_id AND owner_id = uid
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Vendor registration payment state is missing' USING ERRCODE = '55000';
  END IF;

  SELECT vendor_registration_fee INTO fee
  FROM public.student_financial_settings
  WHERE singleton
  FOR SHARE;
  IF fee IS NULL OR fee < 0 THEN
    RAISE EXCEPTION 'Vendor registration fee is not configured' USING ERRCODE = '55000';
  END IF;
  expected_fee := COALESCE(state_row.amount, fee);

  -- Repair stale state only from a real, amount-matched successful payment.
  SELECT * INTO payment_row
  FROM public.payments
  WHERE user_id = uid AND vendor_id = p_vendor_id
    AND payment_type = 'vendor_registration' AND provider = 'paystack'
    AND status = 'success' AND amount = expected_fee AND currency = 'GHS'
  ORDER BY created_at DESC
  LIMIT 1
  FOR UPDATE;
  IF FOUND THEN
    UPDATE public.vendor_registration_payment_states
    SET payment_requirement = 'paid', state = 'paid', payment_id = payment_row.id,
        amount = expected_fee, currency = 'GHS', updated_at = now()
    WHERE vendor_id = p_vendor_id AND owner_id = uid;
    RETURN jsonb_build_object(
      'id', payment_row.id, 'payment_id', payment_row.id,
      'payment_reference', payment_row.payment_reference,
      'amount', payment_row.amount, 'currency', payment_row.currency,
      'payment_type', payment_row.payment_type, 'status', 'success',
      'vendor_id', p_vendor_id
    );
  END IF;

  IF state_row.state = 'paid' THEN
    UPDATE public.vendor_registration_payment_states
    SET payment_requirement = 'required', state = 'awaiting_payment',
        payment_id = NULL, updated_at = now()
    WHERE vendor_id = p_vendor_id AND owner_id = uid;
  END IF;

  IF p_idempotency_key IS NOT NULL THEN
    SELECT * INTO payment_row
    FROM public.payments
    WHERE user_id = uid AND idempotency_key = p_idempotency_key
    FOR UPDATE;
    IF FOUND THEN
      IF payment_row.provider <> 'paystack'
         OR payment_row.payment_type <> 'vendor_registration'
         OR payment_row.vendor_id IS DISTINCT FROM p_vendor_id
         OR payment_row.amount IS DISTINCT FROM expected_fee
         OR payment_row.currency IS DISTINCT FROM 'GHS' THEN
        RAISE EXCEPTION 'Payment request key is already attached to a different payment' USING ERRCODE = '22023';
      END IF;
      IF payment_row.status = 'reconciliation_required' THEN
        RAISE EXCEPTION 'Vendor registration payment requires support review' USING ERRCODE = '55000';
      END IF;
      IF payment_row.status IN ('initiated', 'pending') THEN
        UPDATE public.vendor_registration_payment_states
        SET payment_requirement = 'required', state = 'payment_pending',
            payment_id = payment_row.id, amount = expected_fee,
            currency = 'GHS', updated_at = now()
        WHERE vendor_id = p_vendor_id AND owner_id = uid;
        RETURN jsonb_build_object(
          'id', payment_row.id, 'payment_id', payment_row.id,
          'payment_reference', payment_row.payment_reference,
          'amount', payment_row.amount, 'currency', payment_row.currency,
          'payment_type', payment_row.payment_type, 'status', payment_row.status,
          'vendor_id', p_vendor_id
        );
      END IF;
      -- A provider-confirmed terminal result permits a new, distinct attempt.
    END IF;
  END IF;

  -- Reuse an unresolved attempt under the row lock. This makes concurrent
  -- retries converge on one reference instead of creating duplicate charges.
  SELECT * INTO payment_row
  FROM public.payments
  WHERE user_id = uid AND vendor_id = p_vendor_id
    AND payment_type = 'vendor_registration' AND provider = 'paystack'
    AND status IN ('initiated', 'pending', 'reconciliation_required')
  ORDER BY created_at DESC
  LIMIT 1
  FOR UPDATE;
  IF FOUND THEN
    IF payment_row.status = 'reconciliation_required'
       OR payment_row.amount IS DISTINCT FROM expected_fee
       OR payment_row.currency IS DISTINCT FROM 'GHS' THEN
      RAISE EXCEPTION 'Vendor registration payment requires support review' USING ERRCODE = '55000';
    END IF;
    UPDATE public.vendor_registration_payment_states
    SET payment_requirement = 'required', state = 'payment_pending',
        payment_id = payment_row.id, amount = expected_fee,
        currency = 'GHS', updated_at = now()
    WHERE vendor_id = p_vendor_id AND owner_id = uid;
    RETURN jsonb_build_object(
      'id', payment_row.id, 'payment_id', payment_row.id,
      'payment_reference', payment_row.payment_reference,
      'amount', payment_row.amount, 'currency', payment_row.currency,
      'payment_type', payment_row.payment_type, 'status', payment_row.status,
      'vendor_id', p_vendor_id
    );
  END IF;

  effective_key := p_idempotency_key;
  IF effective_key IS NULL OR EXISTS (
    SELECT 1 FROM public.payments
    WHERE user_id = uid AND idempotency_key = effective_key
  ) THEN
    effective_key := encode(gen_random_bytes(16), 'hex');
  END IF;

  INSERT INTO public.payments(
    payment_reference, provider, user_id, vendor_id, payment_type, entity_id,
    amount, currency, status, idempotency_key, webhook_data
  ) VALUES (
    public.financial_reference('VREG'), 'paystack', uid, p_vendor_id,
    'vendor_registration', p_vendor_id, expected_fee, 'GHS', 'initiated',
    effective_key,
    jsonb_build_object('vendor_id', p_vendor_id, 'fee_snapshot', expected_fee, 'currency', 'GHS')
  ) RETURNING * INTO payment_row;

  UPDATE public.vendor_registration_payment_states
  SET payment_requirement = 'required', state = 'payment_pending',
      payment_id = payment_row.id, amount = expected_fee,
      currency = 'GHS', updated_at = now()
  WHERE vendor_id = p_vendor_id AND owner_id = uid;

  INSERT INTO public.transaction_audit_log(payment_id, new_status, changed_by, reason, metadata)
  VALUES (
    payment_row.id, 'initiated', uid, 'vendor_registration_payment_intent_created',
    jsonb_build_object('vendor_id', p_vendor_id, 'amount', expected_fee, 'currency', 'GHS')
  );

  RETURN jsonb_build_object(
    'id', payment_row.id, 'payment_id', payment_row.id,
    'payment_reference', payment_row.payment_reference,
    'amount', payment_row.amount, 'currency', payment_row.currency,
    'payment_type', payment_row.payment_type, 'status', payment_row.status,
    'vendor_id', p_vendor_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.create_vendor_registration_application(text,text,text,text,text,text,text,text,text,text)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.create_vendor_registration_application(text,text,text,text,text,text,text,text,text,text)
  TO authenticated;
REVOKE ALL ON FUNCTION public.begin_vendor_registration_payment(uuid,text)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.begin_vendor_registration_payment(uuid,text)
  TO authenticated;

COMMENT ON FUNCTION public.create_vendor_registration_application(text,text,text,text,text,text,text,text,text,text) IS
  'Owner-scoped, idempotent vendor registration. Retries update/resume one unpaid vendor record; they never create duplicates.';
COMMENT ON FUNCTION public.begin_vendor_registration_payment(uuid,text) IS
  'Owner-scoped vendor registration payment intent. Reuses unresolved references, validates idempotency-key scope, and unlocks only on an amount-matched successful payment.';

COMMIT;
