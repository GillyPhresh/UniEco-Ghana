BEGIN;

CREATE TABLE IF NOT EXISTS public.ad_campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id uuid NOT NULL REFERENCES public.vendors(id) ON DELETE CASCADE,
  university_id uuid REFERENCES public.universities(id) ON DELETE SET NULL,
  listing_type text NOT NULL CHECK(listing_type IN ('business','product','service','event')),
  listing_id uuid NOT NULL,
  placement text NOT NULL CHECK(placement IN ('sponsored_listing','featured_vendor','promoted_product','promoted_service','campus_banner')),
  title text NOT NULL,
  requested_budget numeric(12,2) NOT NULL DEFAULT 0 CHECK(requested_budget>=0),
  currency text NOT NULL DEFAULT 'GHS',
  actual_spend numeric(12,2) NOT NULL DEFAULT 0 CHECK(actual_spend>=0),
  status text NOT NULL DEFAULT 'pending' CHECK(status IN ('draft','pending','approved','active','paused','completed','rejected','cancelled')),
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  reviewed_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  rejection_reason text,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK(ends_at>starts_at)
);
ALTER TABLE public.ad_campaigns ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS ad_campaigns_active_idx ON public.ad_campaigns(status,university_id,starts_at,ends_at);

-- The legacy request table is no longer browser-mutable. It remains readable
-- for existing vendor history while campaigns provide the canonical lifecycle.
REVOKE INSERT,UPDATE,DELETE ON public.ad_requests,public.advertisements,public.featured_listings,public.ad_campaigns FROM authenticated;
DROP POLICY IF EXISTS ad_requests_vendor_manage ON public.ad_requests;
CREATE POLICY ad_campaigns_vendor_read ON public.ad_campaigns FOR SELECT TO authenticated USING(EXISTS(SELECT 1 FROM public.vendors v WHERE v.id=vendor_id AND v.owner_id=auth.uid()));
CREATE POLICY ad_campaigns_staff_read ON public.ad_campaigns FOR SELECT TO authenticated USING(public.is_staff());

