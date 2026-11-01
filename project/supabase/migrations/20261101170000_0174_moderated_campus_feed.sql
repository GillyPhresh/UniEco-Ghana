-- A source-attributed, human-reviewed campus news feed. The fetch worker may
-- create pending records only; only a super administrator may publish them.
BEGIN;

CREATE TABLE IF NOT EXISTS public.campus_feed_sources (
  id text PRIMARY KEY CHECK (id ~ '^[a-z0-9-]{2,48}$'),
  label text NOT NULL CHECK (length(btrim(label)) BETWEEN 2 AND 120),
  university_name text NOT NULL CHECK (length(btrim(university_name)) BETWEEN 2 AND 160),
  website_url text NOT NULL CHECK (website_url ~ '^https://'),
  feed_url text NOT NULL UNIQUE CHECK (feed_url ~ '^https://'),
  source_domain text NOT NULL CHECK (source_domain ~ '^[a-z0-9.-]+$'),
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.campus_feed_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id text NOT NULL REFERENCES public.campus_feed_sources(id) ON DELETE RESTRICT,
  source_item_key text NOT NULL CHECK (source_item_key ~ '^[0-9a-f]{64}$'),
  source_label text NOT NULL,
  university_name text NOT NULL,
  title text NOT NULL CHECK (length(btrim(title)) BETWEEN 8 AND 220),
  excerpt text NOT NULL DEFAULT '' CHECK (length(excerpt) <= 600),
  canonical_url text NOT NULL CHECK (length(canonical_url) <= 2048 AND canonical_url ~ '^https://'),
  published_at timestamptz,
  media_url text CHECK (media_url IS NULL OR (length(media_url) <= 2048 AND media_url ~ '^https://')),
  media_type text CHECK (media_type IS NULL OR media_type IN ('image', 'video')),
  category text NOT NULL DEFAULT 'news'
    CHECK (category IN ('news', 'events', 'opportunities', 'research', 'notices', 'campus_life')),
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'rejected')),
  review_reason text CHECK (review_reason IS NULL OR length(review_reason) <= 500),
  approved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  approved_at timestamptz,
  fetched_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (source_id, source_item_key),
  CHECK ((media_url IS NULL) = (media_type IS NULL)),
  CHECK ((status = 'approved') = (approved_at IS NOT NULL))
);

CREATE INDEX IF NOT EXISTS campus_feed_public_order_idx
  ON public.campus_feed_items (published_at DESC NULLS LAST, fetched_at DESC)
  WHERE status = 'approved';
CREATE INDEX IF NOT EXISTS campus_feed_review_queue_idx
  ON public.campus_feed_items (fetched_at DESC)
  WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS campus_feed_category_idx
  ON public.campus_feed_items (category, published_at DESC NULLS LAST)
  WHERE status = 'approved';

ALTER TABLE public.campus_feed_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campus_feed_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS campus_feed_enabled_sources_read ON public.campus_feed_sources;
CREATE POLICY campus_feed_enabled_sources_read ON public.campus_feed_sources
  FOR SELECT TO anon, authenticated USING (enabled);
DROP POLICY IF EXISTS campus_feed_super_admin_sources_read ON public.campus_feed_sources;
CREATE POLICY campus_feed_super_admin_sources_read ON public.campus_feed_sources
  FOR SELECT TO authenticated USING (public.is_super_admin());

DROP POLICY IF EXISTS campus_feed_public_approved_read ON public.campus_feed_items;
CREATE POLICY campus_feed_public_approved_read ON public.campus_feed_items
  FOR SELECT TO anon, authenticated
  USING (
    status = 'approved'
    AND EXISTS (
      SELECT 1 FROM public.campus_feed_sources AS source
      WHERE source.id = campus_feed_items.source_id AND source.enabled
    )
  );
DROP POLICY IF EXISTS campus_feed_super_admin_review_read ON public.campus_feed_items;
CREATE POLICY campus_feed_super_admin_review_read ON public.campus_feed_items
  FOR SELECT TO authenticated USING (public.is_super_admin());

REVOKE ALL ON TABLE public.campus_feed_sources FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.campus_feed_items FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.campus_feed_sources TO service_role;
GRANT SELECT, INSERT, UPDATE ON TABLE public.campus_feed_items TO service_role;

-- Public readers only receive approved fields through this owner-checked view.
-- The underlying tables remain unavailable to normal browser clients.
CREATE OR REPLACE VIEW public.campus_feed_public_items
WITH (security_barrier = true)
AS
SELECT item.id, item.source_id, item.source_label, item.university_name,
       item.title, item.excerpt, item.canonical_url, item.published_at,
       item.media_url, item.media_type, item.category
