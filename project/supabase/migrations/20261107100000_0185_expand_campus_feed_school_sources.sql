-- Expand the moderated campus-feed source allowlist to every enabled
-- university with a configured, valid HTTPS website. Feed URLs begin as the
-- school's official site; the worker follows only RSS/Atom links advertised
-- on that site and keeps the existing human-review gate.
BEGIN;

WITH candidates AS (
  SELECT DISTINCT ON (lower(regexp_replace(btrim(university.website_url), '/+$', '')))
    'uni-' || left(replace(university.id::text, '-', ''), 20) AS id,
    left(COALESCE(NULLIF(btrim(university.short_name), ''), university.name), 120) AS label,
    left(COALESCE(NULLIF(btrim(university.official_name), ''), university.name), 160) AS university_name,
    btrim(university.website_url) AS website_url,
    regexp_replace(
      lower(split_part(split_part(btrim(university.website_url), '://', 2), '/', 1)),
      '^www\.', ''
    ) AS source_domain
  FROM public.universities AS university
  WHERE university.is_enabled
    AND university.website_url ~ '^https://[^/?#]+(/[^?#]*)?/?$'
    AND length(university.website_url) <= 2048
    AND split_part(split_part(btrim(university.website_url), '://', 2), '/', 1) !~ '[@:]'
    AND split_part(split_part(btrim(university.website_url), '://', 2), '/', 1) ~ '^[A-Za-z0-9.-]+$'
    AND split_part(split_part(btrim(university.website_url), '://', 2), '/', 1) !~ '^[0-9.]+$'
    AND NOT EXISTS (
      SELECT 1 FROM public.campus_feed_sources AS existing
      WHERE lower(existing.university_name) = lower(COALESCE(NULLIF(btrim(university.official_name), ''), university.name))
    )
  ORDER BY lower(regexp_replace(btrim(university.website_url), '/+$', '')), university.id
)
INSERT INTO public.campus_feed_sources (id, label, university_name, website_url, feed_url, source_domain, enabled)
SELECT id, label, university_name, website_url, website_url, source_domain, true
FROM candidates
WHERE source_domain ~ '^[a-z0-9.-]+$'
  AND source_domain LIKE '%.%'
ON CONFLICT (id) DO NOTHING;

COMMIT;
