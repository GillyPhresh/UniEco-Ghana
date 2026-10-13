-- Module 18: server-authoritative campus fulfillment. Local-only pending migration.
BEGIN;

CREATE TABLE IF NOT EXISTS public.campus_delivery_zones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  university_id uuid NOT NULL REFERENCES public.universities(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(university_id, name)
);

CREATE TABLE IF NOT EXISTS public.order_fulfillment_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  event_type text NOT NULL CHECK(event_type IN ('ready_for_pickup','dispatched','pickup_confirmed','delivery_confirmed')),
  recorded_by uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS order_fulfillment_events_once_per_type ON public.order_fulfillment_events(order_id,event_type);

ALTER TABLE public.campus_delivery_zones ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_fulfillment_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY campus_delivery_zones_public_read ON public.campus_delivery_zones FOR SELECT TO anon,authenticated USING(is_active);
CREATE POLICY order_fulfillment_events_participant_read ON public.order_fulfillment_events FOR SELECT TO authenticated USING(
  EXISTS (SELECT 1 FROM public.orders o JOIN public.vendors v ON v.id=o.vendor_id WHERE o.id=order_id AND (o.buyer_id=auth.uid() OR v.owner_id=auth.uid() OR public.can_manage_university(o.university_id)))
);
REVOKE INSERT, UPDATE, DELETE ON public.campus_delivery_zones, public.order_fulfillment_events FROM authenticated;

-- Replace the A3.5 vendor transition procedure to make handoff observable,
-- while reserving completion for the customer confirmation below. There is no
-- driver role/table in the existing model, therefore no driver assignment is
-- inferred from ordinary user accounts.
CREATE OR REPLACE FUNCTION public.vendor_transition_order(p_order_id uuid,p_next_status text,p_note text DEFAULT NULL)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE v_order public.orders%ROWTYPE; v_note text:=NULLIF(btrim(p_note),'');
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501'; END IF;
  IF p_next_status NOT IN ('accepted','processing','ready','out_for_delivery','cancelled') THEN RAISE EXCEPTION 'Invalid vendor order transition' USING ERRCODE='22023'; END IF;
  IF char_length(COALESCE(v_note,''))>500 THEN RAISE EXCEPTION 'Order note is too long' USING ERRCODE='22023'; END IF;
  SELECT o.* INTO v_order FROM public.orders o JOIN public.vendors v ON v.id=o.vendor_id WHERE o.id=p_order_id AND v.owner_id=auth.uid() FOR UPDATE OF o;
  IF NOT FOUND THEN RAISE EXCEPTION 'Vendor order access denied' USING ERRCODE='42501'; END IF;
  IF NOT ((v_order.status='pending' AND p_next_status IN ('accepted','cancelled')) OR (v_order.status='accepted' AND p_next_status='processing') OR (v_order.status='processing' AND ((v_order.delivery_method='pickup' AND p_next_status='ready') OR (v_order.delivery_method='delivery' AND p_next_status='out_for_delivery')))) THEN RAISE EXCEPTION 'Order transition is not allowed' USING ERRCODE='22023'; END IF;
  UPDATE public.orders SET status=p_next_status,accepted_at=CASE WHEN p_next_status='accepted' THEN now() ELSE accepted_at END,cancelled_at=CASE WHEN p_next_status='cancelled' THEN now() ELSE cancelled_at END,cancellation_reason=CASE WHEN p_next_status='cancelled' THEN v_note ELSE cancellation_reason END,updated_at=now() WHERE id=v_order.id;
  INSERT INTO public.order_status_history(order_id,previous_status,new_status,changed_by,note) VALUES(v_order.id,v_order.status,p_next_status,auth.uid(),v_note);
  IF p_next_status='ready' THEN
    INSERT INTO public.order_fulfillment_events(order_id,event_type,recorded_by,note) VALUES(v_order.id,'ready_for_pickup',auth.uid(),v_note) ON CONFLICT(order_id,event_type) DO NOTHING;
  ELSIF p_next_status='out_for_delivery' THEN
    INSERT INTO public.order_fulfillment_events(order_id,event_type,recorded_by,note) VALUES(v_order.id,'dispatched',auth.uid(),v_note) ON CONFLICT(order_id,event_type) DO NOTHING;
  END IF;
  RETURN true;
