-- Reconcile the public directory with the 68 Ghana university-level
-- institutions listed by uniRank while retaining the existing GTEC-oriented
-- records. Variant names are aliases so we do not create duplicate institutions.
BEGIN;

INSERT INTO public.universities (
  name, official_name, short_name, abbreviation, slug, city, region, country,
  website_url, institution_type, ownership_type, campus_launch_status,
  is_enabled, is_verified, logo_alt_text, hero_alt_text
) VALUES
  ('Accra Institute of Technology', 'Accra Institute of Technology', 'AIT', 'AIT', 'accra-institute-of-technology', 'Accra', 'Greater Accra', 'Ghana', 'https://ait.edu.gh/', 'Private Chartered University', 'private', 'planned', true, false, 'Official logo of Accra Institute of Technology', 'Accra Institute of Technology campus landmark'),
  ('Anglican University College of Technology', 'Anglican University College of Technology', 'AUCT', 'AUCT', 'anglican-university-college-of-technology', 'Kumasi', 'Ashanti', 'Ghana', 'https://aut.edu.gh/', 'Private University', 'private', 'planned', true, false, 'Official logo of Anglican University College of Technology', 'Anglican University College of Technology campus landmark'),
  ('BlueCrest College', 'BlueCrest College', 'BlueCrest', 'BCC', 'bluecrest-college', 'Accra', 'Greater Accra', 'Ghana', 'https://bluecrest.edu.gh/', 'Private University', 'private', 'planned', true, false, 'Official logo of BlueCrest College', 'BlueCrest College campus landmark'),
  ('Catholic Institute of Business and Technology', 'Catholic Institute of Business and Technology', 'CIBT', 'CIBT', 'catholic-institute-of-business-and-technology', 'Accra', 'Greater Accra', 'Ghana', 'https://cibt.edu.gh/', 'Private University', 'private', 'planned', true, false, 'Official logo of Catholic Institute of Business and Technology', 'Catholic Institute of Business and Technology campus landmark'),
  ('Christ Apostolic University College', 'Christ Apostolic University College', 'CAUC', 'CAUC', 'christ-apostolic-university-college', 'Kumasi', 'Ashanti', 'Ghana', 'https://cauc.edu.gh/', 'Private University', 'private', 'planned', true, false, 'Official logo of Christ Apostolic University College', 'Christ Apostolic University College campus landmark'),
  ('Data Link Institute of Business and Technology', 'Data Link Institute of Business and Technology', 'DLIBT', 'DLIBT', 'data-link-institute-of-business-and-technology', 'Accra', 'Greater Accra', 'Ghana', 'https://datalink.edu.gh/', 'Private University', 'private', 'planned', true, false, 'Official logo of Data Link Institute of Business and Technology', 'Data Link Institute of Business and Technology campus landmark'),
  ('Dominion University College', 'Dominion University College', 'DUC', 'DUC', 'dominion-university-college', 'Accra', 'Greater Accra', 'Ghana', 'https://duc.edu.gh/', 'Private University', 'private', 'planned', true, false, 'Official logo of Dominion University College', 'Dominion University College campus landmark'),
  ('Evangelical Presbyterian University College', 'Evangelical Presbyterian University College', 'EPUC', 'EPUC', 'evangelical-presbyterian-university-college', 'Ho', 'Volta', 'Ghana', 'https://epuc.edu.gh/', 'Private University', 'private', 'planned', true, false, 'Official logo of Evangelical Presbyterian University College', 'Evangelical Presbyterian University College campus landmark'),
  ('Ghana Baptist University College', 'Ghana Baptist University College', 'GBUC', 'GBUC', 'ghana-baptist-university-college', 'Kumasi', 'Ashanti', 'Ghana', 'https://gbuc.edu.gh/', 'Private University', 'private', 'planned', true, false, 'Official logo of Ghana Baptist University College', 'Ghana Baptist University College campus landmark'),
  ('Ghana Christian University College', 'Ghana Christian University College', 'GCUC', 'GCUC', 'ghana-christian-university-college', 'Accra', 'Greater Accra', 'Ghana', 'https://www.ghanacu.edu.gh/', 'Private University', 'private', 'planned', true, false, 'Official logo of Ghana Christian University College', 'Ghana Christian University College campus landmark'),
  ('Islamic University College, Ghana', 'Islamic University College, Ghana', 'IUCG', 'IUCG', 'islamic-university-college-ghana', 'Accra', 'Greater Accra', 'Ghana', 'https://iuc.edu.gh/', 'Private University', 'private', 'planned', true, false, 'Official logo of Islamic University College, Ghana', 'Islamic University College, Ghana campus landmark'),
  ('Jayee University College', 'Jayee University College', 'JUC', 'JUC', 'jayee-university-college', 'Accra', 'Greater Accra', 'Ghana', 'https://jayeeuniversity.edu.gh/', 'Private University', 'private', 'planned', true, false, 'Official logo of Jayee University College', 'Jayee University College campus landmark'),
  ('Kessben University College', 'Kessben University College', 'Kessben', 'KUC', 'kessben-university-college', 'Kuntanase', 'Ashanti', 'Ghana', 'https://kessben.edu.gh/', 'Private University', 'private', 'planned', true, false, 'Official logo of Kessben University College', 'Kessben University College campus landmark'),
  ('Kings University College', 'Kings University College', 'Kings', 'KUC', 'kings-university-college', 'Accra', 'Greater Accra', 'Ghana', 'https://kuc.edu.gh/', 'Private University', 'private', 'planned', true, false, 'Official logo of Kings University College', 'Kings University College campus landmark'),
  ('Lancaster University, Ghana', 'Lancaster University, Ghana', 'LUG', 'LUG', 'lancaster-university-ghana', 'Accra', 'Greater Accra', 'Ghana', 'https://lancaster.edu.gh/', 'Private Chartered University', 'private', 'planned', true, false, 'Official logo of Lancaster University, Ghana', 'Lancaster University, Ghana campus landmark'),
  ('Maranatha University College', 'Maranatha University College', 'Maranatha', 'MUC', 'maranatha-university-college', 'Accra', 'Greater Accra', 'Ghana', 'https://maranatha.edu.gh/', 'Private University', 'private', 'planned', true, false, 'Official logo of Maranatha University College', 'Maranatha University College campus landmark'),
  ('Marshalls University College', 'Marshalls University College', 'Marshalls', 'MUC', 'marshalls-university-college', 'Accra', 'Greater Accra', 'Ghana', 'https://marshalls.edu.gh/', 'Private University', 'private', 'planned', true, false, 'Official logo of Marshalls University College', 'Marshalls University College campus landmark'),
  ('Mountcrest University College', 'Mountcrest University College', 'Mountcrest', 'MUC', 'mountcrest-university-college', 'Accra', 'Greater Accra', 'Ghana', 'https://mountcrest.edu.gh/', 'Private University', 'private', 'planned', true, false, 'Official logo of Mountcrest University College', 'Mountcrest University College campus landmark'),
  ('Palm University College', 'Palm University College', 'Palm', 'PUC', 'palm-university-college', 'Accra', 'Greater Accra', 'Ghana', 'https://palm.edu.gh/', 'Private University', 'private', 'planned', true, false, 'Official logo of Palm University College', 'Palm University College campus landmark'),
  ('Perez University College', 'Perez University College', 'Perez', 'Pérez', 'perez-university-college', 'Accra', 'Greater Accra', 'Ghana', 'https://perez.edu.gh/', 'Private University', 'private', 'planned', true, false, 'Official logo of Perez University College', 'Perez University College campus landmark'),
  ('Radford University College', 'Radford University College', 'Radford', 'RUC', 'radford-university-college', 'Accra', 'Greater Accra', 'Ghana', 'https://radford.edu.gh/', 'Private University', 'private', 'planned', true, false, 'Official logo of Radford University College', 'Radford University College campus landmark'),
  ('Regent University College of Science and Technology', 'Regent University College of Science and Technology', 'Regent', 'RUCST', 'regent-university-college', 'Accra', 'Greater Accra', 'Ghana', 'https://regent.edu.gh/', 'Private University', 'private', 'planned', true, false, 'Official logo of Regent University College of Science and Technology', 'Regent University College of Science and Technology campus landmark'),
  ('Spiritan University College', 'Spiritan University College', 'Spiritan', 'SUC', 'spiritan-university-college', 'Ejisu', 'Ashanti', 'Ghana', 'https://spiritan.edu.gh/', 'Private University', 'private', 'planned', true, false, 'Official logo of Spiritan University College', 'Spiritan University College campus landmark'),
  ('University College of Agriculture and Environmental Studies', 'University College of Agriculture and Environmental Studies', 'UCAES', 'UCAES', 'university-college-agriculture-environmental-studies', 'Bunso', 'Eastern', 'Ghana', 'https://ucaes.edu.gh/', 'Private University', 'private', 'planned', true, false, 'Official logo of University College of Agriculture and Environmental Studies', 'University College of Agriculture and Environmental Studies campus landmark'),
  ('West End University College', 'West End University College', 'West End', 'WEUC', 'west-end-university-college', 'Accra', 'Greater Accra', 'Ghana', 'https://weuc.edu.gh/', 'Private University', 'private', 'planned', true, false, 'Official logo of West End University College', 'West End University College campus landmark'),
  ('Wisconsin International University College', 'Wisconsin International University College', 'Wisconsin', 'WIUC', 'wisconsin-international-university-college', 'Accra', 'Greater Accra', 'Ghana', 'https://wiuc-ghana.edu.gh/', 'Private University', 'private', 'planned', true, false, 'Official logo of Wisconsin International University College', 'Wisconsin International University College campus landmark'),
  ('Zenith University College', 'Zenith University College', 'Zenith', 'ZUC', 'zenith-university-college', 'Accra', 'Greater Accra', 'Ghana', 'https://zuc.edu.gh/', 'Private University', 'private', 'planned', true, false, 'Official logo of Zenith University College', 'Zenith University College campus landmark')
ON CONFLICT DO NOTHING;

INSERT INTO public.university_aliases (university_id, alias)
SELECT university.id, aliases.alias
FROM (VALUES
  ('african-university-of-communication-and-business', 'African University of Communications and Business'),
  ('catholic-university', 'Catholic University of Ghana'),
  ('kaaf-university', 'KAAF University College'),
  ('knutsford-university', 'Knutsford University College'),
  ('presbyterian-university', 'Presbyterian University, Ghana'),
  ('sdd-ubids', 'Simon Diedong Dombo University of Business and Integrated Development Studies'),
  ('aamusted', 'University of Skills Training and Entrepreneurial Development')
) AS aliases(slug, alias)
JOIN public.universities university ON university.slug = aliases.slug
ON CONFLICT (university_id, alias) DO NOTHING;

COMMIT;
