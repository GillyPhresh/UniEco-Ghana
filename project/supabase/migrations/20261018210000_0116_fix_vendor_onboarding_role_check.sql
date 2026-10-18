-- Vendor onboarding must validate role names, not assumed numeric role IDs.
-- Account access is automatic; vendor verification remains a separate review.
BEGIN;

CREATE OR REPLACE FUNCTION public.create_vendor_registration_application(
  p_business_name text, p_business_category text, p_description text,
  p_location_address text, p_location_city text, p_location_region text,
  p_product_service_type text, p_contact_phone text, p_contact_email text,
  p_vendor_type text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE
  v_vendor_id uuid;
  v_slug text;
  v_is_student boolean;
  v_role_name text;
  v_next_role_name text;
  v_old_role_id smallint;
  v_next_role_id smallint;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501';
  END IF;

  IF p_vendor_type NOT IN ('student_vendor','external_vendor')
     OR NULLIF(btrim(p_business_name),'') IS NULL
     OR NULLIF(btrim(p_business_category),'') IS NULL
     OR NULLIF(btrim(p_description),'') IS NULL
     OR NULLIF(btrim(p_location_address),'') IS NULL
     OR NULLIF(btrim(p_location_city),'') IS NULL
     OR NULLIF(btrim(p_location_region),'') IS NULL
     OR NULLIF(btrim(p_product_service_type),'') IS NULL
     OR NULLIF(btrim(p_contact_phone),'') IS NULL
  THEN
    RAISE EXCEPTION 'Complete all required business details' USING ERRCODE='22023';
  END IF;

  IF EXISTS (SELECT 1 FROM public.vendors vendor WHERE vendor.owner_id=auth.uid()) THEN
    RAISE EXCEPTION 'A vendor application already exists for this account' USING ERRCODE='23505';
  END IF;

  v_is_student := p_vendor_type='student_vendor';
  IF v_is_student
     AND NOT EXISTS (
       SELECT 1 FROM public.student_profiles
       WHERE user_id=auth.uid() AND is_verified_student
     )
  THEN
    RAISE EXCEPTION 'Verified student status is required for a student vendor application' USING ERRCODE='42501';
  END IF;

  SELECT role.name INTO v_role_name
  FROM public.profiles profile
  JOIN public.user_roles role ON role.id=profile.role_id
  WHERE profile.id=auth.uid() AND profile.is_active
  FOR UPDATE OF profile;

  IF v_role_name IS NULL OR v_role_name NOT IN ('student','student_vendor','external_vendor') THEN
    RAISE EXCEPTION 'Current role is not eligible for vendor onboarding' USING ERRCODE='42501';
  END IF;

  SELECT profile.role_id INTO v_old_role_id
  FROM public.profiles profile
  WHERE profile.id=auth.uid();

  v_slug := lower(regexp_replace(btrim(p_business_name),'[^a-z0-9]+','-','g'));

  INSERT INTO public.vendor_profiles(
    profile_id,vendor_type,verification_status,subscription_status,
    business_category,location_address,location_city,location_region,product_service_type
  )
  VALUES(
    auth.uid(),p_vendor_type,'pending','none',btrim(p_business_category),
    btrim(p_location_address),btrim(p_location_city),btrim(p_location_region),
    btrim(p_product_service_type)
  );

  INSERT INTO public.vendors(
    university_id,owner_id,business_name,business_slug,business_type,description,
    is_student_business,is_verified,is_active,contact_phone,contact_email
  )
  SELECT university_id,auth.uid(),btrim(p_business_name),v_slug||'-'||substr(auth.uid()::text,1,8),
    btrim(p_business_category),btrim(p_description),v_is_student,false,false,
    btrim(p_contact_phone),NULLIF(btrim(p_contact_email),'')
  FROM public.profiles
  WHERE id=auth.uid()
  RETURNING id INTO v_vendor_id;

  INSERT INTO public.vendor_registration_payment_states(vendor_id,owner_id)
  VALUES(v_vendor_id,auth.uid());

  v_next_role_name := CASE WHEN v_is_student THEN 'student_vendor' ELSE 'external_vendor' END;
  SELECT id INTO STRICT v_next_role_id
  FROM public.user_roles
  WHERE name=v_next_role_name;

  UPDATE public.profiles
  SET role_id=v_next_role_id,
      status='active',is_active=true,updated_at=now()
  WHERE id=auth.uid();

  INSERT INTO public.role_transition_audit(target_user_id,old_role_id,new_role_id,actor_id,reason)
  VALUES(auth.uid(),v_old_role_id,v_next_role_id,auth.uid(),'vendor_onboarding_completed')
  ON CONFLICT DO NOTHING;

  INSERT INTO public.audit_logs(actor_id,target_id,action,entity_type,entity_id,metadata)
  VALUES(auth.uid(),auth.uid(),'vendor_registration_submitted','vendors',v_vendor_id,
    jsonb_build_object('vendor_type',p_vendor_type,'payment_requirement','not_required','payment_purpose','vendor_registration'));

  RETURN jsonb_build_object('vendor_id',v_vendor_id,'payment_requirement','not_required','state','awaiting_verification');
END $$;

REVOKE ALL ON FUNCTION public.create_vendor_registration_application(text,text,text,text,text,text,text,text,text,text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.create_vendor_registration_application(text,text,text,text,text,text,text,text,text,text) TO authenticated;

COMMIT;
