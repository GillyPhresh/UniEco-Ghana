/*
# Search & SEO Infrastructure
- FTS generated columns + trigram indexes on vendors, products, services, events
- Search analytics tables (search_queries, search_clicks)
- Synonyms, ranking rules, featured listings, content quality flags
- Admin checks use auth.jwt() ->> 'role' pattern (matching existing schema)
*/

CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ============================================================================
-- SEARCH ANALYTICS
-- ============================================================================

CREATE TABLE IF NOT EXISTS search_queries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  query_text text NOT NULL,
  normalized_query text NOT NULL DEFAULT '',
  result_type text DEFAULT 'all' CHECK (result_type IN ('all', 'businesses', 'products', 'services', 'events', 'universities')),
  result_count integer NOT NULL DEFAULT 0,
  university_id uuid REFERENCES universities(id) ON DELETE SET NULL,
  filters jsonb DEFAULT '{}'::jsonb,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  session_id text,
  device_type text DEFAULT 'unknown',
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE search_queries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "insert_search_queries_authenticated" ON search_queries;
CREATE POLICY "insert_search_queries_authenticated"
ON search_queries FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "insert_search_queries_anon" ON search_queries;
CREATE POLICY "insert_search_queries_anon"
ON search_queries FOR INSERT TO anon WITH CHECK (true);

DROP POLICY IF EXISTS "select_search_queries_admin" ON search_queries;
CREATE POLICY "select_search_queries_admin"
ON search_queries FOR SELECT
TO authenticated USING (auth.jwt() ->> 'role' IN ('moderator', 'super_admin'));

