-- Publish only assets downloaded from the institutions' own sites. Records
-- without a verified public asset intentionally remain on the UI monogram and
-- landmark placeholders until an official source is available.
BEGIN;

UPDATE public.universities AS university
SET
  logo_url = COALESCE(assets.logo_url, university.logo_url),
  hero_image_url = COALESCE(assets.campus_url, university.hero_image_url),
  landmark_image_url = COALESCE(assets.campus_url, university.landmark_image_url),
  image_source = 'Official institutional website',
  updated_at = now()
FROM (VALUES
  ('aamusted', '/assets/universities/aamusted/logo.jpg', '/assets/universities/aamusted/campus.jpg'),
  ('academic-city-university', '/assets/universities/academic-city-university/logo.png', '/assets/universities/academic-city-university/campus.jpg'),
  ('accra-institute-of-technology', '/assets/universities/accra-institute-of-technology/logo.png', NULL),
  ('accra-metropolitan-university', '/assets/universities/accra-metropolitan-university/logo.png', '/assets/universities/accra-metropolitan-university/campus.jpg'),
  ('accra-technical-university', '/assets/universities/atu/logo.png', '/assets/universities/atu/campus.jpg'),
  ('african-university-of-communication-and-business', '/assets/universities/african-university-of-communication-and-business/logo.png', '/assets/universities/african-university-of-communication-and-business/campus.jpg'),
  ('all-nations-university', '/assets/universities/all-nations-university/logo.png', '/assets/universities/all-nations-university/campus.jpg'),
  ('ashesi', '/assets/universities/ashesi/logo.webp', '/assets/universities/ashesi/campus.jpg'),
  ('bluecrest-college', '/assets/universities/bluecrest-college/logo.jpg', '/assets/universities/bluecrest-college/campus.jpg'),
  ('bolgatanga-technical-university', '/assets/universities/btu/logo.png', '/assets/universities/btu/campus.png'),
  ('cape-coast-technical-university', '/assets/universities/cctu/logo.png', '/assets/universities/cctu/campus.jpg'),
  ('catholic-institute-of-business-and-technology', '/assets/universities/catholic-institute-of-business-and-technology/logo.png', '/assets/universities/catholic-institute-of-business-and-technology/campus.jpg'),
  ('catholic-university', '/assets/universities/catholic-university/logo.jpg', '/assets/universities/catholic-university/campus.png'),
  ('central-university', '/assets/universities/central-university/logo.png', '/assets/universities/central-university/campus.jpg'),
  ('christian-service-university', '/assets/universities/christian-service-university/logo.jpg', '/assets/universities/christian-service-university/campus.jpg'),
  ('data-link-institute-of-business-and-technology', '/assets/universities/data-link-institute-of-business-and-technology/logo.png', '/assets/universities/data-link-institute-of-business-and-technology/campus.jpg'),
  ('dr-hilla-limann-technical-university', '/assets/universities/dhltu/logo.png', '/assets/universities/dhltu/campus.jpg'),
  ('ensign-global-university', '/assets/universities/ensign-global-university/logo.png', '/assets/universities/ensign-global-university/campus.png'),
  ('entrance-university-of-health-sciences', '/assets/universities/entrance-university-of-health-sciences/logo.png', NULL),
  ('evangelical-presbyterian-university-college', '/assets/universities/evangelical-presbyterian-university-college/logo.png', NULL),
  ('family-health-university', '/assets/universities/family-health-university/logo.png', '/assets/universities/family-health-university/campus.jpg'),
  ('garden-city-university', '/assets/universities/garden-city-university/logo.png', '/assets/universities/garden-city-university/campus.jpg'),
  ('ghana-armed-forces-command-and-staff-college', '/assets/universities/ghana-armed-forces-command-and-staff-college/logo.png', '/assets/universities/ghana-armed-forces-command-and-staff-college/campus.jpg'),
  ('ghana-baptist-university-college', '/assets/universities/ghana-baptist-university-college/logo.png', '/assets/universities/ghana-baptist-university-college/campus.png'),
  ('ghana-communication-technology-university', '/assets/universities/gctu/logo.png', '/assets/universities/gctu/campus.jpg'),
  ('heritage-christian-university', '/assets/universities/heritage-christian-university/logo.png', '/assets/universities/heritage-christian-university/campus.jpg'),
  ('ho-technical-university', '/assets/universities/htu/logo.png', '/assets/universities/htu/campus.jpg'),
  ('kaaf-university', '/assets/universities/kaaf-university/logo.png', '/assets/universities/kaaf-university/campus.jpg'),
  ('knust', '/assets/universities/knust/logo.png', '/assets/universities/knust/campus.jpg'),
  ('knutsford-university', '/assets/universities/knutsford-university/logo.png', '/assets/universities/knutsford-university/campus.jpg'),
  ('koforidua-technical-university', '/assets/universities/ktu/logo.png', '/assets/universities/ktu/campus.png'),
  ('kumasi-technical-university', '/assets/universities/kstu/logo.png', '/assets/universities/kstu/campus.jpg'),
  ('methodist-university', '/assets/universities/methodist-university/logo.png', '/assets/universities/methodist-university/campus.png'),
  ('national-defence-university', '/assets/universities/national-defence-university/logo.png', '/assets/universities/national-defence-university/campus.jpg'),
  ('nibs-university', '/assets/universities/nibs-university/logo.png', '/assets/universities/nibs-university/campus.webp'),
  ('pentecost-university', '/assets/universities/pentecost-university/logo.png', '/assets/universities/pentecost-university/campus.png'),
  ('presbyterian-university', '/assets/universities/presbyterian-university/logo.jpg', '/assets/universities/presbyterian-university/campus.jpg'),
  ('regional-maritime-university', '/assets/universities/regional-maritime-university/logo.jpg', '/assets/universities/regional-maritime-university/campus.jpg'),
  ('sdd-ubids', '/assets/universities/sdd-ubids/logo.png', '/assets/universities/sdd-ubids/campus.jpg'),
  ('sunyani-technical-university', '/assets/universities/stu/logo.png', '/assets/universities/stu/campus.jpg'),
  ('takoradi-technical-university', '/assets/universities/ttu/logo.png', '/assets/universities/ttu/campus.png'),
  ('tamale-technical-university', '/assets/universities/tatu/logo.png', '/assets/universities/tatu/campus.png'),
  ('thrivus-university', '/assets/universities/thrivus-university/logo.png', '/assets/universities/thrivus-university/campus.jpg'),
  ('trinity-theological-seminary', '/assets/universities/trinity-theological-seminary/logo.webp', '/assets/universities/trinity-theological-seminary/campus.webp'),
  ('university-for-development-studies', '/assets/universities/uds/logo.ico', '/assets/universities/uds/campus.jpg'),
  ('university-of-cape-coast', '/assets/universities/ucc/logo.png', '/assets/universities/ucc/campus.png'),
  ('university-of-education-winneba', '/assets/universities/uew/logo.png', '/assets/universities/uew/campus.jpg'),
  ('university-of-energy-and-natural-resources', '/assets/universities/UENR/logo.png', '/assets/universities/UENR/campus.jpg'),
  ('university-of-environment-and-sustainable-development', '/assets/universities/uesd/logo.jpg', '/assets/universities/uesd/campus.png'),
  ('university-of-ghana', '/assets/universities/ug/logo.svg', '/assets/universities/ug/campus.jpg'),
  ('university-of-gold-coast', '/assets/universities/university-of-gold-coast/logo.png', '/assets/universities/university-of-gold-coast/campus.jpg'),
  ('university-of-health-and-allied-sciences', '/assets/universities/uhas/logo.png', '/assets/universities/uhas/campus.jpg'),
  ('university-of-media-arts-and-communication', '/assets/universities/unimac/logo.png', '/assets/universities/unimac/campus.jpg'),
  ('university-of-mines-and-technology', '/assets/universities/umat/logo.png', '/assets/universities/umat/campus.jpg'),
  ('university-of-professional-studies-accra', '/assets/universities/upsa/logo.png', '/assets/universities/upsa/campus.jpg'),
  ('university-of-technology-and-applied-sciences', '/assets/universities/utas/logo.png', '/assets/universities/utas/campus.webp'),
  ('valley-view-university', '/assets/universities/valley-view-university/logo.png', '/assets/universities/valley-view-university/campus.jpg')
) AS assets(slug, logo_url, campus_url)
WHERE university.slug = assets.slug
  AND (assets.logo_url IS NOT NULL OR assets.campus_url IS NOT NULL);

COMMIT;
