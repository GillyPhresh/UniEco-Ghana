-- Phase A2: financial authority, checkout, payment and refund hardening.
-- This migration reconciles the repository's historical payment schema with
-- the columns used by the application, then makes database workflows the only
-- authority for financial state.

BEGIN;

-- Reconcile columns referenced by existing application code. All changes are
-- additive except order_id becoming nullable so subscription payments can be
-- represented in the existing payments table.
ALTER TABLE public.payments ALTER COLUMN order_id DROP NOT NULL;
ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS payment_reference text;
ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES public.profiles(id);
ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS vendor_id uuid REFERENCES public.vendors(id);
ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS payment_type text NOT NULL DEFAULT 'marketplace';
ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS entity_id uuid;
ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS mobile_number text;
ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS mobile_network text;
ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS failure_reason text;
ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS webhook_received boolean NOT NULL DEFAULT false;
ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS webhook_data jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS idempotency_key text;
ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

ALTER TABLE public.receipts ALTER COLUMN order_id DROP NOT NULL;
ALTER TABLE public.receipts ADD COLUMN IF NOT EXISTS payment_id uuid REFERENCES public.payments(id);
ALTER TABLE public.receipts ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES public.profiles(id);
ALTER TABLE public.receipts ADD COLUMN IF NOT EXISTS vendor_id uuid REFERENCES public.vendors(id);
ALTER TABLE public.receipts ADD COLUMN IF NOT EXISTS receipt_type text NOT NULL DEFAULT 'marketplace';
ALTER TABLE public.receipts ADD COLUMN IF NOT EXISTS amount numeric(12,2);
ALTER TABLE public.receipts ADD COLUMN IF NOT EXISTS currency text NOT NULL DEFAULT 'GHS';
ALTER TABLE public.receipts ADD COLUMN IF NOT EXISTS payment_method text;
ALTER TABLE public.receipts ADD COLUMN IF NOT EXISTS billing_name text;
ALTER TABLE public.receipts ADD COLUMN IF NOT EXISTS billing_email text;

ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES public.profiles(id);
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS payment_id uuid REFERENCES public.payments(id);
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS entity_id uuid;
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS tax_amount numeric(12,2) NOT NULL DEFAULT 0;
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS total_amount numeric(12,2);
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS due_date timestamptz;
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS notes text;
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS billing_name text;
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS billing_email text;
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS billing_phone text;
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE public.subscriptions ADD COLUMN IF NOT EXISTS next_billing_date timestamptz;
ALTER TABLE public.subscriptions ADD COLUMN IF NOT EXISTS last_payment_id uuid REFERENCES public.payments(id);
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS checkout_idempotency_key text;

CREATE TABLE IF NOT EXISTS public.transaction_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id uuid NOT NULL REFERENCES public.payments(id) ON DELETE CASCADE,
  previous_status text,
  new_status text NOT NULL,
  changed_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  reason text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.payment_status_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id uuid NOT NULL REFERENCES public.payments(id) ON DELETE CASCADE,
  status text NOT NULL,
  event_type text NOT NULL,
  description text,
  actor_type text NOT NULL DEFAULT 'system',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.refunds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  refund_number text UNIQUE,
  payment_id uuid NOT NULL REFERENCES public.payments(id) ON DELETE RESTRICT,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  vendor_id uuid REFERENCES public.vendors(id) ON DELETE SET NULL,
  amount numeric(12,2) NOT NULL CHECK (amount > 0),
  currency text NOT NULL DEFAULT 'GHS',
  reason text,
  status text NOT NULL DEFAULT 'requested'
    CHECK (status IN ('requested', 'approved', 'rejected', 'processing', 'processed', 'failed')),
  requested_by uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  reviewed_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  processed_at timestamptz,
  provider_reference text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.payment_webhook_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL,
  provider_event_id text NOT NULL,
  payment_reference text NOT NULL,
  payload_hash text NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz,
  UNIQUE (provider, provider_event_id),
  UNIQUE (provider, payload_hash)
);

-- Inventory is reserved when an order is created, then consumed only after a
-- verified online payment. This avoids both overselling and silently treating
-- an unpaid order as fulfilled inventory.
CREATE TABLE IF NOT EXISTS public.stock_reservations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
  quantity integer NOT NULL CHECK (quantity > 0),
  status text NOT NULL DEFAULT 'reserved'
    CHECK (status IN ('reserved', 'consumed', 'released')),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '30 minutes'),
  created_at timestamptz NOT NULL DEFAULT now(),
  consumed_at timestamptz,
  UNIQUE (order_id, product_id)
);

-- Small, database-local guardrail for high-value state-changing requests.
CREATE TABLE IF NOT EXISTS public.financial_request_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  action text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS payments_payment_reference_unique
  ON public.payments (payment_reference) WHERE payment_reference IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS payments_user_idempotency_key_unique
  ON public.payments (user_id, idempotency_key) WHERE idempotency_key IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS receipts_payment_id_unique
  ON public.receipts (payment_id) WHERE payment_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS invoices_payment_id_unique
  ON public.invoices (payment_id) WHERE payment_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS refunds_payment_idx ON public.refunds(payment_id);
