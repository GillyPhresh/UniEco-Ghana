BEGIN;

-- The public views previously ran with their owner's privileges. Keep the
-- existing API shape, but require the caller's column grants and row policies.
ALTER TABLE public.campus_feed_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campus_feed_items ENABLE ROW LEVEL SECURITY;

-- The public roles get the view's columns plus the fields it filters on.
-- These grants do not expose feed URLs, review notes, reviewer IDs or keys.
REVOKE ALL ON TABLE public.campus_feed_sources, public.campus_feed_items
  FROM PUBLIC, anon, authenticated;
GRANT SELECT (id, label, university_name, source_kind, enabled)
  ON public.campus_feed_sources TO anon, authenticated;
GRANT SELECT (id, source_id, source_label, university_name, title, excerpt,
  canonical_url, published_at, media_url, media_type, category, status)
  ON public.campus_feed_items TO anon, authenticated;

-- Prevent separate permissive staff policies from widening these new column
-- grants. Staff review routes already authenticate staff and use service_role.
CREATE POLICY campus_feed_sources_public_projection_guard
  ON public.campus_feed_sources AS RESTRICTIVE FOR SELECT TO anon, authenticated
  USING (enabled);
CREATE POLICY campus_feed_items_public_projection_guard
  ON public.campus_feed_items AS RESTRICTIVE FOR SELECT TO anon, authenticated
  USING (
    status = 'approved'
    AND EXISTS (
      SELECT 1 FROM public.campus_feed_sources AS source
      WHERE source.id = campus_feed_items.source_id AND source.enabled
    )
  );

ALTER VIEW public.campus_feed_public_sources SET (security_invoker = true, security_barrier = true);
ALTER VIEW public.campus_feed_public_items SET (security_invoker = true, security_barrier = true);
REVOKE ALL ON TABLE public.campus_feed_public_sources, public.campus_feed_public_items FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.campus_feed_public_sources, public.campus_feed_public_items TO anon, authenticated;

COMMIT;
