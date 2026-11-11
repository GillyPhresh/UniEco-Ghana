import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');

test('homepage is a real community feed and keeps the university directory separate', async () => {
  const page = await read('app/page.tsx');
  const feed = await read('components/feed/campus-community-feed.tsx');
  assert.match(page, /CampusCommunityFeed/);
  assert.doesNotMatch(page, /Discover Ghana|Browse the marketplace/);
  assert.doesNotMatch(page, /UniversitySection|FeaturedBusinesses|EventsPreview/);
  assert.doesNotMatch(feed, /Across Ghana|My university|Refresh the feed/);
  assert.match(feed, /const scope: Scope = hasUniversity \? 'university' : 'all'/);
  assert.match(feed, /onTouchStart=\{handleTouchStart\} onTouchMove=\{handleTouchMove\} onTouchEnd=\{handleTouchEnd\}/);
  assert.match(feed, /pullDistanceRef\.current >= 54/);
  assert.match(feed, /href="\/universities"/);
  assert.match(feed, /href="\/updates"/);
  assert.match(feed, /Campus feed/);
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

test('private video attachments autoplay inline without exposing file details', async () => {
  const feed = await read('components/feed/campus-community-feed.tsx');
  const admin = await read('app/admin/community-posts/page.tsx');
  const migration = await read('supabase/migrations/20261102120000_0177_community_any_file_attachments.sql');
  assert.match(feed, /type="file"/);
  assert.match(feed, /Secure attachment · private by default/);
  assert.match(feed, /get_campus_community_post_file_info/);
  assert.match(feed, /status === 401/);
  assert.match(feed, /supabase\.auth\.refreshSession\(\)/);
  assert.match(feed, /Array\.isArray\(response\.data\)/);
  assert.match(feed, /onClick=\{retryAttachmentLookup\}/);
  assert.match(feed, /createSignedUrl\(attachment\.path, 60, \{ download: attachment\.name \}\)/);
  assert.match(feed, /canPlayPrivateVideoInline/);
  assert.match(feed, /createSignedUrl\(fileInfo\.path, 10 \* 60\)/);
  assert.match(feed, /If Storage cannot mint a direct playback URL[\s\S]*prepareLegacyVideoForPlayback/);
  assert.match(feed, /\.catch\(\(\) => \{[\s\S]*prepareLegacyVideoForPlayback/);
  assert.match(feed, /A failed private stream can be caused by a browser-incompatible/);
  assert.match(feed, /\[2, 3, 4\]\.includes\(code \|\| 0\)/);
  assert.match(feed, /autoPlay muted loop preload=\{active \? 'auto' : 'none'\}/);
  assert.match(feed, /Making this video ready…/);
  assert.doesNotMatch(feed, /fileInfo\.name/);
  assert.doesNotMatch(feed, /readableSize\(fileInfo\.size\).*private video/);
  assert.match(feed, /file\.size <= MAX_ATTACHMENT_BYTES && VIDEO_FILE_EXTENSION\.test\(file\.name\)/);
  assert.match(feed, /VIDEO_FILE_EXTENSION = \/\\\.\(mp4\|m4v\|mov\|qt\|webm\|ogv\|ogg\|avi\|mkv\|3gp\|3g2\|3gpp\|3gpp2/);
  const privatePlayback = feed.slice(feed.indexOf('if (!active || post.media_type !== \'file\''), feed.indexOf('useEffect(() => {\n    const connection'));
  assert.match(privatePlayback, /canPlayPrivateVideoInline\(fileInfo\)/);
  assert.match(privatePlayback, /createSignedUrl\(fileInfo\.path, 10 \* 60\)/);
  assert.match(feed, /Video shared by \$\{post\.author_name\}/);
  assert.doesNotMatch(feed, /Play video/);
  assert.match(feed, /onClick=\{\(\) => void downloadAttachment\(\)\}/);
  assert.match(admin, /media_type: 'image' \| 'video' \| 'file' \| 'text'/);
  assert.match(admin, /get_campus_community_post_file_info/);
  assert.match(admin, /campus-community-files/);
  assert.match(migration, /p_path IS NOT NULL AND auth\.uid\(\) IS NOT NULL/);
  assert.match(migration, /community_users_can_interact\(auth\.uid\(\), post\.author_id\)/);
  assert.match(migration, /post\.status = 'published'/);
  assert.match(migration, /uploaded_attachment\.bucket_id = 'campus-community-files'/);
});

test('post composer prepares accepted video containers for phone-friendly inline playback', async () => {
  const feed = await read('components/feed/campus-community-feed.tsx');
  const dockerfile = await read('Dockerfile');
  assert.match(feed, /VIDEO_FILE_EXTENSION/);
  assert.match(feed, /api\/community\/video\/prepare/);
  assert.match(feed, /UniEco will prepare this video as a phone-friendly MP4 before posting/);
  assert.match(feed, /video\/mp4/);
  assert.match(feed, /\.mov/);
  assert.match(dockerfile, /apk add --no-cache ffmpeg/);
  assert.match(dockerfile, /libx264/);
  assert.match(feed, /VIDEO_PREPARATION_TIMEOUT_MS = 240_000/);
  assert.match(feed, /signal: AbortSignal\.timeout\(VIDEO_PREPARATION_TIMEOUT_MS\)/);
  assert.match(feed, /createSignedUploadUrl\(path, \{ upsert: false \}\)/);
  assert.match(feed, /storage\.supabase\.co\/storage\/v1\/upload\/resumable/);
  assert.match(feed, /'x-signature': signedUpload\.token/);
  assert.match(feed, /chunkSize: RESUMABLE_UPLOAD_CHUNK_BYTES/);
  assert.match(feed, /RESUMABLE_UPLOAD_CHUNK_BYTES = 6 \* 1024 \* 1024/);
  assert.match(feed, /onProgress\(bytesUploaded, bytesTotal\)/);
  assert.match(feed, /storeFingerprintForResuming: false/);
  assert.match(feed, /Upload resumes automatically after brief connection interruptions/);
  assert.match(feed, /Video upload was interrupted\. Check your connection and retry/);
  assert.match(feed, /Uploading your post…/);
  assert.match(feed, /Publishing to the campus feed…/);
  assert.match(feed, /void loadPage\(false\)/);
  assert.doesNotMatch(feed, /await loadPage\(false\);/);
});

test('prepared videos publish through the same public feed-media path as photos', async () => {
  const feed = await read('components/feed/campus-community-feed.tsx');
  const submit = feed.slice(feed.indexOf('const submitPost ='), feed.indexOf('const submitReport ='));
  assert.match(feed, /MAX_PUBLIC_VIDEO_BYTES = 24 \* 1024 \* 1024/);
  assert.match(feed, /uploadCommunityMediaResumably/);
  assert.match(feed, /allowSignedUploadFallback = false/);
  assert.match(feed, /storage\.uploadToSignedUrl\(path, fallbackToken\.token, file/);
  assert.match(feed, /if \(!existsError && exists\) return/);
  assert.match(feed, /bucketName: bucket/);
  assert.match(submit, /mp4\.size > MAX_PUBLIC_VIDEO_BYTES/);
  assert.match(submit, /Never silently turn a video into a private attachment/);
  assert.match(submit, /mediaType = 'video'/);
  assert.match(submit, /uploadBucket = 'campus-community'/);
  assert.match(submit, /setUploadProgress, publicVideoUpload/);
  assert.match(submit, /p_media_type: publicPath \? mediaType : null/);
  assert.match(submit, /p_media_path: publicPath/);
  assert.match(feed, /src=\{preparedLegacyVideoUrl \|\| post\.media_url \|\| undefined\}/);
});

test('campus feed has a quiet branded composer and automatic legacy video recovery', async () => {
  const feed = await read('components/feed/campus-community-feed.tsx');
  assert.match(feed, /Share a campus moment/);
  assert.match(feed, /overflow-hidden border-y border-slate-200 bg-white text-slate-900 shadow-sm sm:rounded-2xl sm:border/);
  assert.match(feed, /controls/);
  assert.match(feed, /event\.currentTarget\.error\?\.code/);
  assert.match(feed, /The video stream was interrupted by the connection/);
  assert.match(feed, /We couldn’t play this video/);
  assert.match(feed, /Try again/);
  assert.match(feed, /Making this video ready…/);
  assert.match(feed, /legacyPrepareAttemptedRef/);
  assert.match(feed, /\[2, 3, 4\]\.includes\(code \|\| 0\)/);
  assert.match(feed, /one-time same-origin recovery stream also handles interrupted/);
  assert.match(feed, /autoPlay=\{active && !reducedData\}/);
  assert.match(feed, /border border-emerald-200 bg-white/);
  assert.doesNotMatch(feed, /Prepare &amp; play/);
  assert.match(feed, /prepareLegacyVideoForPlayback/);
  assert.doesNotMatch(feed, /h-full min-h-full snap-start snap-always/);
});

test('video preparation is authenticated, bounded, private-file authorized, and emits mobile-compatible MP4', async () => {
  const route = await read('app/api/community/video/prepare/route.ts');
  assert.match(route, /export const runtime = 'nodejs'/);
  assert.match(route, /supabase\.auth\.getUser\(\)/);
  assert.match(route, /sameOrigin\(request\)/);
  assert.match(route, /can_upload_campus_community_media/);
  assert.match(route, /get_campus_community_post_file_info/);
  assert.match(route, /MAX_VIDEO_BYTES = 50 \* 1024 \* 1024/);
  assert.match(route, /MAX_CONCURRENT_TRANSCODES = 1/);
  assert.match(route, /USER_TRANSCODE_LIMIT = 4/);
  assert.match(route, /-protocol_whitelist', 'file,pipe,data'/);
  assert.match(route, /'libx264'/);
  assert.match(route, /isFastBrowserMp4/);
  assert.match(route, /'ffprobe'/);
  assert.match(route, /copyCompatibleStreams[\s\S]*\['-c:v', 'copy', '-c:a', 'copy'\]/);
  assert.match(route, /'yuv420p'/);
  assert.match(route, /'aac'/);
  assert.match(route, /export async function GET\(request: NextRequest\)/);
  assert.match(route, /convertToStreamingMp4/);
  assert.match(route, /frag_keyframe\+empty_moov\+default_base_moof/);
  assert.match(route, /Content-Disposition.*inline/);
  assert.match(route, /loadAuthorizedPostVideo/);
  assert.match(route, /'video\/mp4'/);
  assert.match(route, /-map_metadata', '-1'/);
  assert.match(route, /rm\(directory, \{ recursive: true, force: true \}\)/);
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
  const routePolicy = await read('lib/auth/admin-route-policy.ts');
  const layout = await read('components/admin/admin-layout.tsx');
  const nav = await read('lib/types/admin.ts');
  const page = await read('app/admin/community-posts/page.tsx');
  assert.match(migration, /SELECT profile\.university_id INTO v_university_id/);
  assert.match(migration, /public\.has_permission\('can_moderate_content'\)/);
  assert.match(migration, /INSERT INTO public\.audit_logs/);
  assert.match(middleware, /getModeratorPermissionForAdminPath\(pathname\)/);
  assert.match(routePolicy, /prefix: '\/admin\/community-posts', permission: 'can_moderate_content'/);
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
  assert.match(actions, /copyTextToClipboard\(shareData\.url\)/);
  assert.match(actions, /searchParams\.set\('post', postId\)/);
  assert.match(actions, /aria-label="Share post"/);
  assert.match(actions, /role="group" aria-label="Post actions"/);
  assert.match(actions, /Share2/);
  assert.match(actions, /aria-pressed=\{state\.liked_by_me\}/);
  assert.match(actions, /aria-pressed=\{state\.bookmarked_by_me\}/);
  assert.match(actions, /\['student', 'student_vendor', 'external_vendor', 'university_admin'\]/);
  assert.doesNotMatch(actions, /\.from\(['"]campus_community_(post_likes|post_bookmarks|follows|comments)['"]\)/);
});

test('post deletion is owner-only, audited, and cleans up assets through Storage API', async () => {
  const storageApiMigration = await read('supabase/migrations/20261106150000_0184_owner_safe_community_post_delete_storage_api.sql');
  const actions = await read('components/feed/community-post-actions.tsx');
  const feed = await read('components/feed/campus-community-feed.tsx');
  assert.match(storageApiMigration, /SECURITY DEFINER/);
  assert.match(storageApiMigration, /post\.author_id = v_actor_id/);
  assert.match(storageApiMigration, /FOR UPDATE/);
  assert.match(storageApiMigration, /SET status = 'removed', removed_at/);
  assert.match(storageApiMigration, /community_post_deleted_by_owner/);
  assert.match(storageApiMigration, /REVOKE ALL ON FUNCTION public\.delete_my_campus_community_post_v2\(uuid\) FROM PUBLIC, anon, authenticated/);
  assert.match(storageApiMigration, /GRANT EXECUTE ON FUNCTION public\.delete_my_campus_community_post_v2\(uuid\) TO authenticated/);
  assert.match(actions, /user\?\.id === authorId/);
  assert.match(storageApiMigration, /delete_my_campus_community_post_v2/);
  assert.match(storageApiMigration, /post\.author_id = v_actor_id/);
  assert.match(storageApiMigration, /FOR UPDATE/);
  assert.doesNotMatch(storageApiMigration, /DELETE FROM storage\.objects/);
  assert.match(actions, /delete_my_campus_community_post_v2/);
  assert.match(actions, /storage\.from\('campus-community'\)\.remove/);
  assert.match(actions, /storage\.from\('campus-community-files'\)\.remove/);
  assert.match(actions, /permanently deletes its attached media or files/);
  assert.match(feed, /onDelete=\{\(\) =>/);
  assert.match(feed, /writeCachedFeed\(feedCacheKey, remaining\)/);
});

test('mobile header keeps message and notification controls visible with fixed touch targets', async () => {
  const header = await read('components/layout/site-header.tsx');
  assert.match(header, /href="\/dashboard\/messages" label="Messages"/);
  assert.match(header, /href="\/dashboard\/notifications" label="Notifications"/);
  assert.match(header, /min-h-11 min-w-11 shrink-0 touch-manipulation/);
});

test('referral dashboards distinguish available rewards from paid-out rewards', async () => {
  const student = await read('app/dashboard/referrals/page.tsx');
  const vendor = await read('app/vendor-dashboard/referrals/page.tsx');
  assert.match(student, /label="Available rewards" value=\{money\(summary\.available_amount\)\}/);
  assert.match(student, /label="Paid out" value=\{money\(summary\.paid_amount\)\}/);
  assert.match(vendor, /label="Available rewards" value=\{money\(summary\.available_amount\)\}/);
  assert.match(vendor, /label="Paid out" value=\{money\(summary\.paid_amount\)\}/);
  assert.doesNotMatch(student, /Rewards settled/);
  assert.doesNotMatch(vendor, /Rewards settled/);
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
