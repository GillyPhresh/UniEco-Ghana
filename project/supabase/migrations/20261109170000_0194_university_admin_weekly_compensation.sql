-- Weekly GH₵2 compensation for each qualified university-admin registration.
-- Earnings join the existing weekly referral payout queue, destination setup,
-- minimum threshold, provider verification and idempotent transfer records.
-- No transfer is initiated by this migration.
BEGIN;

ALTER TABLE public.university_admin_compensation_settings
  ADD COLUMN IF NOT EXISTS weekly_payouts_start_at timestamptz NOT NULL DEFAULT now();

UPDATE public.university_admin_compensation_settings
SET rate_per_qualified_registration = 2.00,
    weekly_payouts_start_at = COALESCE(weekly_payouts_start_at, now());

ALTER TABLE public.university_admin_compensation_settings
  DROP CONSTRAINT IF EXISTS university_admin_compensation_settings_rate_per_qualified_registration_check;
ALTER TABLE public.university_admin_compensation_settings
  ADD CONSTRAINT university_admin_compensation_rate_fixed_check
  CHECK (rate_per_qualified_registration = 2.00);

CREATE TABLE IF NOT EXISTS public.university_admin_earnings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id uuid NOT NULL REFERENCES public.university_admin_assignments(id) ON DELETE RESTRICT,
  university_id uuid NOT NULL REFERENCES public.universities(id) ON DELETE RESTRICT,
  period_start date NOT NULL,
  period_end date NOT NULL,
  period_type text NOT NULL DEFAULT 'weekly' CHECK (period_type IN ('weekly','legacy_monthly')),
  student_count integer NOT NULL DEFAULT 0 CHECK (student_count >= 0),
  vendor_count integer NOT NULL DEFAULT 0 CHECK (vendor_count >= 0),
  qualified_count integer NOT NULL DEFAULT 0 CHECK (qualified_count >= 0),
  rate_per_registration numeric(12,2) NOT NULL DEFAULT 2.00 CHECK (rate_per_registration = 2.00),
  amount numeric(12,2) NOT NULL CHECK (amount >= 0),
  currency text NOT NULL DEFAULT 'GHS' CHECK (currency = 'GHS'),
  status text NOT NULL DEFAULT 'available'
    CHECK (status IN ('available','payout_pending','paid','failed','reversed','reconciliation_required')),
  available_at timestamptz NOT NULL,
  source_monthly_earning_id uuid UNIQUE REFERENCES public.university_admin_monthly_earnings(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  paid_at timestamptz,
  CHECK (period_end > period_start),
  CHECK ((period_type = 'weekly' AND period_end = period_start + 7) OR period_type = 'legacy_monthly'),
  UNIQUE (assignment_id, period_start, period_end)
);
CREATE INDEX IF NOT EXISTS university_admin_earnings_weekly_queue_idx
  ON public.university_admin_earnings(status, available_at, assignment_id);
CREATE INDEX IF NOT EXISTS university_admin_earnings_user_period_idx
  ON public.university_admin_earnings(assignment_id, period_start DESC);
ALTER TABLE public.university_admin_earnings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.university_admin_earnings FROM PUBLIC, anon, authenticated, service_role;

-- Preserve already-approved monthly obligations; do not promote unapproved drafts.
INSERT INTO public.university_admin_earnings(
  assignment_id, university_id, period_start, period_end, period_type,
  student_count, vendor_count, qualified_count, rate_per_registration,
  amount, currency, status, available_at, source_monthly_earning_id
)
SELECT assignment_id, university_id, month_start, month_end, 'legacy_monthly',
  student_count, vendor_count, qualified_count, 2.00,
  amount, currency, 'available', now(), id
FROM public.university_admin_monthly_earnings
WHERE status = 'approved'
ON CONFLICT DO NOTHING;

ALTER TABLE public.referral_payout_allocations
  ADD COLUMN IF NOT EXISTS university_admin_earning_id uuid
    REFERENCES public.university_admin_earnings(id) ON DELETE RESTRICT;
DO $migration$
DECLARE constraint_row record;
BEGIN
  FOR constraint_row IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'public.referral_payout_allocations'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%num_nonnulls%'
  LOOP
    EXECUTE format('ALTER TABLE public.referral_payout_allocations DROP CONSTRAINT %I', constraint_row.conname);
  END LOOP;
