-- UniEco Ghana referral replacement migration.
-- This is a newly approved replacement and is NOT the recovered 0105 original.
-- Policy: GH₵2 per eligible referral, qualified by verified payment plus student verification,
-- settled after 168 hours. Payouts remain disabled until a verified transfer workflow exists.

BEGIN;

-- Student registration pricing and referral settlement are data, not client constants.
CREATE TABLE IF NOT EXISTS public.student_financial_settings (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  registration_fee numeric(12,2) NOT NULL DEFAULT 10.00 CHECK (registration_fee >= 0),
  referral_reward numeric(12,2) NOT NULL DEFAULT 2.00 CHECK (referral_reward >= 0),
  reward_settlement_hours integer NOT NULL DEFAULT 168 CHECK (reward_settlement_hours BETWEEN 0 AND 8760),
  minimum_payout numeric(12,2) NOT NULL DEFAULT 10.00 CHECK (minimum_payout > 0),
  configuration_version text NOT NULL DEFAULT 'v1',
  currency text NOT NULL DEFAULT 'GHS' CHECK (currency = 'GHS'),
  updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.student_financial_settings(singleton) VALUES (true) ON CONFLICT DO NOTHING;
ALTER TABLE public.student_financial_settings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.student_financial_settings FROM PUBLIC, anon, authenticated, service_role;

CREATE TABLE IF NOT EXISTS public.student_registration_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE REFERENCES public.profiles(id) ON DELETE RESTRICT,
  university_id uuid NOT NULL REFERENCES public.universities(id) ON DELETE RESTRICT,
  referral_code text,
  status text NOT NULL DEFAULT 'pending_payment' CHECK (status IN ('pending_payment','paid','failed','reconciliation_required','reversed')),
  created_at timestamptz NOT NULL DEFAULT now(), paid_at timestamptz, updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS student_registration_university_status_idx ON public.student_registration_payments(university_id,status,created_at DESC);
ALTER TABLE public.student_registration_payments ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.student_registration_payments FROM PUBLIC, anon, authenticated, service_role;

-- Keep every immutable payment attempt. A registration's current UI state is
-- separate from the provider/payment history used for delayed reconciliation.
CREATE TABLE IF NOT EXISTS public.student_registration_payment_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  registration_id uuid NOT NULL REFERENCES public.student_registration_payments(id) ON DELETE RESTRICT,
  payment_id uuid NOT NULL UNIQUE REFERENCES public.payments(id) ON DELETE RESTRICT,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  provider text NOT NULL CHECK (provider='paystack'),
  payment_purpose text NOT NULL CHECK (payment_purpose='student_registration'),
  expected_amount numeric(12,2) NOT NULL CHECK (expected_amount>0),
  expected_currency text NOT NULL CHECK (expected_currency='GHS'),
  fee_snapshot_version text NOT NULL,
  provider_environment text CHECK (provider_environment IN ('test','live')),
  status text NOT NULL DEFAULT 'initiated' CHECK (status IN ('initiated','pending','success','failed','cancelled','reconciliation_required','partially_refunded','refunded')),
  created_at timestamptz NOT NULL DEFAULT now(), verified_at timestamptz,
  UNIQUE(registration_id,id)
);
CREATE INDEX IF NOT EXISTS student_registration_attempts_registration_created_idx
  ON public.student_registration_payment_attempts(registration_id,created_at DESC);
ALTER TABLE public.student_registration_payment_attempts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.student_registration_payment_attempts FROM PUBLIC, anon, authenticated, service_role;

CREATE TABLE IF NOT EXISTS public.student_referral_codes (
  user_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE RESTRICT,
  code text NOT NULL UNIQUE CHECK (code ~ '^UE-[A-F0-9]{20}$'),
  created_at timestamptz NOT NULL DEFAULT now(), revoked_at timestamptz
);
ALTER TABLE public.student_referral_codes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.student_referral_codes FROM PUBLIC, anon, authenticated, service_role;
-- Existing active student accounts receive a real unique code during rollout.
INSERT INTO public.student_referral_codes(user_id,code)
SELECT profile.id,'UE-'||upper(encode(gen_random_bytes(10),'hex'))
FROM public.profiles profile JOIN public.user_roles role ON role.id=profile.role_id
WHERE role.name IN ('student','student_vendor') AND profile.is_active AND profile.status='active'
ON CONFLICT(user_id) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.student_referral_attributions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  referred_user_id uuid NOT NULL UNIQUE REFERENCES public.profiles(id) ON DELETE RESTRICT,
  code text NOT NULL REFERENCES public.student_referral_codes(code) ON UPDATE RESTRICT ON DELETE RESTRICT,
  university_id uuid NOT NULL REFERENCES public.universities(id) ON DELETE RESTRICT,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','qualified','rejected','reversed')),
  created_at timestamptz NOT NULL DEFAULT now(), qualified_at timestamptz,
  CHECK (referrer_user_id <> referred_user_id)
);
CREATE INDEX IF NOT EXISTS student_referral_attributions_referrer_idx ON public.student_referral_attributions(referrer_user_id,status,created_at DESC);
ALTER TABLE public.student_referral_attributions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.student_referral_attributions FROM PUBLIC, anon, authenticated, service_role;

CREATE TABLE IF NOT EXISTS public.student_referral_rewards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  attribution_id uuid NOT NULL UNIQUE REFERENCES public.student_referral_attributions(id) ON DELETE RESTRICT,
  payment_id uuid NOT NULL UNIQUE REFERENCES public.payments(id) ON DELETE RESTRICT,
  referrer_user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  referred_user_id uuid NOT NULL UNIQUE REFERENCES public.profiles(id) ON DELETE RESTRICT,
  amount numeric(12,2) NOT NULL CHECK (amount > 0), currency text NOT NULL DEFAULT 'GHS' CHECK(currency='GHS'),
  status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','available','payout_pending','paid','failed','reversed','reconciliation_required')),
  available_at timestamptz NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), paid_at timestamptz, reversed_at timestamptz
);
CREATE INDEX IF NOT EXISTS student_referral_rewards_owner_status_idx ON public.student_referral_rewards(referrer_user_id,status,available_at);
ALTER TABLE public.student_referral_rewards ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.student_referral_rewards FROM PUBLIC, anon, authenticated, service_role;

