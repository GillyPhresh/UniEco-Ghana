/*
# Seed additional universities (disabled, for future expansion)
*/

INSERT INTO universities (name, short_name, slug, city, region, country, description, is_enabled)
VALUES
  ('Kwame Nkrumah University of Science and Technology', 'KNUST', 'knust', 'Kumasi', 'Ashanti', 'Ghana', 'A leading science and technology university in Kumasi.', false),
  ('University of Ghana', 'UG', 'ug', 'Accra', 'Greater Accra', 'Ghana', 'The premier university of Ghana, located in Legon, Accra.', false),
  ('University of Cape Coast', 'UCC', 'ucc', 'Cape Coast', 'Central', 'Ghana', 'A university in Cape Coast known for education and research.', false),
  ('University of Education, Winneba', 'UEW', 'uew', 'Winneba', 'Central', 'Ghana', 'A university focused on teacher education in Winneba.', false),
  ('University for Development Studies', 'UDS', 'uds', 'Tamale', 'Northern', 'Ghana', 'A multi-campus university serving northern Ghana.', false)
ON CONFLICT (slug) DO NOTHING;