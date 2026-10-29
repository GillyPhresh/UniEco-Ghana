-- Make optional student identifiers and academic details consistent across
-- the browser form, Paystack intent, sponsored invite, and trusted database
-- completion paths. Empty strings are stored as NULL instead of fake values.
BEGIN;

CREATE OR REPLACE FUNCTION public.begin_student_registration_payment(
  p_university_id uuid, p_phone text, p_student_id_number text, p_program text,
  p_faculty text, p_department text, p_level text, p_admission_year integer,
  p_graduation_year integer DEFAULT NULL, p_student_document_path text DEFAULT NULL,
  p_referral_code text DEFAULT NULL, p_idempotency_key text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE
  uid uuid:=auth.uid(); profile_row public.profiles%ROWTYPE; fee numeric(12,2); fee_version text;
  intent public.payments%ROWTYPE; code_value text; referrer_id uuid;
  registration_row public.student_registration_payments%ROWTYPE; attempt public.student_registration_payment_attempts%ROWTYPE;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501'; END IF;
  SELECT * INTO profile_row FROM public.profiles WHERE id=uid FOR UPDATE;
  IF NOT FOUND OR NOT profile_row.is_active
     OR profile_row.status NOT IN ('active','pending','pending_payment')
     OR NOT EXISTS (SELECT 1 FROM public.user_roles role WHERE role.id=profile_row.role_id AND role.name IN ('student','student_vendor'))
  THEN RAISE EXCEPTION 'Student registration is unavailable' USING ERRCODE='42501'; END IF;
  IF profile_row.status='active' AND EXISTS (SELECT 1 FROM public.student_profiles WHERE user_id=uid)
     AND NOT EXISTS (SELECT 1 FROM public.student_registration_payments WHERE user_id=uid)
  THEN RAISE EXCEPTION 'Existing student registration cannot be converted to pending payment' USING ERRCODE='22023'; END IF;
  IF p_phone IS NULL OR p_phone !~ '^\+?[0-9 ()-]{9,20}$'
     OR (NULLIF(trim(p_student_id_number),'') IS NOT NULL AND length(trim(p_student_id_number)) NOT BETWEEN 2 AND 80)
     OR (NULLIF(trim(p_program),'') IS NOT NULL AND length(trim(p_program)) NOT BETWEEN 2 AND 120)
     OR (NULLIF(trim(p_faculty),'') IS NOT NULL AND length(trim(p_faculty)) NOT BETWEEN 2 AND 120)
     OR (NULLIF(trim(p_department),'') IS NOT NULL AND length(trim(p_department)) NOT BETWEEN 2 AND 120)
     OR length(trim(p_level)) NOT BETWEEN 1 AND 30
     OR p_admission_year NOT BETWEEN 1950 AND extract(year FROM now())::integer+1
  THEN RAISE EXCEPTION 'Student information is invalid' USING ERRCODE='22023'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.universities WHERE id=p_university_id AND is_enabled)
  THEN RAISE EXCEPTION 'University is unavailable' USING ERRCODE='22023'; END IF;
  IF p_student_document_path IS NOT NULL AND p_student_document_path NOT LIKE uid::text||'/%'
  THEN RAISE EXCEPTION 'Student document path is invalid' USING ERRCODE='22023'; END IF;
  SELECT registration_fee,configuration_version INTO fee,fee_version
  FROM public.student_financial_settings WHERE singleton FOR SHARE;
  SELECT * INTO registration_row FROM public.student_registration_payments WHERE user_id=uid FOR UPDATE;
  IF FOUND THEN
    IF registration_row.status='paid' OR profile_row.status='active' AND EXISTS
      (SELECT 1 FROM public.student_profiles WHERE user_id=uid AND verification_status IN ('verified','approved'))
    THEN RAISE EXCEPTION 'Registration is already complete' USING ERRCODE='22023'; END IF;
    IF registration_row.university_id<>p_university_id OR registration_row.referral_code IS DISTINCT FROM NULLIF(upper(trim(p_referral_code)),'')
    THEN RAISE EXCEPTION 'Registration payment is already locked' USING ERRCODE='22023'; END IF;
    SELECT pa.* INTO attempt FROM public.student_registration_payment_attempts pa
    WHERE pa.registration_id=registration_row.id ORDER BY pa.created_at DESC LIMIT 1 FOR UPDATE;
    SELECT * INTO intent FROM public.payments WHERE id=attempt.payment_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Registration payment requires support review' USING ERRCODE='22023'; END IF;
    IF intent.status IN ('failed','cancelled') THEN
      INSERT INTO public.payments(payment_reference,provider,user_id,payment_type,entity_id,amount,currency,status,idempotency_key,webhook_data)
      VALUES(public.financial_reference('REG'),'paystack',uid,'student_registration',uid,fee,'GHS','initiated',COALESCE(p_idempotency_key,encode(gen_random_bytes(16),'hex')),jsonb_build_object('university_id',p_university_id,'retry_of',intent.id)) RETURNING * INTO intent;
      INSERT INTO public.student_registration_payment_attempts(registration_id,payment_id,user_id,provider,payment_purpose,expected_amount,expected_currency,fee_snapshot_version)
      VALUES(registration_row.id,intent.id,uid,'paystack','student_registration',fee,'GHS',fee_version);
      UPDATE public.student_registration_payments SET status='pending_payment',updated_at=now() WHERE id=registration_row.id;
      INSERT INTO public.transaction_audit_log(payment_id,new_status,changed_by,reason,metadata)
      VALUES(intent.id,'initiated',uid,'student_registration_payment_retry',jsonb_build_object('retry_of_payment_id',attempt.payment_id,'fee_version',fee_version));
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
  VALUES(uid,uid,p_university_id,NULLIF(trim(p_student_id_number),''),NULLIF(trim(p_program),''),NULLIF(trim(p_faculty),''),NULLIF(trim(p_department),''),trim(p_level),p_admission_year,p_graduation_year,p_student_document_path,'pending')
  ON CONFLICT(user_id) DO UPDATE SET university_id=excluded.university_id,student_id_number=excluded.student_id_number,program_of_study=excluded.program_of_study,faculty=excluded.faculty,department=excluded.department,level=excluded.level,admission_year=excluded.admission_year,graduation_year=excluded.graduation_year,student_id_document_url=excluded.student_id_document_url,updated_at=now();
  INSERT INTO public.payments(payment_reference,provider,user_id,payment_type,entity_id,amount,currency,status,idempotency_key,webhook_data)
  VALUES(public.financial_reference('REG'),'paystack',uid,'student_registration',uid,fee,'GHS','initiated',COALESCE(p_idempotency_key,encode(gen_random_bytes(16),'hex')),jsonb_build_object('university_id',p_university_id)) RETURNING * INTO intent;
  INSERT INTO public.student_registration_payments(user_id,university_id,referral_code) VALUES(uid,p_university_id,code_value) RETURNING * INTO registration_row;
  INSERT INTO public.student_registration_payment_attempts(registration_id,payment_id,user_id,provider,payment_purpose,expected_amount,expected_currency,fee_snapshot_version)
  VALUES(registration_row.id,intent.id,uid,'paystack','student_registration',fee,'GHS',fee_version);
  IF code_value IS NOT NULL THEN
    INSERT INTO public.student_referral_attributions(referrer_user_id,referred_user_id,code,university_id)
    SELECT user_id,uid,code_value,p_university_id FROM public.student_referral_codes WHERE code=code_value AND revoked_at IS NULL;
  END IF;
  INSERT INTO public.transaction_audit_log(payment_id,new_status,changed_by,reason,metadata)
  VALUES(intent.id,'initiated',uid,'student_registration_payment_intent_created',jsonb_build_object('amount',fee,'currency','GHS','university_id',p_university_id));
  RETURN jsonb_build_object('id',registration_row.id,'payment_id',intent.id,'payment_reference',intent.payment_reference,'amount',intent.amount,'currency',intent.currency,'payment_type',intent.payment_type,'status',intent.status);
