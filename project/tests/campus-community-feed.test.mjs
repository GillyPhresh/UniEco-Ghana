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
  const attachmentMigration = await read('supabase/migrations/20261102120000_0177_community_any_file_attachments.sql');
  const feed = await read('components/feed/campus-community-feed.tsx');
  assert.match(migration, /file_size_limit\s*=\s*EXCLUDED\.file_size_limit/);
  assert.match(migration, /26214400/);
  assert.match(migration, /campus_community_owner_upload/);
  assert.match(migration, /storage\.foldername\(name\)\)\[1\] = auth\.uid\(\)::text/);
  assert.match(migration, /role\.name IN \('student', 'student_vendor', 'external_vendor'\)/);
  assert.match(migration, /pg_advisory_xact_lock/);
  assert.match(migration, /GRANT EXECUTE ON FUNCTION public\.create_campus_community_post\(text, text, text\) TO authenticated/);
  assert.doesNotMatch(migration, /GRANT EXECUTE ON FUNCTION public\.create_campus_community_post\(text, text, text\) TO anon/);
  assert.match(feed, /MAX_ATTACHMENT_BYTES = 50 \* 1024 \* 1024/);
  assert.match(feed, /MAX_PREVIEW_MEDIA_BYTES = 25 \* 1024 \* 1024/);
  assert.match(feed, /campus-community-files/);
  assert.match(feed, /upsert: false/);
  assert.match(feed, /create_campus_community_post_with_attachment/);
  assert.match(attachmentMigration, /VALUES \('campus-community-files', 'campus-community-files', false, 52428800, NULL\)/);
  assert.match(attachmentMigration, /allowed_mime_types = NULL/);
  assert.match(attachmentMigration, /campus_community_files_owner_upload/);
  assert.match(attachmentMigration, /campus_community_files_authorized_read/);
  assert.match(attachmentMigration, /public\.can_upload_campus_community_media\(\)/);
  assert.match(attachmentMigration, /GRANT EXECUTE ON FUNCTION public\.create_campus_community_post_with_attachment[\s\S]+TO authenticated/);
  assert.doesNotMatch(attachmentMigration, /GRANT EXECUTE ON FUNCTION public\.create_campus_community_post_with_attachment[^;]+TO anon/);
});

test('unsupported file types remain private and are fetched only on explicit download', async () => {
  const feed = await read('components/feed/campus-community-feed.tsx');
  const admin = await read('app/admin/community-posts/page.tsx');
  const migration = await read('supabase/migrations/20261102120000_0177_community_any_file_attachments.sql');
  assert.match(feed, /type="file"/);
  assert.match(feed, /Secure download · type is never opened inline/);
  assert.match(feed, /get_campus_community_post_file_info/);
  assert.match(feed, /createSignedUrl\(attachment\.path, 60, \{ download: attachment\.name \}\)/);
  const cardBeforeExplicitDownload = feed.slice(feed.indexOf('export function CommunityPostCard'), feed.indexOf('const downloadAttachment'));
  assert.doesNotMatch(cardBeforeExplicitDownload, /get_campus_community_post_file_info|createSignedUrl/);
  assert.match(feed, /onClick=\{\(\) => void downloadAttachment\(\)\}/);
  assert.match(admin, /media_type: 'image' \| 'video' \| 'file' \| 'text'/);
  assert.match(admin, /get_campus_community_post_file_info/);
  assert.match(admin, /campus-community-files/);
  assert.match(migration, /p_path IS NOT NULL AND auth\.uid\(\) IS NOT NULL/);
  assert.match(migration, /community_users_can_interact\(auth\.uid\(\), post\.author_id\)/);
  assert.match(migration, /post\.status = 'published'/);
  assert.match(migration, /uploaded_attachment\.bucket_id = 'campus-community-files'/);
});

test('campus feed uses readable social cards and exposes video recovery controls', async () => {
  const feed = await read('components/feed/campus-community-feed.tsx');
  assert.match(feed, /Share a campus moment/);
  assert.match(feed, /overflow-hidden border-y border-slate-200 bg-white text-slate-900 shadow-sm sm:rounded-2xl sm:border/);
  assert.match(feed, /controls/);
  assert.match(feed, /event\.currentTarget\.error\?\.code/);
  assert.match(feed, /The video stream was interrupted by the connection/);
  assert.match(feed, /This phone cannot decode this video’s format/);
  assert.match(feed, /We couldn’t play this video/);
  assert.match(feed, /Try again/);
  assert.match(feed, /Open original/);
  assert.match(feed, /MP4 using H\.264 video and AAC audio/);
  assert.doesNotMatch(feed, /h-full min-h-full snap-start snap-always/);
});

test('slow connections can use cached feed content and media remains lazy', async () => {
  const feed = await read('components/feed/campus-community-feed.tsx');
  const auth = await read('lib/auth/auth-context.tsx');
  assert.match(feed, /sessionStorage\.getItem\(cacheKey\)/);
  assert.match(feed, /FEED_CACHE_TTL_MS/);
  assert.match(feed, /Showing recent posts saved on this device/);
  assert.match(feed, /preload=\{active && !reducedData \? 'metadata' : 'none'\}/);
  assert.match(feed, /connection\?\.saveData/);
  assert.match(feed, /Social counts are secondary: don't hold the actual feed hostage/);
  assert.match(auth, /Promise\.all\(\[/);
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
  assert.match(actions, /navigator\.share\(shareData\)/);
  assert.match(actions, /navigator\.clipboard\.writeText\(shareData\.url\)/);
  assert.match(actions, /searchParams\.set\('post', postId\)/);
  assert.match(actions, /aria-label="Share post"/);
  assert.match(actions, /role="group" aria-label="Post actions"/);
  assert.match(actions, /Share2/);
  assert.match(actions, /aria-pressed=\{state\.liked_by_me\}/);
  assert.match(actions, /aria-pressed=\{state\.bookmarked_by_me\}/);
  assert.match(actions, /\['student', 'student_vendor', 'external_vendor'\]/);
  assert.doesNotMatch(actions, /\.from\(['"]campus_community_(post_likes|post_bookmarks|follows|comments)['"]\)/);
});

test('attachment download is a quiet, labelled, mobile-size-safe action', async () => {
  const feed = await read('components/feed/campus-community-feed.tsx');
  const card = feed.slice(feed.indexOf('export function CommunityPostCard'));
  assert.match(card, /aria-label=\{fileLoading \? 'Preparing attachment download' : 'Download campus attachment'\}/);
  assert.match(card, /min-h-11 min-w-11 shrink-0 touch-manipulation rounded-full/);
  assert.match(card, /variant="ghost"/);
  assert.doesNotMatch(card, /Download campus attachment[^\n]*bg-emerald-700/);
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