CREATE TABLE IF NOT EXISTS public.student_referral_reward_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reward_id uuid NOT NULL REFERENCES public.student_referral_rewards(id) ON DELETE RESTRICT,
  from_status text, to_status text NOT NULL,
  reason text NOT NULL,
  actor_type text NOT NULL CHECK (actor_type IN ('system','user','admin','provider')),
  actor_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  source_reference text,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.student_referral_reward_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.student_referral_reward_events FROM PUBLIC, anon, authenticated, service_role;

CREATE TABLE IF NOT EXISTS public.student_payout_destinations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  account_holder_name text NOT NULL CHECK (length(trim(account_holder_name)) BETWEEN 2 AND 120),
  mobile_number text NOT NULL CHECK (mobile_number ~ '^\+?[0-9]{9,15}$'),
  provider_code text NOT NULL CHECK (provider_code IN ('mtn','telecel','airteltigo')),
  provider_recipient_code text,
  verified_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id)
);
ALTER TABLE public.student_payout_destinations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.student_payout_destinations FROM PUBLIC, anon, authenticated, service_role;

CREATE TABLE IF NOT EXISTS public.student_referral_payouts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  destination_id uuid NOT NULL REFERENCES public.student_payout_destinations(id) ON DELETE RESTRICT,
  reference text NOT NULL UNIQUE, amount numeric(12,2) NOT NULL CHECK(amount > 0), currency text NOT NULL DEFAULT 'GHS' CHECK(currency='GHS'),
  status text NOT NULL DEFAULT 'requested' CHECK(status IN ('requested','processing','succeeded','failed','reconciliation_required','cancelled')),
  provider_reference text UNIQUE, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), completed_at timestamptz
);
ALTER TABLE public.student_referral_payouts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.student_referral_payouts FROM PUBLIC, anon, authenticated, service_role;

CREATE TABLE IF NOT EXISTS public.student_referral_payout_allocations (
  payout_id uuid NOT NULL REFERENCES public.student_referral_payouts(id) ON DELETE RESTRICT,
  reward_id uuid NOT NULL UNIQUE REFERENCES public.student_referral_rewards(id) ON DELETE RESTRICT,
  amount numeric(12,2) NOT NULL CHECK(amount>0), currency text NOT NULL CHECK(currency='GHS'),
  created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(payout_id,reward_id)
);
ALTER TABLE public.student_referral_payout_allocations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.student_referral_payout_allocations FROM PUBLIC,anon,authenticated,service_role;

-- Reserved for a future verified provider-transfer adapter; no payout provider
-- is enabled by this migration.
CREATE TABLE IF NOT EXISTS public.student_referral_payout_provider_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), payout_id uuid NOT NULL REFERENCES public.student_referral_payouts(id) ON DELETE RESTRICT,
  provider text NOT NULL, provider_event_id text NOT NULL, provider_reference text,
  status text NOT NULL CHECK(status IN ('received','verified','processed','ignored','reconciliation_required')),
  payload_hash text NOT NULL, received_at timestamptz NOT NULL DEFAULT now(), processed_at timestamptz,
  UNIQUE(provider,provider_event_id)
);
ALTER TABLE public.student_referral_payout_provider_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.student_referral_payout_provider_events FROM PUBLIC,anon,authenticated,service_role;