CREATE INDEX IF NOT EXISTS idx_search_queries_created_at ON search_queries (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_search_queries_normalized ON search_queries (normalized_query);
CREATE INDEX IF NOT EXISTS idx_search_queries_university ON search_queries (university_id) WHERE university_id IS NOT NULL;

-- ============================================================================
-- SEARCH CLICKS
-- ============================================================================

CREATE TABLE IF NOT EXISTS search_clicks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  search_query_id uuid REFERENCES search_queries(id) ON DELETE CASCADE,
  result_type text NOT NULL CHECK (result_type IN ('business', 'product', 'service', 'event', 'university', 'category')),
  result_id text NOT NULL,
  result_name text,
  position integer NOT NULL DEFAULT 0,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE search_clicks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "insert_search_clicks_authenticated" ON search_clicks;
CREATE POLICY "insert_search_clicks_authenticated"
ON search_clicks FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "insert_search_clicks_anon" ON search_clicks;
CREATE POLICY "insert_search_clicks_anon"
ON search_clicks FOR INSERT TO anon WITH CHECK (true);

DROP POLICY IF EXISTS "select_search_clicks_admin" ON search_clicks;
CREATE POLICY "select_search_clicks_admin"
ON search_clicks FOR SELECT
TO authenticated USING (auth.jwt() ->> 'role' IN ('moderator', 'super_admin'));

CREATE INDEX IF NOT EXISTS idx_search_clicks_query ON search_clicks (search_query_id);
CREATE INDEX IF NOT EXISTS idx_search_clicks_created ON search_clicks (created_at DESC);

-- ============================================================================
-- SEARCH SYNONYMS
-- ============================================================================

CREATE TABLE IF NOT EXISTS search_synonyms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  keyword text NOT NULL UNIQUE,
  synonyms text[] NOT NULL DEFAULT '{}',
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE search_synonyms ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_search_synonyms_public" ON search_synonyms;
CREATE POLICY "select_search_synonyms_public"
ON search_synonyms FOR SELECT TO anon, authenticated USING (is_active = true);

DROP POLICY IF EXISTS "insert_search_synonyms_admin" ON search_synonyms;
CREATE POLICY "insert_search_synonyms_admin"
ON search_synonyms FOR INSERT
TO authenticated WITH CHECK (auth.jwt() ->> 'role' IN ('moderator', 'super_admin'));

DROP POLICY IF EXISTS "update_search_synonyms_admin" ON search_synonyms;
CREATE POLICY "update_search_synonyms_admin"
ON search_synonyms FOR UPDATE
TO authenticated USING (auth.jwt() ->> 'role' IN ('moderator', 'super_admin'))
WITH CHECK (auth.jwt() ->> 'role' IN ('moderator', 'super_admin'));

DROP POLICY IF EXISTS "delete_search_synonyms_admin" ON search_synonyms;
CREATE POLICY "delete_search_synonyms_admin"
ON search_synonyms FOR DELETE
TO authenticated USING (auth.jwt() ->> 'role' IN ('moderator', 'super_admin'));

INSERT INTO search_synonyms (keyword, synonyms) VALUES
  ('food', ARRAY['restaurant', 'chop bar', 'eatery', 'canteen', 'food joint', 'fast food']),
  ('printing', ARRAY['printer', 'print shop', 'photocopy', 'photocopying', 'cyber', 'print service']),
  ('barber', ARRAY['barbing', 'barber shop', 'salon', 'haircut', 'grooming', 'hairdresser']),
  ('phone repair', ARRAY['mobile repair', 'phone fix', 'screen repair', 'phone technician', 'gadget repair']),
  ('fashion', ARRAY['clothing', 'clothes', 'apparel', 'boutique', 'tailor', 'sewing', 'wear', 'dress']),
  ('delivery', ARRAY['rider', 'dispatch', 'errand', 'food delivery', 'parcel delivery', 'transport']),
  ('photographer', ARRAY['photography', 'photo', 'camera', 'event coverage', 'photoshoot']),
  ('tutor', ARRAY['tutoring', 'lessons', 'teaching', 'academic help', 'home tuition', 'coaching']),
  ('laundry', ARRAY['washing', 'dry cleaning', 'dry clean', 'clothes washing']),
  ('hostel', ARRAY['accommodation', 'lodging', 'housing', 'dorm', 'dormitory', 'room', 'apartment']),
  ('ladies shoes', ARRAY['shoes', 'footwear', 'heels', 'sandals', 'sneakers', 'slippers']),
  ('computer accessories', ARRAY['laptop accessories', 'tech accessories', 'gadgets', 'computer parts', 'laptop parts']),
  ('graphic designer', ARRAY['graphic design', 'design', 'logo design', 'branding', 'flyer', 'poster design']),
  ('smoothies', ARRAY['juice', 'drinks', 'beverages', 'healthy drinks', 'fruit juice']),
  ('books', ARRAY['textbooks', 'course material', 'stationery', 'novel', 'reading material']),
  ('repairs', ARRAY['repair', 'fix', 'technician', 'maintenance', 'servicing']),
  ('beauty', ARRAY['makeup', 'cosmetics', 'nails', 'facial', 'beauty salon', 'spa', 'skincare']),
  ('transport', ARRAY['transportation', 'taxi', 'uber', 'bolt', 'bus', 'shuttle', 'car hire']),
  ('cake', ARRAY['baking', 'bakery', 'pastries', 'pastry', 'birthday cake', 'celebration cake']),
  ('event', ARRAY['events', 'party', 'show', 'concert', 'gathering', 'function', 'programme'])
ON CONFLICT (keyword) DO NOTHING;

-- ============================================================================
-- SEARCH RANKING RULES
-- ============================================================================

CREATE TABLE IF NOT EXISTS search_ranking_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_name text NOT NULL UNIQUE,
  rule_type text NOT NULL CHECK (rule_type IN ('boost_verified', 'boost_rating', 'boost_student', 'boost_recency', 'boost_proximity', 'boost_availability', 'custom')),
  weight numeric NOT NULL DEFAULT 1.0 CHECK (weight >= 0 AND weight <= 10),
  is_active boolean NOT NULL DEFAULT true,
  config jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE search_ranking_rules ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_search_ranking_rules_public" ON search_ranking_rules;
CREATE POLICY "select_search_ranking_rules_public"
ON search_ranking_rules FOR SELECT TO anon, authenticated USING (is_active = true);

DROP POLICY IF EXISTS "insert_search_ranking_rules_admin" ON search_ranking_rules;
CREATE POLICY "insert_search_ranking_rules_admin"
ON search_ranking_rules FOR INSERT
TO authenticated WITH CHECK (auth.jwt() ->> 'role' IN ('moderator', 'super_admin'));

DROP POLICY IF EXISTS "update_search_ranking_rules_admin" ON search_ranking_rules;
CREATE POLICY "update_search_ranking_rules_admin"
ON search_ranking_rules FOR UPDATE
TO authenticated USING (auth.jwt() ->> 'role' IN ('moderator', 'super_admin'))
WITH CHECK (auth.jwt() ->> 'role' IN ('moderator', 'super_admin'));

DROP POLICY IF EXISTS "delete_search_ranking_rules_admin" ON search_ranking_rules;
CREATE POLICY "delete_search_ranking_rules_admin"
ON search_ranking_rules FOR DELETE
TO authenticated USING (auth.jwt() ->> 'role' IN ('moderator', 'super_admin'));

INSERT INTO search_ranking_rules (rule_name, rule_type, weight) VALUES
  ('boost_verified', 'boost_verified', 1.5),
  ('boost_rating', 'boost_rating', 1.3),
  ('boost_student_business', 'boost_student', 1.2),
  ('boost_recency', 'boost_recency', 1.1),
  ('boost_availability', 'boost_availability', 1.2)
ON CONFLICT (rule_name) DO NOTHING;

-- ============================================================================
-- FEATURED / SPONSORED LISTINGS
-- ============================================================================

CREATE TABLE IF NOT EXISTS featured_listings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_type text NOT NULL CHECK (listing_type IN ('business', 'product', 'service', 'event')),
  listing_id uuid NOT NULL,
  placement_type text NOT NULL CHECK (placement_type IN ('sponsored', 'featured', 'boosted')),
  search_keyword text,
  university_id uuid REFERENCES universities(id) ON DELETE CASCADE,
  priority integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  start_date timestamptz,
  end_date timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE featured_listings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_featured_listings_public" ON featured_listings;
CREATE POLICY "select_featured_listings_public"
ON featured_listings FOR SELECT TO anon, authenticated USING (
  is_active = true
  AND (start_date IS NULL OR start_date <= now())
  AND (end_date IS NULL OR end_date >= now())
);

DROP POLICY IF EXISTS "insert_featured_listings_admin" ON featured_listings;
CREATE POLICY "insert_featured_listings_admin"
ON featured_listings FOR INSERT
TO authenticated WITH CHECK (auth.jwt() ->> 'role' IN ('moderator', 'super_admin'));

DROP POLICY IF EXISTS "update_featured_listings_admin" ON featured_listings;
CREATE POLICY "update_featured_listings_admin"
ON featured_listings FOR UPDATE
TO authenticated USING (auth.jwt() ->> 'role' IN ('moderator', 'super_admin'))
WITH CHECK (auth.jwt() ->> 'role' IN ('moderator', 'super_admin'));

DROP POLICY IF EXISTS "delete_featured_listings_admin" ON featured_listings;
CREATE POLICY "delete_featured_listings_admin"
ON featured_listings FOR DELETE
TO authenticated USING (auth.jwt() ->> 'role' IN ('moderator', 'super_admin'));

CREATE INDEX IF NOT EXISTS idx_featured_listings_active ON featured_listings (listing_type, placement_type, is_active);
CREATE INDEX IF NOT EXISTS idx_featured_listings_keyword ON featured_listings (search_keyword) WHERE search_keyword IS NOT NULL;

-- ============================================================================
-- CONTENT QUALITY FLAGS
-- ============================================================================

CREATE TABLE IF NOT EXISTS content_quality_flags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  content_type text NOT NULL CHECK (content_type IN ('business', 'product', 'service', 'event', 'review', 'announcement')),
  content_id uuid NOT NULL,
  flag_reason text NOT NULL CHECK (flag_reason IN ('keyword_stuffing', 'duplicate_content', 'misleading_title', 'fake_claims', 'spam_links', 'hidden_text', 'irrelevant_keywords', 'low_quality', 'other')),
  flag_details text,
  flagged_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  is_auto_detected boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'reviewing', 'resolved', 'dismissed')),
  resolved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE content_quality_flags ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_content_quality_flags_admin" ON content_quality_flags;
