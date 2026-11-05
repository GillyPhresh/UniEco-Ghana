-- Auditable, idempotent weekly referral reward payouts through Paystack.
-- This migration does not initiate transfers or enable the worker.
BEGIN;

CREATE TABLE IF NOT EXISTS public.referral_payout_destinations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE REFERENCES public.profiles(id) ON DELETE RESTRICT,
  account_holder_name text NOT NULL CHECK (length(trim(account_holder_name)) BETWEEN 2 AND 120),
  mobile_number text NOT NULL CHECK (mobile_number ~ '^0[0-9]{9}$'),
  provider_code text NOT NULL CHECK (provider_code IN ('mtn','telecel','airteltigo')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.referral_payout_destinations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.referral_payout_destinations FROM PUBLIC, anon, authenticated, service_role;

CREATE TABLE IF NOT EXISTS public.referral_payouts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  destination_id uuid NOT NULL REFERENCES public.referral_payout_destinations(id) ON DELETE RESTRICT,
  destination_name text NOT NULL CHECK (length(trim(destination_name)) BETWEEN 2 AND 120),
  destination_mobile text NOT NULL CHECK (destination_mobile ~ '^0[0-9]{9}$'),
  destination_provider text NOT NULL CHECK (destination_provider IN ('mtn','telecel','airteltigo')),
  recipient_code text,
  period_start date NOT NULL,
  environment text NOT NULL CHECK (environment IN ('test','live')),
  reference text NOT NULL UNIQUE CHECK (reference ~ '^[a-z0-9_-]{16,50}$'),
  amount numeric(12,2) NOT NULL CHECK (amount > 0),
  currency text NOT NULL DEFAULT 'GHS' CHECK (currency = 'GHS'),
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','processing','pending','reconciliation_required','succeeded','failed','reversed')),
  transfer_code text,
  provider_reference text,
  failure_code text,
  claim_run uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  UNIQUE (user_id, period_start, environment),
  CHECK (recipient_code IS NULL OR recipient_code ~ '^RCP_[A-Za-z0-9]+$')
);
CREATE INDEX IF NOT EXISTS referral_payouts_worker_idx ON public.referral_payouts(status, updated_at);
ALTER TABLE public.referral_payouts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.referral_payouts FROM PUBLIC, anon, authenticated, service_role;

CREATE TABLE IF NOT EXISTS public.referral_payout_allocations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payout_id uuid NOT NULL REFERENCES public.referral_payouts(id) ON DELETE RESTRICT,
  student_reward_id uuid REFERENCES public.student_referral_rewards(id) ON DELETE RESTRICT,
  vendor_reward_id uuid REFERENCES public.vendor_referral_rewards(id) ON DELETE RESTRICT,
  amount numeric(12,2) NOT NULL CHECK (amount > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (num_nonnulls(student_reward_id, vendor_reward_id) = 1)
);
-- Preserve allocation history while allowing a definitively failed reward to be
-- allocated into a later weekly payout. Reward status + row locks prevent overlap.
CREATE UNIQUE INDEX IF NOT EXISTS referral_payout_alloc_student_uidx ON public.referral_payout_allocations(payout_id,student_reward_id) WHERE student_reward_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS referral_payout_alloc_vendor_uidx ON public.referral_payout_allocations(payout_id,vendor_reward_id) WHERE vendor_reward_id IS NOT NULL;
ALTER TABLE public.referral_payout_allocations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.referral_payout_allocations FROM PUBLIC, anon, authenticated, service_role;

CREATE TABLE IF NOT EXISTS public.referral_payout_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payout_id uuid NOT NULL REFERENCES public.referral_payouts(id) ON DELETE RESTRICT,
  event_type text NOT NULL CHECK (event_type IN ('queued','submitted','verified_pending','succeeded','failed','reversed','reconciliation_required')),
  provider_reference text,
  payload_hash text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS referral_payout_events_payout_idx ON public.referral_payout_events(payout_id, created_at DESC);