CREATE TABLE IF NOT EXISTS public.student_referral_reversal_cases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), reward_id uuid NOT NULL UNIQUE REFERENCES public.student_referral_rewards(id) ON DELETE RESTRICT,
  amount numeric(12,2) NOT NULL CHECK(amount>0), currency text NOT NULL CHECK(currency='GHS'),
  source_payment_id uuid NOT NULL REFERENCES public.payments(id) ON DELETE RESTRICT,
  status text NOT NULL DEFAULT 'review_required' CHECK(status IN ('review_required','resolved','waived')),
  reason text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), resolved_at timestamptz
);
ALTER TABLE public.student_referral_reversal_cases ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.student_referral_reversal_cases FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION public.begin_student_registration_payment(
  p_university_id uuid, p_phone text, p_student_id_number text, p_program text,
  p_faculty text, p_department text, p_level text, p_admission_year integer,
  p_graduation_year integer DEFAULT NULL, p_student_document_path text DEFAULT NULL, p_referral_code text DEFAULT NULL,
  p_idempotency_key text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE uid uuid:=auth.uid(); profile_row public.profiles%ROWTYPE; fee numeric(12,2); fee_version text; intent public.payments%ROWTYPE; code_value text; referrer_id uuid; registration_row public.student_registration_payments%ROWTYPE; attempt public.student_registration_payment_attempts%ROWTYPE;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501'; END IF;
  SELECT * INTO profile_row FROM public.profiles WHERE id=uid FOR UPDATE;
  IF NOT FOUND OR public.current_app_role() NOT IN ('student','student_vendor') OR NOT profile_row.is_active OR profile_row.status NOT IN ('active','pending_payment') THEN RAISE EXCEPTION 'Student registration is unavailable' USING ERRCODE='42501'; END IF;
  IF profile_row.status='active' AND EXISTS (SELECT 1 FROM public.student_profiles WHERE user_id=uid)
     AND NOT EXISTS (SELECT 1 FROM public.student_registration_payments WHERE user_id=uid) THEN
    RAISE EXCEPTION 'Existing student registration cannot be converted to pending payment' USING ERRCODE='22023';
  END IF;
  IF p_phone IS NULL OR p_phone !~ '^\+?[0-9 ()-]{9,20}$' OR length(trim(p_student_id_number)) NOT BETWEEN 2 AND 80 OR length(trim(p_program)) NOT BETWEEN 2 AND 120 OR length(trim(p_faculty)) NOT BETWEEN 2 AND 120 OR length(trim(p_department)) NOT BETWEEN 2 AND 120 OR length(trim(p_level)) NOT BETWEEN 1 AND 30 OR p_admission_year NOT BETWEEN 1950 AND extract(year FROM now())::integer+1 THEN RAISE EXCEPTION 'Student information is invalid' USING ERRCODE='22023'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.universities WHERE id=p_university_id AND is_enabled) THEN RAISE EXCEPTION 'University is unavailable' USING ERRCODE='22023'; END IF;
  IF p_student_document_path IS NOT NULL AND p_student_document_path NOT LIKE uid::text||'/%' THEN RAISE EXCEPTION 'Student document path is invalid' USING ERRCODE='22023'; END IF;
  SELECT registration_fee,configuration_version INTO fee,fee_version FROM public.student_financial_settings WHERE singleton FOR SHARE;
  SELECT * INTO registration_row FROM public.student_registration_payments WHERE user_id=uid FOR UPDATE;
  IF FOUND THEN
    IF registration_row.status='paid' OR profile_row.status='active' AND EXISTS (SELECT 1 FROM public.student_profiles WHERE user_id=uid AND verification_status IN ('verified','approved')) THEN RAISE EXCEPTION 'Registration is already complete' USING ERRCODE='22023'; END IF;
    IF registration_row.university_id<>p_university_id OR registration_row.referral_code IS DISTINCT FROM NULLIF(upper(trim(p_referral_code)),'') THEN RAISE EXCEPTION 'Registration payment is already locked' USING ERRCODE='22023'; END IF;
    SELECT pa.* INTO attempt FROM public.student_registration_payment_attempts pa WHERE pa.registration_id=registration_row.id ORDER BY pa.created_at DESC LIMIT 1 FOR UPDATE;
    SELECT * INTO intent FROM public.payments WHERE id=attempt.payment_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Registration payment requires support review' USING ERRCODE='22023'; END IF;
    IF intent.status IN ('failed','cancelled') THEN
      INSERT INTO public.payments(payment_reference,provider,user_id,payment_type,entity_id,amount,currency,status,idempotency_key,webhook_data)
      VALUES(public.financial_reference('REG'),'paystack',uid,'student_registration',uid,fee,'GHS','initiated',COALESCE(p_idempotency_key,encode(gen_random_bytes(16),'hex')),jsonb_build_object('university_id',p_university_id,'retry_of',intent.id)) RETURNING * INTO intent;
      INSERT INTO public.student_registration_payment_attempts(registration_id,payment_id,user_id,provider,payment_purpose,expected_amount,expected_currency,fee_snapshot_version)
      VALUES(registration_row.id,intent.id,uid,'paystack','student_registration',fee,'GHS',fee_version);
      UPDATE public.student_registration_payments SET status='pending_payment',updated_at=now() WHERE id=registration_row.id;
      INSERT INTO public.transaction_audit_log(payment_id,new_status,changed_by,reason,metadata) VALUES(intent.id,'initiated',uid,'student_registration_payment_retry',jsonb_build_object('retry_of_payment_id',attempt.payment_id,'fee_version',fee_version));
    ELSIF intent.status='reconciliation_required' THEN
      RAISE EXCEPTION 'Registration payment requires support review' USING ERRCODE='22023';
    END IF;
    RETURN jsonb_build_object('id',registration_row.id,'payment_id',intent.id,'payment_reference',intent.payment_reference,'amount',intent.amount,'currency',intent.currency,'payment_type',intent.payment_type,'status',intent.status);
  END IF;
  IF p_referral_code IS NOT NULL AND trim(p_referral_code)<>'' THEN
    code_value:=upper(trim(p_referral_code));
    SELECT user_id INTO referrer_id FROM public.student_referral_codes WHERE code=code_value AND revoked_at IS NULL FOR SHARE;
    IF NOT FOUND OR referrer_id=uid OR NOT EXISTS (
      SELECT 1 FROM public.profiles referrer JOIN public.user_roles role ON role.id=referrer.role_id
      WHERE referrer.id=referrer_id AND referrer.is_active AND referrer.status='active' AND role.name IN ('student','student_vendor')
    ) THEN RAISE EXCEPTION 'Referral code is invalid' USING ERRCODE='22023'; END IF;
  END IF;
  PERFORM public.enforce_financial_rate_limit('student_registration_payment_intent',5);
  UPDATE public.profiles SET phone=trim(p_phone),university_id=p_university_id,status='pending_payment',updated_at=now() WHERE id=uid;
  INSERT INTO public.student_profiles(user_id,profile_id,university_id,student_id_number,program_of_study,faculty,department,level,admission_year,graduation_year,student_id_document_url,verification_status)
  VALUES(uid,uid,p_university_id,trim(p_student_id_number),trim(p_program),trim(p_faculty),trim(p_department),trim(p_level),p_admission_year,p_graduation_year,p_student_document_path,'pending')
  ON CONFLICT(user_id) DO UPDATE SET university_id=excluded.university_id,student_id_number=excluded.student_id_number,program_of_study=excluded.program_of_study,faculty=excluded.faculty,department=excluded.department,level=excluded.level,admission_year=excluded.admission_year,graduation_year=excluded.graduation_year,student_id_document_url=excluded.student_id_document_url,updated_at=now();
  INSERT INTO public.payments(payment_reference,provider,user_id,payment_type,entity_id,amount,currency,status,idempotency_key,webhook_data)
  VALUES(public.financial_reference('REG'), 'paystack',uid,'student_registration',uid,fee,'GHS','initiated',COALESCE(p_idempotency_key,encode(gen_random_bytes(16),'hex')),jsonb_build_object('university_id',p_university_id)) RETURNING * INTO intent;
  INSERT INTO public.student_registration_payments(user_id,university_id,referral_code) VALUES(uid,p_university_id,code_value) RETURNING * INTO registration_row;
  INSERT INTO public.student_registration_payment_attempts(registration_id,payment_id,user_id,provider,payment_purpose,expected_amount,expected_currency,fee_snapshot_version)
  VALUES(registration_row.id,intent.id,uid,'paystack','student_registration',fee,'GHS',fee_version);
  IF code_value IS NOT NULL THEN
    INSERT INTO public.student_referral_attributions(referrer_user_id,referred_user_id,code,university_id)
    SELECT user_id,uid,code_value,p_university_id FROM public.student_referral_codes WHERE code=code_value AND revoked_at IS NULL;
  END IF;
  INSERT INTO public.transaction_audit_log(payment_id,new_status,changed_by,reason,metadata) VALUES(intent.id,'initiated',uid,'student_registration_payment_intent_created',jsonb_build_object('amount',fee,'currency','GHS','university_id',p_university_id));
  RETURN jsonb_build_object('id',registration_row.id,'payment_id',intent.id,'payment_reference',intent.payment_reference,'amount',intent.amount,'currency',intent.currency,'payment_type',intent.payment_type,'status',intent.status);
