-- Module 17: trusted, transaction-backed reviews and vendor reputation.
-- Local-only pending migration; do not apply remotely in this module.
BEGIN;

ALTER TABLE public.reviews
  ADD COLUMN IF NOT EXISTS service_id uuid REFERENCES public.services(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS order_id uuid REFERENCES public.orders(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS university_id uuid REFERENCES public.universities(id) ON DELETE SET NULL;

-- Product and service reviews retain their vendor for aggregate reputation;
-- an event review is the only non-vendor target shape. No new event reviews
-- are issued until an authoritative participation relation exists.
ALTER TABLE public.reviews ADD CONSTRAINT reviews_one_target CHECK (
  (event_id IS NOT NULL AND vendor_id IS NULL AND product_id IS NULL AND service_id IS NULL)
  OR
  (event_id IS NULL AND vendor_id IS NOT NULL AND NOT (product_id IS NOT NULL AND service_id IS NOT NULL))
) NOT VALID;

CREATE UNIQUE INDEX IF NOT EXISTS reviews_verified_vendor_once_per_order ON public.reviews(reviewer_id, vendor_id, order_id) WHERE vendor_id IS NOT NULL AND order_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS reviews_verified_product_once_per_order ON public.reviews(reviewer_id, product_id, order_id) WHERE product_id IS NOT NULL AND order_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS reviews_verified_service_once_per_order ON public.reviews(reviewer_id, service_id, order_id) WHERE service_id IS NOT NULL AND order_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.recalculate_vendor_reputation(p_vendor_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN
  UPDATE public.vendors v SET
    rating_avg=COALESCE((SELECT round(avg(r.rating)::numeric,2) FROM public.reviews r LEFT JOIN public.review_moderation m ON m.review_id=r.id WHERE r.vendor_id=p_vendor_id AND r.is_approved AND COALESCE(m.moderation_status,'published')='published'),0),
    rating_count=(SELECT count(*) FROM public.reviews r LEFT JOIN public.review_moderation m ON m.review_id=r.id WHERE r.vendor_id=p_vendor_id AND r.is_approved AND COALESCE(m.moderation_status,'published')='published'),
    updated_at=now()
  WHERE v.id=p_vendor_id;
END $$;

CREATE OR REPLACE FUNCTION public.refresh_review_reputation()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN
  IF TG_OP='DELETE' THEN
    PERFORM public.recalculate_vendor_reputation(OLD.vendor_id);
    RETURN OLD;
  END IF;
  PERFORM public.recalculate_vendor_reputation(NEW.vendor_id);
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS reviews_reputation_refresh ON public.reviews;
CREATE TRIGGER reviews_reputation_refresh AFTER INSERT OR UPDATE OF rating,is_approved,vendor_id OR DELETE ON public.reviews FOR EACH ROW EXECUTE FUNCTION public.refresh_review_reputation();

CREATE OR REPLACE FUNCTION public.refresh_review_moderation_reputation()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE v_vendor_id uuid; v_review_id uuid;
BEGIN
  v_review_id := CASE WHEN TG_OP='DELETE' THEN OLD.review_id ELSE NEW.review_id END;
  SELECT vendor_id INTO v_vendor_id FROM public.reviews WHERE id=v_review_id;
  PERFORM public.recalculate_vendor_reputation(v_vendor_id);
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS review_moderation_reputation_refresh ON public.review_moderation;
CREATE TRIGGER review_moderation_reputation_refresh AFTER INSERT OR UPDATE OF moderation_status OR DELETE ON public.review_moderation FOR EACH ROW EXECUTE FUNCTION public.refresh_review_moderation_reputation();

CREATE OR REPLACE FUNCTION public.create_verified_review(p_target_type text,p_target_id uuid,p_rating integer,p_comment text DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE v_order_id uuid; v_vendor_id uuid; v_university_id uuid; v_review_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501'; END IF;
  IF p_target_type NOT IN ('vendor','product','service') OR p_target_id IS NULL THEN RAISE EXCEPTION 'Only vendor, product, and service reviews are supported' USING ERRCODE='22023'; END IF;
  IF p_rating NOT BETWEEN 1 AND 5 THEN RAISE EXCEPTION 'Rating must be between 1 and 5' USING ERRCODE='22023'; END IF;
  IF length(COALESCE(p_comment,''))>500 THEN RAISE EXCEPTION 'Review comment is too long' USING ERRCODE='22023'; END IF;
  IF p_target_type='vendor' THEN
    SELECT o.id,o.vendor_id,o.university_id INTO v_order_id,v_vendor_id,v_university_id FROM public.orders o JOIN public.profiles p ON p.id=auth.uid() WHERE o.buyer_id=auth.uid() AND o.vendor_id=p_target_id AND o.status='completed' AND o.university_id IS NOT DISTINCT FROM p.university_id ORDER BY o.completed_at DESC NULLS LAST,o.created_at DESC LIMIT 1;
  ELSIF p_target_type='product' THEN
    SELECT o.id,o.vendor_id,o.university_id INTO v_order_id,v_vendor_id,v_university_id FROM public.orders o JOIN public.order_items oi ON oi.order_id=o.id JOIN public.products pr ON pr.id=oi.product_id JOIN public.businesses b ON b.id=pr.business_id AND b.vendor_id=o.vendor_id JOIN public.profiles p ON p.id=auth.uid() WHERE o.buyer_id=auth.uid() AND oi.product_id=p_target_id AND o.status='completed' AND o.university_id IS NOT DISTINCT FROM p.university_id ORDER BY o.completed_at DESC NULLS LAST,o.created_at DESC LIMIT 1;
  ELSE
    SELECT o.id,o.vendor_id,o.university_id INTO v_order_id,v_vendor_id,v_university_id FROM public.orders o JOIN public.order_items oi ON oi.order_id=o.id JOIN public.services s ON s.id=oi.service_id JOIN public.businesses b ON b.id=s.business_id AND b.vendor_id=o.vendor_id JOIN public.profiles p ON p.id=auth.uid() WHERE o.buyer_id=auth.uid() AND oi.service_id=p_target_id AND o.status='completed' AND o.university_id IS NOT DISTINCT FROM p.university_id ORDER BY o.completed_at DESC NULLS LAST,o.created_at DESC LIMIT 1;
  END IF;
  IF v_order_id IS NULL OR v_vendor_id IS NULL THEN RAISE EXCEPTION 'A completed, university-scoped interaction is required before reviewing' USING ERRCODE='42501'; END IF;
  INSERT INTO public.reviews(reviewer_id,vendor_id,product_id,service_id,order_id,university_id,rating,comment,is_approved) VALUES(auth.uid(),v_vendor_id,CASE WHEN p_target_type='product' THEN p_target_id END,CASE WHEN p_target_type='service' THEN p_target_id END,v_order_id,v_university_id,p_rating,NULLIF(btrim(p_comment),''),false) RETURNING id INTO v_review_id;
  INSERT INTO public.review_moderation(review_id,moderation_status) VALUES(v_review_id,'pending_review');
  RETURN v_review_id;
END $$;

CREATE OR REPLACE FUNCTION public.upsert_own_review_response(p_review_id uuid,p_response_body text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE v_vendor_id uuid; v_response_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501'; END IF;
  IF NULLIF(btrim(p_response_body),'') IS NULL OR length(p_response_body)>2000 THEN RAISE EXCEPTION 'Response must be 1 to 2000 characters' USING ERRCODE='22023'; END IF;
  SELECT r.vendor_id INTO v_vendor_id FROM public.reviews r JOIN public.vendors v ON v.id=r.vendor_id AND v.owner_id=auth.uid() WHERE r.id=p_review_id FOR UPDATE;
  IF v_vendor_id IS NULL THEN RAISE EXCEPTION 'Review is not owned by your business' USING ERRCODE='42501'; END IF;
  INSERT INTO public.review_responses(review_id,vendor_id,response_body) VALUES(p_review_id,v_vendor_id,btrim(p_response_body)) ON CONFLICT(review_id) DO UPDATE SET response_body=EXCLUDED.response_body,updated_at=now() RETURNING id INTO v_response_id;
  RETURN v_response_id;
END $$;

CREATE OR REPLACE FUNCTION public.moderate_admin_review(p_review_id uuid,p_decision text,p_note text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE v_university_id uuid;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_staff() THEN RAISE EXCEPTION 'Staff access required' USING ERRCODE='42501'; END IF;
  IF p_decision NOT IN ('published','hidden','removed') THEN RAISE EXCEPTION 'Invalid review moderation decision' USING ERRCODE='22023'; END IF;
  SELECT university_id INTO v_university_id FROM public.reviews WHERE id=p_review_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Review not found' USING ERRCODE='P0002'; END IF;
  IF public.current_app_role()='university_admin' AND (v_university_id IS NULL OR NOT public.can_manage_university(v_university_id)) THEN RAISE EXCEPTION 'University scope required' USING ERRCODE='42501'; END IF;
  UPDATE public.reviews SET is_approved=(p_decision='published') WHERE id=p_review_id;
  INSERT INTO public.review_moderation(review_id,moderation_status,moderated_by,moderated_at,moderation_note) VALUES(p_review_id,p_decision,auth.uid(),now(),NULLIF(btrim(p_note),'')) ON CONFLICT(review_id) DO UPDATE SET moderation_status=EXCLUDED.moderation_status,moderated_by=EXCLUDED.moderated_by,moderated_at=EXCLUDED.moderated_at,moderation_note=EXCLUDED.moderation_note,updated_at=now();
  PERFORM public.record_trusted_admin_action('review.'||p_decision,'reputation','review',p_review_id,'{}'::jsonb);
END $$;

DROP POLICY IF EXISTS reviews_owner_manage ON public.reviews;
DROP POLICY IF EXISTS responses_vendor_manage ON public.review_responses;
REVOKE INSERT, UPDATE, DELETE ON public.reviews, public.review_responses, public.review_moderation FROM authenticated;
REVOKE ALL ON FUNCTION public.create_verified_review(text,uuid,integer,text),public.upsert_own_review_response(uuid,text),public.moderate_admin_review(uuid,text,text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.create_verified_review(text,uuid,integer,text),public.upsert_own_review_response(uuid,text),public.moderate_admin_review(uuid,text,text) TO authenticated;
COMMIT;