CREATE UNIQUE INDEX IF NOT EXISTS orders_buyer_checkout_idempotency_key_unique
  ON public.orders (buyer_id, checkout_idempotency_key) WHERE checkout_idempotency_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS stock_reservations_product_active_idx
  ON public.stock_reservations(product_id, expires_at) WHERE status = 'reserved';
CREATE INDEX IF NOT EXISTS financial_request_attempts_user_action_idx
  ON public.financial_request_attempts(user_id, action, created_at DESC);

ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transaction_audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_status_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.refunds ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_webhook_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock_reservations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.financial_request_attempts ENABLE ROW LEVEL SECURITY;

-- Browser clients may read records to which existing RLS grants access, but
-- cannot manufacture or mutate any financial record directly.
DROP POLICY IF EXISTS user_insert_own_payments ON public.payments;
DROP POLICY IF EXISTS user_update_own_payments ON public.payments;
DROP POLICY IF EXISTS staff_update_payments ON public.payments;
REVOKE INSERT, UPDATE, DELETE ON public.payments FROM authenticated;

DROP POLICY IF EXISTS user_insert_own_invoices ON public.invoices;
DROP POLICY IF EXISTS staff_insert_invoices ON public.invoices;
DROP POLICY IF EXISTS staff_update_invoices ON public.invoices;
DROP POLICY IF EXISTS owners_insert_invoices ON public.invoices;
DROP POLICY IF EXISTS owners_update_invoices ON public.invoices;
DROP POLICY IF EXISTS owners_delete_invoices ON public.invoices;
REVOKE INSERT, UPDATE, DELETE ON public.invoices FROM authenticated;

DROP POLICY IF EXISTS user_insert_own_invoice_items ON public.invoice_items;
DROP POLICY IF EXISTS staff_insert_invoice_items ON public.invoice_items;
REVOKE INSERT, UPDATE, DELETE ON public.invoice_items FROM authenticated;

DROP POLICY IF EXISTS buyer_insert_receipts ON public.receipts;
DROP POLICY IF EXISTS vendor_insert_receipts ON public.receipts;
DROP POLICY IF EXISTS user_insert_own_receipts ON public.receipts;
DROP POLICY IF EXISTS staff_insert_receipts ON public.receipts;
REVOKE INSERT, UPDATE, DELETE ON public.receipts FROM authenticated;

DROP POLICY IF EXISTS user_insert_own_refunds ON public.refunds;
DROP POLICY IF EXISTS staff_update_refunds ON public.refunds;
REVOKE INSERT, UPDATE, DELETE ON public.refunds FROM authenticated;

DROP POLICY IF EXISTS staff_insert_tx_audit ON public.transaction_audit_log;
DROP POLICY IF EXISTS staff_insert_payment_history ON public.payment_status_history;
REVOKE INSERT, UPDATE, DELETE ON public.transaction_audit_log FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.payment_status_history FROM authenticated;

DROP POLICY IF EXISTS buyers_insert_own_orders ON public.orders;
DROP POLICY IF EXISTS buyer_insert_orders ON public.orders;
DROP POLICY IF EXISTS buyer_insert_order_items ON public.order_items;
REVOKE INSERT ON public.orders FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.order_items FROM authenticated;
-- Existing operations pages may still change order workflow fields, but never
-- pricing, vendor, buyer, currency, or payment-related fields.
REVOKE UPDATE ON public.orders FROM authenticated;
GRANT UPDATE (status, cancelled_at, cancellation_reason, accepted_at, completed_at, vendor_notes)
  ON public.orders TO authenticated;

DROP POLICY IF EXISTS owners_insert_subscriptions ON public.subscriptions;
DROP POLICY IF EXISTS owners_update_subscriptions ON public.subscriptions;
DROP POLICY IF EXISTS user_insert_own_subscriptions ON public.subscriptions;
DROP POLICY IF EXISTS user_update_own_subscriptions ON public.subscriptions;
REVOKE INSERT, UPDATE, DELETE ON public.subscriptions FROM authenticated;
REVOKE ALL ON public.stock_reservations FROM authenticated;
REVOKE ALL ON public.financial_request_attempts FROM authenticated;

DROP POLICY IF EXISTS insert_own_redemptions ON public.coupon_redemptions;
DROP POLICY IF EXISTS user_insert_coupon_redemptions ON public.coupon_redemptions;
REVOKE INSERT, UPDATE, DELETE ON public.coupon_redemptions FROM authenticated;

-- Provider configuration is never a client-side secret store. Enabled rows
-- are readable to populate checkout choices; only super administrators can
-- change provider availability/configuration.
ALTER TABLE public.payment_providers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS staff_select_payment_providers ON public.payment_providers;
DROP POLICY IF EXISTS staff_manage_payment_providers ON public.payment_providers;
DROP POLICY IF EXISTS enabled_payment_providers_read ON public.payment_providers;
DROP POLICY IF EXISTS super_admin_manage_payment_providers ON public.payment_providers;
CREATE POLICY enabled_payment_providers_read ON public.payment_providers FOR SELECT
  TO authenticated USING (is_enabled OR public.is_super_admin());