END $$;

CREATE OR REPLACE FUNCTION public.apply_student_registration_payment_result()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE registration_row public.student_registration_payments%ROWTYPE; attempt public.student_registration_payment_attempts%ROWTYPE; attribution public.student_referral_attributions%ROWTYPE; settings public.student_financial_settings%ROWTYPE; actual_role text; reward_row public.student_referral_rewards%ROWTYPE;
BEGIN
  IF NEW.payment_type<>'student_registration' OR NEW.status IS NOT DISTINCT FROM OLD.status THEN RETURN NEW; END IF;
  SELECT r.* INTO registration_row FROM public.student_registration_payments r JOIN public.student_registration_payment_attempts pa ON pa.registration_id=r.id WHERE pa.payment_id=NEW.id FOR UPDATE OF r,pa;
  IF NOT FOUND THEN
    UPDATE public.payments SET status='reconciliation_required',failure_reason='Missing student registration mapping' WHERE id=NEW.id;
    INSERT INTO public.payment_reconciliation_events(payment_id,provider,payment_reference,reason,expected,received) VALUES(NEW.id,COALESCE(NEW.provider,'unknown'),NEW.payment_reference,'student_registration_mapping_missing','{}',jsonb_build_object('status',NEW.status));
    RETURN NEW;
  END IF;
  SELECT * INTO attempt FROM public.student_registration_payment_attempts WHERE payment_id=NEW.id FOR UPDATE;
  UPDATE public.student_registration_payment_attempts SET status=NEW.status,verified_at=CASE WHEN NEW.status='success' THEN COALESCE(verified_at,now()) ELSE verified_at END,
    provider_environment=COALESCE(provider_environment,NEW.provider_environment) WHERE id=attempt.id;
  IF NEW.status='success' THEN
    PERFORM set_config('app.referral_reward_reason','verified_registration_payment',true);
    PERFORM set_config('app.referral_reward_source',NEW.payment_reference,true);
    IF NEW.amount<>attempt.expected_amount OR NEW.currency<>attempt.expected_currency OR NEW.provider<>attempt.provider OR NEW.provider_environment IS NULL OR attempt.provider_environment IS DISTINCT FROM NEW.provider_environment OR NEW.payment_type<>attempt.payment_purpose OR NEW.user_id<>registration_row.user_id OR NEW.entity_id<>registration_row.user_id THEN
      UPDATE public.payments SET status='reconciliation_required',failure_reason='Student registration payment expectation mismatch' WHERE id=NEW.id;
      UPDATE public.student_registration_payments SET status='reconciliation_required',updated_at=now() WHERE id=registration_row.id;
      INSERT INTO public.payment_reconciliation_events(payment_id,provider,payment_reference,reason,expected,received) VALUES(NEW.id,COALESCE(NEW.provider,'unknown'),NEW.payment_reference,'student_registration_expectation_mismatch',jsonb_build_object('amount',attempt.expected_amount,'currency',attempt.expected_currency,'provider',attempt.provider,'environment',attempt.provider_environment),jsonb_build_object('amount',NEW.amount,'currency',NEW.currency,'provider',NEW.provider,'environment',NEW.provider_environment));
      RETURN NEW;
    END IF;
    SELECT role.name INTO actual_role FROM public.profiles profile JOIN public.user_roles role ON role.id=profile.role_id WHERE profile.id=registration_row.user_id FOR UPDATE OF profile;
    IF actual_role NOT IN ('student','student_vendor') THEN RAISE EXCEPTION 'Student registration account role mismatch' USING ERRCODE='42501'; END IF;
    -- The first verified full-value attempt activates the registration. Later
    -- delayed successful attempts remain recorded for reconciliation/refund.
    IF registration_row.status NOT IN ('paid','reversed') THEN
      UPDATE public.student_registration_payments SET status='paid',paid_at=COALESCE(paid_at,now()),updated_at=now() WHERE id=registration_row.id;
    END IF;
    UPDATE public.profiles SET status='active',is_active=true,updated_at=now() WHERE id=registration_row.user_id;
    INSERT INTO public.student_referral_codes(user_id,code)
    VALUES(registration_row.user_id,'UE-'||upper(encode(gen_random_bytes(10),'hex'))) ON CONFLICT(user_id) DO NOTHING;
    SELECT * INTO attribution FROM public.student_referral_attributions WHERE referred_user_id=registration_row.user_id FOR UPDATE;
    IF FOUND AND attribution.status='pending' AND attribution.referrer_user_id<>registration_row.user_id
    AND EXISTS (SELECT 1 FROM public.student_profiles verified_student WHERE verified_student.user_id=registration_row.user_id AND verified_student.is_verified_student)
    AND EXISTS (
      SELECT 1 FROM public.profiles referrer JOIN public.user_roles role ON role.id=referrer.role_id
      WHERE referrer.id=attribution.referrer_user_id AND referrer.is_active AND referrer.status='active' AND role.name IN ('student','student_vendor')
    ) THEN
      UPDATE public.student_referral_attributions SET status='qualified',qualified_at=now() WHERE id=attribution.id;
      SELECT * INTO settings FROM public.student_financial_settings WHERE singleton;
      INSERT INTO public.student_referral_rewards(attribution_id,payment_id,referrer_user_id,referred_user_id,amount,currency,status,available_at)
      VALUES(attribution.id,NEW.id,attribution.referrer_user_id,registration_row.user_id,settings.referral_reward,'GHS','pending',now()+make_interval(hours=>settings.reward_settlement_hours)) ON CONFLICT DO NOTHING;
      SELECT * INTO reward_row FROM public.student_referral_rewards WHERE payment_id=NEW.id;
      INSERT INTO public.audit_logs(actor_id,action,entity_type,entity_id,metadata) SELECT NULL,'referral_reward_created','student_referral_reward',id,jsonb_build_object('amount',settings.referral_reward,'currency','GHS','registration_payment_id',NEW.id) FROM public.student_referral_rewards WHERE payment_id=NEW.id ON CONFLICT DO NOTHING;
    ELSIF FOUND AND attribution.status='pending' THEN
      NULL; -- Keep attribution pending until student verification is complete.
    END IF;
  ELSIF NEW.status IN ('failed','cancelled') THEN
    PERFORM set_config('app.referral_reward_reason','registration_payment_failed',true);
    PERFORM set_config('app.referral_reward_source',NEW.payment_reference,true);
    UPDATE public.student_registration_payments SET status='failed',updated_at=now() WHERE id=registration_row.id;
  ELSIF NEW.status IN ('refunded','partially_refunded') THEN
    PERFORM set_config('app.referral_reward_reason',CASE WHEN NEW.status='refunded' THEN 'registration_payment_refunded' ELSE 'registration_payment_partially_refunded' END,true);
    PERFORM set_config('app.referral_reward_source',NEW.payment_reference,true);
    UPDATE public.student_registration_payments SET status=CASE WHEN NEW.status='refunded' THEN 'reversed' ELSE 'reconciliation_required' END,updated_at=now() WHERE id=registration_row.id;
    UPDATE public.student_referral_attributions SET status=CASE WHEN NEW.status='refunded' THEN 'reversed' ELSE 'qualified' END WHERE referred_user_id=registration_row.user_id;
    IF NEW.status='refunded' THEN
      UPDATE public.student_referral_rewards SET status='reversed',reversed_at=now(),updated_at=now() WHERE payment_id=NEW.id AND status IN ('pending','available','failed');
    ELSE
      UPDATE public.student_referral_rewards SET status='reconciliation_required',updated_at=now() WHERE payment_id=NEW.id AND status IN ('pending','available','failed');
    END IF;
    UPDATE public.student_referral_rewards SET status='reconciliation_required',updated_at=now() WHERE payment_id=NEW.id AND status='payout_pending';
    INSERT INTO public.student_referral_reversal_cases(reward_id,amount,currency,source_payment_id,reason)
    SELECT id,amount,currency,NEW.id,CASE WHEN NEW.status='refunded' THEN 'Registration payment refunded after referral reward was paid' ELSE 'Partial registration payment refund requires review' END
    FROM public.student_referral_rewards WHERE payment_id=NEW.id AND status='paid'
    ON CONFLICT(reward_id) DO NOTHING;
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.log_student_referral_reward_transition()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE actor uuid:=auth.uid(); reason_value text:=COALESCE(NULLIF(current_setting('app.referral_reward_reason',true),''),'verified_registration_payment'); source_value text:=NULLIF(current_setting('app.referral_reward_source',true),'');
BEGIN
  IF TG_OP='UPDATE' AND NEW.status IS NOT DISTINCT FROM OLD.status THEN RETURN NEW; END IF;
  INSERT INTO public.student_referral_reward_events(reward_id,from_status,to_status,reason,actor_type,actor_id,source_reference)
  VALUES(NEW.id,CASE WHEN TG_OP='INSERT' THEN NULL ELSE OLD.status END,NEW.status,reason_value,
    CASE WHEN actor IS NULL THEN 'system' ELSE 'user' END,actor,source_value);
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.guard_student_referral_reward_events()
RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
BEGIN RAISE EXCEPTION 'Referral reward events are append-only' USING ERRCODE='42501'; END $$;