CREATE POLICY "select_content_quality_flags_admin"
ON content_quality_flags FOR SELECT
TO authenticated USING (auth.jwt() ->> 'role' IN ('moderator', 'super_admin'));

DROP POLICY IF EXISTS "insert_content_quality_flags_authenticated" ON content_quality_flags;
CREATE POLICY "insert_content_quality_flags_authenticated"
ON content_quality_flags FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "insert_content_quality_flags_anon" ON content_quality_flags;
CREATE POLICY "insert_content_quality_flags_anon"
ON content_quality_flags FOR INSERT TO anon WITH CHECK (true);

DROP POLICY IF EXISTS "update_content_quality_flags_admin" ON content_quality_flags;
CREATE POLICY "update_content_quality_flags_admin"
ON content_quality_flags FOR UPDATE
TO authenticated USING (auth.jwt() ->> 'role' IN ('moderator', 'super_admin'))
WITH CHECK (auth.jwt() ->> 'role' IN ('moderator', 'super_admin'));

DROP POLICY IF EXISTS "delete_content_quality_flags_admin" ON content_quality_flags;
CREATE POLICY "delete_content_quality_flags_admin"
ON content_quality_flags FOR DELETE
TO authenticated USING (auth.jwt() ->> 'role' IN ('moderator', 'super_admin'));

