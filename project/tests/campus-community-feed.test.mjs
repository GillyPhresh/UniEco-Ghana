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

test('campus feed uses readable social cards and exposes video recovery controls', async () => {
  const feed = await read('components/feed/campus-community-feed.tsx');
  assert.match(feed, /Share a campus moment/);
  assert.match(feed, /rounded-2xl border border-slate-200 bg-white/);
  assert.match(feed, /controls/);
  assert.match(feed, /onError=\{\(\) => setVideoState\('error'\)\}/);
  assert.match(feed, /This video didn’t play/);
  assert.match(feed, /Try again/);
  assert.match(feed, /Open original/);
  assert.match(feed, /MP4 with H\.264/);
  assert.doesNotMatch(feed, /h-full min-h-full snap-start snap-always/);
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

test('social actions use guarded RPCs and interaction records are not directly exposed', async () => {
  const migration = await read('supabase/migrations/20261102100000_0176_community_social_graph.sql');
  const actions = await read('components/feed/community-post-actions.tsx');
  assert.match(migration, /ALTER TABLE public\.campus_community_post_likes ENABLE ROW LEVEL SECURITY/);
  assert.match(migration, /FROM PUBLIC, anon, authenticated/);
  assert.match(migration, /GRANT EXECUTE ON FUNCTION public\.set_campus_community_post_like\(uuid, boolean\) TO authenticated/);
  assert.match(migration, /GRANT EXECUTE ON FUNCTION public\.set_campus_community_post_bookmark\(uuid, boolean\) TO authenticated/);
  assert.match(migration, /GRANT EXECUTE ON FUNCTION public\.set_campus_community_follow\(uuid, boolean\) TO authenticated/);
  assert.match(actions, /set_campus_community_post_like/);
  assert.match(actions, /set_campus_community_post_bookmark/);
  assert.match(actions, /set_campus_community_follow/);
  assert.match(actions, /\['student', 'student_vendor', 'external_vendor'\]/);
  assert.doesNotMatch(actions, /\.from\(['"]campus_community_(post_likes|post_bookmarks|follows|comments)['"]\)/);
});

test('publishing and media uploads require verified eligible accounts at the database boundary', async () => {
  const migration = await read('supabase/migrations/20261102100000_0176_community_social_graph.sql');
  assert.match(migration, /CREATE OR REPLACE FUNCTION public\.can_publish_campus_community/);
  assert.match(migration, /student\.is_verified_student\s+AND student\.verification_status = 'verified'/);
  assert.match(migration, /vendor_profile\.verification_status IN \('active', 'verified'\)/);
  assert.match(migration, /vendor\.is_verified AND vendor\.is_active/);
  assert.match(migration, /public\.can_publish_campus_community\(auth\.uid\(\)\)/);
  assert.match(migration, /IF NOT public\.can_publish_campus_community\(v_user_id\) THEN/);
  assert.match(migration, /p_media_type IS NULL OR p_media_type NOT IN \('image', 'video'\)/);
  assert.match(migration, /Invalid community media/);
  assert.match(migration, /object\.name = p_media_path/);
  assert.match(migration, /post\.created_at > now\(\) - interval '1 hour'/);
});

test('public member profiles and private saved posts use limited RPCs and safe identity fields', async () => {
  const migration = await read('supabase/migrations/20261102100000_0176_community_social_graph.sql');
  const profilePage = await read('app/community/member/[id]/page.tsx');
  const savedPage = await read('app/community/saved/page.tsx');
  assert.match(migration, /CREATE OR REPLACE FUNCTION public\.get_campus_community_member_profile/);
  assert.match(migration, /display_name text/);
  assert.match(migration, /university_name text/);
  assert.match(migration, /CREATE OR REPLACE FUNCTION public\.get_campus_community_saved_posts/);
  assert.match(migration, /WHERE saved\.user_id = v_user_id/);
  assert.match(migration, /GRANT EXECUTE ON FUNCTION public\.get_campus_community_saved_posts\(timestamptz, uuid, integer\) TO authenticated/);
  const publicProfileFunction = migration.split('CREATE OR REPLACE FUNCTION public.get_campus_community_member_profile')[1]?.split('CREATE OR REPLACE FUNCTION public.get_campus_community_member_posts')[0] || '';
  assert.doesNotMatch(publicProfileFunction, /\b(email|phone|student_id_number|student_id_document_url)\b/i);
  assert.match(profilePage, /get_campus_community_member_profile/);
  assert.match(profilePage, /get_campus_community_member_posts/);
  assert.match(profilePage, /community\/member\/\$\{memberId\}/);
  assert.match(savedPage, /get_campus_community_saved_posts/);
  assert.match(savedPage, /if \(!next\.bookmarked_by_me\) setPosts/);
});

test('post links open a requested feed item and move the viewport to it', async () => {
  const feed = await read('components/feed/campus-community-feed.tsx');
  const migration = await read('supabase/migrations/20261102100000_0176_community_social_graph.sql');
  assert.match(feed, /new URLSearchParams\(window\.location\.search\)\.get\('post'\)/);
  assert.match(feed, /get_campus_community_post/);
  assert.match(feed, /scrollIntoView\(\{ behavior: 'smooth', block: 'start' \}\)/);
  assert.match(migration, /CREATE OR REPLACE FUNCTION public\.get_campus_community_post\(p_post_id uuid\)/);
  assert.match(migration, /https:\/\/www\.uniecoghana\.com\/\?post=/);
});