CREATE OR REPLACE FUNCTION public.settle_due_student_referral_rewards(p_limit integer DEFAULT 250)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE changed integer;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'Privileged settlement worker required' USING ERRCODE='42501'; END IF;
  IF p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 1000 THEN RAISE EXCEPTION 'Invalid settlement batch size' USING ERRCODE='22023'; END IF;
  PERFORM set_config('app.referral_reward_reason','settlement_period_elapsed',true);
  WITH due AS (
    SELECT reward.id FROM public.student_referral_rewards reward
    JOIN public.student_referral_attributions attribution ON attribution.id=reward.attribution_id AND attribution.status='qualified'
    JOIN public.student_registration_payment_attempts attempt ON attempt.payment_id=reward.payment_id AND attempt.status='success'
    JOIN public.payments payment ON payment.id=attempt.payment_id AND payment.status='success' AND payment.amount=attempt.expected_amount AND payment.currency=attempt.expected_currency
    WHERE reward.status='pending' AND reward.available_at<=now()
    ORDER BY reward.available_at,reward.id FOR UPDATE OF reward SKIP LOCKED LIMIT p_limit
  )
  UPDATE public.student_referral_rewards reward SET status='available',updated_at=now()
  FROM due WHERE reward.id=due.id;
  GET DIAGNOSTICS changed=ROW_COUNT;
  RETURN changed;