FROM public.campus_feed_items AS item
JOIN public.campus_feed_sources AS source ON source.id = item.source_id
WHERE item.status = 'approved' AND source.enabled;
REVOKE ALL ON public.campus_feed_public_items FROM PUBLIC;
GRANT SELECT ON public.campus_feed_public_items TO anon, authenticated;

-- These feeds were confirmed to return RSS content from the institutions'
-- official domains on 1 November 2026. The generic UG RSS endpoint is not used
-- because it returned old directory records rather than current news.
INSERT INTO public.campus_feed_sources (id, label, university_name, website_url, feed_url, source_domain)
VALUES
  ('university-of-ghana', 'University of Ghana', 'University of Ghana', 'https://www.ug.edu.gh/news', 'https://www.ug.edu.gh/news-list.xml', 'ug.edu.gh'),
  ('knust', 'KNUST', 'Kwame Nkrumah University of Science and Technology', 'https://www.knust.edu.gh/news', 'https://www.knust.edu.gh/rss.xml', 'knust.edu.gh'),
  ('accra-technical-university', 'Accra Technical University', 'Accra Technical University', 'https://atu.edu.gh/category/news/', 'https://atu.edu.gh/category/news/feed/', 'atu.edu.gh'),
  ('academic-city', 'Academic City University', 'Academic City University', 'https://acity.edu.gh/', 'https://acity.edu.gh/feed/', 'acity.edu.gh')
ON CONFLICT (id) DO UPDATE SET
  label = EXCLUDED.label,
  university_name = EXCLUDED.university_name,
  website_url = EXCLUDED.website_url,
  feed_url = EXCLUDED.feed_url,
  source_domain = EXCLUDED.source_domain,
  updated_at = now();

CREATE OR REPLACE FUNCTION public.ingest_campus_feed_items(p_items jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  entry jsonb;
  source_row public.campus_feed_sources%ROWTYPE;
  item_source_id text;
  item_key text;
  item_title text;
  item_excerpt text;
  item_url text;
  item_host text;
  item_media_url text;
  media_host text;
  item_media_type text;
  item_category text;
  item_published_at timestamptz;
  inserted_count integer := 0;
  ignored_count integer := 0;
BEGIN
  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' THEN
    RAISE EXCEPTION 'Invalid campus feed batch' USING ERRCODE = '22023';
  END IF;
  IF jsonb_array_length(p_items) NOT BETWEEN 1 AND 80 THEN
    RAISE EXCEPTION 'Invalid campus feed batch' USING ERRCODE = '22023';
  END IF;

  FOR entry IN SELECT value FROM jsonb_array_elements(p_items)
  LOOP
    item_source_id := NULLIF(btrim(entry->>'source_id'), '');
    SELECT * INTO source_row FROM public.campus_feed_sources
      WHERE id = item_source_id AND enabled;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Unapproved campus feed source' USING ERRCODE = '22023';
    END IF;

    item_key := lower(btrim(COALESCE(entry->>'source_item_key', '')));
    item_title := btrim(regexp_replace(COALESCE(entry->>'title', ''), '<[^>]*>', '', 'g'));
    item_excerpt := left(btrim(regexp_replace(COALESCE(entry->>'excerpt', ''), '<[^>]*>', '', 'g')), 600);
    item_url := btrim(COALESCE(entry->>'canonical_url', ''));
    item_host := lower(split_part(split_part(item_url, '/', 3), ':', 1));
    item_media_url := NULLIF(btrim(COALESCE(entry->>'media_url', '')), '');
    item_media_type := NULLIF(lower(btrim(COALESCE(entry->>'media_type', ''))), '');
    media_host := CASE WHEN item_media_url IS NULL THEN NULL
      ELSE lower(split_part(split_part(item_media_url, '/', 3), ':', 1)) END;
    item_category := lower(COALESCE(entry->>'category', 'news'));

    IF item_key !~ '^[0-9a-f]{64}$'
       OR length(item_title) NOT BETWEEN 8 AND 220
       OR length(item_url) > 2048
       OR item_url !~ '^https://[a-z0-9.-]+(/|$)'
       OR NOT (item_host = source_row.source_domain OR item_host LIKE '%.' || source_row.source_domain)
       OR item_category NOT IN ('news', 'events', 'opportunities', 'research', 'notices', 'campus_life') THEN
      RAISE EXCEPTION 'Invalid campus feed item' USING ERRCODE = '22023';
    END IF;

    IF item_media_url IS NOT NULL THEN
      IF item_media_type NOT IN ('image', 'video')
         OR item_media_url !~ '^https://[a-z0-9.-]+(/|$)'
         OR length(item_media_url) > 2048
         OR NOT (media_host = source_row.source_domain OR media_host LIKE '%.' || source_row.source_domain) THEN
        item_media_url := NULL;
        item_media_type := NULL;
      END IF;
    ELSE
      item_media_type := NULL;
    END IF;

    item_published_at := NULL;
    IF COALESCE(entry->>'published_at', '') ~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:?\d{2})$' THEN
      BEGIN
        item_published_at := (entry->>'published_at')::timestamptz;
      EXCEPTION WHEN others THEN
        item_published_at := NULL;
      END;
    END IF;

    INSERT INTO public.campus_feed_items (
      source_id, source_item_key, source_label, university_name,
      title, excerpt, canonical_url, published_at, media_url, media_type, category
    ) VALUES (
      source_row.id, item_key, source_row.label, source_row.university_name,
      item_title, item_excerpt, item_url, item_published_at, item_media_url, item_media_type, item_category
    )
    ON CONFLICT (source_id, source_item_key) DO UPDATE SET
      source_label = EXCLUDED.source_label,
      university_name = EXCLUDED.university_name,
      title = EXCLUDED.title,
      excerpt = EXCLUDED.excerpt,
      canonical_url = EXCLUDED.canonical_url,
      published_at = EXCLUDED.published_at,
      media_url = EXCLUDED.media_url,
      media_type = EXCLUDED.media_type,
      category = EXCLUDED.category,
      fetched_at = now(),
      updated_at = now()
    WHERE public.campus_feed_items.status = 'pending';

    IF FOUND THEN inserted_count := inserted_count + 1;
    ELSE ignored_count := ignored_count + 1;
    END IF;
  END LOOP;

  RETURN jsonb_build_object('accepted', inserted_count, 'ignored', ignored_count);
