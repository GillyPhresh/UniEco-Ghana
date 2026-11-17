-- Approved parcel couriers for the existing Marketplace checkout. Ships closed.
BEGIN;
SET LOCAL lock_timeout = '5s';

CREATE TABLE public.courier_program (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  is_open boolean NOT NULL DEFAULT false,
  reviewed_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  reviewed_at timestamptz
);
INSERT INTO public.courier_program (singleton) VALUES (true);

CREATE TABLE public.courier_applications (
  user_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE RESTRICT,
  campus_id uuid NOT NULL REFERENCES public.universities(id) ON DELETE RESTRICT,
  display_name text NOT NULL CHECK (char_length(display_name) BETWEEN 2 AND 50),
  phone text NOT NULL CHECK (phone ~ '^\+233[0-9]{9}$'),
  vehicle text NOT NULL CHECK (vehicle IN ('walking','bicycle','motorbike','car')),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','declined','paused')),
  available boolean NOT NULL DEFAULT false,
  released_at timestamptz,
  verified_until date,
  reviewed_at timestamptz,
  reviewed_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (status <> 'approved' OR vehicle NOT IN ('motorbike','car') OR verified_until IS NOT NULL)
);

CREATE TABLE public.courier_order_consents (
  order_id uuid PRIMARY KEY REFERENCES public.orders(id) ON DELETE CASCADE,
  authorized_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.courier_jobs (
  order_id uuid PRIMARY KEY REFERENCES public.orders(id) ON DELETE RESTRICT,
  campus_id uuid NOT NULL REFERENCES public.universities(id) ON DELETE RESTRICT,
  state text NOT NULL DEFAULT 'requested' CHECK (state IN ('requested','offered','claimed','collected','delivered','cancelled')),
  parcel_size text NOT NULL CHECK (parcel_size IN ('small','medium','large')),
  pickup_address text CHECK (char_length(pickup_address) BETWEEN 5 AND 240),
  fee_pesewas integer CHECK (fee_pesewas BETWEEN 100 AND 100000),
  offer_until timestamptz,
  courier_id uuid REFERENCES public.courier_applications(user_id) ON DELETE RESTRICT,
  pickup_code text CHECK (pickup_code ~ '^[0-9]{6}$'),
  dropoff_code text CHECK (dropoff_code ~ '^[0-9]{6}$'),
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts BETWEEN 0 AND 5),
  retry_after timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (state NOT IN ('claimed','collected','delivered') OR courier_id IS NOT NULL),
  CHECK (state <> 'offered' OR (fee_pesewas IS NOT NULL AND offer_until IS NOT NULL)),
  CHECK (pickup_code IS NULL OR dropoff_code IS NULL OR pickup_code <> dropoff_code),
  CHECK (state NOT IN ('requested','offered','claimed','collected') OR pickup_address IS NOT NULL)
);
CREATE INDEX courier_available_jobs_idx ON public.courier_jobs(campus_id, offer_until) WHERE state='offered';
CREATE UNIQUE INDEX courier_one_active_job_idx ON public.courier_jobs(courier_id) WHERE state IN ('claimed','collected');
CREATE INDEX courier_review_queue_idx ON public.courier_applications(status, updated_at DESC);

ALTER TABLE public.courier_program ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.courier_applications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.courier_order_consents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.courier_jobs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.courier_program, public.courier_applications, public.courier_order_consents, public.courier_jobs
  FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION public.courier_program_is_open() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
  SELECT COALESCE((SELECT is_open FROM public.courier_program WHERE singleton), false)
$$;

-- Hold the switch while admitting new work so a pause cannot race a claim.
CREATE FUNCTION public.courier_program_accepting() RETURNS boolean
LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
  SELECT COALESCE((SELECT is_open FROM public.courier_program WHERE singleton FOR SHARE), false)
$$;

CREATE FUNCTION public.courier_identity_ok(p_user_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles p JOIN auth.users a ON a.id=p.id
    WHERE p.id=p_user_id AND p.is_active AND p.status IN ('active','pending','pending_payment','pending_approval')
      AND a.email_confirmed_at IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM public.account_restrictions r WHERE r.user_id=p.id AND r.is_active
        AND (r.ends_at IS NULL OR r.ends_at>now()))
  )
$$;

-- Courier-only registration has no fee. Older reminder sources fall back to a
-- student lane for a profile without a paid intent; suppress only that prompt.
CREATE FUNCTION public.courier_without_paid_intent(p_user_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles p JOIN auth.users a ON a.id=p.id
    WHERE p.id=p_user_id AND p.role_id=2
      AND COALESCE(p.preferences->>'registration_intent','') NOT IN ('student','external_vendor')
      AND (a.raw_user_meta_data->>'signup_experience'='courier'
        OR EXISTS (SELECT 1 FROM public.courier_applications WHERE user_id=p.id))
  )
$$;

CREATE FUNCTION public.courier_skip_registration_prompt() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN
  IF public.courier_without_paid_intent(NEW.user_id) THEN RETURN NULL; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER courier_free_registration_campaign BEFORE INSERT ON public.communication_campaign_log
  FOR EACH ROW WHEN (NEW.campaign_key='registration_payment_required') EXECUTE FUNCTION public.courier_skip_registration_prompt();