END $$;
DROP TRIGGER IF EXISTS apply_student_registration_payment_result ON public.payments;
CREATE TRIGGER apply_student_registration_payment_result AFTER UPDATE OF status ON public.payments FOR EACH ROW EXECUTE FUNCTION public.apply_student_registration_payment_result();

CREATE OR REPLACE FUNCTION public.sync_student_registration_attempt_environment()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
  IF NEW.payment_type='student_registration' AND NEW.provider_environment IS DISTINCT FROM OLD.provider_environment THEN
    UPDATE public.student_registration_payment_attempts SET provider_environment=NEW.provider_environment
    WHERE payment_id=NEW.id AND provider_environment IS NULL AND status IN ('initiated','pending');
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS sync_student_registration_attempt_environment ON public.payments;
CREATE TRIGGER sync_student_registration_attempt_environment AFTER UPDATE OF provider_environment ON public.payments
FOR EACH ROW EXECUTE FUNCTION public.sync_student_registration_attempt_environment();

CREATE OR REPLACE FUNCTION public.get_my_referral_summary()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE uid uuid:=auth.uid(); result jsonb;
BEGIN
  IF uid IS NULL OR public.current_app_role() NOT IN ('student','student_vendor') THEN RAISE EXCEPTION 'Student access required' USING ERRCODE='42501'; END IF;
  -- Deliberately read-only: settlement is performed only by the privileged job.
  SELECT jsonb_build_object(
    'code',code.code,'successful_referrals',(SELECT count(*) FROM public.student_referral_attributions a WHERE a.referrer_user_id=uid AND a.status='qualified'),
    'pending_amount',COALESCE((SELECT sum(amount) FROM public.student_referral_rewards WHERE referrer_user_id=uid AND status='pending'),0),
    'available_amount',COALESCE((SELECT sum(amount) FROM public.student_referral_rewards WHERE referrer_user_id=uid AND status='available'),0),
    'paid_amount',COALESCE((SELECT sum(amount) FROM public.student_referral_rewards WHERE referrer_user_id=uid AND status='paid'),0),
    'total_earned',COALESCE((SELECT sum(amount) FROM public.student_referral_rewards WHERE referrer_user_id=uid AND status IN ('pending','available','payout_pending','paid')),0),
    'minimum_payout',(SELECT minimum_payout FROM public.student_financial_settings WHERE singleton),
    'history',COALESCE((SELECT jsonb_agg(jsonb_build_object('created_at',a.created_at,'referred_name',left(COALESCE(p.full_name,'Student'),1)||'.','registration_status',r.status,'reward_amount',rw.amount,'reward_status',rw.status) ORDER BY a.created_at DESC) FROM public.student_referral_attributions a JOIN public.profiles p ON p.id=a.referred_user_id LEFT JOIN public.student_registration_payments r ON r.user_id=a.referred_user_id LEFT JOIN public.student_referral_rewards rw ON rw.referred_user_id=a.referred_user_id WHERE a.referrer_user_id=uid),'[]'::jsonb)
  ) INTO result FROM public.student_referral_codes code WHERE code.user_id=uid AND code.revoked_at IS NULL;
  RETURN COALESCE(result,jsonb_build_object('code',NULL,'successful_referrals',0,'pending_amount',0,'available_amount',0,'paid_amount',0,'total_earned',0,'minimum_payout',10,'history','[]'::jsonb));
END $$;

