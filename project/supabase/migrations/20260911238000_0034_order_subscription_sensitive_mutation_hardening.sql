-- Phase A3.5: trusted order workflow and subscription-extension mutations.
BEGIN;

-- Browser code may read permitted records, but cannot mutate order lifecycle,
-- booking state, history, or subscriptions directly.
REVOKE INSERT, UPDATE, DELETE ON public.orders FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.order_items FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.order_status_history FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.subscriptions FROM authenticated;
DROP POLICY IF EXISTS buyer_insert_status_history ON public.order_status_history;
DROP POLICY IF EXISTS vendor_insert_status_history ON public.order_status_history;

CREATE OR REPLACE FUNCTION public.customer_cancel_order(p_order_id uuid, p_reason text DEFAULT NULL)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE v_order public.orders%ROWTYPE; v_reason text := NULLIF(btrim(p_reason), '');
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501'; END IF;
  IF char_length(COALESCE(v_reason, '')) > 500 THEN RAISE EXCEPTION 'Cancellation reason is too long' USING ERRCODE = '22023'; END IF;
  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND OR v_order.buyer_id <> auth.uid() THEN RAISE EXCEPTION 'Order access denied' USING ERRCODE = '42501'; END IF;
  IF v_order.status NOT IN ('pending', 'accepted') THEN RAISE EXCEPTION 'This order can no longer be cancelled' USING ERRCODE = '22023'; END IF;
  UPDATE public.orders SET status = 'cancelled', cancelled_at = now(), cancellation_reason = v_reason, updated_at = now() WHERE id = v_order.id;
  INSERT INTO public.order_status_history (order_id, previous_status, new_status, changed_by, note)
  VALUES (v_order.id, v_order.status, 'cancelled', auth.uid(), v_reason);
  RETURN true;
END $$;

CREATE OR REPLACE FUNCTION public.vendor_transition_order(p_order_id uuid, p_next_status text, p_note text DEFAULT NULL)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE v_order public.orders%ROWTYPE; v_note text := NULLIF(btrim(p_note), '');
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501'; END IF;
  IF p_next_status NOT IN ('accepted', 'processing', 'ready', 'out_for_delivery', 'completed', 'cancelled') THEN RAISE EXCEPTION 'Invalid vendor order transition' USING ERRCODE = '22023'; END IF;
  IF char_length(COALESCE(v_note, '')) > 500 THEN RAISE EXCEPTION 'Order note is too long' USING ERRCODE = '22023'; END IF;
  SELECT o.* INTO v_order FROM public.orders o JOIN public.vendors v ON v.id = o.vendor_id
  WHERE o.id = p_order_id AND v.owner_id = auth.uid() FOR UPDATE OF o;
  IF NOT FOUND THEN RAISE EXCEPTION 'Vendor order access denied' USING ERRCODE = '42501'; END IF;
  IF NOT ((v_order.status = 'pending' AND p_next_status IN ('accepted', 'cancelled'))
       OR (v_order.status = 'accepted' AND p_next_status = 'processing')
       OR (v_order.status = 'processing' AND ((v_order.delivery_method = 'pickup' AND p_next_status = 'ready') OR (v_order.delivery_method = 'delivery' AND p_next_status = 'out_for_delivery')))
       OR (v_order.status IN ('ready', 'out_for_delivery') AND p_next_status = 'completed')) THEN
    RAISE EXCEPTION 'Order transition is not allowed' USING ERRCODE = '22023';
  END IF;
  UPDATE public.orders SET status = p_next_status,
    accepted_at = CASE WHEN p_next_status = 'accepted' THEN now() ELSE accepted_at END,
    completed_at = CASE WHEN p_next_status = 'completed' THEN now() ELSE completed_at END,
    cancelled_at = CASE WHEN p_next_status = 'cancelled' THEN now() ELSE cancelled_at END,
    cancellation_reason = CASE WHEN p_next_status = 'cancelled' THEN v_note ELSE cancellation_reason END,
    updated_at = now() WHERE id = v_order.id;
  INSERT INTO public.order_status_history (order_id, previous_status, new_status, changed_by, note)
  VALUES (v_order.id, v_order.status, p_next_status, auth.uid(), v_note);
  RETURN true;
