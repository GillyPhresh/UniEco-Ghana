-- Google Maps-ready vendor location metadata and owner-controlled pin updates.
-- Coordinates are never treated as verified merely because a vendor submitted them.
BEGIN;

ALTER TABLE public.vendors
  ADD COLUMN IF NOT EXISTS location_place_id text,
  ADD COLUMN IF NOT EXISTS location_selection_source text NOT NULL DEFAULT 'not_provided'
    CHECK (location_selection_source IN ('not_provided','owner_address','owner_pin','google_place','admin_reviewed')),
  ADD COLUMN IF NOT EXISTS location_verification_status text NOT NULL DEFAULT 'not_submitted'
    CHECK (location_verification_status IN ('not_submitted','pending_review','verified','rejected')),
  ADD COLUMN IF NOT EXISTS location_last_confirmed_at timestamptz,
  ADD COLUMN IF NOT EXISTS location_public_visibility text NOT NULL DEFAULT 'business_location'
    CHECK (location_public_visibility IN ('business_location','service_area','pickup_only','private'));

ALTER TABLE public.locations
  ADD COLUMN IF NOT EXISTS place_id text,
  ADD COLUMN IF NOT EXISTS selection_source text NOT NULL DEFAULT 'owner_pin'
    CHECK (selection_source IN ('owner_address','owner_pin','google_place','admin_reviewed')),
  ADD COLUMN IF NOT EXISTS verification_status text NOT NULL DEFAULT 'pending_review'
    CHECK (verification_status IN ('pending_review','verified','rejected')),
  ADD COLUMN IF NOT EXISTS last_confirmed_at timestamptz;

CREATE INDEX IF NOT EXISTS vendors_university_coordinates_idx
  ON public.vendors(university_id, gps_latitude, gps_longitude)
  WHERE is_active AND gps_latitude IS NOT NULL AND gps_longitude IS NOT NULL;