CREATE OR REPLACE FUNCTION public.upsert_my_referral_payout_destination(p_name text,p_mobile text,p_provider text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
  RAISE EXCEPTION 'Referral payouts are not enabled yet' USING ERRCODE='55000';
END $$;

CREATE OR REPLACE FUNCTION public.request_my_referral_payout()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
  RAISE EXCEPTION 'Referral payouts are not enabled yet' USING ERRCODE='55000';
END $$;

CREATE OR REPLACE FUNCTION public.get_admin_student_referral_overview()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE result jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_super_admin() THEN RAISE EXCEPTION 'Super administrator access required' USING ERRCODE='42501'; END IF;
  SELECT jsonb_build_object(
    'referrers',(SELECT count(*) FROM public.student_referral_codes WHERE revoked_at IS NULL),
    'qualified_referrals',(SELECT count(*) FROM public.student_referral_attributions WHERE status='qualified'),
    'rewards_pending',COALESCE((SELECT sum(amount) FROM public.student_referral_rewards WHERE status='pending'),0),
    'rewards_available',COALESCE((SELECT sum(amount) FROM public.student_referral_rewards WHERE status='available'),0),
    'rewards_paid',COALESCE((SELECT sum(amount) FROM public.student_referral_rewards WHERE status='paid'),0),
    'payouts_pending',(SELECT count(*) FROM public.student_referral_payouts WHERE status IN ('requested','processing','reconciliation_required')),
    'payouts_failed',(SELECT count(*) FROM public.student_referral_payouts WHERE status='failed'),
    'rewards_reversed',(SELECT count(*) FROM public.student_referral_rewards WHERE status='reversed'),
    'recent_rewards',COALESCE((SELECT jsonb_agg(jsonb_build_object('created_at',rw.created_at,'referrer',left(COALESCE(p.full_name,'Student'),1)||'.','amount',rw.amount,'currency',rw.currency,'status',rw.status,'university_id',a.university_id) ORDER BY rw.created_at DESC) FROM (SELECT * FROM public.student_referral_rewards ORDER BY created_at DESC LIMIT 100) rw JOIN public.student_referral_attributions a ON a.id=rw.attribution_id JOIN public.profiles p ON p.id=rw.referrer_user_id),'[]'::jsonb),
    'payout_queue',COALESCE((SELECT jsonb_agg(jsonb_build_object('created_at',po.created_at,'reference',po.reference,'amount',po.amount,'currency',po.currency,'status',po.status,'user_id',po.user_id) ORDER BY po.created_at DESC) FROM (SELECT * FROM public.student_referral_payouts WHERE status IN ('requested','processing','failed','reconciliation_required') ORDER BY created_at DESC LIMIT 100) po),'[]'::jsonb)
  ) INTO result;
  RETURN result;
END $$;

-- Protect the ledger values and permit only documented state transitions.
CREATE OR REPLACE FUNCTION public.guard_student_referral_reward_ledger()
RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
BEGIN
  IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Referral reward history is immutable' USING ERRCODE='42501'; END IF;
  IF NEW.id IS DISTINCT FROM OLD.id OR NEW.attribution_id IS DISTINCT FROM OLD.attribution_id OR NEW.payment_id IS DISTINCT FROM OLD.payment_id OR NEW.referrer_user_id IS DISTINCT FROM OLD.referrer_user_id OR NEW.referred_user_id IS DISTINCT FROM OLD.referred_user_id OR NEW.amount IS DISTINCT FROM OLD.amount OR NEW.currency IS DISTINCT FROM OLD.currency OR NEW.available_at IS DISTINCT FROM OLD.available_at OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'Referral reward financial facts are immutable' USING ERRCODE='42501';
  END IF;
  IF NEW.status IS DISTINCT FROM OLD.status AND NOT (
    (OLD.status='pending' AND NEW.status IN ('available','reversed','reconciliation_required')) OR
    (OLD.status='available' AND NEW.status IN ('payout_pending','reversed','reconciliation_required')) OR
    (OLD.status='payout_pending' AND NEW.status IN ('paid','failed','available','reversed','reconciliation_required')) OR
    (OLD.status='failed' AND NEW.status IN ('available','reversed','reconciliation_required'))
  ) THEN RAISE EXCEPTION 'Referral reward state transition is not allowed' USING ERRCODE='22023'; END IF;
  RETURN NEW;
END $$;
CREATE OR REPLACE FUNCTION public.guard_student_referral_payout_ledger()
RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
BEGIN
  IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Referral payout history is immutable' USING ERRCODE='42501'; END IF;
  IF NEW.id IS DISTINCT FROM OLD.id OR NEW.user_id IS DISTINCT FROM OLD.user_id OR NEW.destination_id IS DISTINCT FROM OLD.destination_id OR NEW.reference IS DISTINCT FROM OLD.reference OR NEW.amount IS DISTINCT FROM OLD.amount OR NEW.currency IS DISTINCT FROM OLD.currency OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'Referral payout financial facts are immutable' USING ERRCODE='42501';
  END IF;
  IF NEW.status IS DISTINCT FROM OLD.status AND NOT (
    (OLD.status='requested' AND NEW.status IN ('processing','cancelled','reconciliation_required')) OR
    (OLD.status='processing' AND NEW.status IN ('succeeded','failed','reconciliation_required')) OR
    (OLD.status='reconciliation_required' AND NEW.status IN ('succeeded','failed')) OR
    (OLD.status='failed' AND NEW.status IN ('processing','reconciliation_required'))
  ) THEN RAISE EXCEPTION 'Referral payout state transition is not allowed' USING ERRCODE='22023'; END IF;
  RETURN NEW;
END $$;
CREATE OR REPLACE FUNCTION public.guard_student_registration_payment_attempt()
RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
BEGIN
  IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Registration payment attempt history is immutable' USING ERRCODE='42501'; END IF;
  IF NEW.id IS DISTINCT FROM OLD.id OR NEW.registration_id IS DISTINCT FROM OLD.registration_id OR NEW.payment_id IS DISTINCT FROM OLD.payment_id OR NEW.user_id IS DISTINCT FROM OLD.user_id OR NEW.provider IS DISTINCT FROM OLD.provider OR NEW.payment_purpose IS DISTINCT FROM OLD.payment_purpose OR NEW.expected_amount IS DISTINCT FROM OLD.expected_amount OR NEW.expected_currency IS DISTINCT FROM OLD.expected_currency OR NEW.fee_snapshot_version IS DISTINCT FROM OLD.fee_snapshot_version OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'Payment attempt financial facts are immutable' USING ERRCODE='42501';
  END IF;
  IF OLD.provider_environment IS NOT NULL AND NEW.provider_environment IS DISTINCT FROM OLD.provider_environment THEN
    RAISE EXCEPTION 'Payment attempt environment is immutable once bound' USING ERRCODE='42501';
  END IF;
  IF NEW.status IS DISTINCT FROM OLD.status AND NOT (
    (OLD.status='initiated' AND NEW.status IN ('pending','success','failed','cancelled','reconciliation_required')) OR
    (OLD.status='pending' AND NEW.status IN ('success','failed','cancelled','reconciliation_required','partially_refunded','refunded')) OR
    (OLD.status='success' AND NEW.status IN ('reconciliation_required','partially_refunded','refunded')) OR
    (OLD.status='failed' AND NEW.status IN ('reconciliation_required','refunded')) OR
    (OLD.status='partially_refunded' AND NEW.status IN ('refunded','reconciliation_required'))
  ) THEN RAISE EXCEPTION 'Payment attempt state transition is not allowed' USING ERRCODE='22023'; END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS guard_student_referral_reward_ledger ON public.student_referral_rewards;
CREATE TRIGGER guard_student_referral_reward_ledger BEFORE UPDATE OR DELETE ON public.student_referral_rewards FOR EACH ROW EXECUTE FUNCTION public.guard_student_referral_reward_ledger();
DROP TRIGGER IF EXISTS guard_student_referral_payout_ledger ON public.student_referral_payouts;
CREATE TRIGGER guard_student_referral_payout_ledger BEFORE UPDATE OR DELETE ON public.student_referral_payouts FOR EACH ROW EXECUTE FUNCTION public.guard_student_referral_payout_ledger();
DROP TRIGGER IF EXISTS guard_student_registration_payment_attempt ON public.student_registration_payment_attempts;
CREATE TRIGGER guard_student_registration_payment_attempt BEFORE UPDATE OR DELETE ON public.student_registration_payment_attempts
FOR EACH ROW EXECUTE FUNCTION public.guard_student_registration_payment_attempt();
DROP TRIGGER IF EXISTS log_student_referral_reward_transition ON public.student_referral_rewards;
CREATE TRIGGER log_student_referral_reward_transition AFTER INSERT OR UPDATE ON public.student_referral_rewards
FOR EACH ROW EXECUTE FUNCTION public.log_student_referral_reward_transition();
DROP TRIGGER IF EXISTS guard_student_referral_reward_events ON public.student_referral_reward_events;
CREATE TRIGGER guard_student_referral_reward_events BEFORE UPDATE OR DELETE ON public.student_referral_reward_events
FOR EACH ROW EXECUTE FUNCTION public.guard_student_referral_reward_events();

REVOKE ALL ON FUNCTION public.begin_student_registration_payment(uuid,text,text,text,text,text,text,integer,integer,text,text,text) FROM PUBLIC,anon,authenticated,service_role;
CREATE OR REPLACE FUNCTION public.try_qualify_student_referral(p_referred_user_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE
  attribution public.student_referral_attributions%ROWTYPE;
  registration public.student_registration_payments%ROWTYPE;
  attempt public.student_registration_payment_attempts%ROWTYPE;
  settings public.student_financial_settings%ROWTYPE;
  reward_id uuid;
BEGIN
  SELECT * INTO attribution FROM public.student_referral_attributions
  WHERE referred_user_id=p_referred_user_id AND status='pending' FOR UPDATE;
  IF NOT FOUND OR attribution.referrer_user_id=p_referred_user_id THEN RETURN NULL; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.student_profiles
    WHERE user_id=p_referred_user_id AND is_verified_student IS TRUE
  ) THEN RETURN NULL; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles referrer
    JOIN public.user_roles role ON role.id=referrer.role_id
    WHERE referrer.id=attribution.referrer_user_id
      AND referrer.is_active AND referrer.status='active'
      AND role.name IN ('student','student_vendor')
  ) THEN RETURN NULL; END IF;
  SELECT * INTO registration FROM public.student_registration_payments
  WHERE user_id=p_referred_user_id AND status='paid' FOR UPDATE;
  IF NOT FOUND THEN RETURN NULL; END IF;
  SELECT pa.* INTO attempt
  FROM public.student_registration_payment_attempts pa
  JOIN public.payments payment ON payment.id=pa.payment_id
  WHERE pa.registration_id=registration.id
    AND pa.user_id=p_referred_user_id
    AND pa.status='success'
    AND payment.status='success'
    AND payment.amount=pa.expected_amount
    AND payment.currency=pa.expected_currency
    AND payment.payment_type='student_registration'
    AND payment.user_id=p_referred_user_id
    AND payment.entity_id=p_referred_user_id
  ORDER BY pa.verified_at DESC NULLS LAST, pa.created_at DESC
  LIMIT 1;
  IF NOT FOUND THEN RETURN NULL; END IF;
  SELECT * INTO settings FROM public.student_financial_settings WHERE singleton;
  UPDATE public.student_referral_attributions
  SET status='qualified',qualified_at=COALESCE(qualified_at,now())
  WHERE id=attribution.id AND status='pending';
  IF NOT FOUND THEN RETURN NULL; END IF;
  INSERT INTO public.student_referral_rewards
    (attribution_id,payment_id,referrer_user_id,referred_user_id,amount,currency,status,available_at)
  VALUES
    (attribution.id,attempt.payment_id,attribution.referrer_user_id,p_referred_user_id,
     settings.referral_reward,settings.currency,'pending',
     now()+make_interval(hours=>settings.reward_settlement_hours))
  ON CONFLICT DO NOTHING
  RETURNING id INTO reward_id;
  RETURN reward_id;