ALTER TABLE public.referral_payout_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.referral_payout_events FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.save_my_referral_payout_destination(p_name text, p_mobile text, p_provider text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE uid uuid := auth.uid(); mobile text := regexp_replace(COALESCE(p_mobile,''), '[^0-9]', '', 'g'); app_role text := public.current_app_role();
BEGIN
  IF uid IS NULL OR app_role IS NULL OR app_role NOT IN ('student','student_vendor','external_vendor') THEN
    RAISE EXCEPTION 'Registered student or vendor access required' USING ERRCODE='42501';
  END IF;
  IF length(mobile)=12 AND left(mobile,3)='233' THEN mobile := '0'||right(mobile,9); END IF;
  IF length(trim(COALESCE(p_name,''))) NOT BETWEEN 2 AND 120 OR mobile !~ '^0[0-9]{9}$'
    OR p_provider IS NULL OR p_provider NOT IN ('mtn','telecel','airteltigo') THEN
    RAISE EXCEPTION 'Check the account name, Ghana mobile number, and network' USING ERRCODE='22023';
  END IF;
  INSERT INTO public.referral_payout_destinations(user_id,account_holder_name,mobile_number,provider_code)
  VALUES(uid,trim(p_name),mobile,p_provider)
  ON CONFLICT(user_id) DO UPDATE SET account_holder_name=EXCLUDED.account_holder_name,
    mobile_number=EXCLUDED.mobile_number, provider_code=EXCLUDED.provider_code, updated_at=now();
  RETURN jsonb_build_object('saved',true,'provider',p_provider,'mobile_suffix',right(mobile,4),'updated_at',now());
END $$;

CREATE OR REPLACE FUNCTION public.get_my_referral_payout_overview()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog, public AS $$
DECLARE uid uuid := auth.uid(); result jsonb;
BEGIN
  IF uid IS NULL OR COALESCE(public.current_app_role() IN ('student','student_vendor','external_vendor'),false) IS NOT TRUE THEN
    RAISE EXCEPTION 'Registered student or vendor access required' USING ERRCODE='42501';
  END IF;
  SELECT jsonb_build_object(
    'destination',(SELECT jsonb_build_object('name',d.account_holder_name,'provider',d.provider_code,
      'mobile_suffix',right(d.mobile_number,4),'updated_at',d.updated_at)
      FROM public.referral_payout_destinations d WHERE d.user_id=uid),
    'minimum_payout',COALESCE((SELECT s.minimum_payout FROM public.student_financial_settings s WHERE s.singleton),10),
    'payouts',COALESCE((SELECT jsonb_agg(jsonb_build_object('created_at',p.created_at,'amount',p.amount,
      'currency',p.currency,'status',p.status,'reference',p.reference,'completed_at',p.completed_at)
      ORDER BY p.created_at DESC) FROM (SELECT * FROM public.referral_payouts WHERE user_id=uid
      ORDER BY created_at DESC LIMIT 30) p),'[]'::jsonb)
  ) INTO result;
  RETURN result;
END $$;

-- Service-only reservation. Rewards and destination are snapshotted atomically;
-- concurrent weekly runs serialize per owner and the unique key is a backstop.
CREATE OR REPLACE FUNCTION public.reserve_weekly_referral_payouts(p_period_start date, p_environment text)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog, public AS $$
DECLARE owner_row record; student_ids uuid[]; vendor_ids uuid[]; student_total numeric(12,2);
  vendor_total numeric(12,2); combined numeric(12,2); threshold numeric(12,2);
  new_payout_id uuid; payout_reference text; reserved integer := 0;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'Service access required' USING ERRCODE='42501'; END IF;
  -- Never let a test-mode reservation consume production reward ledger rows.
  IF p_environment IS DISTINCT FROM 'live' OR p_period_start IS NULL
    OR extract(isodow FROM p_period_start) <> 1 OR p_period_start > date_trunc('week',current_date)::date THEN
    RAISE EXCEPTION 'Invalid weekly payout period or environment' USING ERRCODE='22023';
  END IF;
  SELECT minimum_payout INTO threshold FROM public.student_financial_settings WHERE singleton;
  threshold := COALESCE(threshold,10);
  FOR owner_row IN
    SELECT DISTINCT c.user_id FROM (
      SELECT r.referrer_user_id user_id FROM public.student_referral_rewards r WHERE r.status='available' AND r.available_at<=now()
      UNION ALL SELECT r.referrer_user_id FROM public.vendor_referral_rewards r WHERE r.status='available' AND r.available_at<=now()
    ) c JOIN public.referral_payout_destinations d ON d.user_id=c.user_id ORDER BY c.user_id LIMIT 500
  LOOP
    PERFORM pg_advisory_xact_lock(hashtextextended(owner_row.user_id::text,0));
    IF EXISTS (SELECT 1 FROM public.referral_payouts p WHERE p.user_id=owner_row.user_id AND p.period_start=p_period_start AND p.environment=p_environment) THEN CONTINUE; END IF;
    student_ids := ARRAY[]::uuid[]; vendor_ids := ARRAY[]::uuid[]; student_total := 0; vendor_total := 0; new_payout_id := NULL;
    SELECT COALESCE(array_agg(x.id),ARRAY[]::uuid[]),COALESCE(sum(x.amount),0) INTO student_ids,student_total
      FROM (SELECT id,amount FROM public.student_referral_rewards WHERE referrer_user_id=owner_row.user_id
        AND status='available' AND available_at<=now() ORDER BY available_at,id FOR UPDATE SKIP LOCKED) x;
    SELECT COALESCE(array_agg(x.id),ARRAY[]::uuid[]),COALESCE(sum(x.amount),0) INTO vendor_ids,vendor_total
      FROM (SELECT id,amount FROM public.vendor_referral_rewards WHERE referrer_user_id=owner_row.user_id
        AND status='available' AND available_at<=now() ORDER BY available_at,id FOR UPDATE SKIP LOCKED) x;
    combined := student_total+vendor_total;
    IF combined < threshold OR combined <= 0 THEN CONTINUE; END IF;
    payout_reference := 'ue_ref_'||replace(owner_row.user_id::text,'-','')||to_char(p_period_start,'YYYYMMDD');
    INSERT INTO public.referral_payouts(user_id,destination_id,destination_name,destination_mobile,destination_provider,
      period_start,environment,reference,amount)
      SELECT owner_row.user_id,d.id,d.account_holder_name,d.mobile_number,d.provider_code,p_period_start,p_environment,payout_reference,combined
      FROM public.referral_payout_destinations d WHERE d.user_id=owner_row.user_id
      ON CONFLICT(user_id,period_start,environment) DO NOTHING RETURNING id INTO new_payout_id;
    IF new_payout_id IS NULL THEN CONTINUE; END IF;
    INSERT INTO public.referral_payout_allocations(payout_id,student_reward_id,amount)
      SELECT new_payout_id,r.id,r.amount FROM public.student_referral_rewards r WHERE r.id=ANY(student_ids);
    INSERT INTO public.referral_payout_allocations(payout_id,vendor_reward_id,amount)
      SELECT new_payout_id,r.id,r.amount FROM public.vendor_referral_rewards r WHERE r.id=ANY(vendor_ids);
    UPDATE public.student_referral_rewards SET status='payout_pending',updated_at=now() WHERE id=ANY(student_ids);
    UPDATE public.vendor_referral_rewards SET status='payout_pending',updated_at=now() WHERE id=ANY(vendor_ids);
    INSERT INTO public.referral_payout_events(payout_id,event_type) VALUES(new_payout_id,'queued');
    reserved := reserved+1;
  END LOOP;
  RETURN reserved;
END $$;

-- Each payout is claimed at most once per invocation. A queued payout may be
-- submitted; every later state can only be verified, never POSTed again.
CREATE OR REPLACE FUNCTION public.claim_referral_payout_for_worker(p_run_id uuid,p_environment text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog, public AS $$
DECLARE payout public.referral_payouts%ROWTYPE; next_action text;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'Service access required' USING ERRCODE='42501'; END IF;
  IF p_run_id IS NULL OR p_environment IS DISTINCT FROM 'live' THEN RAISE EXCEPTION 'Live worker run required' USING ERRCODE='22023'; END IF;
  SELECT * INTO payout FROM public.referral_payouts WHERE environment=p_environment AND status='queued' AND claim_run IS DISTINCT FROM p_run_id
    ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT 1;
  IF FOUND THEN next_action:='submit';
  ELSE
    SELECT * INTO payout FROM public.referral_payouts WHERE environment=p_environment AND
      (status IN ('pending','reconciliation_required') OR (status='processing' AND updated_at < now()-interval '2 minutes'))
      AND claim_run IS DISTINCT FROM p_run_id ORDER BY updated_at FOR UPDATE SKIP LOCKED LIMIT 1;
    IF NOT FOUND THEN RETURN NULL; END IF;
    next_action:='verify';
  END IF;
  UPDATE public.referral_payouts SET status='processing',claim_run=p_run_id,updated_at=now() WHERE id=payout.id RETURNING * INTO payout;
  IF next_action='submit' THEN INSERT INTO public.referral_payout_events(payout_id,event_type) VALUES(payout.id,'submitted'); END IF;
  RETURN jsonb_build_object('id',payout.id,'amount',payout.amount,'currency',payout.currency,'reference',payout.reference,
    'environment',payout.environment,'action',next_action,'transfer_code',payout.transfer_code,
    'recipient_code',payout.recipient_code,'name',payout.destination_name,'mobile',payout.destination_mobile,'provider',payout.destination_provider);
END $$;

CREATE OR REPLACE FUNCTION public.store_referral_paystack_recipient(p_payout_id uuid,p_recipient_code text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog, public AS $$
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'Service access required' USING ERRCODE='42501'; END IF;
  IF p_payout_id IS NULL OR p_recipient_code IS NULL OR p_recipient_code !~ '^RCP_[A-Za-z0-9]+$' THEN RAISE EXCEPTION 'Invalid recipient' USING ERRCODE='22023'; END IF;
  UPDATE public.referral_payouts SET recipient_code=p_recipient_code,updated_at=now()
    WHERE id=p_payout_id AND status='processing' AND recipient_code IS NULL;
  IF NOT FOUND AND NOT EXISTS(SELECT 1 FROM public.referral_payouts WHERE id=p_payout_id AND recipient_code=p_recipient_code) THEN
    RAISE EXCEPTION 'Payout recipient could not be stored' USING ERRCODE='P0002';
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.record_referral_paystack_result(
  p_payout_id uuid,p_status text,p_transfer_code text DEFAULT NULL,p_provider_reference text DEFAULT NULL,p_failure_code text DEFAULT NULL
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog, public AS $$
DECLARE payout public.referral_payouts%ROWTYPE; reward_status text; event_kind text;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'Service access required' USING ERRCODE='42501'; END IF;
  IF p_payout_id IS NULL OR p_status IS NULL OR p_status NOT IN ('pending','succeeded','failed','reversed','reconciliation_required') THEN RAISE EXCEPTION 'Invalid transfer result' USING ERRCODE='22023'; END IF;
  SELECT * INTO payout FROM public.referral_payouts WHERE id=p_payout_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Payout not found' USING ERRCODE='P0002'; END IF;
  IF payout.status IN ('succeeded','failed','reversed') THEN
    IF payout.status=p_status THEN RETURN; END IF;
    IF NOT (payout.status='succeeded' AND p_status='reversed') THEN RAISE EXCEPTION 'Conflicting final transfer result' USING ERRCODE='22023'; END IF;
  END IF;
  UPDATE public.referral_payouts SET status=p_status,transfer_code=COALESCE(p_transfer_code,transfer_code),
    provider_reference=COALESCE(p_provider_reference,provider_reference),failure_code=left(p_failure_code,120),updated_at=now(),
    completed_at=CASE WHEN p_status IN ('succeeded','failed','reversed') THEN now() ELSE completed_at END
    WHERE id=p_payout_id;
  IF p_status='succeeded' THEN reward_status:='paid'; event_kind:='succeeded';
  ELSIF p_status='failed' THEN reward_status:='available'; event_kind:='failed';
  ELSIF p_status='reversed' THEN reward_status:='reconciliation_required'; event_kind:='reversed';
  ELSIF p_status='pending' THEN reward_status:=NULL; event_kind:='verified_pending';
  ELSE reward_status:='reconciliation_required'; event_kind:='reconciliation_required'; END IF;
  IF reward_status IS NOT NULL THEN
    UPDATE public.student_referral_rewards r SET status=reward_status,updated_at=now(),paid_at=CASE WHEN reward_status='paid' THEN now() ELSE paid_at END
      FROM public.referral_payout_allocations a WHERE a.payout_id=p_payout_id AND a.student_reward_id=r.id;
    UPDATE public.vendor_referral_rewards r SET status=reward_status,updated_at=now(),paid_at=CASE WHEN reward_status='paid' THEN now() ELSE paid_at END
      FROM public.referral_payout_allocations a WHERE a.payout_id=p_payout_id AND a.vendor_reward_id=r.id;
  END IF;
  INSERT INTO public.referral_payout_events(payout_id,event_type,provider_reference) VALUES(p_payout_id,event_kind,left(p_provider_reference,120));
END $$;

REVOKE ALL ON FUNCTION public.save_my_referral_payout_destination(text,text,text) FROM PUBLIC,anon,service_role;
REVOKE ALL ON FUNCTION public.get_my_referral_payout_overview() FROM PUBLIC,anon,service_role;
REVOKE ALL ON FUNCTION public.reserve_weekly_referral_payouts(date,text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.claim_referral_payout_for_worker(uuid,text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.store_referral_paystack_recipient(uuid,text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.record_referral_paystack_result(uuid,text,text,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.save_my_referral_payout_destination(text,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_referral_payout_overview() TO authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_weekly_referral_payouts(date,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.claim_referral_payout_for_worker(uuid,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.store_referral_paystack_recipient(uuid,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.record_referral_paystack_result(uuid,text,text,text,text) TO service_role;
COMMIT;