END $$;

CREATE OR REPLACE FUNCTION public.vendor_update_order_notes(p_order_id uuid, p_notes text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501'; END IF;
  IF char_length(COALESCE(p_notes, '')) > 2000 THEN RAISE EXCEPTION 'Vendor notes are too long' USING ERRCODE = '22023'; END IF;
  UPDATE public.orders o SET vendor_notes = NULLIF(btrim(p_notes), ''), updated_at = now()
  WHERE o.id = p_order_id AND EXISTS (SELECT 1 FROM public.vendors v WHERE v.id = o.vendor_id AND v.owner_id = auth.uid());
  IF NOT FOUND THEN RAISE EXCEPTION 'Vendor order access denied' USING ERRCODE = '42501'; END IF;
  RETURN true;
END $$;

CREATE OR REPLACE FUNCTION public.vendor_update_booking_status(p_order_item_id uuid, p_status text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE v_current text;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501'; END IF;
  IF p_status NOT IN ('confirmed', 'declined') THEN RAISE EXCEPTION 'Invalid booking transition' USING ERRCODE = '22023'; END IF;
  SELECT item.booking_status INTO v_current FROM public.order_items item JOIN public.orders o ON o.id = item.order_id JOIN public.vendors v ON v.id = o.vendor_id
  WHERE item.id = p_order_item_id AND v.owner_id = auth.uid() FOR UPDATE OF item;
  IF NOT FOUND THEN RAISE EXCEPTION 'Vendor booking access denied' USING ERRCODE = '42501'; END IF;
  IF v_current IS DISTINCT FROM 'pending' THEN RAISE EXCEPTION 'Booking transition is not allowed' USING ERRCODE = '22023'; END IF;
  UPDATE public.order_items SET booking_status = p_status WHERE id = p_order_item_id;
  RETURN true;
END $$;

CREATE OR REPLACE FUNCTION public.admin_extend_subscription(p_subscription_id uuid, p_days integer, p_note text DEFAULT NULL)
RETURNS timestamptz LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE v_subscription public.subscriptions%ROWTYPE; v_new_end timestamptz; v_note text := NULLIF(btrim(p_note), '');
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_super_admin() THEN RAISE EXCEPTION 'Super administrator access required' USING ERRCODE = '42501'; END IF;
  IF p_days IS NULL OR p_days < 1 OR p_days > 365 THEN RAISE EXCEPTION 'Extension must be between 1 and 365 days' USING ERRCODE = '22023'; END IF;
  IF char_length(COALESCE(v_note, '')) > 1000 THEN RAISE EXCEPTION 'Extension note is too long' USING ERRCODE = '22023'; END IF;
  SELECT * INTO v_subscription FROM public.subscriptions WHERE id = p_subscription_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Subscription not found' USING ERRCODE = 'P0002'; END IF;
  v_new_end := GREATEST(COALESCE(v_subscription.ends_at, now()), now()) + make_interval(days => p_days);
  UPDATE public.subscriptions SET ends_at = v_new_end, extended_by = auth.uid(), extension_note = v_note WHERE id = v_subscription.id;
  INSERT INTO public.admin_actions (admin_id, action, module, target_type, target_id, metadata, result)
  VALUES (auth.uid(), 'subscription.extend', 'subscriptions', 'subscription', v_subscription.id, jsonb_build_object('days', p_days, 'note', v_note, 'previous_ends_at', v_subscription.ends_at, 'new_ends_at', v_new_end), 'success');
  RETURN v_new_end;
END $$;

REVOKE ALL ON FUNCTION public.customer_cancel_order(uuid, text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.vendor_transition_order(uuid, text, text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.vendor_update_order_notes(uuid, text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.vendor_update_booking_status(uuid, text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.admin_extend_subscription(uuid, integer, text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.customer_cancel_order(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.vendor_transition_order(uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.vendor_update_order_notes(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.vendor_update_booking_status(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_extend_subscription(uuid, integer, text) TO authenticated;
COMMIT;