END $$;

DROP TRIGGER IF EXISTS qualify_student_referral_after_verification ON public.student_profiles;
CREATE OR REPLACE FUNCTION public.qualify_student_referral_after_verification()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
  PERFORM public.try_qualify_student_referral(NEW.user_id);
  RETURN NEW;
END $$;

CREATE TRIGGER qualify_student_referral_after_verification
AFTER UPDATE OF is_verified_student,verification_status ON public.student_profiles
FOR EACH ROW WHEN (NEW.is_verified_student IS TRUE)
EXECUTE FUNCTION public.qualify_student_referral_after_verification();

REVOKE ALL ON FUNCTION public.get_my_referral_summary() FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.upsert_my_referral_payout_destination(text,text,text) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.request_my_referral_payout() FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.try_qualify_student_referral(uuid) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.qualify_student_referral_after_verification() FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.get_admin_student_referral_overview() FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.guard_student_referral_reward_ledger() FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.guard_student_referral_payout_ledger() FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.guard_student_registration_payment_attempt() FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.log_student_referral_reward_transition() FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.guard_student_referral_reward_events() FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.settle_due_student_referral_rewards(integer) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.begin_student_registration_payment(uuid,text,text,text,text,text,text,integer,integer,text,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_referral_summary() TO authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_my_referral_payout_destination(text,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.request_my_referral_payout() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_admin_student_referral_overview() TO authenticated;
GRANT EXECUTE ON FUNCTION public.settle_due_student_referral_rewards(integer) TO service_role;
REVOKE ALL ON FUNCTION public.apply_student_registration_payment_result() FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.sync_student_registration_attempt_environment() FROM PUBLIC,anon,authenticated,service_role;

COMMIT;