CREATE TRIGGER courier_free_registration_notification BEFORE INSERT ON public.notifications
  FOR EACH ROW WHEN (NEW.type='registration_payment_required') EXECUTE FUNCTION public.courier_skip_registration_prompt();

-- Keep the existing 0193 delivery behavior for every other notification.
CREATE OR REPLACE FUNCTION public.enqueue_trusted_communication_event(
  p_event_type text,
  p_recipient_id uuid DEFAULT NULL,
  p_recipient_email text DEFAULT NULL,
  p_recipient_phone text DEFAULT NULL,
  p_subject text DEFAULT NULL,
  p_channels text[] DEFAULT ARRAY['in_app'],
  p_metadata jsonb DEFAULT '{}'::jsonb
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE
  v_event_id uuid;
  v_channels text[] := COALESCE(p_channels, ARRAY[]::text[]);
BEGIN
  IF cardinality(v_channels) = 0
     OR EXISTS (SELECT 1 FROM unnest(v_channels) AS channel_name WHERE channel_name NOT IN ('in_app','email','push','whatsapp','sms')) THEN
    RAISE EXCEPTION 'Invalid communication channels' USING ERRCODE = '22023';
  END IF;
  IF NULLIF(btrim(p_event_type), '') IS NULL THEN
    RAISE EXCEPTION 'Event type is required' USING ERRCODE = '22023';
  END IF;
  IF btrim(p_event_type)='registration_payment_required' AND public.courier_without_paid_intent(p_recipient_id) THEN
    RETURN NULL;
  END IF;
  IF p_event_type IN ('registration_welcome','student_welcome','vendor_welcome','referral_link_ready') THEN
    v_channels := array_remove(v_channels, 'email');
    IF cardinality(v_channels) = 0 THEN RETURN NULL; END IF;
  END IF;

  INSERT INTO public.communication_events(event_type,recipient_id,recipient_email,recipient_phone,subject,channels,status,metadata)
  VALUES (btrim(p_event_type),p_recipient_id,NULLIF(btrim(p_recipient_email),''),NULLIF(btrim(p_recipient_phone),''),NULLIF(btrim(p_subject),''),v_channels,'queued',COALESCE(p_metadata,'{}'::jsonb))
  RETURNING id INTO v_event_id;
  INSERT INTO public.communication_deliveries(event_id,channel,status)
  SELECT v_event_id, channel_name, 'queued' FROM unnest(v_channels) AS channel_name WHERE channel_name <> 'in_app';
  IF NOT EXISTS (SELECT 1 FROM public.communication_deliveries WHERE event_id=v_event_id) THEN
    UPDATE public.communication_events SET status='delivered', updated_at=now() WHERE id=v_event_id;
  END IF;
  RETURN v_event_id;
END;
$$;
REVOKE ALL ON FUNCTION public.enqueue_trusted_communication_event(text,uuid,text,text,text,text[],jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.enqueue_trusted_communication_event(text,uuid,text,text,text,text[],jsonb) TO service_role;

CREATE FUNCTION public.courier_can_work(p_user_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
  SELECT public.courier_identity_ok(p_user_id) AND EXISTS (
    SELECT 1 FROM public.courier_applications a WHERE a.user_id=p_user_id AND a.status='approved'
      AND (a.vehicle NOT IN ('motorbike','car') OR a.verified_until >= (now() AT TIME ZONE 'Africa/Accra')::date)
  )
$$;

CREATE FUNCTION public.courier_order_has_payment_arrangement(p_order_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.orders o JOIN public.payments p ON p.order_id=o.id AND p.user_id=o.buyer_id AND p.vendor_id=o.vendor_id
    WHERE o.id=p_order_id AND p.payment_type='marketplace' AND p.amount=o.total_amount AND p.currency=o.currency
      AND ((p.provider='manual' AND p.status IN ('cash_on_delivery','success'))
        OR (p.provider<>'manual' AND p.status='success'))
  )
$$;

CREATE FUNCTION public.courier_new_handoff_code() RETURNS text
LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
  SELECT lpad(((get_byte(bytes,0)*65536+get_byte(bytes,1)*256+get_byte(bytes,2)) % 1000000)::text,6,'0')
  FROM (SELECT extensions.gen_random_bytes(3) AS bytes) AS entropy
$$;

CREATE FUNCTION public.courier_apply(p_campus_id uuid,p_display_name text,p_phone text,p_vehicle text,p_attested boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE uid uuid := auth.uid();
BEGIN
  IF NOT public.courier_identity_ok(uid) THEN RAISE EXCEPTION 'Confirm your email before applying' USING ERRCODE='42501'; END IF;
  IF NOT public.courier_program_accepting() THEN RAISE EXCEPTION 'Courier applications are closed' USING ERRCODE='55000'; END IF;
  IF p_attested IS DISTINCT FROM true OR p_vehicle IS NULL OR p_vehicle NOT IN ('walking','bicycle','motorbike','car')
     OR char_length(COALESCE(btrim(p_display_name),'')) NOT BETWEEN 2 AND 50
     OR COALESCE(p_phone,'') !~ '^\+233[0-9]{9}$' OR NOT EXISTS (SELECT 1 FROM public.universities WHERE id=p_campus_id) THEN
    RAISE EXCEPTION 'Check your name, phone, campus and delivery type' USING ERRCODE='22023';
  END IF;
  INSERT INTO public.courier_applications(user_id,campus_id,display_name,phone,vehicle)
    VALUES(uid,p_campus_id,btrim(p_display_name),p_phone,p_vehicle)
    ON CONFLICT (user_id) DO UPDATE SET campus_id=EXCLUDED.campus_id, display_name=EXCLUDED.display_name,
      phone=EXCLUDED.phone, vehicle=EXCLUDED.vehicle, status='pending', available=false, verified_until=NULL,
      reviewed_at=NULL, reviewed_by=NULL, updated_at=now()
    WHERE courier_applications.status IN ('pending','declined') AND courier_applications.updated_at < now() - interval '30 seconds';
  IF NOT FOUND THEN RAISE EXCEPTION 'An application already exists or was updated just now' USING ERRCODE='55000'; END IF;
END $$;

CREATE FUNCTION public.courier_admin_set_program(p_open boolean,p_operations_confirmed boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_super_admin() THEN RAISE EXCEPTION 'Courier operations access required' USING ERRCODE='42501'; END IF;
  IF p_open IS NULL OR (p_open AND p_operations_confirmed IS DISTINCT FROM true) THEN
    RAISE EXCEPTION 'Confirm the operator, safety and compensation arrangements first' USING ERRCODE='22023';
  END IF;
  UPDATE public.courier_program SET is_open=p_open, reviewed_by=auth.uid(), reviewed_at=now() WHERE singleton;
  PERFORM public.record_trusted_admin_action('courier.program','operations','courier_program','00000000-0000-4000-8000-000000000205',jsonb_build_object('is_open',p_open));
END $$;

CREATE FUNCTION public.courier_admin_review(p_user_id uuid,p_decision text,p_verified_until date,p_checks_complete boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE applicant public.courier_applications%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_super_admin() OR p_user_id=auth.uid() THEN
    RAISE EXCEPTION 'Courier review access required' USING ERRCODE='42501';
  END IF;
  SELECT * INTO applicant FROM public.courier_applications WHERE user_id=p_user_id FOR UPDATE;
  IF NOT FOUND OR p_decision IS NULL OR p_decision NOT IN ('approved','declined','paused')
    OR NOT ((applicant.status IN ('pending','paused') AND p_decision IN ('approved','declined'))
      OR (applicant.status='approved' AND p_decision IN ('approved','paused'))) THEN
    RAISE EXCEPTION 'This courier review is not available' USING ERRCODE='22023';
  END IF;
  IF p_decision='approved' AND (p_checks_complete IS DISTINCT FROM true OR NOT public.courier_identity_ok(p_user_id)
      OR (applicant.vehicle IN ('motorbike','car') AND (p_verified_until IS NULL OR p_verified_until < (now() AT TIME ZONE 'Africa/Accra')::date))) THEN
    RAISE EXCEPTION 'Verify the applicant and all applicable documents before approving' USING ERRCODE='22023';
  END IF;
  IF p_decision<>'approved' AND EXISTS (SELECT 1 FROM public.courier_jobs WHERE courier_id=p_user_id AND state IN ('claimed','collected')) THEN
    RAISE EXCEPTION 'Resolve this courier’s active delivery first' USING ERRCODE='55000';
  END IF;
  UPDATE public.courier_applications SET status=p_decision, available=false,
    verified_until=CASE WHEN p_decision='approved' AND applicant.vehicle IN ('motorbike','car') THEN p_verified_until ELSE NULL END,
    reviewed_by=auth.uid(), reviewed_at=now(), updated_at=now() WHERE user_id=p_user_id;
  PERFORM public.record_trusted_admin_action('courier.review','operations','courier',p_user_id,jsonb_build_object('decision',p_decision));
END $$;

CREATE FUNCTION public.courier_set_available(p_available boolean) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN
  IF p_available IS NULL OR NOT public.courier_can_work(auth.uid()) OR (p_available AND NOT public.courier_program_accepting()) THEN
    RAISE EXCEPTION 'Courier availability cannot be changed right now' USING ERRCODE='42501';
  END IF;
  UPDATE public.courier_applications SET available=p_available,updated_at=now() WHERE user_id=auth.uid() AND status='approved';
END $$;

CREATE FUNCTION public.courier_authorize_for_order(p_order_id uuid,p_allow boolean) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE sale public.orders%ROWTYPE;
BEGIN
  IF p_allow AND NOT public.courier_program_accepting() THEN
    RAISE EXCEPTION 'New courier requests are paused' USING ERRCODE='55000';
  END IF;
  SELECT * INTO sale FROM public.orders WHERE id=p_order_id AND buyer_id=auth.uid() FOR UPDATE;
  IF NOT FOUND OR p_allow IS NULL OR (p_allow AND NOT public.courier_identity_ok(auth.uid()))
     OR sale.delivery_method IS DISTINCT FROM 'delivery' OR sale.order_type IS DISTINCT FROM 'product'
     OR sale.status NOT IN ('pending','confirmed','accepted','processing','ready') THEN
    RAISE EXCEPTION 'Courier choice is not available on this order' USING ERRCODE='42501';
  END IF;
  IF p_allow THEN
    INSERT INTO public.courier_order_consents(order_id) VALUES (p_order_id) ON CONFLICT DO NOTHING;
  ELSE
    IF EXISTS (SELECT 1 FROM public.courier_jobs WHERE order_id=p_order_id AND state IN ('claimed','collected','delivered')) THEN
      RAISE EXCEPTION 'An assigned delivery must be changed through support' USING ERRCODE='55000';
    END IF;
    DELETE FROM public.courier_order_consents WHERE order_id=p_order_id;
    UPDATE public.courier_jobs SET state='cancelled',pickup_address=NULL,updated_at=now()
      WHERE order_id=p_order_id AND state IN ('requested','offered');
  END IF;
END $$;

CREATE FUNCTION public.courier_request_for_order(p_order_id uuid,p_pickup_address text,p_parcel_size text,p_ready boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE sale public.orders%ROWTYPE; campus uuid;
BEGIN
  IF NOT public.courier_identity_ok(auth.uid()) OR NOT public.courier_program_accepting() THEN
    RAISE EXCEPTION 'New courier requests are paused' USING ERRCODE='55000';
  END IF;
  SELECT o.* INTO sale FROM public.orders o JOIN public.vendors v ON v.id=o.vendor_id
    WHERE o.id=p_order_id AND v.owner_id=auth.uid() AND v.is_active AND v.is_verified AND v.delivery_available FOR UPDATE OF o;
  IF NOT FOUND OR sale.delivery_method IS DISTINCT FROM 'delivery' OR sale.order_type IS DISTINCT FROM 'product'
    OR sale.status NOT IN ('confirmed','processing','ready') OR COALESCE(sale.delivery_fee,0) < 1
    OR length(COALESCE(btrim(sale.delivery_address->>'line1'),'')) NOT BETWEEN 2 AND 240
    OR NOT EXISTS (SELECT 1 FROM public.courier_order_consents WHERE order_id=sale.id)
    OR NOT public.courier_order_has_payment_arrangement(sale.id) THEN
    RAISE EXCEPTION 'This delivery is not eligible for a courier request' USING ERRCODE='22023';
  END IF;
  IF p_ready IS DISTINCT FROM true OR p_parcel_size IS NULL OR p_parcel_size NOT IN ('small','medium','large')
     OR length(COALESCE(btrim(p_pickup_address),'')) NOT BETWEEN 5 AND 240 THEN
    RAISE EXCEPTION 'Select a parcel size, enter a pickup address and confirm the parcel is ready' USING ERRCODE='22023';
  END IF;
  SELECT COALESCE(sale.university_id,v.university_id) INTO campus FROM public.vendors v WHERE v.id=sale.vendor_id;
  IF campus IS NULL THEN RAISE EXCEPTION 'Associate this shop with a campus first' USING ERRCODE='22023'; END IF;
  INSERT INTO public.courier_jobs(order_id,campus_id,parcel_size,pickup_address)
    VALUES(sale.id,campus,p_parcel_size,btrim(p_pickup_address))
    ON CONFLICT(order_id) DO UPDATE SET state='requested',campus_id=EXCLUDED.campus_id,
      pickup_address=EXCLUDED.pickup_address,parcel_size=EXCLUDED.parcel_size,fee_pesewas=NULL,offer_until=NULL,courier_id=NULL,
      pickup_code=NULL,dropoff_code=NULL,attempts=0,retry_after=NULL,updated_at=now()
    WHERE courier_jobs.state='cancelled';
  IF NOT FOUND THEN RAISE EXCEPTION 'A courier request already exists' USING ERRCODE='55000'; END IF;
  -- Verified prepaid orders may still be in the legacy confirmed state. A shop
  -- that explicitly confirms its parcel is ready can enter processing here.
  IF sale.status='confirmed' THEN
    UPDATE public.orders SET status='processing',accepted_at=COALESCE(accepted_at,now()),updated_at=now() WHERE id=sale.id;
    INSERT INTO public.order_status_history(order_id,previous_status,new_status,changed_by,note)
      VALUES(sale.id,'confirmed','processing',auth.uid(),'Parcel prepared for courier pickup');
  END IF;
END $$;

CREATE FUNCTION public.courier_admin_dispatch(p_order_id uuid,p_action text,p_fee_pesewas integer DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE sale public.orders%ROWTYPE; job public.courier_jobs%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_super_admin() THEN RAISE EXCEPTION 'Courier operations access required' USING ERRCODE='42501'; END IF;
  IF p_action='publish' AND NOT public.courier_program_accepting() THEN
    RAISE EXCEPTION 'New delivery offers are paused' USING ERRCODE='55000';
  END IF;
  SELECT * INTO sale FROM public.orders WHERE id=p_order_id FOR UPDATE;
  SELECT * INTO job FROM public.courier_jobs WHERE order_id=p_order_id FOR UPDATE;
  IF NOT FOUND OR p_action IS NULL OR p_action NOT IN ('publish','cancel') THEN RAISE EXCEPTION 'Courier request unavailable' USING ERRCODE='22023'; END IF;
  IF p_action='publish' THEN
    IF job.state NOT IN ('requested','offered') OR sale.status NOT IN ('processing','ready')
       OR p_fee_pesewas IS NULL OR p_fee_pesewas NOT BETWEEN 100 AND least(100000,floor(COALESCE(sale.delivery_fee,0)*100))
       OR NOT EXISTS (SELECT 1 FROM public.courier_order_consents WHERE order_id=sale.id)
       OR NOT public.courier_order_has_payment_arrangement(sale.id) THEN
      RAISE EXCEPTION 'This offer is unavailable or the fee exceeds the order’s delivery budget' USING ERRCODE='22023';
    END IF;
    UPDATE public.courier_jobs SET state='offered', fee_pesewas=p_fee_pesewas,offer_until=now()+interval '2 hours',updated_at=now() WHERE order_id=sale.id;
  ELSE
    IF job.state NOT IN ('requested','offered','claimed') THEN RAISE EXCEPTION 'An in-transit delivery cannot be cancelled here' USING ERRCODE='55000'; END IF;
    UPDATE public.courier_jobs SET state='cancelled', pickup_address=NULL, pickup_code=NULL,dropoff_code=NULL,updated_at=now() WHERE order_id=sale.id;
  END IF;
  PERFORM public.record_trusted_admin_action('courier.'||p_action,'operations','order',sale.id,
    CASE WHEN p_action='publish' THEN jsonb_build_object('fee_pesewas',p_fee_pesewas) ELSE '{}'::jsonb END);
END $$;

CREATE FUNCTION public.courier_shop_withdraw(p_order_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN
  PERFORM 1 FROM public.orders o JOIN public.vendors v ON v.id=o.vendor_id
    WHERE o.id=p_order_id AND v.owner_id=auth.uid() AND o.status IN ('processing','ready') FOR UPDATE OF o;
  IF NOT FOUND THEN RAISE EXCEPTION 'Shop delivery access required' USING ERRCODE='42501'; END IF;
  UPDATE public.courier_jobs SET state='cancelled',pickup_address=NULL,updated_at=now()
    WHERE order_id=p_order_id AND state IN ('requested','offered');
  IF NOT FOUND THEN RAISE EXCEPTION 'Contact support to change an assigned delivery' USING ERRCODE='55000'; END IF;
END $$;

CREATE FUNCTION public.courier_claim_job(p_order_id uuid,p_expected_fee_pesewas integer) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE uid uuid:=auth.uid(); applicant public.courier_applications%ROWTYPE; sale public.orders%ROWTYPE; job public.courier_jobs%ROWTYPE;
  pickup_pin text; dropoff_pin text;
BEGIN
  IF NOT public.courier_can_work(uid) OR NOT public.courier_program_accepting() THEN
    RAISE EXCEPTION 'Only approved couriers may accept delivery offers' USING ERRCODE='42501';
  END IF;
  SELECT * INTO sale FROM public.orders WHERE id=p_order_id FOR UPDATE;
  SELECT * INTO applicant FROM public.courier_applications WHERE user_id=uid FOR UPDATE;
  SELECT * INTO job FROM public.courier_jobs WHERE order_id=p_order_id FOR UPDATE;
  IF NOT FOUND OR job.state<>'offered' OR job.offer_until<=now() OR sale.status NOT IN ('processing','ready')
    OR applicant.available IS DISTINCT FROM true OR NOT public.courier_can_work(uid) OR applicant.campus_id<>job.campus_id
    OR (job.parcel_size='large' AND applicant.vehicle<>'car') OR (job.parcel_size='medium' AND applicant.vehicle='walking')
    OR sale.buyer_id=uid OR EXISTS (SELECT 1 FROM public.vendors WHERE id=sale.vendor_id AND owner_id=uid)
    OR NOT EXISTS (SELECT 1 FROM public.courier_order_consents WHERE order_id=sale.id)
    OR NOT public.courier_order_has_payment_arrangement(sale.id) THEN
    RAISE EXCEPTION 'This delivery is no longer available to you' USING ERRCODE='55000';
  END IF;
  IF EXISTS (SELECT 1 FROM public.courier_jobs WHERE courier_id=uid AND state IN ('claimed','collected')) THEN
    RAISE EXCEPTION 'Finish your active delivery before accepting another' USING ERRCODE='55000';
  END IF;
  IF applicant.released_at > now() - interval '2 minutes' THEN
    RAISE EXCEPTION 'Wait two minutes after releasing a delivery before claiming another' USING ERRCODE='55000';
  END IF;
  IF job.fee_pesewas IS DISTINCT FROM p_expected_fee_pesewas THEN
    RAISE EXCEPTION 'The delivery fee changed. Review the updated offer before accepting' USING ERRCODE='55000';
  END IF;
  pickup_pin := public.courier_new_handoff_code();
  dropoff_pin := public.courier_new_handoff_code();
  IF pickup_pin=dropoff_pin THEN dropoff_pin:=lpad(((pickup_pin::int+1)%1000000)::text,6,'0'); END IF;
  UPDATE public.courier_jobs SET state='claimed',courier_id=uid,pickup_code=pickup_pin,
    dropoff_code=dropoff_pin,updated_at=now() WHERE order_id=sale.id;
END $$;

CREATE FUNCTION public.courier_release_job(p_order_id uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE uid uuid:=auth.uid();
BEGIN
  IF NOT public.courier_identity_ok(uid) THEN RAISE EXCEPTION 'A confirmed account is required' USING ERRCODE='42501'; END IF;
  PERFORM 1 FROM public.orders WHERE id=p_order_id AND status IN ('processing','ready') FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Only a job you have not collected can be released' USING ERRCODE='55000'; END IF;
  PERFORM 1 FROM public.courier_applications WHERE user_id=uid FOR UPDATE;
  UPDATE public.courier_jobs SET state='offered',courier_id=NULL,pickup_code=NULL,dropoff_code=NULL,
    attempts=0,retry_after=NULL,updated_at=now() WHERE order_id=p_order_id AND courier_id=uid AND state='claimed';
  IF NOT FOUND THEN RAISE EXCEPTION 'Only a job you have not collected can be released' USING ERRCODE='55000'; END IF;
  UPDATE public.courier_applications SET available=false,released_at=now(),updated_at=now() WHERE user_id=uid;
END $$;

CREATE FUNCTION public.courier_record_handoff(p_order_id uuid,p_code text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE uid uuid:=auth.uid(); sale public.orders%ROWTYPE; job public.courier_jobs%ROWTYPE; correct_code text; failed_attempts int;
BEGIN
  IF NOT public.courier_can_work(uid) THEN RAISE EXCEPTION 'Active courier approval required' USING ERRCODE='42501'; END IF;
  SELECT * INTO sale FROM public.orders WHERE id=p_order_id FOR UPDATE;
  SELECT * INTO job FROM public.courier_jobs WHERE order_id=p_order_id AND courier_id=uid FOR UPDATE;
  IF NOT FOUND OR NOT public.courier_can_work(uid)
    OR NOT ((job.state='claimed' AND sale.status IN ('processing','ready')) OR (job.state='collected' AND sale.status='out_for_delivery'))
    OR NOT EXISTS (SELECT 1 FROM public.courier_order_consents WHERE order_id=p_order_id) THEN
    RAISE EXCEPTION 'No active handoff for this delivery' USING ERRCODE='42501';
  END IF;
  IF job.state='claimed' AND NOT public.courier_order_has_payment_arrangement(sale.id) THEN
    RAISE EXCEPTION 'Order payment arrangement changed. Contact support before collecting' USING ERRCODE='55000';
  END IF;
  IF job.retry_after>now() THEN RETURN jsonb_build_object('ok',false,'reason','wait'); END IF;
  correct_code:=CASE WHEN job.state='claimed' THEN job.pickup_code ELSE job.dropoff_code END;
  IF COALESCE(p_code,'') !~ '^[0-9]{6}$' OR p_code IS DISTINCT FROM correct_code THEN
    failed_attempts:=CASE WHEN job.retry_after IS NOT NULL THEN 1 ELSE job.attempts+1 END;
    UPDATE public.courier_jobs SET attempts=failed_attempts,
      retry_after=CASE WHEN failed_attempts>=5 THEN now()+interval '15 minutes' ELSE NULL END WHERE order_id=p_order_id;
    RETURN jsonb_build_object('ok',false,'reason',CASE WHEN failed_attempts>=5 THEN 'wait' ELSE 'code' END);
  END IF;
  IF job.state='claimed' THEN
    UPDATE public.courier_jobs SET state='collected',pickup_code=NULL,attempts=0,retry_after=NULL,updated_at=now() WHERE order_id=sale.id;
    UPDATE public.orders SET status='out_for_delivery',updated_at=now() WHERE id=sale.id;
    INSERT INTO public.order_status_history(order_id,previous_status,new_status,changed_by,note)
      VALUES(sale.id,sale.status,'out_for_delivery',uid,'Courier pickup confirmed');
    INSERT INTO public.order_fulfillment_events(order_id,event_type,recorded_by,note)
      VALUES(sale.id,'dispatched',uid,'Courier pickup confirmed') ON CONFLICT (order_id,event_type) DO NOTHING;
    RETURN jsonb_build_object('ok',true,'state','collected');
  END IF;
  UPDATE public.courier_jobs SET state='delivered',dropoff_code=NULL,pickup_address=NULL,attempts=0,retry_after=NULL,updated_at=now() WHERE order_id=sale.id;
  -- The buyer still confirms receipt through the existing order workflow. No payment or payout is changed here.
  RETURN jsonb_build_object('ok',true,'state','delivered');
END $$;

CREATE FUNCTION public.courier_guard_order_transition() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF NEW.status='out_for_delivery' AND EXISTS(SELECT 1 FROM public.courier_jobs WHERE order_id=NEW.id AND state IN ('requested','offered','claimed')) THEN
      RAISE EXCEPTION 'Use the assigned courier handoff or cancel the courier request first' USING ERRCODE='55000';
    END IF;
    IF NEW.status IN ('completed','fulfilled') AND EXISTS(SELECT 1 FROM public.courier_jobs WHERE order_id=NEW.id AND state IN ('requested','offered','claimed','collected')) THEN
      RAISE EXCEPTION 'Confirm receipt after the courier drop-off' USING ERRCODE='55000';
    END IF;
    IF NEW.status IN ('cancelled','refunded') THEN
      UPDATE public.courier_jobs SET state='cancelled',pickup_address=NULL,pickup_code=NULL,dropoff_code=NULL,updated_at=now()
        WHERE order_id=NEW.id AND state IN ('requested','offered','claimed','collected');
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER courier_owns_active_dispatch BEFORE UPDATE OF status ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.courier_guard_order_transition();

CREATE FUNCTION public.courier_workspace() RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE uid uuid:=auth.uid(); applicant public.courier_applications%ROWTYPE; can_work boolean; program_open boolean; offers jsonb; assignment jsonb;
BEGIN
  IF NOT public.courier_identity_ok(uid) THEN RAISE EXCEPTION 'A confirmed account is required' USING ERRCODE='42501'; END IF;
  program_open:=public.courier_program_is_open();
  SELECT * INTO applicant FROM public.courier_applications WHERE user_id=uid;
  can_work:=public.courier_can_work(uid);
  IF can_work THEN
    SELECT jsonb_build_object('id',j.order_id,'reference',o.order_number,'state',j.state,'campus',u.name,'fee_pesewas',j.fee_pesewas,
      'shop',v.business_name,'shop_phone',v.contact_phone,
      'pickup',CASE WHEN j.state='claimed' THEN j.pickup_address END,
      'dropoff',CASE WHEN j.state='collected' THEN jsonb_build_object(
        'line1',left(o.delivery_address->>'line1',240),'city',left(o.delivery_address->>'city',100),
        'region',left(o.delivery_address->>'region',100),'landmark',left(o.delivery_address->>'landmark',140)) END)
    INTO assignment
    FROM public.courier_jobs j JOIN public.orders o ON o.id=j.order_id JOIN public.universities u ON u.id=j.campus_id
    JOIN public.vendors v ON v.id=o.vendor_id JOIN public.courier_order_consents c ON c.order_id=j.order_id
    WHERE j.courier_id=uid AND j.state IN ('claimed','collected');
    IF program_open AND applicant.available AND assignment IS NULL THEN
      SELECT jsonb_agg(to_jsonb(result)) INTO offers FROM (
        SELECT j.order_id AS id,u.name AS campus,j.parcel_size,j.fee_pesewas,j.offer_until
        FROM public.courier_jobs j JOIN public.universities u ON u.id=j.campus_id JOIN public.orders o ON o.id=j.order_id
        JOIN public.vendors v ON v.id=o.vendor_id JOIN public.courier_order_consents c ON c.order_id=j.order_id
        WHERE j.state='offered' AND j.offer_until>now() AND j.campus_id=applicant.campus_id AND o.status IN ('processing','ready')
          AND o.buyer_id<>uid AND v.owner_id<>uid AND (j.parcel_size<>'large' OR applicant.vehicle='car')
          AND (j.parcel_size<>'medium' OR applicant.vehicle<>'walking')
          AND public.courier_order_has_payment_arrangement(o.id)
        ORDER BY j.offer_until,j.order_id LIMIT 30
      ) result;
    END IF;
  END IF;
  RETURN jsonb_build_object('open',program_open,'can_work',can_work,
    'application',CASE WHEN applicant.user_id IS NOT NULL THEN jsonb_build_object(
      'status',applicant.status,'display_name',applicant.display_name,'phone',applicant.phone,'campus_id',applicant.campus_id,
      'vehicle',applicant.vehicle,'available',applicant.available,'verified_until',applicant.verified_until) END,
    'offers',COALESCE(offers,'[]'::jsonb),'assignment',assignment);
END $$;

CREATE FUNCTION public.courier_order_tracking(p_order_id uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE uid uuid:=auth.uid(); order_record public.orders%ROWTYPE; job public.courier_jobs%ROWTYPE;
  owns_shop boolean; authorized boolean; program_open boolean; contact jsonb;
BEGIN
  IF NOT public.courier_identity_ok(uid) THEN RAISE EXCEPTION 'A confirmed account is required' USING ERRCODE='42501'; END IF;
  SELECT o.* INTO order_record FROM public.orders o WHERE o.id=p_order_id;
  SELECT EXISTS (SELECT 1 FROM public.vendors WHERE id=order_record.vendor_id AND owner_id=uid) INTO owns_shop;
  IF order_record.id IS NULL OR (order_record.buyer_id IS DISTINCT FROM uid AND NOT owns_shop) THEN RAISE EXCEPTION 'Order access denied' USING ERRCODE='42501'; END IF;
  program_open:=public.courier_program_is_open();
  IF order_record.delivery_method IS DISTINCT FROM 'delivery' OR order_record.order_type IS DISTINCT FROM 'product' THEN RETURN NULL; END IF;
  SELECT EXISTS(SELECT 1 FROM public.courier_order_consents WHERE order_id=p_order_id) INTO authorized;
  SELECT * INTO job FROM public.courier_jobs WHERE order_id=p_order_id;
  IF authorized AND job.state IN ('claimed','collected') THEN
    SELECT jsonb_build_object('name',a.display_name,'phone',a.phone) INTO contact
      FROM public.courier_applications a WHERE a.user_id=job.courier_id AND a.status='approved';
  END IF;
  RETURN jsonb_build_object('open',program_open,'authorized',authorized,'state',job.state,'role',CASE WHEN owns_shop THEN 'shop' ELSE 'buyer' END,
    'can_authorize',NOT owns_shop AND order_record.status IN ('pending','confirmed','accepted','processing','ready') AND (program_open OR authorized)
      AND COALESCE(job.state,'none') NOT IN ('claimed','collected','delivered'),
    'can_request',owns_shop AND program_open AND authorized AND order_record.status IN ('confirmed','processing','ready')
      AND order_record.delivery_fee>=1 AND (job.state IS NULL OR job.state='cancelled') AND public.courier_order_has_payment_arrangement(p_order_id),
    'handoff_code',CASE WHEN owns_shop AND job.state='claimed' THEN job.pickup_code
      WHEN NOT owns_shop AND job.state='collected' THEN job.dropoff_code END,'contact',contact);
END $$;

CREATE FUNCTION public.courier_admin_dashboard() RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_super_admin() THEN RAISE EXCEPTION 'Courier operations access required' USING ERRCODE='42501'; END IF;
  RETURN jsonb_build_object('open',public.courier_program_is_open(),
    'applications',(SELECT COALESCE(jsonb_agg(to_jsonb(applicants)),'[]'::jsonb) FROM (
      SELECT a.user_id AS id,a.display_name,a.phone,a.vehicle,a.status,a.verified_until,u.name AS campus
      FROM public.courier_applications a JOIN public.universities u ON u.id=a.campus_id
      ORDER BY (a.status='pending') DESC,a.updated_at DESC LIMIT 100) applicants),
    'jobs',(SELECT COALESCE(jsonb_agg(to_jsonb(dispatch)),'[]'::jsonb) FROM (
      SELECT j.order_id AS id,j.state,j.parcel_size,j.fee_pesewas,j.offer_until,o.order_number AS reference,
        floor(o.delivery_fee*100)::integer AS budget_pesewas,u.name AS campus,v.business_name AS shop,a.display_name AS courier
      FROM public.courier_jobs j JOIN public.orders o ON o.id=j.order_id JOIN public.vendors v ON v.id=o.vendor_id
      JOIN public.universities u ON u.id=j.campus_id LEFT JOIN public.courier_applications a ON a.user_id=j.courier_id
      ORDER BY (j.state='requested') DESC,j.updated_at DESC LIMIT 100) dispatch));
END $$;

REVOKE ALL ON FUNCTION public.courier_program_accepting(), public.courier_identity_ok(uuid),
  public.courier_without_paid_intent(uuid), public.courier_skip_registration_prompt(), public.courier_can_work(uuid),
  public.courier_order_has_payment_arrangement(uuid), public.courier_new_handoff_code(), public.courier_guard_order_transition()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.courier_program_is_open(), public.courier_apply(uuid,text,text,text,boolean),
  public.courier_admin_set_program(boolean,boolean), public.courier_admin_review(uuid,text,date,boolean),
  public.courier_set_available(boolean), public.courier_authorize_for_order(uuid,boolean),
  public.courier_request_for_order(uuid,text,text,boolean), public.courier_admin_dispatch(uuid,text,integer), public.courier_shop_withdraw(uuid),
  public.courier_claim_job(uuid,integer), public.courier_release_job(uuid), public.courier_record_handoff(uuid,text), public.courier_workspace(),
  public.courier_order_tracking(uuid), public.courier_admin_dashboard() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.courier_program_is_open() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.courier_apply(uuid,text,text,text,boolean),
  public.courier_admin_set_program(boolean,boolean), public.courier_admin_review(uuid,text,date,boolean),
  public.courier_set_available(boolean), public.courier_authorize_for_order(uuid,boolean),
  public.courier_request_for_order(uuid,text,text,boolean), public.courier_admin_dispatch(uuid,text,integer), public.courier_shop_withdraw(uuid),
  public.courier_claim_job(uuid,integer), public.courier_release_job(uuid), public.courier_record_handoff(uuid,text), public.courier_workspace(),
  public.courier_order_tracking(uuid), public.courier_admin_dashboard() TO authenticated;

NOTIFY pgrst, 'reload schema';
COMMIT;