CREATE INDEX IF NOT EXISTS idx_quality_flags_status ON content_quality_flags (status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_quality_flags_content ON content_quality_flags (content_type, content_id);

-- ============================================================================
-- TRIGRAM INDEXES FOR FUZZY SEARCH
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_vendors_business_name_trgm ON vendors USING gin (business_name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_vendors_description_trgm ON vendors USING gin (description gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_products_name_trgm ON products USING gin (name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_products_description_trgm ON products USING gin (description gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_services_name_trgm ON services USING gin (name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_services_description_trgm ON services USING gin (description gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_events_title_trgm ON events USING gin (title gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_events_description_trgm ON events USING gin (description gin_trgm_ops);

-- ============================================================================
-- FULL-TEXT SEARCH GENERATED COLUMNS
-- ============================================================================

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'vendors' AND column_name = 'search_tsv') THEN
    ALTER TABLE vendors ADD COLUMN search_tsv tsvector
    GENERATED ALWAYS AS (
      setweight(to_tsvector('english', coalesce(business_name, '')), 'A') ||
      setweight(to_tsvector('english', coalesce(business_type, '')), 'B') ||
      setweight(to_tsvector('english', coalesce(description, '')), 'C')
    ) STORED;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_vendors_search_tsv ON vendors USING gin (search_tsv);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'products' AND column_name = 'search_tsv') THEN
    ALTER TABLE products ADD COLUMN search_tsv tsvector
    GENERATED ALWAYS AS (
      setweight(to_tsvector('english', coalesce(name, '')), 'A') ||
      setweight(to_tsvector('english', coalesce(description, '')), 'B')
    ) STORED;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_products_search_tsv ON products USING gin (search_tsv);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'services' AND column_name = 'search_tsv') THEN
    ALTER TABLE services ADD COLUMN search_tsv tsvector
    GENERATED ALWAYS AS (
      setweight(to_tsvector('english', coalesce(name, '')), 'A') ||
      setweight(to_tsvector('english', coalesce(description, '')), 'B')
    ) STORED;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_services_search_tsv ON services USING gin (search_tsv);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'events' AND column_name = 'search_tsv') THEN
    ALTER TABLE events ADD COLUMN search_tsv tsvector
    GENERATED ALWAYS AS (
      setweight(to_tsvector('english', coalesce(title, '')), 'A') ||
      setweight(to_tsvector('english', coalesce(description, '')), 'B') ||
      setweight(to_tsvector('english', coalesce(location, '')), 'C')
    ) STORED;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_events_search_tsv ON events USING gin (search_tsv);

-- ============================================================================
-- RPC: log_search_query (privacy-conscious, no PII)
-- ============================================================================

CREATE OR REPLACE FUNCTION log_search_query(
  p_query text, p_result_type text DEFAULT 'all', p_result_count integer DEFAULT 0,
  p_university_id uuid DEFAULT NULL, p_filters jsonb DEFAULT '{}'::jsonb,
  p_session_id text DEFAULT NULL, p_device_type text DEFAULT 'unknown'
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id uuid; v_normalized text;
BEGIN
  v_normalized := lower(btrim(regexp_replace(p_query, '\s+', ' ', 'g')));
  INSERT INTO search_queries (query_text, normalized_query, result_type, result_count, university_id, filters, session_id, device_type)
  VALUES (p_query, v_normalized, p_result_type, p_result_count, p_university_id, p_filters, p_session_id, p_device_type)
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

GRANT EXECUTE ON FUNCTION log_search_query TO anon, authenticated;

-- ============================================================================
-- RPC: get_demand_insights (admin analytics)
-- ============================================================================

CREATE OR REPLACE FUNCTION get_demand_insights(
  p_days integer DEFAULT 30, p_university_id uuid DEFAULT NULL
) RETURNS TABLE (
  normalized_query text, total_searches bigint, unique_sessions bigint,
  avg_result_count numeric, result_type text, opportunity_level text
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  RETURN QUERY
  SELECT
    sq.normalized_query,
    COUNT(*)::bigint AS total_searches,
    COUNT(DISTINCT sq.session_id)::bigint AS unique_sessions,
    AVG(sq.result_count)::numeric AS avg_result_count,
    MAX(sq.result_type) AS result_type,
    CASE
      WHEN AVG(sq.result_count) = 0 THEN 'HIGH'
      WHEN AVG(sq.result_count) < 3 THEN 'MEDIUM'
      ELSE 'LOW'
    END AS opportunity_level
  FROM search_queries sq
  WHERE sq.created_at >= now() - (p_days || ' days')::interval
    AND sq.normalized_query != ''
    AND (p_university_id IS NULL OR sq.university_id = p_university_id)
  GROUP BY sq.normalized_query
  ORDER BY total_searches DESC
  LIMIT 100;
END;
$$;

GRANT EXECUTE ON FUNCTION get_demand_insights TO authenticated;

-- ============================================================================
-- RPC: get_popular_searches (public, for autocomplete)
-- ============================================================================

CREATE OR REPLACE FUNCTION get_popular_searches(
  p_limit integer DEFAULT 10, p_days integer DEFAULT 7
) RETURNS TABLE (query_text text, search_count bigint)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  RETURN QUERY
  SELECT sq.normalized_query AS query_text, COUNT(*)::bigint AS search_count
  FROM search_queries sq
  WHERE sq.created_at >= now() - (p_days || ' days')::interval
    AND sq.normalized_query != ''
  GROUP BY sq.normalized_query
  ORDER BY search_count DESC
  LIMIT p_limit;
END;
$$;

GRANT EXECUTE ON FUNCTION get_popular_searches TO anon, authenticated;