END $$;

CREATE OR REPLACE FUNCTION public.complete_student_registration(
  p_university_id uuid, p_phone text, p_student_id_number text, p_program text,
  p_faculty text, p_department text, p_level text, p_admission_year integer,
  p_graduation_year integer DEFAULT NULL, p_student_document_path text DEFAULT NULL,
  p_referral_code text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE uid uuid:=auth.uid(); profile_row public.profiles%ROWTYPE; registration_row public.student_registration_payments%ROWTYPE; required_amount numeric(12,2);
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501'; END IF;
  SELECT * INTO profile_row FROM public.profiles WHERE id=uid FOR UPDATE;
  IF NOT FOUND OR NOT profile_row.is_active OR profile_row.status='suspended' OR public.current_app_role() NOT IN ('student','student_vendor') THEN RAISE EXCEPTION 'Student registration is unavailable' USING ERRCODE='42501'; END IF;
  SELECT registration_fee INTO required_amount FROM public.student_financial_settings WHERE singleton;
  SELECT * INTO registration_row FROM public.student_registration_payments WHERE user_id=uid AND status='paid' FOR UPDATE;
  IF NOT FOUND OR NOT EXISTS (SELECT 1 FROM public.payments payment WHERE payment.user_id=uid AND payment.payment_type='student_registration' AND payment.entity_id=uid AND payment.status='success' AND payment.amount=required_amount AND payment.currency='GHS') THEN RAISE EXCEPTION 'Registration payment is required before account activation' USING ERRCODE='42501'; END IF;
  IF p_phone IS NULL OR p_phone !~ '^\+?[0-9 ()-]{9,20}$'
     OR (NULLIF(btrim(p_student_id_number),'') IS NOT NULL AND length(btrim(p_student_id_number)) NOT BETWEEN 2 AND 80)
     OR (NULLIF(btrim(p_program),'') IS NOT NULL AND length(btrim(p_program)) NOT BETWEEN 2 AND 120)
     OR (NULLIF(btrim(p_faculty),'') IS NOT NULL AND length(btrim(p_faculty)) NOT BETWEEN 2 AND 120)
     OR (NULLIF(btrim(p_department),'') IS NOT NULL AND length(btrim(p_department)) NOT BETWEEN 2 AND 120)
     OR length(btrim(p_level)) NOT BETWEEN 1 AND 30
     OR p_admission_year NOT BETWEEN 1950 AND extract(year FROM now())::integer + 1
     OR NOT EXISTS (SELECT 1 FROM public.universities WHERE id=p_university_id AND is_enabled)
     OR (p_student_document_path IS NOT NULL AND p_student_document_path NOT LIKE uid::text || '/%') THEN RAISE EXCEPTION 'Student information is invalid' USING ERRCODE='22023'; END IF;
  UPDATE public.profiles SET phone=btrim(p_phone),university_id=p_university_id,status='active',is_active=true,updated_at=now() WHERE id=uid;
  INSERT INTO public.student_profiles(user_id,profile_id,university_id,student_id_number,program_of_study,faculty,department,level,admission_year,graduation_year,student_id_document_url,verification_status)
  VALUES(uid,uid,p_university_id,NULLIF(btrim(p_student_id_number),''),NULLIF(btrim(p_program),''),NULLIF(btrim(p_faculty),''),NULLIF(btrim(p_department),''),btrim(p_level),p_admission_year,p_graduation_year,p_student_document_path,'pending')
  ON CONFLICT (user_id) DO UPDATE SET university_id=excluded.university_id,student_id_number=excluded.student_id_number,program_of_study=excluded.program_of_study,faculty=excluded.faculty,department=excluded.department,level=excluded.level,admission_year=excluded.admission_year,graduation_year=excluded.graduation_year,student_id_document_url=excluded.student_id_document_url,updated_at=now();
  RETURN jsonb_build_object('status','active','registration_status',registration_row.status,'payment_required',false,'verification_status','pending');
END $$;

CREATE OR REPLACE FUNCTION public.complete_student_registration_with_invite(
  p_token text, p_university_id uuid, p_phone text, p_student_id_number text,
  p_program text, p_faculty text, p_department text, p_level text,
  p_admission_year integer, p_graduation_year integer DEFAULT NULL,
  p_student_document_path text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE uid uuid:=auth.uid(); profile_row public.profiles%ROWTYPE; invite_id uuid; registration_id uuid;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501'; END IF;
  SELECT * INTO profile_row FROM public.profiles WHERE id=uid FOR UPDATE;
  IF NOT FOUND OR public.current_app_role() NOT IN ('student','student_vendor') OR NOT profile_row.is_active THEN RAISE EXCEPTION 'Student registration is unavailable' USING ERRCODE='42501'; END IF;
  IF p_phone IS NULL OR p_phone !~ '^\+?[0-9 ()-]{9,20}$'
     OR (NULLIF(trim(p_student_id_number),'') IS NOT NULL AND length(trim(p_student_id_number)) NOT BETWEEN 2 AND 80)
     OR (NULLIF(trim(p_program),'') IS NOT NULL AND length(trim(p_program)) NOT BETWEEN 2 AND 120)
     OR (NULLIF(trim(p_faculty),'') IS NOT NULL AND length(trim(p_faculty)) NOT BETWEEN 2 AND 120)
     OR (NULLIF(trim(p_department),'') IS NOT NULL AND length(trim(p_department)) NOT BETWEEN 2 AND 120)
     OR length(trim(p_level)) NOT BETWEEN 1 AND 30
     OR p_admission_year NOT BETWEEN 1950 AND extract(year FROM now())::integer+1
     OR NOT EXISTS (SELECT 1 FROM public.universities WHERE id=p_university_id AND is_enabled)
     OR (p_student_document_path IS NOT NULL AND p_student_document_path NOT LIKE uid::text||'/%') THEN RAISE EXCEPTION 'Student information is invalid' USING ERRCODE='22023'; END IF;
  SELECT id INTO invite_id FROM public.registration_access_invites WHERE token_hash=encode(extensions.digest(p_token,'sha256'),'hex') AND audience='student' AND redeemed_at IS NULL AND expires_at>now() FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'This sponsored registration link is invalid, expired, or already used' USING ERRCODE='42501'; END IF;
  IF EXISTS (SELECT 1 FROM public.student_registration_payments WHERE user_id=uid AND status='paid') THEN RAISE EXCEPTION 'Student registration is already complete' USING ERRCODE='22023'; END IF;
  UPDATE public.profiles SET phone=trim(p_phone),university_id=p_university_id,status='active',is_active=true,updated_at=now() WHERE id=uid;
  INSERT INTO public.student_profiles(user_id,profile_id,university_id,student_id_number,program_of_study,faculty,department,level,admission_year,graduation_year,student_id_document_url,verification_status)
  VALUES(uid,uid,p_university_id,NULLIF(trim(p_student_id_number),''),NULLIF(trim(p_program),''),NULLIF(trim(p_faculty),''),NULLIF(trim(p_department),''),trim(p_level),p_admission_year,p_graduation_year,p_student_document_path,'pending')
  ON CONFLICT(user_id) DO UPDATE SET university_id=excluded.university_id,student_id_number=excluded.student_id_number,program_of_study=excluded.program_of_study,faculty=excluded.faculty,department=excluded.department,level=excluded.level,admission_year=excluded.admission_year,graduation_year=excluded.graduation_year,student_id_document_url=excluded.student_id_document_url,updated_at=now();
  INSERT INTO public.student_registration_payments(user_id,university_id,status,paid_at) VALUES(uid,p_university_id,'paid',now()) ON CONFLICT(user_id) DO UPDATE SET university_id=excluded.university_id,status='paid',paid_at=now(),updated_at=now() RETURNING id INTO registration_id;
  UPDATE public.registration_access_invites SET redeemed_at=now(),redeemed_by=uid WHERE id=invite_id;
  INSERT INTO public.audit_logs(actor_id,target_id,action,entity_type,entity_id,metadata) VALUES(uid,uid,'sponsored_student_registration_completed','registration_access_invites',invite_id,jsonb_build_object('registration_id',registration_id,'university_id',p_university_id));
  RETURN jsonb_build_object('status','paid','sponsored',true,'invite_id',invite_id);
END $$;

COMMIT;