END
$migration$;
ALTER TABLE public.referral_payout_allocations
  ADD CONSTRAINT referral_payout_allocations_one_source_check
  CHECK (num_nonnulls(student_reward_id, vendor_reward_id, university_admin_earning_id) = 1);
CREATE UNIQUE INDEX IF NOT EXISTS referral_payout_alloc_admin_uidx
  ON public.referral_payout_allocations(payout_id, university_admin_earning_id)
  WHERE university_admin_earning_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.set_university_admin_compensation_rate(p_rate numeric)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $func$
DECLARE actor uuid := auth.uid(); changed public.university_admin_compensation_settings%ROWTYPE;
BEGIN
  IF actor IS NULL OR NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Super administrator access required' USING ERRCODE = '42501';
  END IF;
  IF p_rate IS DISTINCT FROM 2.00 THEN
    RAISE EXCEPTION 'University administrator compensation is fixed at GH₵2.00 per qualified registration' USING ERRCODE = '22023';
  END IF;
  UPDATE public.university_admin_compensation_settings
  SET rate_per_qualified_registration = 2.00, updated_at = now(), updated_by = actor
  WHERE singleton RETURNING * INTO changed;
  INSERT INTO public.audit_logs(actor_id,action,entity_type,metadata)
  VALUES(actor,'university_admin_compensation_rate_confirmed','university_admin_compensation_settings',
    jsonb_build_object('rate_per_qualified_registration',2.00,'currency',changed.currency));
  RETURN jsonb_build_object('rate_per_qualified_registration',2.00,'currency',changed.currency,'updated_at',changed.updated_at);
END $func$;
REVOKE ALL ON FUNCTION public.set_university_admin_compensation_rate(numeric) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.set_university_admin_compensation_rate(numeric) TO authenticated;