CREATE POLICY super_admin_manage_payment_providers ON public.payment_providers FOR ALL
  TO authenticated USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());

DROP POLICY IF EXISTS staff_insert_coupons ON public.coupons;
DROP POLICY IF EXISTS staff_update_coupons ON public.coupons;
DROP POLICY IF EXISTS staff_delete_coupons ON public.coupons;
CREATE POLICY super_admin_insert_coupons ON public.coupons FOR INSERT
  TO authenticated WITH CHECK (public.is_super_admin());
CREATE POLICY super_admin_update_coupons ON public.coupons FOR UPDATE
  TO authenticated USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());
CREATE POLICY super_admin_delete_coupons ON public.coupons FOR DELETE
  TO authenticated USING (public.is_super_admin());

DROP POLICY IF EXISTS staff_select_all_payments ON public.payments;
CREATE POLICY staff_select_all_payments ON public.payments FOR SELECT TO authenticated
  USING (public.current_app_role() IN ('moderator', 'super_admin'));
DROP POLICY IF EXISTS staff_select_all_payment_history ON public.payment_status_history;
CREATE POLICY staff_select_all_payment_history ON public.payment_status_history FOR SELECT TO authenticated
  USING (public.current_app_role() IN ('moderator', 'super_admin'));
DROP POLICY IF EXISTS staff_select_tx_audit ON public.transaction_audit_log;
CREATE POLICY staff_select_tx_audit ON public.transaction_audit_log FOR SELECT TO authenticated
  USING (public.current_app_role() IN ('moderator', 'super_admin'));
DROP POLICY IF EXISTS staff_select_redemptions ON public.coupon_redemptions;
CREATE POLICY staff_select_redemptions ON public.coupon_redemptions FOR SELECT TO authenticated
  USING (public.current_app_role() IN ('moderator', 'super_admin'));

DROP POLICY IF EXISTS financial_party_select_receipts ON public.receipts;
CREATE POLICY financial_party_select_receipts ON public.receipts FOR SELECT TO authenticated
USING (
  user_id = auth.uid()
  OR EXISTS (SELECT 1 FROM public.vendors vendor WHERE vendor.id = receipts.vendor_id AND vendor.owner_id = auth.uid())
  OR public.current_app_role() IN ('moderator', 'super_admin')
);

-- Deterministic, collision-resistant references replace MAX()+1 generators in
-- financial creation paths.
CREATE OR REPLACE FUNCTION public.financial_reference(p_prefix text)
RETURNS text
LANGUAGE sql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT upper(p_prefix) || '-' || to_char(now(), 'YYYYMMDD') || '-' ||
    upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 12))
$$;

CREATE OR REPLACE FUNCTION public.enforce_financial_rate_limit(p_action text, p_max_attempts integer DEFAULT 8)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE attempt_count integer;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501'; END IF;
  SELECT count(*) INTO attempt_count FROM public.financial_request_attempts
  WHERE user_id = auth.uid() AND action = p_action AND created_at > now() - interval '5 minutes';
  IF attempt_count >= p_max_attempts THEN
    RAISE EXCEPTION 'Too many financial requests. Please wait before trying again.' USING ERRCODE = '22023';
  END IF;
  INSERT INTO public.financial_request_attempts (user_id, action) VALUES (auth.uid(), p_action);
END
$$;

CREATE OR REPLACE FUNCTION public.create_subscription_payment_intent(
  p_vendor_id uuid,
  p_provider text,
  p_mobile_number text DEFAULT NULL,
  p_mobile_network text DEFAULT NULL,
  p_auto_renew boolean DEFAULT false,
  p_idempotency_key text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  vendor_row record;
  payment_row public.payments%ROWTYPE;
  amount_due numeric(12,2);
  plan_name text;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501'; END IF;
  IF p_provider IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.payment_providers WHERE name = p_provider AND is_enabled
  ) THEN RAISE EXCEPTION 'Selected payment provider is not enabled' USING ERRCODE = '22023'; END IF;

  SELECT vendor.id, vendor.is_student_business, vendor.owner_id
  INTO vendor_row FROM public.vendors vendor WHERE vendor.id = p_vendor_id FOR UPDATE;
  IF NOT FOUND OR vendor_row.owner_id <> auth.uid() THEN RAISE EXCEPTION 'Vendor not owned by caller' USING ERRCODE = '42501'; END IF;

  IF vendor_row.is_student_business
    AND public.current_app_role() = 'student_vendor'
    AND EXISTS (SELECT 1 FROM public.student_profiles sp WHERE sp.user_id = auth.uid() AND sp.is_verified_student)
  THEN amount_due := 20; plan_name := 'student_vendor';
  ELSE amount_due := 50; plan_name := 'external_vendor';
  END IF;

  IF p_idempotency_key IS NOT NULL THEN
    SELECT * INTO payment_row FROM public.payments
    WHERE user_id = auth.uid() AND idempotency_key = p_idempotency_key
    FOR UPDATE;
    IF FOUND THEN RETURN to_jsonb(payment_row); END IF;
  END IF;
  PERFORM public.enforce_financial_rate_limit('subscription_payment_intent');

  INSERT INTO public.payments (
    payment_reference, provider, user_id, vendor_id, payment_type, entity_id,
    amount, currency, mobile_number, mobile_network, status, idempotency_key, webhook_data
  ) VALUES (
    public.financial_reference('PAY'), p_provider, auth.uid(), p_vendor_id, 'subscription', p_vendor_id,
    amount_due, 'GHS', p_mobile_number, p_mobile_network,
    CASE WHEN p_provider = 'manual' THEN 'pending' ELSE 'initiated' END,
    p_idempotency_key, jsonb_build_object('subscription_plan', plan_name, 'auto_renew', p_auto_renew)
  ) RETURNING * INTO payment_row;

  INSERT INTO public.transaction_audit_log (payment_id, new_status, changed_by, reason, metadata)
  VALUES (payment_row.id, payment_row.status, auth.uid(), 'subscription_payment_intent_created',
    jsonb_build_object('plan', plan_name, 'amount', amount_due));
  INSERT INTO public.payment_status_history (payment_id, status, event_type, description, actor_type)
  VALUES (payment_row.id, payment_row.status, 'intent_created', 'Subscription payment intent created', 'user');
  RETURN to_jsonb(payment_row);
