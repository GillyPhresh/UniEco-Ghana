BEGIN;

-- PROD-04: registration has no independently approved upfront fee in the
-- existing financial model. Record that decision explicitly and require the
-- later subscription payment lifecycle rather than inventing a charge.
CREATE TABLE IF NOT EXISTS public.vendor_registration_payment_states (
  vendor_id uuid PRIMARY KEY REFERENCES public.vendors(id) ON DELETE CASCADE,
  owner_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  payment_purpose text NOT NULL DEFAULT 'vendor_registration'
    CHECK (payment_purpose = 'vendor_registration'),
  payment_requirement text NOT NULL DEFAULT 'not_required'
    CHECK (payment_requirement IN ('not_required','required','paid')),
  state text NOT NULL DEFAULT 'awaiting_verification'
    CHECK (state IN ('awaiting_verification','awaiting_payment','payment_pending','paid','rejected')),
  payment_id uuid UNIQUE REFERENCES public.payments(id) ON DELETE RESTRICT,
  amount numeric(12,2),
  currency text NOT NULL DEFAULT 'GHS',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((payment_requirement = 'not_required' AND amount IS NULL AND payment_id IS NULL AND state = 'awaiting_verification') OR payment_requirement <> 'not_required')
);
ALTER TABLE public.vendor_registration_payment_states ENABLE ROW LEVEL SECURITY;
CREATE POLICY vendor_registration_payment_state_owner_read ON public.vendor_registration_payment_states
  FOR SELECT TO authenticated USING (owner_id = auth.uid() OR public.is_super_admin());
REVOKE INSERT, UPDATE, DELETE ON public.vendor_registration_payment_states FROM authenticated;

CREATE OR REPLACE FUNCTION public.create_vendor_registration_application(
  p_business_name text, p_business_category text, p_description text,
  p_location_address text, p_location_city text, p_location_region text,
  p_product_service_type text, p_contact_phone text, p_contact_email text,
  p_vendor_type text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE v_vendor_id uuid; v_existing uuid; v_slug text; v_is_student boolean; v_role smallint;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501'; END IF;
  IF p_vendor_type NOT IN ('student_vendor','external_vendor') OR NULLIF(btrim(p_business_name),'') IS NULL OR NULLIF(btrim(p_business_category),'') IS NULL OR NULLIF(btrim(p_description),'') IS NULL OR NULLIF(btrim(p_location_address),'') IS NULL OR NULLIF(btrim(p_location_city),'') IS NULL OR NULLIF(btrim(p_location_region),'') IS NULL OR NULLIF(btrim(p_product_service_type),'') IS NULL OR NULLIF(btrim(p_contact_phone),'') IS NULL THEN RAISE EXCEPTION 'Complete all required business details' USING ERRCODE='22023'; END IF;
  SELECT id INTO v_existing FROM public.vendors WHERE owner_id=auth.uid() FOR UPDATE;
  IF FOUND THEN RAISE EXCEPTION 'A vendor application already exists for this account' USING ERRCODE='23505'; END IF;
  v_is_student := p_vendor_type='student_vendor';
  IF v_is_student AND NOT EXISTS (SELECT 1 FROM public.student_profiles WHERE user_id=auth.uid() AND is_verified_student) THEN RAISE EXCEPTION 'Verified student status is required for a student vendor application' USING ERRCODE='42501'; END IF;
  v_slug := lower(regexp_replace(btrim(p_business_name),'[^a-z0-9]+','-','g'));
  INSERT INTO public.vendor_profiles(profile_id,vendor_type,verification_status,subscription_status,business_category,location_address,location_city,location_region,product_service_type)
  VALUES(auth.uid(),p_vendor_type,'pending','none',btrim(p_business_category),btrim(p_location_address),btrim(p_location_city),btrim(p_location_region),btrim(p_product_service_type));
  INSERT INTO public.vendors(university_id,owner_id,business_name,business_slug,business_type,description,is_student_business,is_verified,is_active,contact_phone,contact_email)
  SELECT university_id,auth.uid(),btrim(p_business_name),v_slug||'-'||substr(auth.uid()::text,1,8),btrim(p_business_category),btrim(p_description),v_is_student,false,false,btrim(p_contact_phone),NULLIF(btrim(p_contact_email),'') FROM public.profiles WHERE id=auth.uid() RETURNING id INTO v_vendor_id;
  INSERT INTO public.vendor_registration_payment_states(vendor_id,owner_id) VALUES(v_vendor_id,auth.uid());
  SELECT role_id INTO v_role FROM public.profiles WHERE id=auth.uid() FOR UPDATE;
  IF v_role NOT IN (2,3,4) THEN RAISE EXCEPTION 'Current role is not eligible for vendor onboarding' USING ERRCODE='42501'; END IF;
  UPDATE public.profiles SET role_id=CASE WHEN v_is_student THEN 3 ELSE 4 END WHERE id=auth.uid();
  INSERT INTO public.role_transition_audit(target_user_id,old_role_id,new_role_id,actor_id,reason) VALUES(auth.uid(),v_role,CASE WHEN v_is_student THEN 3 ELSE 4 END,auth.uid(),'vendor_onboarding_completed') ON CONFLICT DO NOTHING;
  INSERT INTO public.audit_logs(actor_id,target_id,action,entity_type,entity_id,metadata) VALUES(auth.uid(),auth.uid(),'vendor_registration_submitted','vendors',v_vendor_id,jsonb_build_object('vendor_type',p_vendor_type,'payment_requirement','not_required','payment_purpose','vendor_registration'));
  RETURN jsonb_build_object('vendor_id',v_vendor_id,'payment_requirement','not_required','state','awaiting_verification');
END $$;

REVOKE ALL ON FUNCTION public.create_vendor_registration_application(text,text,text,text,text,text,text,text,text,text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.create_vendor_registration_application(text,text,text,text,text,text,text,text,text,text) TO authenticated;
COMMIT;
