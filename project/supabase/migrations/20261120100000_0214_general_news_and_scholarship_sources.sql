-- Extend UniEco's source-attributed feed to trusted general-news publishers
-- and official scholarship providers. Research ingestion remains pending-only;
-- a Super Admin must verify every story before it appears publicly.
BEGIN;

ALTER TABLE public.campus_feed_sources
  DROP CONSTRAINT IF EXISTS campus_feed_sources_source_kind_check;
ALTER TABLE public.campus_feed_sources
  ADD CONSTRAINT campus_feed_sources_source_kind_check
  CHECK (source_kind IN ('campus', 'opportunities', 'news'));

INSERT INTO public.campus_feed_sources
  (id, label, university_name, website_url, feed_url, source_domain, source_kind, enabled)
VALUES
  ('ghana-news-agency', 'Ghana News Agency', 'Ghana',
   'https://gna.org.gh/', 'https://gna.org.gh/', 'gna.org.gh', 'news', true),
  ('myjoyonline', 'MyJoyOnline', 'Ghana',
   'https://www.myjoyonline.com/', 'https://www.myjoyonline.com/feed/', 'myjoyonline.com', 'news', true),
  ('3news', '3News', 'Ghana',
   'https://3news.com/', 'https://3news.com/', '3news.com', 'news', true),
  ('associated-press', 'Associated Press', 'International news',
   'https://apnews.com/', 'https://apnews.com/', 'apnews.com', 'news', true),
  ('cambridge-press', 'Cambridge University Press & Assessment', 'International education',
   'https://www.cambridge.org/news-and-insights/', 'https://www.cambridge.org/news-and-insights/', 'cambridge.org', 'news', true),
  ('bank-of-ghana', 'Bank of Ghana', 'Ghana',
   'https://www.bog.gov.gh/news/', 'https://www.bog.gov.gh/news/', 'bog.gov.gh', 'news', true),
  ('getfund-local-scholarships', 'GETFund scholarships', 'National scholarships in Ghana',
   'https://getfund.gov.gh/', 'https://getfund.gov.gh/', 'getfund.gov.gh', 'opportunities', true),
  ('ug-scholarships', 'University of Ghana Financial Aid', 'University of Ghana',
   'https://www.ug.edu.gh/financialaid/scholarships', 'https://www.ug.edu.gh/financialaid/scholarships', 'ug.edu.gh', 'opportunities', true),
  ('knust-scholarships', 'KNUST scholarships', 'Kwame Nkrumah University of Science and Technology',
   'https://www.knust.edu.gh/announcements/general', 'https://www.knust.edu.gh/announcements/general', 'knust.edu.gh', 'opportunities', true),
  ('commonwealth-shared-scholarships', 'Commonwealth Scholarship Commission', 'International scholarships',
   'https://cscuk.fcdo.gov.uk/shared/', 'https://cscuk.fcdo.gov.uk/shared/', 'cscuk.fcdo.gov.uk', 'opportunities', true),
  ('manchester-scholarships', 'University of Manchester scholarships', 'International scholarships',
   'https://www.manchester.ac.uk/study/international/country-specific-information/ghana/scholarships/',
   'https://www.manchester.ac.uk/study/international/country-specific-information/ghana/scholarships/',
   'manchester.ac.uk', 'opportunities', true),
  ('oxford-reach-scholarship', 'University of Oxford · Reach Scholarship', 'International scholarships',
   'https://www.ox.ac.uk/admissions/undergraduate/fees-and-funding/oxford-bursaries-and-scholarships/reach-oxford',
   'https://www.ox.ac.uk/admissions/undergraduate/fees-and-funding/oxford-bursaries-and-scholarships/reach-oxford',
   'ox.ac.uk', 'opportunities', true)
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
WITH (security_invoker = true, security_barrier = true)
AS
SELECT id AS source_id, label AS source_label, university_name, source_kind
FROM public.campus_feed_sources
WHERE enabled;

REVOKE ALL ON public.campus_feed_public_sources FROM PUBLIC;
GRANT SELECT ON public.campus_feed_public_sources TO anon, authenticated;

COMMIT;
