-- Add official Ghana-wide opportunity sources to the moderated campus feed.
-- These sources only create pending candidates; public visibility still
-- requires a Super Admin's explicit review and approval.
BEGIN;

ALTER TABLE public.campus_feed_sources
  ADD COLUMN IF NOT EXISTS source_kind text NOT NULL DEFAULT 'campus';

ALTER TABLE public.campus_feed_sources
  DROP CONSTRAINT IF EXISTS campus_feed_sources_source_kind_check;
ALTER TABLE public.campus_feed_sources
  ADD CONSTRAINT campus_feed_sources_source_kind_check
  CHECK (source_kind IN ('campus', 'opportunities'));

INSERT INTO public.campus_feed_sources
  (id, label, university_name, website_url, feed_url, source_domain, source_kind, enabled)
VALUES
  ('ghana-scholarships-authority', 'Ghana Scholarships Authority', 'National opportunities across Ghana',
   'https://scholarships.gov.gh/', 'https://scholarships.gov.gh/', 'scholarships.gov.gh', 'opportunities', true),
  ('neip-student-enterprise', 'NEIP student enterprise programme', 'National opportunities across Ghana',
   'https://neip.gov.gh/projects', 'https://neip.gov.gh/projects', 'neip.gov.gh', 'opportunities', true)
ON CONFLICT (id) DO UPDATE SET
  label = EXCLUDED.label,
  university_name = EXCLUDED.university_name,
  website_url = EXCLUDED.website_url,
  feed_url = EXCLUDED.feed_url,
  source_domain = EXCLUDED.source_domain,
  source_kind = EXCLUDED.source_kind,
  enabled = true,
  updated_at = now();

CREATE OR REPLACE VIEW public.campus_feed_public_sources
WITH (security_barrier = true)
AS
SELECT id AS source_id, label AS source_label, university_name, source_kind
FROM public.campus_feed_sources
WHERE enabled;

REVOKE ALL ON public.campus_feed_public_sources FROM PUBLIC;
GRANT SELECT ON public.campus_feed_public_sources TO anon, authenticated;

COMMIT;
