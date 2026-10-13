BEGIN;

-- Analytics stores only event classification and server-derived scope. It has
-- no URL, IP, email, free-text search, message body, document, payment detail,
-- or browser-supplied financial/workflow outcome columns.
CREATE TABLE IF NOT EXISTS public.analytics_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  event_type text NOT NULL CHECK (event_type IN (
    'page_view','university_view','business_view','product_view','service_view',
    'search','search_result_click','vendor_profile_visit','product_click','service_click',
    'event_view','marketplace_interaction','cart_add','cart_remove','checkout_started',
    'message_opened','ad_impression','ad_click','review_submitted',
    'registration_started','registration_completed','vendor_registration_started',
    'vendor_registration_completed'
  )),
  subject_type text CHECK (subject_type IN ('university','business','product','service','event','advertisement')),
  subject_id uuid,
  university_id uuid REFERENCES public.universities(id) ON DELETE SET NULL,
  vendor_id uuid REFERENCES public.vendors(id) ON DELETE SET NULL,
  result_count integer CHECK (result_count IS NULL OR result_count BETWEEN 0 AND 1000),
  occurred_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.analytics_events ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS analytics_events_scope_time_idx ON public.analytics_events(university_id,vendor_id,occurred_at DESC);
CREATE INDEX IF NOT EXISTS analytics_events_type_time_idx ON public.analytics_events(event_type,occurred_at DESC);

REVOKE ALL ON public.analytics_events FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.record_analytics_events(p_events jsonb)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE v_event jsonb; v_type text; v_subject_type text; v_subject_id uuid;
DECLARE v_university_id uuid; v_vendor_id uuid; v_count integer := 0; v_result_count integer;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501'; END IF;
  IF jsonb_typeof(p_events) <> 'array' OR jsonb_array_length(p_events) NOT BETWEEN 1 AND 20 THEN
    RAISE EXCEPTION 'Events must be a batch of 1 to 20 items' USING ERRCODE='22023';
  END IF;
  FOR v_event IN SELECT value FROM jsonb_array_elements(p_events) LOOP
    v_type := v_event->>'event_type'; v_subject_type := NULLIF(v_event->>'subject_type','');
    v_subject_id := NULLIF(v_event->>'subject_id','')::uuid;
    v_result_count := NULLIF(v_event->>'result_count','')::integer;
    IF v_type NOT IN ('page_view','university_view','business_view','product_view','service_view','search','search_result_click','vendor_profile_visit','product_click','service_click','event_view','marketplace_interaction','cart_add','cart_remove','checkout_started','message_opened','ad_impression','ad_click','review_submitted','registration_started','registration_completed','vendor_registration_started','vendor_registration_completed') THEN
      RAISE EXCEPTION 'Unsupported analytics event' USING ERRCODE='22023';
    END IF;
    IF v_result_count IS NOT NULL AND v_result_count NOT BETWEEN 0 AND 1000 THEN RAISE EXCEPTION 'Invalid result count' USING ERRCODE='22023'; END IF;
    v_university_id := NULL; v_vendor_id := NULL;
    IF v_subject_type IS NULL AND v_subject_id IS NOT NULL THEN RAISE EXCEPTION 'Subject type required' USING ERRCODE='22023'; END IF;
    IF v_subject_type='university' THEN SELECT id INTO v_university_id FROM public.universities WHERE id=v_subject_id;
    ELSIF v_subject_type='business' THEN SELECT university_id,vendor_id INTO v_university_id,v_vendor_id FROM public.businesses WHERE id=v_subject_id AND is_active;
    ELSIF v_subject_type='product' THEN SELECT p.university_id,b.vendor_id INTO v_university_id,v_vendor_id FROM public.products p JOIN public.businesses b ON b.id=p.business_id WHERE p.id=v_subject_id AND p.is_active AND NOT p.is_archived;
    ELSIF v_subject_type='service' THEN SELECT s.university_id,b.vendor_id INTO v_university_id,v_vendor_id FROM public.services s JOIN public.businesses b ON b.id=s.business_id WHERE s.id=v_subject_id AND s.is_active AND NOT s.is_archived;
    ELSIF v_subject_type='event' THEN SELECT university_id INTO v_university_id FROM public.events WHERE id=v_subject_id AND is_published;
    ELSIF v_subject_type='advertisement' THEN SELECT university_id,vendor_id INTO v_university_id,v_vendor_id FROM public.advertisements WHERE id=v_subject_id AND is_active AND status='active';
    ELSIF v_subject_type IS NOT NULL THEN RAISE EXCEPTION 'Invalid analytics subject' USING ERRCODE='22023'; END IF;
    IF v_subject_type IS NOT NULL AND v_university_id IS NULL AND v_vendor_id IS NULL THEN RAISE EXCEPTION 'Analytics subject not available' USING ERRCODE='P0002'; END IF;
    INSERT INTO public.analytics_events(actor_id,event_type,subject_type,subject_id,university_id,vendor_id,result_count)
    VALUES(auth.uid(),v_type,v_subject_type,v_subject_id,v_university_id,v_vendor_id,v_result_count);
    v_count := v_count + 1;
  END LOOP;
  RETURN v_count;
END $$;

