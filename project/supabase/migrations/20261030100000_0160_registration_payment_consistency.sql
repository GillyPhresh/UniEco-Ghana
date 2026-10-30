-- Keep vendor registration payments aligned with the configured fee and the
-- amount captured on the payment state. Never use a hard-coded fee when a
-- payment is created or verified.
BEGIN;

CREATE OR REPLACE FUNCTION public.begin_vendor_registration_payment(
  p_vendor_id uuid,
  p_idempotency_key text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  uid uuid := auth.uid();
  vendor_row public.vendors%ROWTYPE;
  state_row public.vendor_registration_payment_states%ROWTYPE;
  payment_row public.payments%ROWTYPE;
  fee numeric(12,2);
  expected_fee numeric(12,2);
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;
  IF public.current_app_role() NOT IN ('student_vendor', 'external_vendor') THEN
    RAISE EXCEPTION 'Vendor registration payment is unavailable' USING ERRCODE = '42501';
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
  IF fee IS NULL THEN
    RAISE EXCEPTION 'Vendor registration fee is not configured' USING ERRCODE = '55000';
  END IF;

  expected_fee := COALESCE(state_row.amount, fee);
  IF state_row.state = 'paid' THEN
    RETURN jsonb_build_object(
      'status', 'success', 'amount', expected_fee, 'currency', 'GHS', 'vendor_id', p_vendor_id
    );
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.payments
    WHERE user_id = uid
      AND vendor_id = p_vendor_id
      AND payment_type = 'vendor_registration'
      AND status = 'success'
      AND amount = expected_fee
      AND currency = 'GHS'
  ) THEN
    UPDATE public.vendor_registration_payment_states
    SET payment_requirement = 'paid', state = 'paid', amount = expected_fee,
        currency = 'GHS', updated_at = now()
    WHERE vendor_id = p_vendor_id AND owner_id = uid;
    RETURN jsonb_build_object(
      'status', 'success', 'amount', expected_fee, 'currency', 'GHS', 'vendor_id', p_vendor_id
    );
  END IF;

  IF p_idempotency_key IS NOT NULL THEN
    SELECT * INTO payment_row
    FROM public.payments
    WHERE user_id = uid AND idempotency_key = p_idempotency_key
    FOR UPDATE;
    IF FOUND THEN
      RETURN jsonb_build_object(
        'id', payment_row.id,
        'payment_id', payment_row.id,
        'payment_reference', payment_row.payment_reference,
        'amount', payment_row.amount,
        'currency', payment_row.currency,
        'payment_type', payment_row.payment_type,
        'status', payment_row.status,
        'vendor_id', p_vendor_id
      );
    END IF;
  END IF;

  INSERT INTO public.payments(
    payment_reference, provider, user_id, vendor_id, payment_type, entity_id,
    amount, currency, status, idempotency_key, webhook_data
  )
  VALUES (
    public.financial_reference('VREG'), 'paystack', uid, p_vendor_id,
    'vendor_registration', p_vendor_id, fee, 'GHS', 'initiated',
    COALESCE(p_idempotency_key, encode(gen_random_bytes(16), 'hex')),
    jsonb_build_object('vendor_id', p_vendor_id, 'fee_snapshot', fee, 'currency', 'GHS')
  )
  RETURNING * INTO payment_row;

  UPDATE public.vendor_registration_payment_states
  SET payment_requirement = 'required', state = 'payment_pending',
      payment_id = payment_row.id, amount = fee, currency = 'GHS', updated_at = now()
  WHERE vendor_id = p_vendor_id AND owner_id = uid;

  INSERT INTO public.transaction_audit_log(payment_id, new_status, changed_by, reason, metadata)
  VALUES (
    payment_row.id, 'initiated', uid, 'vendor_registration_payment_intent_created',
    jsonb_build_object('vendor_id', p_vendor_id, 'amount', fee, 'currency', 'GHS')
  );

  RETURN jsonb_build_object(
    'id', payment_row.id,
    'payment_id', payment_row.id,
    'payment_reference', payment_row.payment_reference,
    'amount', payment_row.amount,
    'currency', payment_row.currency,
    'payment_type', payment_row.payment_type,
    'status', payment_row.status,
    'vendor_id', p_vendor_id
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.apply_vendor_registration_payment_result()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  expected_amount numeric(12,2);
BEGIN
  IF NEW.payment_type <> 'vendor_registration'
     OR NEW.status IS NOT DISTINCT FROM OLD.status THEN
    RETURN NEW;
  END IF;

  IF NEW.status = 'success' THEN
    SELECT COALESCE(state.amount, settings.vendor_registration_fee)
    INTO expected_amount
    FROM public.vendor_registration_payment_states state
    JOIN public.student_financial_settings settings ON settings.singleton
    WHERE state.vendor_id = NEW.vendor_id
      AND state.owner_id = NEW.user_id
    FOR UPDATE;

    IF expected_amount IS NOT NULL
       AND NEW.amount = expected_amount
       AND NEW.currency = 'GHS' THEN
      UPDATE public.vendor_registration_payment_states
      SET payment_requirement = 'paid', state = 'paid', payment_id = NEW.id,
          amount = NEW.amount, currency = NEW.currency, updated_at = now()
      WHERE vendor_id = NEW.vendor_id AND owner_id = NEW.user_id;
    ELSE
      -- Keep the payment event for reconciliation, but do not unlock access
      -- for a payment whose amount or currency does not match the snapshot.
      UPDATE public.vendor_registration_payment_states
      SET payment_requirement = 'required', state = 'awaiting_payment',
          updated_at = now()
      WHERE vendor_id = NEW.vendor_id AND owner_id = NEW.user_id;
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

REVOKE ALL ON FUNCTION public.begin_vendor_registration_payment(uuid, text)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.begin_vendor_registration_payment(uuid, text)
  TO authenticated;
REVOKE ALL ON FUNCTION public.apply_vendor_registration_payment_result()
  FROM PUBLIC, anon, authenticated, service_role;

COMMIT;