END
$$;

CREATE OR REPLACE FUNCTION public.create_marketplace_checkout(
  p_items jsonb,
  p_delivery_method text DEFAULT 'pickup',
  p_delivery_address jsonb DEFAULT NULL,
  p_delivery_instructions text DEFAULT NULL,
  p_coupon_code text DEFAULT NULL,
  p_notes text DEFAULT NULL,
  p_idempotency_key text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  item jsonb;
  product_row record;
  service_row record;
  vendor_uuid uuid;
  university_uuid uuid;
  subtotal numeric(12,2) := 0;
  discount_amount numeric(12,2) := 0;
  delivery_amount numeric(12,2) := 0;
  total numeric(12,2);
  item_count int := 0;
  qty int;
  coupon_row public.coupons%ROWTYPE;
  order_row public.orders%ROWTYPE;
  order_kind text := 'product';
  has_product boolean := false;
  has_service boolean := false;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501'; END IF;
  IF p_idempotency_key IS NOT NULL THEN
    SELECT * INTO order_row FROM public.orders
    WHERE buyer_id = auth.uid() AND checkout_idempotency_key = p_idempotency_key FOR UPDATE;
    IF FOUND THEN RETURN jsonb_build_object('order', to_jsonb(order_row), 'idempotent', true); END IF;
  END IF;
  PERFORM public.enforce_financial_rate_limit('marketplace_checkout', 5);
  IF jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'Checkout requires at least one item' USING ERRCODE = '22023';
  END IF;
  IF p_delivery_method NOT IN ('pickup', 'delivery') THEN RAISE EXCEPTION 'Invalid delivery method' USING ERRCODE = '22023'; END IF;

  FOR item IN SELECT value FROM jsonb_array_elements(p_items)
  LOOP
    qty := COALESCE((item->>'quantity')::int, 0);
    IF qty < 1 OR qty > 100 THEN RAISE EXCEPTION 'Invalid item quantity' USING ERRCODE = '22023'; END IF;
    IF (item ? 'product_id' AND NULLIF(item->>'product_id', '') IS NOT NULL)
      = (item ? 'service_id' AND NULLIF(item->>'service_id', '') IS NOT NULL)
    THEN RAISE EXCEPTION 'Each checkout item must identify exactly one product or service' USING ERRCODE = '22023'; END IF;
    item_count := item_count + 1;
    IF item ? 'product_id' AND NULLIF(item->>'product_id', '') IS NOT NULL THEN
      SELECT p.id, p.business_id, p.university_id, p.name, p.image_url, p.price, p.discount_price, p.stock, p.is_active,
        p.is_archived, b.vendor_id
      INTO product_row
      FROM public.products p JOIN public.businesses b ON b.id = p.business_id
      WHERE p.id = (item->>'product_id')::uuid FOR UPDATE OF p;
      IF NOT FOUND OR NOT product_row.is_active OR product_row.is_archived
        OR product_row.stock - COALESCE((
          SELECT sum(reservation.quantity) FROM public.stock_reservations reservation
          WHERE reservation.product_id = product_row.id AND reservation.status = 'reserved' AND reservation.expires_at > now()
        ), 0) < qty
      THEN
        RAISE EXCEPTION 'A product is unavailable or has insufficient stock' USING ERRCODE = '22023';
      END IF;
      IF vendor_uuid IS NULL THEN vendor_uuid := product_row.vendor_id; university_uuid := product_row.university_id;
      ELSIF vendor_uuid <> product_row.vendor_id THEN RAISE EXCEPTION 'Items from different vendors require separate orders' USING ERRCODE = '22023'; END IF;
      subtotal := subtotal + (COALESCE(product_row.discount_price, product_row.price) * qty);
      has_product := true;
    ELSIF item ? 'service_id' AND NULLIF(item->>'service_id', '') IS NOT NULL THEN
      SELECT s.id, s.business_id, s.university_id, s.name, s.image_url, s.price, s.is_active, s.is_archived, b.vendor_id
      INTO service_row
      FROM public.services s JOIN public.businesses b ON b.id = s.business_id
      WHERE s.id = (item->>'service_id')::uuid FOR UPDATE OF s;
      IF NOT FOUND OR NOT service_row.is_active OR service_row.is_archived THEN
        RAISE EXCEPTION 'A service is unavailable' USING ERRCODE = '22023';
      END IF;
      IF vendor_uuid IS NULL THEN vendor_uuid := service_row.vendor_id; university_uuid := service_row.university_id;
      ELSIF vendor_uuid <> service_row.vendor_id THEN RAISE EXCEPTION 'Items from different vendors require separate orders' USING ERRCODE = '22023'; END IF;
      subtotal := subtotal + (service_row.price * qty);
      has_service := true;
    ELSE
      RAISE EXCEPTION 'Each checkout item must identify one product or service' USING ERRCODE = '22023';
    END IF;
  END LOOP;

  order_kind := CASE
    WHEN has_product AND has_service THEN 'mixed'
    WHEN has_service THEN 'service'
    ELSE 'product'
  END;

  IF NOT EXISTS (SELECT 1 FROM public.vendors WHERE id = vendor_uuid AND is_active) THEN
    RAISE EXCEPTION 'Vendor is unavailable' USING ERRCODE = '22023';
  END IF;
  IF p_delivery_method = 'delivery' THEN
    IF NOT EXISTS (SELECT 1 FROM public.vendors WHERE id = vendor_uuid AND delivery_available) THEN
      RAISE EXCEPTION 'This vendor does not offer delivery' USING ERRCODE = '22023';
    END IF;
    -- The existing UI used a flat GHS 10 rate. It is now a server-side
    -- temporary rule until delivery-zone pricing is implemented.
    delivery_amount := 10;
  END IF;

  IF NULLIF(trim(COALESCE(p_coupon_code, '')), '') IS NOT NULL THEN
    SELECT * INTO coupon_row FROM public.coupons WHERE upper(code) = upper(trim(p_coupon_code)) FOR UPDATE;
    IF NOT FOUND OR NOT coupon_row.is_active OR coupon_row.starts_at > now() OR coupon_row.ends_at < now()
      OR coupon_row.min_order_amount > subtotal
      OR (coupon_row.usage_limit IS NOT NULL AND coupon_row.usage_count >= coupon_row.usage_limit)
      OR (coupon_row.vendor_id IS NOT NULL AND coupon_row.vendor_id <> vendor_uuid)
      OR (coupon_row.university_id IS NOT NULL AND coupon_row.university_id <> university_uuid)
      OR (coupon_row.student_only AND NOT EXISTS (
        SELECT 1 FROM public.student_profiles sp WHERE sp.user_id = auth.uid() AND sp.is_verified_student
      ))
      OR EXISTS (SELECT 1 FROM public.coupon_redemptions red WHERE red.coupon_id = coupon_row.id AND red.user_id = auth.uid())
    THEN RAISE EXCEPTION 'Coupon is not valid for this checkout' USING ERRCODE = '22023'; END IF;
    discount_amount := CASE WHEN coupon_row.discount_type = 'percentage'
      THEN subtotal * coupon_row.discount_value / 100 ELSE coupon_row.discount_value END;
    IF coupon_row.max_discount_amount IS NOT NULL THEN discount_amount := LEAST(discount_amount, coupon_row.max_discount_amount); END IF;
    discount_amount := LEAST(discount_amount, subtotal);
  END IF;

  total := GREATEST(0, subtotal - discount_amount + delivery_amount);
  INSERT INTO public.orders (
    buyer_id, vendor_id, university_id, order_number, order_type, status, total_amount, currency,
    delivery_method, delivery_address, delivery_fee, delivery_instructions, notes, coupon_code, coupon_discount, checkout_idempotency_key
  ) VALUES (
    auth.uid(), vendor_uuid, university_uuid, public.financial_reference('ORD'), order_kind, 'pending', total, 'GHS',
    p_delivery_method, CASE WHEN p_delivery_method = 'delivery' THEN p_delivery_address ELSE NULL END,
    delivery_amount, p_delivery_instructions, p_notes, NULLIF(trim(COALESCE(p_coupon_code, '')), ''), discount_amount, p_idempotency_key
  ) RETURNING * INTO order_row;

  FOR item IN SELECT value FROM jsonb_array_elements(p_items)
  LOOP
    qty := (item->>'quantity')::int;
    IF item ? 'product_id' AND NULLIF(item->>'product_id', '') IS NOT NULL THEN
      SELECT p.name, p.image_url, COALESCE(p.discount_price, p.price) AS price INTO product_row FROM public.products p WHERE p.id = (item->>'product_id')::uuid;
      INSERT INTO public.order_items (order_id, product_id, quantity, unit_price, unit_name, unit_image_url, item_name)
      VALUES (order_row.id, (item->>'product_id')::uuid, qty, product_row.price, product_row.name, product_row.image_url, product_row.name);
      INSERT INTO public.stock_reservations (order_id, product_id, quantity)
      VALUES (order_row.id, (item->>'product_id')::uuid, qty);
    ELSE
      SELECT s.name, s.image_url, s.price INTO service_row FROM public.services s WHERE s.id = (item->>'service_id')::uuid;
      INSERT INTO public.order_items (order_id, service_id, quantity, unit_price, unit_name, unit_image_url, item_name, booking_date, booking_time, booking_notes, booking_status)
      VALUES (order_row.id, (item->>'service_id')::uuid, qty, service_row.price, service_row.name, service_row.image_url, service_row.name,
        NULLIF(item->>'booking_date', '')::date, NULLIF(item->>'booking_time', '')::time, NULLIF(item->>'booking_notes', ''), 'pending');
    END IF;
  END LOOP;
  INSERT INTO public.order_status_history (order_id, previous_status, new_status, changed_by, note)
  VALUES (order_row.id, NULL, 'pending', auth.uid(), 'Authoritative checkout created');
  IF coupon_row.id IS NOT NULL THEN
    UPDATE public.coupons SET usage_count = usage_count + 1 WHERE id = coupon_row.id;
    INSERT INTO public.coupon_redemptions (coupon_id, user_id, order_id) VALUES (coupon_row.id, auth.uid(), order_row.id);
  END IF;
  RETURN jsonb_build_object('order', to_jsonb(order_row), 'subtotal', subtotal, 'discount', discount_amount, 'delivery_fee', delivery_amount, 'total', total);
END
$$;

CREATE OR REPLACE FUNCTION public.create_marketplace_payment_intent(
  p_order_id uuid,
  p_provider text,
  p_mobile_number text DEFAULT NULL,
  p_mobile_network text DEFAULT NULL,
  p_idempotency_key text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE order_row public.orders%ROWTYPE; payment_row public.payments%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501'; END IF;
  SELECT * INTO order_row FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND OR order_row.buyer_id <> auth.uid() THEN RAISE EXCEPTION 'Order not owned by caller' USING ERRCODE = '42501'; END IF;
  IF p_provider IS NULL OR NOT EXISTS (SELECT 1 FROM public.payment_providers WHERE name = p_provider AND is_enabled) THEN
    RAISE EXCEPTION 'Selected payment provider is not enabled' USING ERRCODE = '22023';
  END IF;
  IF p_idempotency_key IS NOT NULL THEN
    SELECT * INTO payment_row FROM public.payments WHERE user_id = auth.uid() AND idempotency_key = p_idempotency_key FOR UPDATE;
    IF FOUND THEN RETURN to_jsonb(payment_row); END IF;
  END IF;
  PERFORM public.enforce_financial_rate_limit('marketplace_payment_intent');
  INSERT INTO public.payments (
    order_id, payment_reference, provider, user_id, vendor_id, payment_type, entity_id, amount, currency,
    mobile_number, mobile_network, status, idempotency_key
  ) VALUES (
    order_row.id, public.financial_reference('PAY'), p_provider, auth.uid(), order_row.vendor_id, 'marketplace',
    order_row.id, order_row.total_amount, order_row.currency, p_mobile_number, p_mobile_network,
    CASE WHEN p_provider = 'manual' THEN 'cash_on_delivery' ELSE 'initiated' END, p_idempotency_key
  ) RETURNING * INTO payment_row;
  INSERT INTO public.transaction_audit_log (payment_id, new_status, changed_by, reason)
  VALUES (payment_row.id, payment_row.status, auth.uid(), 'marketplace_payment_intent_created');
  INSERT INTO public.payment_status_history (payment_id, status, event_type, description, actor_type)
  VALUES (payment_row.id, payment_row.status, 'intent_created',
    CASE WHEN p_provider = 'manual' THEN 'Cash on delivery awaiting collection' ELSE 'Marketplace payment intent created' END, 'user');
  RETURN to_jsonb(payment_row);
END
$$;

CREATE OR REPLACE FUNCTION public.set_subscription_auto_renew(p_subscription_id uuid, p_auto_renew boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.subscriptions subscription JOIN public.vendors vendor ON vendor.id = subscription.vendor_id
    WHERE subscription.id = p_subscription_id AND vendor.owner_id = auth.uid()
  ) THEN RAISE EXCEPTION 'Subscription not owned by caller' USING ERRCODE = '42501'; END IF;
  UPDATE public.subscriptions SET auto_renew = p_auto_renew, cancelled_at = CASE WHEN p_auto_renew THEN NULL ELSE now() END
  WHERE id = p_subscription_id;
END $$;

CREATE OR REPLACE FUNCTION public.request_payment_refund(p_payment_id uuid, p_amount numeric, p_reason text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE payment_row public.payments%ROWTYPE; refunded_total numeric(12,2); refund_row public.refunds%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL OR p_amount IS NULL OR p_amount <= 0 THEN RAISE EXCEPTION 'Invalid refund request' USING ERRCODE = '22023'; END IF;
  SELECT * INTO payment_row FROM public.payments WHERE id = p_payment_id FOR UPDATE;
  IF NOT FOUND OR payment_row.user_id <> auth.uid() OR payment_row.status NOT IN ('success', 'partially_refunded') THEN
    RAISE EXCEPTION 'Payment is not eligible for a refund request' USING ERRCODE = '42501';
  END IF;
  SELECT COALESCE(sum(amount), 0) INTO refunded_total FROM (
    SELECT amount FROM public.refunds
    WHERE payment_id = p_payment_id AND status IN ('approved', 'processing', 'processed')
    FOR UPDATE
  ) locked_refunds;
  IF refunded_total + p_amount > payment_row.amount THEN RAISE EXCEPTION 'Refund exceeds paid amount' USING ERRCODE = '22023'; END IF;
  INSERT INTO public.refunds (refund_number, payment_id, user_id, vendor_id, amount, currency, reason, status, requested_by)
  VALUES (public.financial_reference('RFD'), p_payment_id, auth.uid(), payment_row.vendor_id, p_amount, payment_row.currency, p_reason, 'requested', auth.uid())
  RETURNING * INTO refund_row;
  INSERT INTO public.transaction_audit_log (payment_id, previous_status, new_status, changed_by, reason, metadata)
  VALUES (p_payment_id, payment_row.status, payment_row.status, auth.uid(), 'refund_requested', jsonb_build_object('refund_id', refund_row.id, 'amount', p_amount));
  RETURN to_jsonb(refund_row);
END $$;

CREATE OR REPLACE FUNCTION public.review_payment_refund(p_refund_id uuid, p_approved boolean, p_notes text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE refund_row public.refunds%ROWTYPE;
BEGIN
  IF NOT public.is_super_admin() THEN RAISE EXCEPTION 'Only platform financial administrators can review refunds' USING ERRCODE = '42501'; END IF;
  SELECT * INTO refund_row FROM public.refunds WHERE id = p_refund_id FOR UPDATE;
  IF NOT FOUND OR refund_row.status <> 'requested' THEN RAISE EXCEPTION 'Refund is not awaiting review' USING ERRCODE = '22023'; END IF;
  UPDATE public.refunds SET status = CASE WHEN p_approved THEN 'approved' ELSE 'rejected' END, reviewed_by = auth.uid(), reviewed_at = now(), notes = p_notes WHERE id = p_refund_id;
  INSERT INTO public.transaction_audit_log (payment_id, new_status, changed_by, reason, metadata)
  VALUES (refund_row.payment_id, (SELECT status FROM public.payments WHERE id = refund_row.payment_id), auth.uid(),
    CASE WHEN p_approved THEN 'refund_approved' ELSE 'refund_rejected' END, jsonb_build_object('refund_id', p_refund_id));
END $$;

-- Called exclusively by the payment webhook Edge Function using the service
-- role. It verifies all stored expectations and applies each payment once.
CREATE OR REPLACE FUNCTION public.apply_verified_payment_webhook(
  p_provider text, p_provider_event_id text, p_payload_hash text, p_payment_reference text,
  p_provider_reference text, p_status text, p_amount numeric, p_currency text, p_payload jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE payment_row public.payments%ROWTYPE; existing_event uuid; next_status text; plan_name text; subscription_row public.subscriptions%ROWTYPE; reservation_row public.stock_reservations%ROWTYPE; starts_at_value timestamptz; ends_at_value timestamptz;
BEGIN
  IF p_status NOT IN ('success', 'failed', 'cancelled') OR p_amount IS NULL OR p_currency <> 'GHS' THEN
    RAISE EXCEPTION 'Invalid provider payment result' USING ERRCODE = '22023';
  END IF;
  INSERT INTO public.payment_webhook_events (provider, provider_event_id, payment_reference, payload_hash)
  VALUES (p_provider, p_provider_event_id, p_payment_reference, p_payload_hash)
  ON CONFLICT (provider, provider_event_id) DO NOTHING RETURNING id INTO existing_event;
  IF existing_event IS NULL THEN RETURN jsonb_build_object('idempotent', true); END IF;
  SELECT * INTO payment_row FROM public.payments WHERE payment_reference = p_payment_reference FOR UPDATE;
  IF NOT FOUND OR payment_row.provider <> p_provider OR payment_row.amount <> p_amount OR payment_row.currency <> p_currency THEN
    RAISE EXCEPTION 'Provider result does not match expected payment' USING ERRCODE = '22023';
  END IF;
  IF payment_row.status IN ('success', 'refunded', 'partially_refunded', 'cash_on_delivery') THEN
    UPDATE public.payment_webhook_events SET processed_at = now() WHERE id = existing_event;
    RETURN jsonb_build_object('idempotent', true, 'payment_id', payment_row.id);
  END IF;
  next_status := p_status;
  UPDATE public.payments SET status = next_status, provider_reference = p_provider_reference, webhook_received = true,
    webhook_data = p_payload, paid_at = CASE WHEN next_status = 'success' THEN now() ELSE paid_at END,
    failure_reason = CASE WHEN next_status = 'failed' THEN 'Provider reported payment failure' ELSE NULL END
  WHERE id = payment_row.id;
  INSERT INTO public.transaction_audit_log (payment_id, previous_status, new_status, reason, metadata)
  VALUES (payment_row.id, payment_row.status, next_status, 'verified_provider_webhook', jsonb_build_object('provider', p_provider, 'event_id', p_provider_event_id));
  INSERT INTO public.payment_status_history (payment_id, status, event_type, description, actor_type, metadata)
  VALUES (payment_row.id, next_status, 'verified_webhook', 'Verified payment provider webhook', 'provider', jsonb_build_object('provider', p_provider));
  IF next_status = 'success' THEN
    INSERT INTO public.receipts (order_id, payment_id, user_id, vendor_id, receipt_number, receipt_type, amount, currency, payment_method, data)
    VALUES (payment_row.order_id, payment_row.id, payment_row.user_id, payment_row.vendor_id, public.financial_reference('RCP'), payment_row.payment_type, payment_row.amount, payment_row.currency, p_provider, jsonb_build_object('provider_reference', p_provider_reference))
    ON CONFLICT (payment_id) WHERE payment_id IS NOT NULL DO NOTHING;
    IF payment_row.payment_type = 'marketplace' THEN
      FOR reservation_row IN
        SELECT * FROM public.stock_reservations
        WHERE order_id = payment_row.order_id AND status = 'reserved' AND expires_at > now()
        FOR UPDATE
      LOOP
        UPDATE public.products SET stock = stock - reservation_row.quantity
        WHERE id = reservation_row.product_id AND stock >= reservation_row.quantity;
        IF NOT FOUND THEN
          RAISE EXCEPTION 'Reserved product stock is no longer available' USING ERRCODE = '40001';
        END IF;
        UPDATE public.stock_reservations SET status = 'consumed', consumed_at = now() WHERE id = reservation_row.id;
      END LOOP;
    END IF;
    IF payment_row.payment_type = 'subscription' THEN
      plan_name := CASE WHEN payment_row.amount = 20 THEN 'student_vendor' ELSE 'external_vendor' END;
      starts_at_value := now();
      SELECT * INTO subscription_row FROM public.subscriptions WHERE vendor_id = payment_row.vendor_id ORDER BY created_at DESC LIMIT 1 FOR UPDATE;
      ends_at_value := CASE WHEN FOUND AND subscription_row.status = 'active' AND subscription_row.ends_at > now()
        THEN subscription_row.ends_at + interval '30 days' ELSE starts_at_value + interval '30 days' END;
      IF FOUND THEN
        UPDATE public.subscriptions SET status = 'active', plan = plan_name, ends_at = ends_at_value, next_billing_date = ends_at_value,
          last_payment_id = payment_row.id, amount = payment_row.amount, currency = payment_row.currency, payment_method = p_provider,
          payment_reference = payment_row.payment_reference WHERE id = subscription_row.id;
      ELSE
        INSERT INTO public.subscriptions (vendor_id, plan, status, started_at, ends_at, next_billing_date, last_payment_id, amount, currency, payment_method, payment_reference)
        VALUES (payment_row.vendor_id, plan_name, 'active', starts_at_value, ends_at_value, ends_at_value, payment_row.id, payment_row.amount, payment_row.currency, p_provider, payment_row.payment_reference);
      END IF;
      INSERT INTO public.invoices (vendor_id, invoice_number, invoice_type, reference_id, amount, currency, status, payment_reference, user_id, payment_id, entity_id, tax_amount, total_amount, paid_at, metadata)
      VALUES (payment_row.vendor_id, public.financial_reference('INV'), 'subscription', payment_row.vendor_id, payment_row.amount, payment_row.currency, 'paid', payment_row.payment_reference, payment_row.user_id, payment_row.id, payment_row.id, 0, payment_row.amount, now(), jsonb_build_object('plan', plan_name))
      ON CONFLICT (payment_id) WHERE payment_id IS NOT NULL DO NOTHING;
    END IF;
  END IF;
  UPDATE public.payment_webhook_events SET processed_at = now() WHERE id = existing_event;
  RETURN jsonb_build_object('idempotent', false, 'payment_id', payment_row.id, 'status', next_status);
END $$;

REVOKE ALL ON FUNCTION public.financial_reference(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.enforce_financial_rate_limit(text, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.generate_payment_reference() FROM authenticated;
REVOKE ALL ON FUNCTION public.generate_invoice_number() FROM authenticated;
REVOKE ALL ON FUNCTION public.generate_receipt_number() FROM authenticated;
REVOKE ALL ON FUNCTION public.create_subscription_payment_intent(uuid, text, text, text, boolean, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_marketplace_checkout(jsonb, text, jsonb, text, text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_marketplace_payment_intent(uuid, text, text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.set_subscription_auto_renew(uuid, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.request_payment_refund(uuid, numeric, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.review_payment_refund(uuid, boolean, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.apply_verified_payment_webhook(text, text, text, text, text, text, numeric, text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_subscription_payment_intent(uuid, text, text, text, boolean, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_marketplace_checkout(jsonb, text, jsonb, text, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_marketplace_payment_intent(uuid, text, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_subscription_auto_renew(uuid, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.request_payment_refund(uuid, numeric, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.review_payment_refund(uuid, boolean, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.apply_verified_payment_webhook(text, text, text, text, text, text, numeric, text, jsonb) TO service_role;

COMMIT;