CREATE OR REPLACE FUNCTION public.get_vendor_analytics_dashboard(p_days integer DEFAULT 30)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE v_vendor uuid; v_start timestamptz; v_result jsonb;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501'; END IF;
  IF p_days NOT BETWEEN 1 AND 365 THEN RAISE EXCEPTION 'Invalid analytics period' USING ERRCODE='22023'; END IF;
  SELECT id INTO v_vendor FROM public.vendors WHERE owner_id=auth.uid();
  IF v_vendor IS NULL THEN RAISE EXCEPTION 'Vendor access required' USING ERRCODE='42501'; END IF;
  v_start := now() - make_interval(days=>p_days);
  SELECT jsonb_build_object(
    'profile_views',count(*) FILTER (WHERE event_type IN ('business_view','vendor_profile_visit')),
    'product_views',count(*) FILTER (WHERE event_type IN ('product_view','product_click')),
    'service_views',count(*) FILTER (WHERE event_type IN ('service_view','service_click')),
    'search_appearances',count(*) FILTER (WHERE event_type='search_result_click'),
    'messages_received',(SELECT count(*) FROM public.messages m WHERE m.recipient_id=auth.uid() AND m.created_at>=v_start),
    'saved_count',(SELECT count(*) FROM public.saved_items s WHERE s.item_type='business' AND s.item_id IN (SELECT id FROM public.businesses WHERE vendor_id=v_vendor)),
    'orders',(SELECT count(*) FROM public.orders o WHERE o.vendor_id=v_vendor AND o.created_at>=v_start),
    'completed_orders',(SELECT count(*) FROM public.orders o WHERE o.vendor_id=v_vendor AND o.status='completed' AND o.completed_at>=v_start),
    'revenue',(SELECT COALESCE(sum(p.amount),0) FROM public.payments p WHERE p.vendor_id=v_vendor AND p.status='completed' AND p.paid_at>=v_start)
  ) INTO v_result FROM public.analytics_events WHERE vendor_id=v_vendor AND occurred_at>=v_start;
  RETURN COALESCE(v_result,'{}'::jsonb);
END $$;

CREATE OR REPLACE FUNCTION public.get_university_analytics_dashboard(p_days integer DEFAULT 30,p_university_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE v_university uuid; v_start timestamptz;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501'; END IF;
  IF p_days NOT BETWEEN 1 AND 365 THEN RAISE EXCEPTION 'Invalid analytics period' USING ERRCODE='22023'; END IF;
  IF public.is_super_admin() THEN v_university:=p_university_id;
  ELSE SELECT university_id INTO v_university FROM public.university_admin_memberships WHERE user_id=auth.uid() AND is_active AND (p_university_id IS NULL OR university_id=p_university_id) LIMIT 1;
  END IF;
  IF v_university IS NULL THEN RAISE EXCEPTION 'University administrator access required or select a university scope' USING ERRCODE='42501'; END IF;
  v_start:=now()-make_interval(days=>p_days);
  RETURN jsonb_build_object('users',(SELECT count(*) FROM public.profiles WHERE university_id=v_university),'vendors',(SELECT count(*) FROM public.vendors WHERE university_id=v_university),'engagement_events',(SELECT count(*) FROM public.analytics_events WHERE university_id=v_university AND occurred_at>=v_start),'orders',(SELECT count(*) FROM public.orders WHERE university_id=v_university AND created_at>=v_start),'revenue',(SELECT COALESCE(sum(p.amount),0) FROM public.payments p JOIN public.orders o ON o.id=p.order_id WHERE o.university_id=v_university AND p.status='completed' AND p.paid_at>=v_start));
END $$;

CREATE OR REPLACE FUNCTION public.get_platform_analytics_dashboard(p_days integer DEFAULT 30)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE v_start timestamptz;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_staff() THEN RAISE EXCEPTION 'Staff access required' USING ERRCODE='42501'; END IF;
  IF p_days NOT BETWEEN 1 AND 365 THEN RAISE EXCEPTION 'Invalid analytics period' USING ERRCODE='22023'; END IF;
  v_start:=now()-make_interval(days=>p_days);
  RETURN jsonb_build_object('users',(SELECT count(*) FROM public.profiles),'vendors',(SELECT count(*) FROM public.vendors),'universities',(SELECT count(*) FROM public.universities WHERE is_enabled),'engagement_events',(SELECT count(*) FROM public.analytics_events WHERE occurred_at>=v_start),'orders',(SELECT count(*) FROM public.orders WHERE created_at>=v_start),'revenue',(SELECT COALESCE(sum(amount),0) FROM public.payments WHERE status='completed' AND paid_at>=v_start),'ads',(SELECT count(*) FROM public.analytics_events WHERE event_type IN ('ad_impression','ad_click') AND occurred_at>=v_start));
END $$;

REVOKE ALL ON FUNCTION public.record_analytics_events(jsonb),public.get_vendor_analytics_dashboard(integer),public.get_university_analytics_dashboard(integer,uuid),public.get_platform_analytics_dashboard(integer) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.record_analytics_events(jsonb),public.get_vendor_analytics_dashboard(integer),public.get_university_analytics_dashboard(integer,uuid),public.get_platform_analytics_dashboard(integer) TO authenticated;
COMMIT;
