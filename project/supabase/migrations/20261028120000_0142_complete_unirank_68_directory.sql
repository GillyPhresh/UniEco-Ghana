-- Complete the three records that could not use the shared MUC short name.
-- Unique display names keep the directory constraint intact.
BEGIN;

INSERT INTO public.universities (
  name, official_name, short_name, abbreviation, slug, city, region, country,
  website_url, institution_type, ownership_type, campus_launch_status,
  is_enabled, is_verified, logo_alt_text, hero_alt_text
) VALUES
  ('Kings University College', 'Kings University College', 'Kings University', 'KUC', 'kings-university-college', 'Accra', 'Greater Accra', 'Ghana', 'https://kuc.edu.gh/', 'Private University', 'private', 'planned', true, false, 'Official logo of Kings University College', 'Kings University College campus landmark'),
  ('Marshalls University College', 'Marshalls University College', 'Marshalls University', 'MUC', 'marshalls-university-college', 'Accra', 'Greater Accra', 'Ghana', 'https://marshalls.edu.gh/', 'Private University', 'private', 'planned', true, false, 'Official logo of Marshalls University College', 'Marshalls University College campus landmark'),
  ('Mountcrest University College', 'Mountcrest University College', 'Mountcrest University', 'MUC', 'mountcrest-university-college', 'Accra', 'Greater Accra', 'Ghana', 'https://mountcrest.edu.gh/', 'Private University', 'private', 'planned', true, false, 'Official logo of Mountcrest University College', 'Mountcrest University College campus landmark')
ON CONFLICT DO NOTHING;

COMMIT;
