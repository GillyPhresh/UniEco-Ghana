-- Bounded review queue for the existing database-authoritative moderation RPC.
-- Only assigned content moderators and super admins can read these review bodies.
BEGIN;

CREATE INDEX IF NOT EXISTS reviews_moderation_queue_order_idx
  ON public.reviews (created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS review_moderation_queue_status_idx
  ON public.review_moderation (moderation_status, updated_at DESC, review_id);

CREATE OR REPLACE FUNCTION public.get_admin_review_moderation_queue(
  p_status text DEFAULT 'pending_review',
  p_search text DEFAULT NULL,
  p_limit integer DEFAULT 25,
  p_offset integer DEFAULT 0
)
RETURNS TABLE (
  review_id uuid,
  target_title text,
  vendor_name text,
  university_name text,
  rating integer,
  comment text,
  moderation_status text,
  flag_reason text,
  created_at timestamptz,
  total_count bigint
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_status text := COALESCE(NULLIF(btrim(p_status), ''), 'pending_review');
  v_search text := NULLIF(lower(btrim(COALESCE(p_search, ''))), '');
  v_limit integer := COALESCE(p_limit, 25);
  v_offset integer := COALESCE(p_offset, 0);
BEGIN
  IF auth.uid() IS NULL OR NOT (public.is_super_admin() OR public.has_permission('can_moderate_content')) THEN
    RAISE EXCEPTION 'Review moderation permission required' USING ERRCODE = '42501';
  END IF;
  IF v_status NOT IN ('all', 'pending_review', 'published', 'flagged', 'hidden', 'removed') THEN
    RAISE EXCEPTION 'Invalid review status filter' USING ERRCODE = '22023';
  END IF;
  IF v_search IS NOT NULL AND length(v_search) > 100 THEN
    RAISE EXCEPTION 'Search query is too long' USING ERRCODE = '22023';
  END IF;
  IF v_limit NOT BETWEEN 1 AND 100 OR v_offset NOT BETWEEN 0 AND 10000 THEN
    RAISE EXCEPTION 'Invalid review page range' USING ERRCODE = '22023';
  END IF;

  RETURN QUERY
  SELECT r.id,
    COALESCE(product.name, service.name, event.title, vendor.business_name, 'Unavailable listing')::text,
    vendor.business_name::text,
    university.name::text,
    r.rating,
    r.comment,
    COALESCE(moderation.moderation_status, CASE WHEN r.is_approved THEN 'published' ELSE 'pending_review' END)::text,
    moderation.flag_reason,
    r.created_at,
    count(*) OVER ()
  FROM public.reviews AS r
  LEFT JOIN public.review_moderation AS moderation ON moderation.review_id = r.id
  LEFT JOIN public.vendors AS vendor ON vendor.id = r.vendor_id
  LEFT JOIN public.products AS product ON product.id = r.product_id
  LEFT JOIN public.services AS service ON service.id = r.service_id
  LEFT JOIN public.events AS event ON event.id = r.event_id
  LEFT JOIN public.universities AS university ON university.id = r.university_id
  WHERE (v_status = 'all' OR COALESCE(moderation.moderation_status, CASE WHEN r.is_approved THEN 'published' ELSE 'pending_review' END) = v_status)
    AND (v_search IS NULL OR position(v_search IN lower(concat_ws(' ',
      COALESCE(product.name, service.name, event.title, vendor.business_name, ''),
      COALESCE(vendor.business_name, ''), COALESCE(university.name, ''), COALESCE(r.comment, '')
    ))) > 0)
  ORDER BY r.created_at DESC, r.id DESC
  LIMIT v_limit OFFSET v_offset;
END;
$$;

REVOKE ALL ON FUNCTION public.get_admin_review_moderation_queue(text,text,integer,integer) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_admin_review_moderation_queue(text,text,integer,integer) TO authenticated;

COMMIT;