-- The shared destination is still private; administrators can save one only
-- when they have an appointment, and the existing API reveals only a suffix.
CREATE OR REPLACE FUNCTION public.save_my_referral_payout_destination(p_name text, p_mobile text, p_provider text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $func$
DECLARE uid uuid := auth.uid(); mobile text := regexp_replace(COALESCE(p_mobile,''), '[^0-9]', '', 'g'); app_role text := public.current_app_role();
BEGIN
  IF uid IS NULL OR app_role IS NULL OR app_role NOT IN ('student','student_vendor','external_vendor','university_admin') THEN
    RAISE EXCEPTION 'Registered payout-program participant required' USING ERRCODE='42501';
  END IF;
  IF app_role = 'university_admin' AND NOT EXISTS (
    SELECT 1 FROM public.university_admin_assignments WHERE user_id=uid AND status='active'
  ) THEN RAISE EXCEPTION 'University administrator appointment required' USING ERRCODE='42501'; END IF;
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
END $func$;

CREATE OR REPLACE FUNCTION public.get_my_referral_payout_overview()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog, public AS $func$
DECLARE uid uuid := auth.uid(); app_role text := public.current_app_role(); result jsonb;
BEGIN
  IF uid IS NULL OR COALESCE(app_role IN ('student','student_vendor','external_vendor'),false) IS NOT TRUE
    AND (app_role IS DISTINCT FROM 'university_admin' OR NOT EXISTS (
      SELECT 1 FROM public.university_admin_assignments WHERE user_id=uid AND status='active'
    )) THEN
    RAISE EXCEPTION 'Registered payout-program participant required' USING ERRCODE='42501';
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
END $func$;

CREATE OR REPLACE FUNCTION public.reserve_weekly_referral_payouts(p_period_start date, p_environment text)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog, public AS $func$
DECLARE owner_row record; student_ids uuid[]; vendor_ids uuid[]; admin_ids uuid[];
  student_total numeric(12,2); vendor_total numeric(12,2); admin_total numeric(12,2);
  combined numeric(12,2); threshold numeric(12,2); new_payout_id uuid;
  payout_reference text; reserved integer := 0; settings_row public.university_admin_compensation_settings%ROWTYPE;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'Service access required' USING ERRCODE='42501'; END IF;
  IF p_environment IS DISTINCT FROM 'live' OR p_period_start IS NULL
    OR extract(isodow FROM p_period_start) <> 1 OR p_period_start > date_trunc('week',current_date)::date THEN
    RAISE EXCEPTION 'Invalid weekly payout period or environment' USING ERRCODE='22023';
  END IF;
  SELECT minimum_payout INTO threshold FROM public.student_financial_settings WHERE singleton;
  threshold := COALESCE(threshold,10);

  -- Create a single immutable GH₵2 earning for each completed Accra week.
  -- Settlement starts seven days after the last qualification in that week,
  -- matching referral reward review, then waits for the next weekly run.
  SELECT * INTO settings_row FROM public.university_admin_compensation_settings WHERE singleton;
  INSERT INTO public.university_admin_earnings(
    assignment_id,university_id,period_start,period_end,period_type,
    student_count,vendor_count,qualified_count,rate_per_registration,amount,currency,status,available_at
  )
  SELECT assignment.id,assignment.university_id,weekly.period_start,weekly.period_start+7,'weekly',
    weekly.student_count,weekly.vendor_count,weekly.qualified_count,2.00,weekly.qualified_count*2.00,'GHS','available',
    weekly.last_qualified_at + interval '7 days'
  FROM (
    SELECT referral.assignment_id,
      date_trunc('week',referral.qualified_at AT TIME ZONE 'Africa/Accra')::date AS period_start,
      count(*) FILTER (WHERE referral.registration_type IN ('student','student_vendor'))::integer AS student_count,
      count(*) FILTER (WHERE referral.registration_type IN ('vendor','student_vendor'))::integer AS vendor_count,
      count(*)::integer AS qualified_count,
      max(referral.qualified_at) AS last_qualified_at
    FROM public.university_admin_referrals referral
    WHERE referral.status='qualified'
      AND referral.qualified_at >= settings_row.weekly_payouts_start_at
      AND referral.qualified_at IS NOT NULL
    GROUP BY referral.assignment_id,date_trunc('week',referral.qualified_at AT TIME ZONE 'Africa/Accra')::date
  ) weekly
  JOIN public.university_admin_assignments assignment ON assignment.id=weekly.assignment_id
  WHERE weekly.period_start + 7 <= p_period_start
    AND weekly.qualified_count > 0
  ON CONFLICT (assignment_id,period_start,period_end) DO NOTHING;

  FOR owner_row IN
    SELECT DISTINCT c.user_id FROM (
      SELECT r.referrer_user_id user_id FROM public.student_referral_rewards r WHERE r.status='available' AND r.available_at<=now()
      UNION ALL SELECT r.referrer_user_id FROM public.vendor_referral_rewards r WHERE r.status='available' AND r.available_at<=now()
      UNION ALL SELECT a.user_id FROM public.university_admin_earnings e
        JOIN public.university_admin_assignments a ON a.id=e.assignment_id
        WHERE e.status='available' AND e.available_at<=now()
    ) c JOIN public.referral_payout_destinations d ON d.user_id=c.user_id ORDER BY c.user_id LIMIT 500
  LOOP
    PERFORM pg_advisory_xact_lock(hashtextextended(owner_row.user_id::text,0));
    IF EXISTS (SELECT 1 FROM public.referral_payouts p WHERE p.user_id=owner_row.user_id AND p.period_start=p_period_start AND p.environment=p_environment) THEN CONTINUE; END IF;
    student_ids := ARRAY[]::uuid[]; vendor_ids := ARRAY[]::uuid[]; admin_ids := ARRAY[]::uuid[];
    student_total := 0; vendor_total := 0; admin_total := 0; new_payout_id := NULL;
    SELECT COALESCE(array_agg(x.id),ARRAY[]::uuid[]),COALESCE(sum(x.amount),0) INTO student_ids,student_total
      FROM (SELECT id,amount FROM public.student_referral_rewards WHERE referrer_user_id=owner_row.user_id
        AND status='available' AND available_at<=now() ORDER BY available_at,id FOR UPDATE SKIP LOCKED) x;
    SELECT COALESCE(array_agg(x.id),ARRAY[]::uuid[]),COALESCE(sum(x.amount),0) INTO vendor_ids,vendor_total
      FROM (SELECT id,amount FROM public.vendor_referral_rewards WHERE referrer_user_id=owner_row.user_id
        AND status='available' AND available_at<=now() ORDER BY available_at,id FOR UPDATE SKIP LOCKED) x;
    SELECT COALESCE(array_agg(x.id),ARRAY[]::uuid[]),COALESCE(sum(x.amount),0) INTO admin_ids,admin_total
      FROM (SELECT e.id,e.amount FROM public.university_admin_earnings e
        JOIN public.university_admin_assignments a ON a.id=e.assignment_id
        WHERE a.user_id=owner_row.user_id AND e.status='available' AND e.available_at<=now()
        ORDER BY e.available_at,e.id FOR UPDATE OF e SKIP LOCKED) x;
    combined := student_total+vendor_total+admin_total;
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
    INSERT INTO public.referral_payout_allocations(payout_id,university_admin_earning_id,amount)
      SELECT new_payout_id,e.id,e.amount FROM public.university_admin_earnings e WHERE e.id=ANY(admin_ids);
    UPDATE public.student_referral_rewards SET status='payout_pending',updated_at=now() WHERE id=ANY(student_ids);
    UPDATE public.vendor_referral_rewards SET status='payout_pending',updated_at=now() WHERE id=ANY(vendor_ids);
    UPDATE public.university_admin_earnings SET status='payout_pending',updated_at=now() WHERE id=ANY(admin_ids);
    INSERT INTO public.referral_payout_events(payout_id,event_type) VALUES(new_payout_id,'queued');
    reserved := reserved+1;
  END LOOP;
  RETURN reserved;
END $func$;

CREATE OR REPLACE FUNCTION public.record_referral_paystack_result(
  p_payout_id uuid,p_status text,p_transfer_code text DEFAULT NULL,p_provider_reference text DEFAULT NULL,p_failure_code text DEFAULT NULL
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog, public AS $func$
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
    UPDATE public.university_admin_earnings e SET status=reward_status,updated_at=now(),paid_at=CASE WHEN reward_status='paid' THEN now() ELSE paid_at END
      FROM public.referral_payout_allocations a WHERE a.payout_id=p_payout_id AND a.university_admin_earning_id=e.id;
  END IF;
  INSERT INTO public.referral_payout_events(payout_id,event_type,provider_reference) VALUES(p_payout_id,event_kind,left(p_provider_reference,120));
END $func$;

CREATE OR REPLACE FUNCTION public.get_my_university_admin_weekly_earnings(p_university_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog, public AS $func$
DECLARE actor uuid := auth.uid(); selected_university uuid; assignment_ids uuid[];
  week_start date := date_trunc('week',now() AT TIME ZONE 'Africa/Accra')::date;
  students integer; vendors integer; qualified integer; history_rows jsonb;
BEGIN
  IF actor IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501'; END IF;
  SELECT assignment.university_id INTO selected_university FROM public.university_admin_assignments assignment
  WHERE assignment.user_id=actor AND assignment.status='active'
    AND (p_university_id IS NULL OR assignment.university_id=p_university_id)
  ORDER BY assignment.university_id,assignment.id LIMIT 1;
  IF selected_university IS NULL THEN RAISE EXCEPTION 'Active university administrator assignment required' USING ERRCODE='42501'; END IF;
  SELECT array_agg(id) INTO assignment_ids FROM public.university_admin_assignments
  WHERE user_id=actor AND status='active' AND university_id=selected_university;
  SELECT count(*) FILTER (WHERE registration_type IN ('student','student_vendor'))::integer,
    count(*) FILTER (WHERE registration_type IN ('vendor','student_vendor'))::integer,count(*)::integer
  INTO students,vendors,qualified FROM public.university_admin_referrals
  WHERE assignment_id=ANY(assignment_ids) AND status='qualified'
    AND qualified_at >= (week_start::timestamp AT TIME ZONE 'Africa/Accra')
    AND qualified_at < ((week_start+7)::timestamp AT TIME ZONE 'Africa/Accra');
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'period_start',earning.period_start,'period_end',earning.period_end,'period_type',earning.period_type,
    'student_count',earning.student_count,'vendor_count',earning.vendor_count,
    'qualified_count',earning.qualified_count,'amount',earning.amount,'currency',earning.currency,
    'status',earning.status,'available_at',earning.available_at,'paid_at',earning.paid_at
  ) ORDER BY earning.period_start DESC),'[]'::jsonb) INTO history_rows
  FROM (SELECT * FROM public.university_admin_earnings WHERE assignment_id=ANY(assignment_ids)
    ORDER BY period_start DESC LIMIT 16) earning;
  RETURN jsonb_build_object('university_id',selected_university,'week_start',week_start,'week_end',week_start+7,
    'student_count',COALESCE(students,0),'vendor_count',COALESCE(vendors,0),'qualified_count',COALESCE(qualified,0),
    'rate_per_registration',2.00,'estimated_amount',COALESCE(qualified,0)*2.00,'currency','GHS',
    'review_days',7,'minimum_payout',COALESCE((SELECT minimum_payout FROM public.student_financial_settings WHERE singleton),10),
    'history',history_rows);
