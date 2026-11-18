-- Run against a disposable database with 0209 applied. All fixtures roll back.
BEGIN;

INSERT INTO public.campus_feed_sources
  (id, label, university_name, website_url, feed_url, source_domain, enabled)
VALUES
  ('qa-public-source', 'QA Enabled', 'QA College', 'https://example.test',
   'https://example.test/enabled.rss', 'example.test', true),
  ('qa-disabled-source', 'QA Disabled', 'QA College', 'https://example.test',
   'https://example.test/disabled.rss', 'example.test', false);

INSERT INTO public.campus_feed_items
  (source_id, source_item_key, source_label, university_name, title, canonical_url, status, approved_at, review_reason)
VALUES
  ('qa-public-source', repeat('a', 64), 'QA Enabled', 'QA College', 'Published fixture',
    'https://example.test/a', 'approved', now(), 'Private note'),
  ('qa-public-source', repeat('b', 64), 'QA Enabled', 'QA College', 'Pending fixture',
    'https://example.test/b', 'pending', null, 'Private note'),
  ('qa-disabled-source', repeat('c', 64), 'QA Disabled', 'QA College', 'Disabled source fixture',
    'https://example.test/c', 'approved', now(), 'Private note'),
  ('qa-public-source', repeat('d', 64), 'QA Enabled', 'QA College', 'Rejected fixture',
    'https://example.test/d', 'rejected', null, 'Private note');

SET LOCAL ROLE anon;
DO $$
BEGIN
  IF (SELECT array_agg(title ORDER BY title) FROM public.campus_feed_public_items
      WHERE source_id LIKE 'qa-%') IS DISTINCT FROM ARRAY['Published fixture'] THEN
    RAISE EXCEPTION 'Anonymous view must only return approved items from enabled sources';
  END IF;
  IF (SELECT array_agg(source_id ORDER BY source_id) FROM public.campus_feed_public_sources
      WHERE source_id LIKE 'qa-%') IS DISTINCT FROM ARRAY['qa-public-source'] THEN
    RAISE EXCEPTION 'Anonymous source view must hide disabled sources';
  END IF;
  IF EXISTS (SELECT 1 FROM public.campus_feed_items WHERE source_id LIKE 'qa-%' AND title <> 'Published fixture')
     OR EXISTS (SELECT 1 FROM public.campus_feed_sources WHERE id = 'qa-disabled-source') THEN
    RAISE EXCEPTION 'Direct anonymous reads must also honor row policies';
  END IF;
  BEGIN
    PERFORM review_reason FROM public.campus_feed_items LIMIT 1;
    RAISE EXCEPTION 'Anonymous reader accessed a moderation field';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    PERFORM feed_url FROM public.campus_feed_sources LIMIT 1;
    RAISE EXCEPTION 'Anonymous reader accessed an ingestion field';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END;
$$;

SET LOCAL ROLE authenticated;
DO $$
BEGIN
  IF (SELECT count(*) FROM public.campus_feed_public_items WHERE source_id LIKE 'qa-%') <> 1
     OR (SELECT count(*) FROM public.campus_feed_items WHERE source_id LIKE 'qa-%') <> 1 THEN
    RAISE EXCEPTION 'Authenticated feed must hide pending and disabled-source items';
  END IF;
  IF has_column_privilege(current_user, 'public.campus_feed_items', 'approved_by', 'select')
     OR has_column_privilege(current_user, 'public.campus_feed_items', 'source_item_key', 'select')
     OR has_table_privilege(current_user, 'public.campus_feed_items', 'insert')
     OR has_table_privilege(current_user, 'public.campus_feed_public_sources', 'insert,update,delete')
     OR has_table_privilege(current_user, 'public.campus_feed_public_items', 'insert,update,delete') THEN
    RAISE EXCEPTION 'Browser reader has excessive privileges';
  END IF;
END;
$$;

SET LOCAL ROLE service_role;
DO $$
BEGIN
  IF (SELECT count(review_reason) FROM public.campus_feed_items WHERE source_id LIKE 'qa-%') <> 4 THEN
    RAISE EXCEPTION 'Staff backend can no longer review the underlying queue';
  END IF;
END;
$$;

ROLLBACK;