END $$;

CREATE OR REPLACE FUNCTION public.customer_confirm_order_handoff(p_order_id uuid,p_note text DEFAULT NULL)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE v_order public.orders%ROWTYPE; v_note text:=NULLIF(btrim(p_note),''); v_event text;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501'; END IF;
  IF char_length(COALESCE(v_note,''))>500 THEN RAISE EXCEPTION 'Confirmation note is too long' USING ERRCODE='22023'; END IF;
  SELECT * INTO v_order FROM public.orders WHERE id=p_order_id AND buyer_id=auth.uid() FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Order access denied' USING ERRCODE='42501'; END IF;
  IF v_order.status NOT IN ('ready','out_for_delivery') THEN RAISE EXCEPTION 'This order is not ready for confirmation' USING ERRCODE='22023'; END IF;
  v_event:=CASE WHEN v_order.delivery_method='pickup' THEN 'pickup_confirmed' ELSE 'delivery_confirmed' END;
  UPDATE public.orders SET status='completed',completed_at=now(),updated_at=now() WHERE id=v_order.id;
  INSERT INTO public.order_status_history(order_id,previous_status,new_status,changed_by,note) VALUES(v_order.id,v_order.status,'completed',auth.uid(),v_note);
  INSERT INTO public.order_fulfillment_events(order_id,event_type,recorded_by,note) VALUES(v_order.id,v_event,auth.uid(),v_note) ON CONFLICT(order_id,event_type) DO NOTHING;
  RETURN true;
END $$;

CREATE OR REPLACE FUNCTION public.create_admin_campus_delivery_zone(p_university_id uuid,p_name text,p_description text DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE v_id uuid;
BEGIN
  IF auth.uid() IS NULL OR NOT public.can_manage_university(p_university_id) THEN RAISE EXCEPTION 'University administrator access required' USING ERRCODE='42501'; END IF;
  IF NULLIF(btrim(p_name),'') IS NULL OR length(p_name)>100 THEN RAISE EXCEPTION 'Valid zone name required' USING ERRCODE='22023'; END IF;
  INSERT INTO public.campus_delivery_zones(university_id,name,description) VALUES(p_university_id,btrim(p_name),NULLIF(btrim(p_description),'')) RETURNING id INTO v_id;
  PERFORM public.record_trusted_admin_action('delivery_zone.create','operations','campus_delivery_zone',v_id,jsonb_build_object('university_id',p_university_id));
  RETURN v_id;
END $$;

CREATE OR REPLACE FUNCTION public.update_admin_campus_delivery_zone(p_zone_id uuid,p_name text,p_description text DEFAULT NULL,p_is_active boolean DEFAULT true)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE v_university_id uuid;
BEGIN
  SELECT university_id INTO v_university_id FROM public.campus_delivery_zones WHERE id=p_zone_id FOR UPDATE;
  IF auth.uid() IS NULL OR NOT FOUND OR NOT public.can_manage_university(v_university_id) THEN RAISE EXCEPTION 'University administrator access required' USING ERRCODE='42501'; END IF;
  IF NULLIF(btrim(p_name),'') IS NULL OR length(p_name)>100 THEN RAISE EXCEPTION 'Valid zone name required' USING ERRCODE='22023'; END IF;
  UPDATE public.campus_delivery_zones SET name=btrim(p_name),description=NULLIF(btrim(p_description),''),is_active=COALESCE(p_is_active,true),updated_at=now() WHERE id=p_zone_id;
  PERFORM public.record_trusted_admin_action('delivery_zone.update','operations','campus_delivery_zone',p_zone_id,'{}'::jsonb);
END $$;

REVOKE ALL ON FUNCTION public.customer_confirm_order_handoff(uuid,text),public.create_admin_campus_delivery_zone(uuid,text,text),public.update_admin_campus_delivery_zone(uuid,text,text,boolean) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.vendor_transition_order(uuid,text,text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.customer_confirm_order_handoff(uuid,text),public.create_admin_campus_delivery_zone(uuid,text,text),public.update_admin_campus_delivery_zone(uuid,text,text,boolean),public.vendor_transition_order(uuid,text,text) TO authenticated;
COMMIT;
