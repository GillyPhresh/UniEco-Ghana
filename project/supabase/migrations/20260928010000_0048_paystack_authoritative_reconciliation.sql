BEGIN;

-- PROD-04: preserve existing financial records while binding Paystack results
-- to the server-selected test/live environment. Secrets never live in this DB.
ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS provider_environment text
    CHECK (provider_environment IN ('test', 'live')),
  ADD COLUMN IF NOT EXISTS provider_checkout_initialized_at timestamptz;

ALTER TABLE public.payment_webhook_events
  ADD COLUMN IF NOT EXISTS provider_signature text,
  ADD COLUMN IF NOT EXISTS raw_payload jsonb,
  ADD COLUMN IF NOT EXISTS processing_status text NOT NULL DEFAULT 'received',
  ADD COLUMN IF NOT EXISTS processing_note text,
  ADD COLUMN IF NOT EXISTS provider_environment text
    CHECK (provider_environment IN ('test', 'live'));

CREATE TABLE IF NOT EXISTS public.payment_reconciliation_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id uuid REFERENCES public.payments(id) ON DELETE SET NULL,
  provider text NOT NULL,
  payment_reference text NOT NULL,
  event_id text,
  reason text NOT NULL,
  expected jsonb NOT NULL DEFAULT '{}'::jsonb,
  received jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.payment_reconciliation_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.payment_reconciliation_events FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.record_paystack_checkout_initialized(
  p_payment_reference text, p_provider_environment text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public AS $$
DECLARE payment_row public.payments%ROWTYPE;
BEGIN
  IF p_provider_environment NOT IN ('test','live') THEN
    RAISE EXCEPTION 'Invalid Paystack environment' USING ERRCODE='22023';
  END IF;
  SELECT * INTO payment_row FROM public.payments
  WHERE payment_reference = p_payment_reference AND provider = 'paystack' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Unknown Paystack payment reference' USING ERRCODE='P0002'; END IF;
  IF payment_row.status NOT IN ('initiated','pending') THEN
    RAISE EXCEPTION 'Payment cannot be initialized from its current status' USING ERRCODE='22023';
  END IF;
  UPDATE public.payments SET status='pending', provider_environment=p_provider_environment,
    provider_checkout_initialized_at=COALESCE(provider_checkout_initialized_at, now()), updated_at=now()
  WHERE id=payment_row.id;
  INSERT INTO public.payment_status_history(payment_id,status,event_type,description,actor_type,metadata)
  VALUES(payment_row.id,'pending','provider_checkout_initialized','Paystack checkout initialized','provider',jsonb_build_object('environment',p_provider_environment));
  RETURN jsonb_build_object('payment_id',payment_row.id,'status','pending');
END $$;

CREATE OR REPLACE FUNCTION public.apply_verified_paystack_webhook(
  p_provider_event_id text, p_payload_hash text, p_payment_reference text,
  p_provider_reference text, p_status text, p_amount numeric, p_currency text,
  p_provider_environment text, p_signature text, p_payload jsonb DEFAULT '{}'::jsonb
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public AS $$
DECLARE payment_row public.payments%ROWTYPE; event_row uuid; subscription_row public.subscriptions%ROWTYPE;
  reservation_row public.stock_reservations%ROWTYPE; plan_name text; starts_at_value timestamptz; ends_at_value timestamptz;
BEGIN
  IF p_status NOT IN ('success','failed','cancelled') OR p_amount IS NULL OR p_currency <> 'GHS' OR p_provider_environment NOT IN ('test','live') THEN
    RAISE EXCEPTION 'Invalid verified Paystack result' USING ERRCODE='22023';
  END IF;
  INSERT INTO public.payment_webhook_events(provider,provider_event_id,payment_reference,payload_hash,provider_signature,raw_payload,provider_environment)
  VALUES('paystack',p_provider_event_id,p_payment_reference,p_payload_hash,p_signature,p_payload,p_provider_environment)
  ON CONFLICT(provider,provider_event_id) DO NOTHING RETURNING id INTO event_row;
  IF event_row IS NULL THEN RETURN jsonb_build_object('idempotent',true); END IF;
  SELECT * INTO payment_row FROM public.payments WHERE payment_reference=p_payment_reference FOR UPDATE;
  IF NOT FOUND THEN
    UPDATE public.payment_webhook_events SET processing_status='ignored_unknown_reference',processing_note='No internal payment matches this reference',processed_at=now() WHERE id=event_row;
    RETURN jsonb_build_object('ignored',true,'reason','unknown_reference');
  END IF;
  IF payment_row.provider <> 'paystack' OR payment_row.provider_environment IS DISTINCT FROM p_provider_environment OR payment_row.amount <> p_amount OR payment_row.currency <> p_currency THEN
    UPDATE public.payments SET status='reconciliation_required',failure_reason='Verified provider result does not match internal payment expectations',webhook_received=true,updated_at=now() WHERE id=payment_row.id AND status NOT IN ('success','refunded','partially_refunded');
    INSERT INTO public.payment_reconciliation_events(payment_id,provider,payment_reference,event_id,reason,expected,received)
    VALUES(payment_row.id,'paystack',p_payment_reference,p_provider_event_id,'payment_expectation_mismatch',jsonb_build_object('amount',payment_row.amount,'currency',payment_row.currency,'environment',payment_row.provider_environment),jsonb_build_object('amount',p_amount,'currency',p_currency,'environment',p_provider_environment));
    UPDATE public.payment_webhook_events SET processing_status='reconciliation_required',processing_note='Provider result did not match internal payment',processed_at=now() WHERE id=event_row;
    RETURN jsonb_build_object('reconciliation_required',true,'payment_id',payment_row.id);
  END IF;
  IF payment_row.status IN ('success','refunded','partially_refunded','cash_on_delivery') THEN
    UPDATE public.payment_webhook_events SET processing_status='idempotent',processed_at=now() WHERE id=event_row;
    RETURN jsonb_build_object('idempotent',true,'payment_id',payment_row.id);
  END IF;
  UPDATE public.payments SET status=p_status,provider_reference=p_provider_reference,webhook_received=true,webhook_data=p_payload,paid_at=CASE WHEN p_status='success' THEN now() ELSE paid_at END,failure_reason=CASE WHEN p_status='failed' THEN 'Provider reported payment failure' WHEN p_status='cancelled' THEN 'Provider reported payment cancellation' ELSE NULL END,updated_at=now() WHERE id=payment_row.id;
  INSERT INTO public.transaction_audit_log(payment_id,previous_status,new_status,reason,metadata) VALUES(payment_row.id,payment_row.status,p_status,'verified_paystack_webhook',jsonb_build_object('event_id',p_provider_event_id,'environment',p_provider_environment));
  INSERT INTO public.payment_status_history(payment_id,status,event_type,description,actor_type,metadata) VALUES(payment_row.id,p_status,'verified_webhook','Verified Paystack webhook','provider',jsonb_build_object('environment',p_provider_environment));
  IF p_status='success' THEN
    INSERT INTO public.receipts(order_id,payment_id,user_id,vendor_id,receipt_number,receipt_type,amount,currency,payment_method,data) VALUES(payment_row.order_id,payment_row.id,payment_row.user_id,payment_row.vendor_id,public.financial_reference('RCP'),payment_row.payment_type,payment_row.amount,payment_row.currency,'paystack',jsonb_build_object('provider_reference',p_provider_reference)) ON CONFLICT(payment_id) WHERE payment_id IS NOT NULL DO NOTHING;
    IF payment_row.payment_type='marketplace' THEN
      FOR reservation_row IN SELECT * FROM public.stock_reservations WHERE order_id=payment_row.order_id AND status='reserved' AND expires_at>now() FOR UPDATE LOOP
        UPDATE public.products SET stock=stock-reservation_row.quantity WHERE id=reservation_row.product_id AND stock>=reservation_row.quantity;
        IF NOT FOUND THEN RAISE EXCEPTION 'Reserved product stock is no longer available' USING ERRCODE='40001'; END IF;
        UPDATE public.stock_reservations SET status='consumed',consumed_at=now() WHERE id=reservation_row.id;
      END LOOP;
      UPDATE public.orders SET status='confirmed' WHERE id=payment_row.order_id AND status='pending';
      INSERT INTO public.order_status_history(order_id,previous_status,new_status,changed_by,note) SELECT payment_row.order_id,'pending','confirmed',NULL,'Verified Paystack payment' WHERE EXISTS(SELECT 1 FROM public.orders WHERE id=payment_row.order_id AND status='confirmed');
    ELSIF payment_row.payment_type IN ('subscription','vendor_registration') THEN
      plan_name:=CASE WHEN payment_row.amount=20 THEN 'student_vendor' ELSE 'external_vendor' END; starts_at_value:=now();
      SELECT * INTO subscription_row FROM public.subscriptions WHERE vendor_id=payment_row.vendor_id ORDER BY created_at DESC LIMIT 1 FOR UPDATE;
      ends_at_value:=CASE WHEN FOUND AND subscription_row.status='active' AND subscription_row.ends_at>now() THEN subscription_row.ends_at+interval '30 days' ELSE starts_at_value+interval '30 days' END;
      IF FOUND THEN UPDATE public.subscriptions SET status='active',plan=plan_name,ends_at=ends_at_value,next_billing_date=ends_at_value,last_payment_id=payment_row.id,amount=payment_row.amount,currency=payment_row.currency,payment_method='paystack',payment_reference=payment_row.payment_reference WHERE id=subscription_row.id;
      ELSE INSERT INTO public.subscriptions(vendor_id,plan,status,started_at,ends_at,next_billing_date,last_payment_id,amount,currency,payment_method,payment_reference) VALUES(payment_row.vendor_id,plan_name,'active',starts_at_value,ends_at_value,ends_at_value,payment_row.id,payment_row.amount,payment_row.currency,'paystack',payment_row.payment_reference); END IF;
      INSERT INTO public.invoices(vendor_id,invoice_number,invoice_type,reference_id,amount,currency,status,payment_reference,user_id,payment_id,entity_id,tax_amount,total_amount,paid_at,metadata) VALUES(payment_row.vendor_id,public.financial_reference('INV'),'subscription',payment_row.vendor_id,payment_row.amount,payment_row.currency,'paid',payment_row.payment_reference,payment_row.user_id,payment_row.id,payment_row.id,0,payment_row.amount,now(),jsonb_build_object('plan',plan_name)) ON CONFLICT(payment_id) WHERE payment_id IS NOT NULL DO NOTHING;
    END IF;
  END IF;
  UPDATE public.payment_webhook_events SET processing_status='processed',processed_at=now() WHERE id=event_row;
  RETURN jsonb_build_object('idempotent',false,'payment_id',payment_row.id,'status',p_status);
END $$;

REVOKE ALL ON FUNCTION public.record_paystack_checkout_initialized(text,text) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.apply_verified_paystack_webhook(text,text,text,text,text,numeric,text,text,text,jsonb) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.record_paystack_checkout_initialized(text,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.apply_verified_paystack_webhook(text,text,text,text,text,numeric,text,text,text,jsonb) TO service_role;
COMMIT;
