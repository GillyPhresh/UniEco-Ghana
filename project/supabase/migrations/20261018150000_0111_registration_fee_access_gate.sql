-- Require authoritative registration payment before authenticated student/vendor access.
-- Students use the existing student_registration payment flow; vendors use the
-- vendor_registration flow added here. Provider webhooks remain authoritative.
BEGIN;

ALTER TABLE public.student_financial_settings
  ADD COLUMN IF NOT EXISTS vendor_registration_fee numeric(12,2) NOT NULL DEFAULT 20.00
    CHECK (vendor_registration_fee >= 0);

UPDATE public.student_financial_settings
SET registration_fee = 10.00,
    vendor_registration_fee = 20.00,
    updated_at = now()
WHERE singleton;

UPDATE public.vendor_registration_payment_states
SET payment_requirement = 'required',
    amount = 20.00,
    currency = 'GHS',
    state = CASE WHEN state = 'paid' THEN 'paid' ELSE 'awaiting_payment' END,
    updated_at = now()
WHERE payment_requirement = 'not_required';

CREATE OR REPLACE FUNCTION public.begin_vendor_registration_payment(
  p_vendor_id uuid,
  p_idempotency_key text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE
  uid uuid := auth.uid();
  vendor_row public.vendors%ROWTYPE;
  state_row public.vendor_registration_payment_states%ROWTYPE;
  payment_row public.payments%ROWTYPE;
  fee numeric(12,2);
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501'; END IF;
  IF public.current_app_role() NOT IN ('student_vendor','external_vendor') THEN
    RAISE EXCEPTION 'Vendor registration payment is unavailable' USING ERRCODE='42501';
  END IF;
  SELECT * INTO vendor_row FROM public.vendors
  WHERE id = p_vendor_id AND owner_id = uid FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Vendor registration access denied' USING ERRCODE='42501'; END IF;
  SELECT * INTO state_row FROM public.vendor_registration_payment_states
  WHERE vendor_id = p_vendor_id AND owner_id = uid FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Vendor registration payment state is missing' USING ERRCODE='55000'; END IF;
  IF state_row.state = 'paid' OR EXISTS (
    SELECT 1 FROM public.payments
    WHERE user_id = uid AND vendor_id = p_vendor_id
      AND payment_type = 'vendor_registration' AND status = 'success'
      AND amount = 20.00 AND currency = 'GHS'
  ) THEN
    RETURN jsonb_build_object('status','success','amount',20.00,'currency','GHS','vendor_id',p_vendor_id);
  END IF;
  IF p_idempotency_key IS NOT NULL THEN
    SELECT * INTO payment_row FROM public.payments
    WHERE user_id = uid AND idempotency_key = p_idempotency_key FOR UPDATE;
    IF FOUND THEN
      RETURN jsonb_build_object('id',payment_row.id,'payment_id',payment_row.id,'payment_reference',payment_row.payment_reference,'amount',payment_row.amount,'currency',payment_row.currency,'payment_type',payment_row.payment_type,'status',payment_row.status,'vendor_id',p_vendor_id);
    END IF;
  END IF;
  SELECT vendor_registration_fee INTO fee FROM public.student_financial_settings WHERE singleton FOR SHARE;
  INSERT INTO public.payments(payment_reference,provider,user_id,vendor_id,payment_type,entity_id,amount,currency,status,idempotency_key,webhook_data)
  VALUES(public.financial_reference('VREG'),'paystack',uid,p_vendor_id,'vendor_registration',p_vendor_id,fee,'GHS','initiated',COALESCE(p_idempotency_key,encode(gen_random_bytes(16),'hex')),jsonb_build_object('vendor_id',p_vendor_id))
  RETURNING * INTO payment_row;
  UPDATE public.vendor_registration_payment_states
  SET payment_requirement='required', state='payment_pending', payment_id=payment_row.id,
      amount=fee, currency='GHS', updated_at=now()
  WHERE vendor_id=p_vendor_id;
  INSERT INTO public.transaction_audit_log(payment_id,new_status,changed_by,reason,metadata)
  VALUES(payment_row.id,'initiated',uid,'vendor_registration_payment_intent_created',jsonb_build_object('vendor_id',p_vendor_id,'amount',fee,'currency','GHS'));
  RETURN jsonb_build_object('id',payment_row.id,'payment_id',payment_row.id,'payment_reference',payment_row.payment_reference,'amount',payment_row.amount,'currency',payment_row.currency,'payment_type',payment_row.payment_type,'status',payment_row.status,'vendor_id',p_vendor_id);
END $$;

CREATE OR REPLACE FUNCTION public.apply_vendor_registration_payment_result()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
  IF NEW.payment_type <> 'vendor_registration' OR NEW.status IS NOT DISTINCT FROM OLD.status THEN RETURN NEW; END IF;
  IF NEW.status = 'success' AND NEW.amount = 20.00 AND NEW.currency = 'GHS' THEN
    UPDATE public.vendor_registration_payment_states
    SET payment_requirement='paid', state='paid', payment_id=NEW.id, amount=NEW.amount, currency=NEW.currency, updated_at=now()
    WHERE vendor_id=NEW.vendor_id AND owner_id=NEW.user_id;
  ELSIF NEW.status IN ('failed','cancelled','refunded','partially_refunded') THEN
    UPDATE public.vendor_registration_payment_states
    SET payment_requirement='required', state='awaiting_payment', updated_at=now()
    WHERE vendor_id=NEW.vendor_id AND owner_id=NEW.user_id;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS apply_vendor_registration_payment_result ON public.payments;
CREATE TRIGGER apply_vendor_registration_payment_result
AFTER UPDATE OF status ON public.payments
FOR EACH ROW EXECUTE FUNCTION public.apply_vendor_registration_payment_result();

CREATE OR REPLACE FUNCTION public.get_my_registration_access()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE
  uid uuid := auth.uid();
  role_name text := public.current_app_role();
  required_amount numeric(12,2);
  paid boolean := false;
BEGIN
  IF uid IS NULL THEN
    RETURN jsonb_build_object('allowed',false,'role',NULL,'required_amount',NULL,'status','unauthenticated');
  END IF;
  IF role_name IN ('moderator','super_admin','university_admin') THEN
    RETURN jsonb_build_object('allowed',true,'role',role_name,'required_amount',0,'status','staff_exempt');
  END IF;
  IF role_name = 'student' THEN
    SELECT registration_fee INTO required_amount FROM public.student_financial_settings WHERE singleton;
    paid := EXISTS (SELECT 1 FROM public.payments WHERE user_id=uid AND payment_type='student_registration' AND status='success' AND amount=required_amount AND currency='GHS');
  ELSIF role_name IN ('student_vendor','external_vendor') THEN
    SELECT vendor_registration_fee INTO required_amount FROM public.student_financial_settings WHERE singleton;
    paid := EXISTS (SELECT 1 FROM public.payments WHERE user_id=uid AND payment_type='vendor_registration' AND status='success' AND amount=required_amount AND currency='GHS');
  ELSE
    RETURN jsonb_build_object('allowed',false,'role',role_name,'required_amount',NULL,'status','registration_required');
  END IF;
  RETURN jsonb_build_object('allowed',paid,'role',role_name,'required_amount',required_amount,'currency','GHS','status',CASE WHEN paid THEN 'paid' ELSE 'payment_required' END);
END $$;

REVOKE ALL ON FUNCTION public.begin_vendor_registration_payment(uuid,text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.begin_vendor_registration_payment(uuid,text) TO authenticated;
REVOKE ALL ON FUNCTION public.apply_vendor_registration_payment_result() FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.get_my_registration_access() FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.get_my_registration_access() TO authenticated;

COMMIT;
