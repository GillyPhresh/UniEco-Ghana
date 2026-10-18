-- One-time Super Admin sponsorship for people who cannot pay registration by MoMo.
-- Normal registration remains payment-gated; this is an explicit, auditable exception.
BEGIN;

CREATE TABLE IF NOT EXISTS public.registration_access_invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token_hash text NOT NULL UNIQUE,
  audience text NOT NULL CHECK (audience IN ('student','vendor')),
  created_by uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  note text,
  expires_at timestamptz NOT NULL,
  redeemed_at timestamptz,
  redeemed_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (expires_at > created_at),
  CHECK ((redeemed_at IS NULL AND redeemed_by IS NULL) OR (redeemed_at IS NOT NULL AND redeemed_by IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS registration_access_invites_active_idx
  ON public.registration_access_invites (audience, expires_at)
  WHERE redeemed_at IS NULL;
ALTER TABLE public.registration_access_invites ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.registration_access_invites FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.create_registration_access_invite(
  p_audience text,
  p_expires_hours integer DEFAULT 168,
  p_note text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE
  uid uuid := auth.uid();
  token text := 'UEI_' || encode(extensions.gen_random_bytes(32), 'hex');
  invite_id uuid;
  expires_at_value timestamptz;
BEGIN
  IF uid IS NULL OR NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Super administrator access required' USING ERRCODE='42501';
  END IF;
  IF p_audience NOT IN ('student','vendor') THEN
    RAISE EXCEPTION 'Invite audience must be student or vendor' USING ERRCODE='22023';
  END IF;
  IF p_expires_hours IS NULL OR p_expires_hours NOT BETWEEN 1 AND 720 THEN
    RAISE EXCEPTION 'Invite expiry must be between 1 and 720 hours' USING ERRCODE='22023';
  END IF;
  expires_at_value := now() + make_interval(hours => p_expires_hours);
  INSERT INTO public.registration_access_invites(token_hash,audience,created_by,note,expires_at)
  VALUES (encode(extensions.digest(token, 'sha256'), 'hex'), p_audience, uid, NULLIF(btrim(p_note),''), expires_at_value)
  RETURNING id INTO invite_id;
  INSERT INTO public.audit_logs(actor_id,target_id,action,entity_type,entity_id,metadata)
  VALUES(uid,uid,'registration_access_invite_created','registration_access_invites',invite_id,
    jsonb_build_object('audience',p_audience,'expires_at',expires_at_value,'note',p_note));
  RETURN jsonb_build_object('id',invite_id,'token',token,'audience',p_audience,'expires_at',expires_at_value);
END $$;

CREATE OR REPLACE FUNCTION public.complete_student_registration_with_invite(
  p_token text,
  p_university_id uuid,
  p_phone text,
  p_student_id_number text,
  p_program text,
  p_faculty text,
  p_department text,
  p_level text,
  p_admission_year integer,
  p_graduation_year integer DEFAULT NULL,
  p_student_document_path text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE
  uid uuid := auth.uid();
  profile_row public.profiles%ROWTYPE;
  invite_id uuid;
  registration_id uuid;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501'; END IF;
  SELECT * INTO profile_row FROM public.profiles WHERE id=uid FOR UPDATE;
  IF NOT FOUND OR public.current_app_role() NOT IN ('student','student_vendor') OR NOT profile_row.is_active THEN
    RAISE EXCEPTION 'Student registration is unavailable' USING ERRCODE='42501';
  END IF;
  IF p_phone IS NULL OR p_phone !~ '^\+?[0-9 ()-]{9,20}$'
     OR length(trim(p_student_id_number)) NOT BETWEEN 2 AND 80
     OR length(trim(p_program)) NOT BETWEEN 2 AND 120
     OR length(trim(p_faculty)) NOT BETWEEN 2 AND 120
     OR length(trim(p_department)) NOT BETWEEN 2 AND 120
     OR length(trim(p_level)) NOT BETWEEN 1 AND 30
     OR p_admission_year NOT BETWEEN 1950 AND extract(year FROM now())::integer+1
     OR NOT EXISTS (SELECT 1 FROM public.universities WHERE id=p_university_id AND is_enabled)
     OR (p_student_document_path IS NOT NULL AND p_student_document_path NOT LIKE uid::text||'/%') THEN
    RAISE EXCEPTION 'Student information is invalid' USING ERRCODE='22023';
  END IF;
  SELECT id INTO invite_id FROM public.registration_access_invites
  WHERE token_hash=encode(extensions.digest(p_token,'sha256'),'hex')
    AND audience='student' AND redeemed_at IS NULL AND expires_at>now()
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'This sponsored registration link is invalid, expired, or already used' USING ERRCODE='42501'; END IF;
  IF EXISTS (SELECT 1 FROM public.student_registration_payments WHERE user_id=uid AND status='paid') THEN
    RAISE EXCEPTION 'Student registration is already complete' USING ERRCODE='22023';
  END IF;
  UPDATE public.profiles SET phone=trim(p_phone),university_id=p_university_id,status='active',is_active=true,updated_at=now() WHERE id=uid;
  INSERT INTO public.student_profiles(user_id,profile_id,university_id,student_id_number,program_of_study,faculty,department,level,admission_year,graduation_year,student_id_document_url,verification_status)
  VALUES(uid,uid,p_university_id,trim(p_student_id_number),trim(p_program),trim(p_faculty),trim(p_department),trim(p_level),p_admission_year,p_graduation_year,p_student_document_path,'pending')
  ON CONFLICT(user_id) DO UPDATE SET university_id=excluded.university_id,student_id_number=excluded.student_id_number,program_of_study=excluded.program_of_study,faculty=excluded.faculty,department=excluded.department,level=excluded.level,admission_year=excluded.admission_year,graduation_year=excluded.graduation_year,student_id_document_url=excluded.student_id_document_url,updated_at=now();
  INSERT INTO public.student_registration_payments(user_id,university_id,status,paid_at)
  VALUES(uid,p_university_id,'paid',now())
  ON CONFLICT(user_id) DO UPDATE SET university_id=excluded.university_id,status='paid',paid_at=now(),updated_at=now()
  RETURNING id INTO registration_id;
  UPDATE public.registration_access_invites SET redeemed_at=now(),redeemed_by=uid WHERE id=invite_id;
  INSERT INTO public.audit_logs(actor_id,target_id,action,entity_type,entity_id,metadata)
  VALUES(uid,uid,'sponsored_student_registration_completed','registration_access_invites',invite_id,jsonb_build_object('registration_id',registration_id,'university_id',p_university_id));
  RETURN jsonb_build_object('status','paid','sponsored',true,'invite_id',invite_id);
END $$;

CREATE OR REPLACE FUNCTION public.redeem_vendor_registration_invite(
  p_token text,
  p_vendor_id uuid
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE uid uuid := auth.uid(); invite_id uuid;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501'; END IF;
  IF public.current_app_role() NOT IN ('student_vendor','external_vendor') THEN RAISE EXCEPTION 'Vendor registration is unavailable' USING ERRCODE='42501'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.vendors WHERE id=p_vendor_id AND owner_id=uid) THEN RAISE EXCEPTION 'Vendor registration access denied' USING ERRCODE='42501'; END IF;
  SELECT id INTO invite_id FROM public.registration_access_invites
  WHERE token_hash=encode(extensions.digest(p_token,'sha256'),'hex')
    AND audience='vendor' AND redeemed_at IS NULL AND expires_at>now()
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'This sponsored registration link is invalid, expired, or already used' USING ERRCODE='42501'; END IF;
  UPDATE public.vendor_registration_payment_states SET payment_requirement='paid',state='paid',amount=20.00,currency='GHS',updated_at=now() WHERE vendor_id=p_vendor_id AND owner_id=uid;
  UPDATE public.registration_access_invites SET redeemed_at=now(),redeemed_by=uid WHERE id=invite_id;
  INSERT INTO public.audit_logs(actor_id,target_id,action,entity_type,entity_id,metadata)
  VALUES(uid,uid,'sponsored_vendor_registration_completed','registration_access_invites',invite_id,jsonb_build_object('vendor_id',p_vendor_id));
  RETURN jsonb_build_object('status','paid','sponsored',true,'invite_id',invite_id,'vendor_id',p_vendor_id);
END $$;

CREATE OR REPLACE FUNCTION public.get_my_registration_access()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE uid uuid := auth.uid(); role_name text := public.current_app_role(); required_amount numeric(12,2); paid boolean := false; sponsored boolean := false; audience_name text;
BEGIN
  IF uid IS NULL THEN RETURN jsonb_build_object('allowed',false,'role',NULL,'required_amount',NULL,'status','unauthenticated'); END IF;
  IF role_name IN ('moderator','super_admin','university_admin') THEN RETURN jsonb_build_object('allowed',true,'role',role_name,'required_amount',0,'status','staff_exempt'); END IF;
  audience_name := CASE WHEN role_name='student' THEN 'student' WHEN role_name IN ('student_vendor','external_vendor') THEN 'vendor' ELSE NULL END;
  IF audience_name IS NULL THEN RETURN jsonb_build_object('allowed',false,'role',role_name,'required_amount',NULL,'status','registration_required'); END IF;
  sponsored := EXISTS (SELECT 1 FROM public.registration_access_invites WHERE redeemed_by=uid AND audience=audience_name);
  IF role_name='student' THEN SELECT registration_fee INTO required_amount FROM public.student_financial_settings WHERE singleton; ELSE SELECT vendor_registration_fee INTO required_amount FROM public.student_financial_settings WHERE singleton; END IF;
  paid := sponsored OR EXISTS (SELECT 1 FROM public.payments WHERE user_id=uid AND payment_type=CASE WHEN role_name='student' THEN 'student_registration' ELSE 'vendor_registration' END AND status='success' AND amount=required_amount AND currency='GHS');
  RETURN jsonb_build_object('allowed',paid,'role',role_name,'required_amount',required_amount,'currency','GHS','status',CASE WHEN sponsored THEN 'sponsored' WHEN paid THEN 'paid' ELSE 'payment_required' END,'sponsored',sponsored);
END $$;

REVOKE ALL ON FUNCTION public.create_registration_access_invite(text,integer,text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.create_registration_access_invite(text,integer,text) TO authenticated;
REVOKE ALL ON FUNCTION public.complete_student_registration_with_invite(text,uuid,text,text,text,text,text,text,integer,integer,text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.complete_student_registration_with_invite(text,uuid,text,text,text,text,text,text,integer,integer,text) TO authenticated;
REVOKE ALL ON FUNCTION public.redeem_vendor_registration_invite(text,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.redeem_vendor_registration_invite(text,uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.get_my_registration_access() FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.get_my_registration_access() TO authenticated;

COMMIT;