END;
$function$;

REVOKE ALL ON FUNCTION public.ingest_campus_feed_items(jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ingest_campus_feed_items(jsonb) TO service_role;

CREATE OR REPLACE FUNCTION public.get_campus_feed_review_items(p_status text)
RETURNS TABLE (
  id uuid, source_id text, source_label text, university_name text,
  title text, excerpt text, canonical_url text, published_at timestamptz,
  media_url text, media_type text, category text, status text,
  review_reason text, fetched_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Super administrator access required' USING ERRCODE = '42501';
  END IF;
  IF p_status NOT IN ('pending', 'approved', 'rejected') THEN
    RAISE EXCEPTION 'Invalid campus feed status' USING ERRCODE = '22023';
  END IF;
  RETURN QUERY
    SELECT item.id, item.source_id, item.source_label, item.university_name,
           item.title, item.excerpt, item.canonical_url, item.published_at,
           item.media_url, item.media_type, item.category, item.status,
           item.review_reason, item.fetched_at
    FROM public.campus_feed_items AS item
    WHERE item.status = p_status
    ORDER BY item.published_at DESC NULLS LAST, item.fetched_at DESC
    LIMIT 100;
END;
$function$;
REVOKE ALL ON FUNCTION public.get_campus_feed_review_items(text) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.get_campus_feed_review_items(text) TO authenticated;

CREATE OR REPLACE FUNCTION public.moderate_campus_feed_item(
  p_item_id uuid,
  p_decision text,
  p_reason text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  item_row public.campus_feed_items%ROWTYPE;
  next_status text := lower(btrim(COALESCE(p_decision, '')));
  reason_text text := btrim(COALESCE(p_reason, ''));
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Super administrator access required' USING ERRCODE = '42501';
  END IF;
  IF p_item_id IS NULL OR next_status NOT IN ('approved', 'rejected')
     OR length(reason_text) NOT BETWEEN 10 AND 500 THEN
    RAISE EXCEPTION 'A valid decision and 10–500 character reason are required' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO item_row FROM public.campus_feed_items WHERE id = p_item_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Campus feed item not found' USING ERRCODE = 'P0002'; END IF;

  UPDATE public.campus_feed_items SET
    status = next_status,
    review_reason = reason_text,
    approved_by = CASE WHEN next_status = 'approved' THEN auth.uid() ELSE NULL END,
    approved_at = CASE WHEN next_status = 'approved' THEN now() ELSE NULL END,
    updated_at = now()
  WHERE id = p_item_id;

  INSERT INTO public.audit_logs (actor_id, target_id, action, entity_type, entity_id, metadata)
  VALUES (
    auth.uid(), p_item_id,
    CASE WHEN next_status = 'approved' THEN 'campus_feed.approved' ELSE 'campus_feed.rejected' END,
    'campus_feed_item', p_item_id,
    jsonb_build_object('previous_status', item_row.status, 'status', next_status, 'reason', reason_text, 'source_id', item_row.source_id)
  );

  RETURN jsonb_build_object('id', p_item_id, 'status', next_status);
END;
$function$;

REVOKE ALL ON FUNCTION public.moderate_campus_feed_item(uuid, text, text) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.moderate_campus_feed_item(uuid, text, text) TO authenticated;

COMMIT;
