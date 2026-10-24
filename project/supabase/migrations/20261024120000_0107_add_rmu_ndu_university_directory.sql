-- Add the two university-level institutions identified while reconciling the
-- requested 54-record branding set with the original 52-record directory.
-- This is additive and safe to re-run: existing rows are never overwritten.
BEGIN;

INSERT INTO public.universities (
  name, official_name, short_name, abbreviation, slug, city, region, country,
  website_url, institution_type, ownership_type, campus_launch_status,
  is_enabled, is_verified, logo_alt_text, hero_alt_text
) VALUES
  (
    'Regional Maritime University',
    'Regional Maritime University',
    'RMU',
    'RMU',
    'regional-maritime-university',
    'Accra',
    'Greater Accra',
    'Ghana',
    'https://rmu.edu.gh',
    'Other recognized university-level institution',
    'public',
    'planned',
    true,
    true,
    'Official logo of Regional Maritime University',
    'Regional Maritime University campus'
  ),
  (
    'National Defence University, Ghana',
    'National Defence University, Ghana',
    'NDU',
    'NDU',
    'national-defence-university',
    'Accra',
    'Greater Accra',
    'Ghana',
    'https://ndu.edu.gh',
    'Other recognized university-level institution',
    'public',
    'planned',
    true,
    true,
    'Official logo of National Defence University, Ghana',
    'National Defence University campus'
  )
ON CONFLICT DO NOTHING;

COMMIT;
