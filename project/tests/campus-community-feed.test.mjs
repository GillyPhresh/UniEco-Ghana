import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');

test('homepage is a real community feed and keeps the university directory separate', async () => {
  const page = await read('app/page.tsx');
  const feed = await read('components/feed/campus-community-feed.tsx');
  assert.match(page, /CampusCommunityFeed/);
  assert.doesNotMatch(page, /UniversitySection|FeaturedBusinesses|EventsPreview/);
  assert.match(feed, /Across Ghana/);
  assert.match(feed, /My university/);
  assert.match(feed, /href="\/universities"/);
  assert.match(feed, /href="\/updates"/);
  assert.match(feed, /get_campus_community_feed/);
});

test('community media is bounded and writes go through authenticated owner-checked RPCs', async () => {
  const migration = await read('supabase/migrations/20261101180000_0175_campus_community_posts.sql');
  const feed = await read('components/feed/campus-community-feed.tsx');
  assert.match(migration, /file_size_limit\s*=\s*EXCLUDED\.file_size_limit/);
  assert.match(migration, /26214400/);
  assert.match(migration, /campus_community_owner_upload/);
  assert.match(migration, /storage\.foldername\(name\)\)\[1\] = auth\.uid\(\)::text/);
  assert.match(migration, /role\.name IN \('student', 'student_vendor', 'external_vendor'\)/);
  assert.match(migration, /pg_advisory_xact_lock/);
  assert.match(migration, /GRANT EXECUTE ON FUNCTION public\.create_campus_community_post\(text, text, text\) TO authenticated/);
  assert.doesNotMatch(migration, /GRANT EXECUTE ON FUNCTION public\.create_campus_community_post\(text, text, text\) TO anon/);
  assert.match(feed, /MAX_MEDIA_BYTES = 25 \* 1024 \* 1024/);
  assert.match(feed, /upsert: false/);
  assert.match(feed, /create_campus_community_post/);
});

test('campus-only scope derives the school on the server and reports have an audited review route', async () => {
  const migration = await read('supabase/migrations/20261101180000_0175_campus_community_posts.sql');
  const middleware = await read('lib/supabase/middleware.ts');
  const layout = await read('components/admin/admin-layout.tsx');
  const nav = await read('lib/types/admin.ts');
  const page = await read('app/admin/community-posts/page.tsx');
  assert.match(migration, /SELECT profile\.university_id INTO v_university_id/);
  assert.match(migration, /public\.has_permission\('can_moderate_content'\)/);
  assert.match(migration, /INSERT INTO public\.audit_logs/);
  assert.match(middleware, /community-posts.*can_moderate_content/s);
  assert.match(layout, /community-posts.*moderatorPermissions\.has\('can_moderate_content'\)/s);
  assert.match(nav, /Campus Posts.*\/admin\/community-posts/);
  assert.match(page, /moderate_campus_community_post_report/);
  assert.match(page, /p_note: note\.trim\(\)/);
});