CREATE OR REPLACE FUNCTION public.create_own_ad_campaign(
  p_listing_type text,p_listing_id uuid,p_placement text,p_title text,p_requested_budget numeric,
  p_starts_at timestamptz,p_ends_at timestamptz
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE v_vendor uuid; v_university uuid; v_campaign uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501'; END IF;
  SELECT id,university_id INTO v_vendor,v_university FROM public.vendors WHERE owner_id=auth.uid();
  IF v_vendor IS NULL THEN RAISE EXCEPTION 'Vendor access required' USING ERRCODE='42501'; END IF;
  IF p_listing_type NOT IN ('business','product','service','event') OR p_placement NOT IN ('sponsored_listing','featured_vendor','promoted_product','promoted_service','campus_banner') THEN RAISE EXCEPTION 'Invalid campaign classification' USING ERRCODE='22023'; END IF;
  IF NULLIF(btrim(p_title),'') IS NULL OR COALESCE(p_requested_budget,0)<0 OR p_starts_at<now()-interval '5 minutes' OR p_ends_at<=p_starts_at OR p_ends_at>p_starts_at+interval '180 days' THEN RAISE EXCEPTION 'Invalid campaign details' USING ERRCODE='22023'; END IF;
  IF (p_listing_type='business' AND NOT EXISTS(SELECT 1 FROM public.businesses WHERE id=p_listing_id AND vendor_id=v_vendor))
     OR (p_listing_type='product' AND NOT EXISTS(SELECT 1 FROM public.products p JOIN public.businesses b ON b.id=p.business_id WHERE p.id=p_listing_id AND b.vendor_id=v_vendor))
     OR (p_listing_type='service' AND NOT EXISTS(SELECT 1 FROM public.services s JOIN public.businesses b ON b.id=s.business_id WHERE s.id=p_listing_id AND b.vendor_id=v_vendor))
     OR (p_listing_type='event' AND NOT EXISTS(SELECT 1 FROM public.events WHERE id=p_listing_id AND organizer_id=auth.uid())) THEN RAISE EXCEPTION 'Campaign listing is not owned by the caller' USING ERRCODE='42501'; END IF;
  INSERT INTO public.ad_campaigns(vendor_id,university_id,listing_type,listing_id,placement,title,requested_budget,starts_at,ends_at,status)
  VALUES(v_vendor,v_university,p_listing_type,p_listing_id,p_placement,btrim(p_title),COALESCE(p_requested_budget,0),p_starts_at,p_ends_at,'pending') RETURNING id INTO v_campaign;
  RETURN v_campaign;
END $$;

CREATE OR REPLACE FUNCTION public.review_admin_ad_campaign(p_campaign_id uuid,p_decision text,p_priority integer DEFAULT 0,p_note text DEFAULT NULL)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE v_university uuid;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_staff() THEN RAISE EXCEPTION 'Staff access required' USING ERRCODE='42501'; END IF;
  IF p_decision NOT IN ('approved','rejected') THEN RAISE EXCEPTION 'Invalid campaign decision' USING ERRCODE='22023'; END IF;
  SELECT university_id INTO v_university FROM public.ad_campaigns WHERE id=p_campaign_id AND status='pending' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Only pending campaigns may be reviewed' USING ERRCODE='22023'; END IF;
  IF public.current_app_role()='university_admin' AND NOT public.can_manage_university(v_university) THEN RAISE EXCEPTION 'University scope required' USING ERRCODE='42501'; END IF;
  IF p_decision='rejected' AND NULLIF(btrim(p_note),'') IS NULL THEN RAISE EXCEPTION 'Rejection reason required' USING ERRCODE='22023'; END IF;
  UPDATE public.ad_campaigns SET status=p_decision,reviewed_by=auth.uid(),reviewed_at=now(),rejection_reason=CASE WHEN p_decision='rejected' THEN btrim(p_note) ELSE NULL END,updated_at=now() WHERE id=p_campaign_id;
  IF p_decision='approved' THEN INSERT INTO public.featured_listings(listing_type,listing_id,placement_type,university_id,priority,is_active,start_date,end_date) SELECT listing_type,listing_id,CASE WHEN placement='featured_vendor' THEN 'featured' ELSE 'sponsored' END,university_id,GREATEST(COALESCE(p_priority,0),0),false,starts_at,ends_at FROM public.ad_campaigns WHERE id=p_campaign_id; END IF;
  PERFORM public.record_trusted_admin_action('campaign.'||p_decision,'advertising','ad_campaign',p_campaign_id,jsonb_build_object('priority',GREATEST(COALESCE(p_priority,0),0)));
  RETURN true;
END $$;

CREATE OR REPLACE FUNCTION public.activate_admin_ad_campaign(p_campaign_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE v_university uuid;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_staff() THEN RAISE EXCEPTION 'Staff access required' USING ERRCODE='42501'; END IF;
  SELECT university_id INTO v_university FROM public.ad_campaigns WHERE id=p_campaign_id AND status='approved' AND starts_at<=now() AND ends_at>now() FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Campaign is not eligible for activation' USING ERRCODE='22023'; END IF;
  IF public.current_app_role()='university_admin' AND NOT public.can_manage_university(v_university) THEN RAISE EXCEPTION 'University scope required' USING ERRCODE='42501'; END IF;
  UPDATE public.ad_campaigns SET status='active',updated_at=now() WHERE id=p_campaign_id;
  UPDATE public.featured_listings SET is_active=true,updated_at=now() WHERE listing_id=(SELECT listing_id FROM public.ad_campaigns WHERE id=p_campaign_id) AND start_date=(SELECT starts_at FROM public.ad_campaigns WHERE id=p_campaign_id) AND end_date=(SELECT ends_at FROM public.ad_campaigns WHERE id=p_campaign_id);
  PERFORM public.record_trusted_admin_action('campaign.activated','advertising','ad_campaign',p_campaign_id,'{}'); RETURN true;
END $$;

CREATE OR REPLACE FUNCTION public.cancel_own_ad_campaign(p_campaign_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501'; END IF;
  UPDATE public.ad_campaigns SET status='cancelled',updated_at=now() WHERE id=p_campaign_id AND vendor_id IN (SELECT id FROM public.vendors WHERE owner_id=auth.uid()) AND status IN ('draft','pending','approved');
  IF NOT FOUND THEN RAISE EXCEPTION 'Campaign cannot be cancelled by the caller' USING ERRCODE='42501'; END IF;
  UPDATE public.featured_listings SET is_active=false,updated_at=now() WHERE listing_id=(SELECT listing_id FROM public.ad_campaigns WHERE id=p_campaign_id) AND start_date=(SELECT starts_at FROM public.ad_campaigns WHERE id=p_campaign_id) AND end_date=(SELECT ends_at FROM public.ad_campaigns WHERE id=p_campaign_id);
  RETURN true;
END $$;

CREATE OR REPLACE FUNCTION public.get_active_promoted_listings(p_listing_type text,p_university_id uuid DEFAULT NULL)
RETURNS TABLE(listing_id uuid,listing_type text,placement_label text,priority integer) LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
 SELECT f.listing_id,f.listing_type,CASE WHEN f.placement_type='featured' THEN 'Featured' ELSE 'Sponsored' END,f.priority
 FROM public.featured_listings f WHERE f.listing_type=p_listing_type AND f.is_active AND (f.start_date IS NULL OR f.start_date<=now()) AND (f.end_date IS NULL OR f.end_date>=now()) AND (p_university_id IS NULL OR f.university_id=p_university_id) ORDER BY f.priority DESC,f.created_at DESC
$$;

REVOKE ALL ON FUNCTION public.create_own_ad_campaign(text,uuid,text,text,numeric,timestamptz,timestamptz),public.review_admin_ad_campaign(uuid,text,integer,text),public.activate_admin_ad_campaign(uuid),public.cancel_own_ad_campaign(uuid),public.get_active_promoted_listings(text,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.create_own_ad_campaign(text,uuid,text,text,numeric,timestamptz,timestamptz),public.review_admin_ad_campaign(uuid,text,integer,text),public.activate_admin_ad_campaign(uuid),public.cancel_own_ad_campaign(uuid),public.get_active_promoted_listings(text,uuid) TO authenticated;
COMMIT;
