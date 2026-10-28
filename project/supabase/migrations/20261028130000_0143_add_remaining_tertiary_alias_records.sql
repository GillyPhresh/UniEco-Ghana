-- The original legacy abbreviations KUC/MUC are already claimed by other
-- directory rows. Use stable unique abbreviations for these three institutions.
BEGIN;

INSERT INTO public.universities (
  name, official_name, short_name, abbreviation, slug, city, region, country,
  website_url, institution_type, ownership_type, campus_launch_status,
  is_enabled, is_verified, logo_alt_text, hero_alt_text
) VALUES
  ('Kings University College', 'Kings University College', 'Kings University', 'KINGS', 'kings-university-college', 'Accra', 'Greater Accra', 'Ghana', 'https://kuc.edu.gh/', 'Private University', 'private', 'planned', true, false, 'Official logo of Kings University College', 'Kings University College campus landmark'),
  ('Marshalls University College', 'Marshalls University College', 'Marshalls University', 'MARSHALLS', 'marshalls-university-college', 'Accra', 'Greater Accra', 'Ghana', 'https://marshalls.edu.gh/', 'Private University', 'private', 'planned', true, false, 'Official logo of Marshalls University College', 'Marshalls University College campus landmark'),
  ('Mountcrest University College', 'Mountcrest University College', 'Mountcrest University', 'MOUNT', 'mountcrest-university-college', 'Accra', 'Greater Accra', 'Ghana', 'https://mountcrest.edu.gh/', 'Private University', 'private', 'planned', true, false, 'Official logo of Mountcrest University College', 'Mountcrest University College campus landmark')
ON CONFLICT DO NOTHING;

COMMIT;