END $func$;

CREATE OR REPLACE FUNCTION public.get_university_admin_weekly_payroll(p_week_start date)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog, public AS $func$
DECLARE rows_value jsonb; threshold numeric(12,2);
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_super_admin() THEN RAISE EXCEPTION 'Super administrator access required' USING ERRCODE='42501'; END IF;
  IF p_week_start IS NULL OR extract(isodow FROM p_week_start) <> 1 THEN RAISE EXCEPTION 'Choose a Monday as the week start' USING ERRCODE='22023'; END IF;
  SELECT minimum_payout INTO threshold FROM public.student_financial_settings WHERE singleton;
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'earning_id',earning.id,'assignment_id',assignment.id,'administrator_name',COALESCE(NULLIF(trim(profile.full_name),''),'University Administrator'),
    'administrator_email',profile.email,'university_name',university.name,'period_start',p_week_start,'period_end',p_week_start+7,
    'student_count',COALESCE(earning.student_count,counts.student_count),'vendor_count',COALESCE(earning.vendor_count,counts.vendor_count),
    'qualified_count',COALESCE(earning.qualified_count,counts.qualified_count),'rate_per_registration',2.00,
    'amount',COALESCE(earning.amount,counts.qualified_count*2.00),'currency','GHS',
    'status',COALESCE(earning.status,CASE WHEN counts.qualified_count>0 THEN 'review_period' ELSE 'no_earnings' END),
    'available_at',earning.available_at,'payout_status',payout.status,'payout_reference',payout.reference,'paid_at',earning.paid_at
  ) ORDER BY university.name,profile.full_name),'[]'::jsonb) INTO rows_value
  FROM public.university_admin_assignments assignment
  JOIN public.profiles profile ON profile.id=assignment.user_id
  JOIN public.universities university ON university.id=assignment.university_id
  LEFT JOIN public.university_admin_earnings earning
    ON earning.assignment_id=assignment.id AND earning.period_type='weekly' AND earning.period_start=p_week_start
  LEFT JOIN public.referral_payout_allocations allocation ON allocation.university_admin_earning_id=earning.id
  LEFT JOIN public.referral_payouts payout ON payout.id=allocation.payout_id
  CROSS JOIN LATERAL (
    SELECT count(referral.id) FILTER (WHERE referral.registration_type IN ('student','student_vendor'))::integer student_count,
      count(referral.id) FILTER (WHERE referral.registration_type IN ('vendor','student_vendor'))::integer vendor_count,
      count(referral.id)::integer qualified_count
    FROM public.university_admin_referrals referral
    WHERE referral.assignment_id=assignment.id AND referral.status='qualified'
      AND referral.qualified_at >= (p_week_start::timestamp AT TIME ZONE 'Africa/Accra')
      AND referral.qualified_at < ((p_week_start+7)::timestamp AT TIME ZONE 'Africa/Accra')
  ) counts
  WHERE assignment.status IN ('active','suspended','revoked')
    AND (earning.id IS NOT NULL OR counts.qualified_count>0);
  RETURN jsonb_build_object('week_start',p_week_start,'week_end',p_week_start+7,'rate_per_registration',2.00,
    'minimum_payout',COALESCE(threshold,10),'currency','GHS','rows',rows_value);
END $func$;

REVOKE ALL ON FUNCTION public.reserve_weekly_referral_payouts(date,text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.get_my_university_admin_weekly_earnings(uuid) FROM PUBLIC,anon,service_role;
REVOKE ALL ON FUNCTION public.get_university_admin_weekly_payroll(date) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.reserve_weekly_referral_payouts(date,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_my_university_admin_weekly_earnings(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_university_admin_weekly_payroll(date) TO authenticated;
COMMIT;
