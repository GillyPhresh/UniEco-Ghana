-- Replace the API-backed map picker with low-cost address, coordinate, and
-- vendor-supplied Google Maps link capture. Navigation remains external.
BEGIN;

ALTER TABLE public.vendors
  ADD COLUMN IF NOT EXISTS location_maps_url text;

ALTER TABLE public.vendors DROP CONSTRAINT IF EXISTS vendors_location_selection_source_check;
ALTER TABLE public.vendors ADD CONSTRAINT vendors_location_selection_source_check
  CHECK (location_selection_source IN ('not_provided','owner_address','owner_pin','google_maps_link','google_place','admin_reviewed'));

DROP FUNCTION IF EXISTS public.set_my_vendor_location(uuid,numeric,numeric,text,text,text,text,text,text);

CREATE OR REPLACE FUNCTION public.set_my_vendor_location(
  p_vendor_id uuid,
  p_latitude numeric DEFAULT NULL,
  p_longitude numeric DEFAULT NULL,
  p_address text DEFAULT NULL,
  p_city text DEFAULT NULL,
  p_region text DEFAULT NULL,
  p_place_id text DEFAULT NULL,
  p_selection_source text DEFAULT 'owner_address',
  p_public_visibility text DEFAULT 'business_location',
  p_maps_url text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE v_vendor public.vendors%ROWTYPE; v_location_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501'; END IF;
  IF (p_latitude IS NULL) <> (p_longitude IS NULL) THEN
    RAISE EXCEPTION 'Latitude and longitude must be supplied together' USING ERRCODE='22023';
  END IF;
  IF p_latitude IS NOT NULL AND (p_latitude NOT BETWEEN -90 AND 90 OR p_longitude NOT BETWEEN -180 AND 180) THEN
    RAISE EXCEPTION 'Invalid latitude or longitude' USING ERRCODE='22023';
  END IF;
  IF p_selection_source NOT IN ('owner_address','owner_pin','google_maps_link') THEN RAISE EXCEPTION 'Invalid location source' USING ERRCODE='22023'; END IF;
  IF p_public_visibility NOT IN ('business_location','service_area','pickup_only','private') THEN RAISE EXCEPTION 'Invalid location visibility' USING ERRCODE='22023'; END IF;
  IF p_maps_url IS NOT NULL AND p_maps_url !~* '^https://([a-z0-9-]+\.)*google\.com/maps(/|\?|$)' AND p_maps_url !~* '^https://maps\.app\.goo\.gl/' THEN
    RAISE EXCEPTION 'Unsupported Google Maps link' USING ERRCODE='22023';
  END IF;
  SELECT * INTO v_vendor FROM public.vendors WHERE id=p_vendor_id AND owner_id=auth.uid() FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Vendor location access denied' USING ERRCODE='42501'; END IF;
  UPDATE public.vendors SET gps_latitude=CASE WHEN p_latitude IS NULL THEN NULL ELSE round(p_latitude,6) END,
    gps_longitude=CASE WHEN p_longitude IS NULL THEN NULL ELSE round(p_longitude,6) END,
    location_maps_url=NULLIF(btrim(p_maps_url),''), location_place_id=NULLIF(btrim(p_place_id),''),
    location_selection_source=p_selection_source, location_verification_status='pending_review',
    location_last_confirmed_at=now(), location_public_visibility=p_public_visibility, updated_at=now()
    WHERE id=p_vendor_id;
  SELECT id INTO v_location_id FROM public.locations WHERE owner_type='vendor' AND owner_id=p_vendor_id LIMIT 1 FOR UPDATE;
  IF v_location_id IS NULL THEN
    INSERT INTO public.locations(university_id,owner_type,owner_id,label,address_line,city,region,latitude,longitude,place_id,selection_source,verification_status,last_confirmed_at)
    VALUES(v_vendor.university_id,'vendor',p_vendor_id,v_vendor.business_name,NULLIF(btrim(p_address),''),NULLIF(btrim(p_city),''),NULLIF(btrim(p_region),''),CASE WHEN p_latitude IS NULL THEN NULL ELSE round(p_latitude,6) END,CASE WHEN p_longitude IS NULL THEN NULL ELSE round(p_longitude,6) END,NULLIF(btrim(p_place_id),''),CASE WHEN p_selection_source='google_maps_link' THEN 'owner_address' ELSE p_selection_source END,'pending_review',now()) RETURNING id INTO v_location_id;
  ELSE
    UPDATE public.locations SET university_id=v_vendor.university_id,address_line=NULLIF(btrim(p_address),''),city=NULLIF(btrim(p_city),''),region=NULLIF(btrim(p_region),''),latitude=CASE WHEN p_latitude IS NULL THEN NULL ELSE round(p_latitude,6) END,longitude=CASE WHEN p_longitude IS NULL THEN NULL ELSE round(p_longitude,6) END,place_id=NULLIF(btrim(p_place_id),''),selection_source=CASE WHEN p_selection_source='google_maps_link' THEN 'owner_address' ELSE p_selection_source END,verification_status='pending_review',last_confirmed_at=now() WHERE id=v_location_id;
  END IF;
  INSERT INTO public.audit_logs(actor_id,target_id,action,entity_type,entity_id,metadata)
  VALUES(auth.uid(),auth.uid(),'vendor_location_submitted','vendors',p_vendor_id,jsonb_build_object('source',p_selection_source,'latitude',p_latitude,'longitude',p_longitude,'maps_url',NULLIF(btrim(p_maps_url),'')));
  RETURN jsonb_build_object('vendor_id',p_vendor_id,'location_id',v_location_id,'verification_status','pending_review');
END $$;

REVOKE ALL ON FUNCTION public.set_my_vendor_location(uuid,numeric,numeric,text,text,text,text,text,text,text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.set_my_vendor_location(uuid,numeric,numeric,text,text,text,text,text,text,text) TO authenticated;

COMMIT;
