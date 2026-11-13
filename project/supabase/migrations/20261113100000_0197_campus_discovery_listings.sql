-- Source-attributed public discoveries are deliberately separate from
-- UniEco-verified vendors and institution-created events.
CREATE TABLE IF NOT EXISTS public.campus_discovery_listings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  university_id uuid NOT NULL REFERENCES public.universities(id) ON DELETE CASCADE,
  listing_type text NOT NULL CHECK (listing_type IN ('business', 'event')),
  title text NOT NULL CHECK (length(btrim(title)) BETWEEN 2 AND 220),
  summary text CHECK (summary IS NULL OR length(summary) <= 1200),
  location text CHECK (location IS NULL OR length(location) <= 240),
  starts_at timestamptz,
  ends_at timestamptz,
  source_url text NOT NULL CHECK (source_url ~ '^https://'),
  source_label text NOT NULL CHECK (length(btrim(source_label)) BETWEEN 2 AND 180),
  external_url text CHECK (external_url IS NULL OR external_url ~ '^https://'),
  source_fingerprint text NOT NULL CHECK (length(source_fingerprint) = 64),
  status text NOT NULL DEFAULT 'pending_review' CHECK (status IN ('pending_review', 'published', 'rejected')),
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_checked_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  reviewed_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (university_id, source_fingerprint),
  CHECK (ends_at IS NULL OR starts_at IS NULL OR ends_at >= starts_at)
);

CREATE INDEX IF NOT EXISTS campus_discovery_public_idx
  ON public.campus_discovery_listings (university_id, listing_type, starts_at)
  WHERE status = 'published';
CREATE INDEX IF NOT EXISTS campus_discovery_review_idx
  ON public.campus_discovery_listings (status, last_checked_at DESC);

ALTER TABLE public.campus_discovery_listings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS campus_discovery_public_read ON public.campus_discovery_listings;
CREATE POLICY campus_discovery_public_read
  ON public.campus_discovery_listings FOR SELECT TO anon, authenticated
  USING (status = 'published' AND expires_at > now()
    AND (listing_type <> 'event' OR starts_at IS NULL OR starts_at >= now() - interval '1 day'));

DROP POLICY IF EXISTS campus_discovery_super_admin_read ON public.campus_discovery_listings;
CREATE POLICY campus_discovery_super_admin_read
  ON public.campus_discovery_listings FOR SELECT TO authenticated
  USING (public.current_app_role() = 'super_admin');

DROP POLICY IF EXISTS campus_discovery_super_admin_manage ON public.campus_discovery_listings;
CREATE POLICY campus_discovery_super_admin_manage
  ON public.campus_discovery_listings FOR ALL TO authenticated
  USING (public.current_app_role() = 'super_admin')
  WITH CHECK (public.current_app_role() = 'super_admin');

REVOKE ALL ON public.campus_discovery_listings FROM PUBLIC;
GRANT SELECT ON public.campus_discovery_listings TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.campus_discovery_listings TO authenticated;

COMMENT ON TABLE public.campus_discovery_listings IS
  'Source-attributed external campus leads. Public entries are not UniEco-verified and are reviewed before publication.';
