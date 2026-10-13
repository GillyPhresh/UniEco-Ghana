-- Canonical Ghana university directory.  Reference data is derived from the
-- active GTEC institution catalogue, with official-name corrections retained
-- as aliases.  This migration is intentionally additive and staging-safe.
BEGIN;

ALTER TABLE public.universities
  ADD COLUMN IF NOT EXISTS official_name text,
  ADD COLUMN IF NOT EXISTS abbreviation text,
  ADD COLUMN IF NOT EXISTS institution_type text,
  ADD COLUMN IF NOT EXISTS ownership_type text,
  ADD COLUMN IF NOT EXISTS campus_launch_status text NOT NULL DEFAULT 'planned',
  ADD COLUMN IF NOT EXISTS is_verified boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS landmark_image_url text;

UPDATE public.universities
SET official_name = COALESCE(NULLIF(official_name, ''), name),
    abbreviation = COALESCE(NULLIF(abbreviation, ''), short_name)
WHERE official_name IS NULL OR official_name = '' OR abbreviation IS NULL OR abbreviation = '';

ALTER TABLE public.universities
  ALTER COLUMN official_name SET NOT NULL;

DO $$ BEGIN
  ALTER TABLE public.universities ADD CONSTRAINT universities_institution_type_check
    CHECK (institution_type IS NULL OR institution_type IN (
      'Public University', 'Public Technical University', 'Private Chartered University',
      'Private University', 'Other recognized university-level institution'
    ));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.universities ADD CONSTRAINT universities_ownership_type_check
    CHECK (ownership_type IS NULL OR ownership_type IN ('public', 'private', 'other'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.universities ADD CONSTRAINT universities_launch_status_check
    CHECK (campus_launch_status IN ('planned', 'onboarding', 'active', 'suspended'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE UNIQUE INDEX IF NOT EXISTS universities_abbreviation_unique_ci
  ON public.universities (lower(abbreviation)) WHERE abbreviation IS NOT NULL;
CREATE INDEX IF NOT EXISTS universities_directory_filter_idx
  ON public.universities (is_enabled, institution_type, region, campus_launch_status, name);

CREATE TABLE IF NOT EXISTS public.university_aliases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  university_id uuid NOT NULL REFERENCES public.universities(id) ON DELETE CASCADE,
  alias text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (university_id, alias)
);
CREATE UNIQUE INDEX IF NOT EXISTS university_aliases_alias_unique_ci
  ON public.university_aliases (lower(alias));
CREATE INDEX IF NOT EXISTS university_aliases_university_idx
  ON public.university_aliases (university_id);

ALTER TABLE public.university_aliases ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS public_enabled_university_aliases_read ON public.university_aliases;
CREATE POLICY public_enabled_university_aliases_read ON public.university_aliases
  FOR SELECT TO anon, authenticated
  USING (EXISTS (
    SELECT 1 FROM public.universities university
    WHERE university.id = university_aliases.university_id AND university.is_enabled
  ));
GRANT SELECT ON TABLE public.university_aliases TO anon, authenticated;

-- Directory mutations are server-authoritative and remain restricted to the
-- existing super-administrator role. University administrators retain only
-- their already-scoped branding authority.
CREATE OR REPLACE FUNCTION public.set_admin_university_launch_status(
  p_university_id uuid, p_launch_status text
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Super administrator access required' USING ERRCODE = '42501';
  END IF;
  IF p_launch_status NOT IN ('planned', 'onboarding', 'active', 'suspended') THEN
    RAISE EXCEPTION 'Invalid campus launch status' USING ERRCODE = '22023';
  END IF;
  UPDATE public.universities
  SET campus_launch_status = p_launch_status, updated_at = now()
  WHERE id = p_university_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'University not found' USING ERRCODE = 'P0002'; END IF;
  INSERT INTO public.audit_logs (actor_id, target_id, action, entity_type, entity_id, metadata)
  VALUES (auth.uid(), p_university_id, 'university.launch_status_set', 'university', p_university_id,
    jsonb_build_object('campus_launch_status', p_launch_status));
END $$;
REVOKE ALL ON FUNCTION public.set_admin_university_launch_status(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_admin_university_launch_status(uuid, text) TO authenticated;

-- The current GTEC catalogue has 16 traditional universities, 10 public
-- technical universities, 24 chartered private institutions and one private
-- university. GAFCSC is the active university-level public professional body.
INSERT INTO public.universities (
  name, official_name, short_name, abbreviation, slug, city, region, country,
  website_url, institution_type, ownership_type, campus_launch_status,
  is_enabled, is_verified, logo_alt_text, hero_alt_text
) VALUES
  ('Akenten Appiah-Menka University of Skills Training and Entrepreneurial Development', 'Akenten Appiah-Menka University of Skills Training and Entrepreneurial Development', 'AAMUSTED', 'AAMUSTED', 'aamusted', 'Kumasi', 'Ashanti', 'Ghana', NULL, 'Public University', 'public', 'planned', true, true, NULL, NULL),
  ('University of Technology and Applied Sciences', 'University of Technology and Applied Sciences', 'UTAS', 'UTAS', 'utas', 'Navrongo', 'Upper East', 'Ghana', NULL, 'Public University', 'public', 'planned', true, true, NULL, NULL),
  ('Ghana Communication Technology University', 'Ghana Communication Technology University', 'GCTU', 'GCTU', 'gctu', 'Tesano', 'Greater Accra', 'Ghana', NULL, 'Public University', 'public', 'planned', true, true, NULL, NULL),
  ('Ghana Institute of Management and Public Administration', 'Ghana Institute of Management and Public Administration', 'GIMPA', 'GIMPA', 'gimpa', 'Achimota', 'Greater Accra', 'Ghana', NULL, 'Public University', 'public', 'planned', true, true, NULL, NULL),
  ('Kwame Nkrumah University of Science and Technology', 'Kwame Nkrumah University of Science and Technology', 'KNUST', 'KNUST', 'knust', 'Kumasi', 'Ashanti', 'Ghana', NULL, 'Public University', 'public', 'planned', true, true, NULL, NULL),
  ('Simon Diedong Dombo University of Business and Integrated Development Studies', 'Simon Diedong Dombo University of Business and Integrated Development Studies', 'SDD-UBIDS', 'SDD-UBIDS', 'sdd-ubids', 'Wa', 'Upper West', 'Ghana', NULL, 'Public University', 'public', 'planned', true, true, NULL, NULL),
  ('University for Development Studies', 'University for Development Studies', 'UDS', 'UDS', 'uds', 'Tamale', 'Northern', 'Ghana', NULL, 'Public University', 'public', 'planned', true, true, NULL, NULL),
  ('University of Cape Coast', 'University of Cape Coast', 'UCC', 'UCC', 'ucc', 'Cape Coast', 'Central', 'Ghana', NULL, 'Public University', 'public', 'planned', true, true, NULL, NULL),
  ('University of Education, Winneba', 'University of Education, Winneba', 'UEW', 'UEW', 'uew', 'Winneba', 'Central', 'Ghana', NULL, 'Public University', 'public', 'planned', true, true, NULL, NULL),
  ('University of Energy and Natural Resources', 'University of Energy and Natural Resources', 'UENR', 'UENR', 'uenr', 'Sunyani', 'Bono', 'Ghana', NULL, 'Public University', 'public', 'active', true, true, 'Official logo of the University of Energy and Natural Resources', 'University of Energy and Natural Resources campus'),
  ('University of Health and Allied Sciences', 'University of Health and Allied Sciences', 'UHAS', 'UHAS', 'uhas', 'Ho', 'Volta', 'Ghana', NULL, 'Public University', 'public', 'planned', true, true, NULL, NULL),
  ('University of Environment and Sustainable Development', 'University of Environment and Sustainable Development', 'UESD', 'UESD', 'uesd', 'Somanya', 'Eastern', 'Ghana', NULL, 'Public University', 'public', 'planned', true, true, NULL, NULL),
  ('University of Ghana', 'University of Ghana', 'UG', 'UG', 'ug', 'Legon', 'Greater Accra', 'Ghana', NULL, 'Public University', 'public', 'planned', true, true, NULL, NULL),
  ('University of Media, Arts and Communication', 'University of Media, Arts and Communication', 'UniMAC', 'UniMAC', 'unimac', 'Accra', 'Greater Accra', 'Ghana', NULL, 'Public University', 'public', 'planned', true, true, NULL, NULL),
  ('University of Mines and Technology', 'University of Mines and Technology', 'UMaT', 'UMaT', 'umat', 'Tarkwa', 'Western', 'Ghana', NULL, 'Public University', 'public', 'planned', true, true, NULL, NULL),
  ('University of Professional Studies, Accra', 'University of Professional Studies, Accra', 'UPSA', 'UPSA', 'upsa', 'Legon', 'Greater Accra', 'Ghana', NULL, 'Public University', 'public', 'planned', true, true, NULL, NULL),
  ('Accra Technical University', 'Accra Technical University', 'ATU', 'ATU', 'atu', 'Accra', 'Greater Accra', 'Ghana', 'https://atu.edu.gh', 'Public Technical University', 'public', 'planned', true, true, NULL, NULL),
  ('Bolgatanga Technical University', 'Bolgatanga Technical University', 'BTU', 'BTU', 'btu', 'Bolgatanga', 'Upper East', 'Ghana', 'https://bolgatu.edu.gh', 'Public Technical University', 'public', 'planned', true, true, NULL, NULL),
  ('Cape Coast Technical University', 'Cape Coast Technical University', 'CCTU', 'CCTU', 'cctu', 'Cape Coast', 'Central', 'Ghana', 'https://cctu.edu.gh', 'Public Technical University', 'public', 'planned', true, true, NULL, NULL),
  ('Dr. Hilla Limann Technical University', 'Dr. Hilla Limann Technical University', 'DHLTU', 'DHLTU', 'dhltu', 'Wa', 'Upper West', 'Ghana', 'https://dhlttu.edu.gh', 'Public Technical University', 'public', 'planned', true, true, NULL, NULL),
  ('Ho Technical University', 'Ho Technical University', 'HTU', 'HTU', 'htu', 'Ho', 'Volta', 'Ghana', 'https://htu.edu.gh', 'Public Technical University', 'public', 'planned', true, true, NULL, NULL),
  ('Koforidua Technical University', 'Koforidua Technical University', 'KTU', 'KTU', 'ktu', 'Koforidua', 'Eastern', 'Ghana', 'https://ktu.edu.gh', 'Public Technical University', 'public', 'planned', true, true, NULL, NULL),
  ('Kumasi Technical University', 'Kumasi Technical University', 'KsTU', 'KsTU', 'kstu', 'Kumasi', 'Ashanti', 'Ghana', 'https://kstu.edu.gh', 'Public Technical University', 'public', 'planned', true, true, NULL, NULL),
  ('Sunyani Technical University', 'Sunyani Technical University', 'STU', 'STU', 'stu', 'Sunyani', 'Bono', 'Ghana', 'https://stu.edu.gh', 'Public Technical University', 'public', 'planned', true, true, NULL, NULL),
  ('Takoradi Technical University', 'Takoradi Technical University', 'TTU', 'TTU', 'ttu', 'Takoradi', 'Western', 'Ghana', 'https://ttu.edu.gh', 'Public Technical University', 'public', 'planned', true, true, NULL, NULL),
  ('Tamale Technical University', 'Tamale Technical University', 'TaTU', 'TaTU', 'tatu', 'Tamale', 'Northern', 'Ghana', 'https://tatu.edu.gh', 'Public Technical University', 'public', 'planned', true, true, NULL, NULL),
  ('Academic City University', 'Academic City University', 'Academic City', NULL, 'academic-city-university', 'Accra', 'Greater Accra', 'Ghana', NULL, 'Private Chartered University', 'private', 'planned', true, true, NULL, NULL),
  ('Accra Metropolitan University', 'Accra Metropolitan University', 'Accra Metropolitan', NULL, 'accra-metropolitan-university', 'Accra', 'Greater Accra', 'Ghana', NULL, 'Private Chartered University', 'private', 'planned', true, true, NULL, NULL),
  ('African University of Communication and Business', 'African University of Communication and Business', 'AUCB', 'AUCB', 'african-university-of-communication-and-business', 'Accra', 'Greater Accra', 'Ghana', NULL, 'Private Chartered University', 'private', 'planned', true, true, NULL, NULL),
  ('Akrofi-Christaller Institute of Theology, Mission and Culture', 'Akrofi-Christaller Institute of Theology, Mission and Culture', 'Akrofi-Christaller Institute', NULL, 'akrofi-christaller-institute', 'Akropong', 'Eastern', 'Ghana', NULL, 'Private Chartered University', 'private', 'planned', true, true, NULL, NULL),
  ('All Nations University', 'All Nations University', 'ANU', 'ANU', 'all-nations-university', 'Koforidua', 'Eastern', 'Ghana', NULL, 'Private Chartered University', 'private', 'planned', true, true, NULL, NULL),
  ('Ashesi University', 'Ashesi University', 'Ashesi', NULL, 'ashesi', 'Berekuso', 'Eastern', 'Ghana', 'https://ashesi.edu.gh', 'Private Chartered University', 'private', 'planned', true, true, NULL, NULL),
  ('Catholic University', 'Catholic University', 'Catholic University', NULL, 'catholic-university', 'Fiapre-Sunyani', 'Bono', 'Ghana', NULL, 'Private Chartered University', 'private', 'planned', true, true, NULL, NULL),
  ('Central University', 'Central University', 'Central University', 'CU', 'central-university', 'Tema', 'Greater Accra', 'Ghana', NULL, 'Private Chartered University', 'private', 'planned', true, true, NULL, NULL),
  ('Christian Service University', 'Christian Service University', 'CSU', 'CSU', 'christian-service-university', 'Kumasi', 'Ashanti', 'Ghana', NULL, 'Private Chartered University', 'private', 'planned', true, true, NULL, NULL),
  ('Ensign Global University', 'Ensign Global University', 'Ensign Global', NULL, 'ensign-global-university', 'Kpong', 'Eastern', 'Ghana', NULL, 'Private Chartered University', 'private', 'planned', true, true, NULL, NULL),
  ('Entrance University of Health Sciences', 'Entrance University of Health Sciences', 'Entrance University', NULL, 'entrance-university-of-health-sciences', 'Spintex Road', 'Greater Accra', 'Ghana', NULL, 'Private Chartered University', 'private', 'planned', true, true, NULL, NULL),
  ('Family Health University', 'Family Health University', 'Family Health', NULL, 'family-health-university', 'Teshie', 'Greater Accra', 'Ghana', NULL, 'Private Chartered University', 'private', 'planned', true, true, NULL, NULL),
  ('Garden City University', 'Garden City University', 'Garden City', NULL, 'garden-city-university', 'Kumasi', 'Ashanti', 'Ghana', NULL, 'Private Chartered University', 'private', 'planned', true, true, NULL, NULL),
  ('Heritage Christian University', 'Heritage Christian University', 'Heritage Christian', NULL, 'heritage-christian-university', 'Amasaman', 'Greater Accra', 'Ghana', NULL, 'Private Chartered University', 'private', 'planned', true, true, NULL, NULL),
  ('KAAF University', 'KAAF University', 'KAAF', 'KAAF', 'kaaf-university', 'Fetteh Kakraba', 'Central', 'Ghana', NULL, 'Private Chartered University', 'private', 'planned', true, true, NULL, NULL),
  ('Knutsford University', 'Knutsford University', 'Knutsford', NULL, 'knutsford-university', 'East Legon', 'Greater Accra', 'Ghana', NULL, 'Private Chartered University', 'private', 'planned', true, true, NULL, NULL),
  ('Methodist University', 'Methodist University', 'Methodist University', NULL, 'methodist-university', 'Accra', 'Greater Accra', 'Ghana', NULL, 'Private Chartered University', 'private', 'planned', true, true, NULL, NULL),
  ('NiBS University', 'NiBS University', 'NiBS', 'NiBS', 'nibs-university', 'South Legon', 'Greater Accra', 'Ghana', NULL, 'Private Chartered University', 'private', 'planned', true, true, NULL, NULL),
  ('Pentecost University', 'Pentecost University', 'Pentecost University', 'PU', 'pentecost-university', 'Sowutuom', 'Greater Accra', 'Ghana', NULL, 'Private Chartered University', 'private', 'planned', true, true, NULL, NULL),
  ('Presbyterian University', 'Presbyterian University', 'Presbyterian University', 'PUG', 'presbyterian-university', 'Abetifi', 'Eastern', 'Ghana', NULL, 'Private Chartered University', 'private', 'planned', true, true, NULL, NULL),
  ('Thrivus University for Biomedical Science and Technology', 'Thrivus University for Biomedical Science and Technology', 'Thrivus University', NULL, 'thrivus-university', 'Lashibi', 'Greater Accra', 'Ghana', NULL, 'Private Chartered University', 'private', 'planned', true, true, NULL, NULL),
  ('Trinity Theological Seminary', 'Trinity Theological Seminary', 'Trinity Seminary', NULL, 'trinity-theological-seminary', 'East Legon', 'Greater Accra', 'Ghana', NULL, 'Private Chartered University', 'private', 'planned', true, true, NULL, NULL),
  ('University of Gold Coast', 'University of Gold Coast', 'University of Gold Coast', 'UGC', 'university-of-gold-coast', 'Spintex', 'Greater Accra', 'Ghana', NULL, 'Private Chartered University', 'private', 'planned', true, true, NULL, NULL),
  ('Valley View University', 'Valley View University', 'Valley View', 'VVU', 'valley-view-university', 'Oyibi', 'Greater Accra', 'Ghana', NULL, 'Private Chartered University', 'private', 'planned', true, true, NULL, NULL),
  ('SENES Professional College, Accra', 'SENES Professional College, Accra', 'SENES Professional College', NULL, 'senes-professional-college-accra', 'Tema', 'Greater Accra', 'Ghana', NULL, 'Private University', 'private', 'planned', true, true, NULL, NULL),
  ('Ghana Armed Forces Command and Staff College', 'Ghana Armed Forces Command and Staff College', 'GAFCSC', 'GAFCSC', 'ghana-armed-forces-command-and-staff-college', 'Burma Camp, Accra', 'Greater Accra', 'Ghana', NULL, 'Other recognized university-level institution', 'public', 'planned', true, true, NULL, NULL)
ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name,
  official_name = EXCLUDED.official_name,
  short_name = EXCLUDED.short_name,
  abbreviation = EXCLUDED.abbreviation,
  city = EXCLUDED.city,
  region = EXCLUDED.region,
  country = EXCLUDED.country,
  website_url = COALESCE(EXCLUDED.website_url, public.universities.website_url),
  institution_type = EXCLUDED.institution_type,
  ownership_type = EXCLUDED.ownership_type,
  campus_launch_status = EXCLUDED.campus_launch_status,
  is_enabled = EXCLUDED.is_enabled,
  is_verified = EXCLUDED.is_verified,
  logo_alt_text = COALESCE(EXCLUDED.logo_alt_text, public.universities.logo_alt_text),
  hero_alt_text = COALESCE(EXCLUDED.hero_alt_text, public.universities.hero_alt_text),
  updated_at = now();

INSERT INTO public.university_aliases (university_id, alias)
SELECT university.id, aliases.alias
FROM (VALUES
  ('utas', 'C.K. Tedam University of Technology and Applied Sciences'),
  ('utas', 'CKT-UTAS'),
  ('sdd-ubids', 'S.D. Dombo University of Business and Integrated Development Studies'),
  ('sdd-ubids', 'SD Dombo University of Business and Integrated Development Studies'),
  ('uhas', 'University of Health and Allied Science'),
  ('unimac', 'University of Media Arts and Communication'),
  ('knust', 'Kwame Nkrumah University'),
  ('kstu', 'Kumasi Technical University'),
  ('university-of-gold-coast', 'UGC')
) AS aliases(slug, alias)
JOIN public.universities university ON university.slug = aliases.slug
ON CONFLICT (university_id, alias) DO NOTHING;

COMMIT;