CREATE OR REPLACE FUNCTION public.set_my_vendor_location(
  p_vendor_id uuid,
  p_latitude numeric,
  p_longitude numeric,
  p_address text DEFAULT NULL,
  p_city text DEFAULT NULL,
  p_region text DEFAULT NULL,
  p_place_id text DEFAULT NULL,
  p_selection_source text DEFAULT 'owner_pin',
  p_public_visibility text DEFAULT 'business_location'
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE v_vendor public.vendors%ROWTYPE; v_location_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501'; END IF;
  IF p_latitude IS NULL OR p_longitude IS NULL OR p_latitude NOT BETWEEN -90 AND 90 OR p_longitude NOT BETWEEN -180 AND 180 THEN
    RAISE EXCEPTION 'A valid map location is required' USING ERRCODE='22023';
  END IF;
  IF p_selection_source NOT IN ('owner_address','owner_pin','google_place') THEN RAISE EXCEPTION 'Invalid location source' USING ERRCODE='22023'; END IF;
  IF p_public_visibility NOT IN ('business_location','service_area','pickup_only','private') THEN RAISE EXCEPTION 'Invalid location visibility' USING ERRCODE='22023'; END IF;
  SELECT * INTO v_vendor FROM public.vendors WHERE id=p_vendor_id AND owner_id=auth.uid() FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Vendor location access denied' USING ERRCODE='42501'; END IF;
  UPDATE public.vendors SET gps_latitude=round(p_latitude,6), gps_longitude=round(p_longitude,6),
    location_place_id=NULLIF(btrim(p_place_id),''), location_selection_source=p_selection_source,
    location_verification_status='pending_review', location_last_confirmed_at=now(),
    location_public_visibility=p_public_visibility, updated_at=now() WHERE id=p_vendor_id;
  SELECT id INTO v_location_id FROM public.locations WHERE owner_type='vendor' AND owner_id=p_vendor_id LIMIT 1 FOR UPDATE;
  IF v_location_id IS NULL THEN
    INSERT INTO public.locations(university_id,owner_type,owner_id,label,address_line,city,region,latitude,longitude,place_id,selection_source,verification_status,last_confirmed_at)
    VALUES(v_vendor.university_id,'vendor',p_vendor_id,v_vendor.business_name,NULLIF(btrim(p_address),''),NULLIF(btrim(p_city),''),NULLIF(btrim(p_region),''),round(p_latitude,6),round(p_longitude,6),NULLIF(btrim(p_place_id),''),p_selection_source,'pending_review',now()) RETURNING id INTO v_location_id;
  ELSE
    UPDATE public.locations SET university_id=v_vendor.university_id,address_line=NULLIF(btrim(p_address),''),city=NULLIF(btrim(p_city),''),region=NULLIF(btrim(p_region),''),latitude=round(p_latitude,6),longitude=round(p_longitude,6),place_id=NULLIF(btrim(p_place_id),''),selection_source=p_selection_source,verification_status='pending_review',last_confirmed_at=now() WHERE id=v_location_id;
  END IF;
  INSERT INTO public.audit_logs(actor_id,target_id,action,entity_type,entity_id,metadata)
  VALUES(auth.uid(),auth.uid(),'vendor_location_submitted','vendors',p_vendor_id,jsonb_build_object('source',p_selection_source,'latitude',round(p_latitude,6),'longitude',round(p_longitude,6),'place_id',NULLIF(btrim(p_place_id),'')));
  RETURN jsonb_build_object('vendor_id',p_vendor_id,'location_id',v_location_id,'verification_status','pending_review');
END $$;

CREATE OR REPLACE FUNCTION public.review_vendor_location(p_vendor_id uuid, p_status text, p_note text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE v_university_id uuid;
BEGIN
  SELECT university_id INTO v_university_id FROM public.vendors WHERE id=p_vendor_id;
  IF NOT (public.is_super_admin() OR (public.current_app_role()='university_admin' AND public.can_manage_university(v_university_id))) THEN
    RAISE EXCEPTION 'Location review access denied' USING ERRCODE='42501';
  END IF;
  IF p_status NOT IN ('verified','rejected') THEN RAISE EXCEPTION 'Invalid location review status' USING ERRCODE='22023'; END IF;
  UPDATE public.vendors SET location_verification_status=p_status, location_selection_source=CASE WHEN p_status='verified' THEN 'admin_reviewed' ELSE location_selection_source END, updated_at=now() WHERE id=p_vendor_id;
  UPDATE public.locations SET verification_status=p_status WHERE owner_type='vendor' AND owner_id=p_vendor_id;
  INSERT INTO public.audit_logs(actor_id,target_id,action,entity_type,entity_id,metadata) VALUES(auth.uid(),auth.uid(),'vendor_location_reviewed','vendors',p_vendor_id,jsonb_build_object('status',p_status,'note',p_note));
  RETURN jsonb_build_object('vendor_id',p_vendor_id,'status',p_status);
END $$;

CREATE OR REPLACE FUNCTION public.get_vendor_location_review(p_vendor_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE result jsonb; v_university_id uuid;
BEGIN
  SELECT university_id INTO v_university_id FROM public.vendors WHERE id=p_vendor_id;
  IF NOT (public.is_super_admin() OR (public.current_app_role()='university_admin' AND public.can_manage_university(v_university_id))) THEN
    RAISE EXCEPTION 'Location review access denied' USING ERRCODE='42501';
  END IF;
  SELECT jsonb_build_object(
    'vendor_id',v.id,'business_name',v.business_name,'latitude',v.gps_latitude,'longitude',v.gps_longitude,
    'place_id',v.location_place_id,'selection_source',v.location_selection_source,
    'verification_status',v.location_verification_status,'public_visibility',v.location_public_visibility,
    'address',l.address_line,'city',l.city,'region',l.region,'last_confirmed_at',v.location_last_confirmed_at
  ) INTO result
  FROM public.vendors v LEFT JOIN public.locations l ON l.owner_type='vendor' AND l.owner_id=v.id
  WHERE v.id=p_vendor_id;
  RETURN result;
END $$;

REVOKE ALL ON FUNCTION public.set_my_vendor_location(uuid,numeric,numeric,text,text,text,text,text,text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.set_my_vendor_location(uuid,numeric,numeric,text,text,text,text,text,text) TO authenticated;
REVOKE ALL ON FUNCTION public.review_vendor_location(uuid,text,text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.review_vendor_location(uuid,text,text) TO authenticated;
REVOKE ALL ON FUNCTION public.get_vendor_location_review(uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.get_vendor_location_review(uuid) TO authenticated;

COMMIT;
