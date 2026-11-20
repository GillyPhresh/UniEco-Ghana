import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('profiles let users set a separate private account name and public nickname', () => {
  const profile = read('app/profile/page.tsx');
  assert.match(profile, /public_nickname: nickname \|\| null/);
  assert.match(profile, /Public nickname/);
  assert.match(profile, /Account name \(private\)/);
  assert.match(profile, /Leave blank to appear as “Campus member”/);
  assert.match(profile, /nickname\.length > 30/);
  assert.match(profile, /\.select\('id, public_nickname'\)/);
  assert.match(profile, /if \(!data\) throw new Error\('Your profile was not updated/);
  assert.match(profile, /setPublicNickname\(user\.profile\.public_nickname \|\| ''\)/);
});

test('migration grants users only their own nickname field and prevents public full-name fallback', () => {
  const migration = read('supabase/migrations/20261119140000_0213_public_nicknames.sql');
  assert.match(migration, /ADD COLUMN IF NOT EXISTS public_nickname text/);
  assert.match(migration, /GRANT UPDATE \(public_nickname\) ON public\.profiles TO authenticated/);
  assert.match(migration, /public_profile_display_name/);
  assert.match(migration, /'Campus member'/);
  assert.doesNotMatch(migration, /COALESCE\([^\n]*full_name/);
  assert.match(migration, /search_path = pg_catalog, public/);
});

test('public community profiles, posts, comments and chat lookup use the privacy-safe display name', () => {
  const migration = read('supabase/migrations/20261119140000_0213_public_nicknames.sql');
  for (const functionName of [
    'get_campus_community_feed', 'get_campus_community_post_comments',
    'get_campus_community_member_profile', 'get_campus_community_member_posts',
    'get_campus_community_post', 'get_campus_community_saved_posts',
    'get_message_conversation_recipient', 'search_message_contacts',
  ]) assert.match(migration, new RegExp(`FUNCTION public\\.${functionName}`));
  assert.match(migration, /public\.public_profile_display_name\(author\.id\)/);
  assert.match(migration, /public\.public_profile_display_name\(profile\.id\)/);
  assert.match(migration, /public\.public_profile_display_name\(p\.id\)/);
  assert.match(migration, /COALESCE\(p\.public_nickname,''\) ILIKE/);
});

test('signed-in navigation and dashboard show the chosen public nickname, never the private account name', () => {
  const header = read('components/layout/site-header.tsx');
  const dashboard = read('app/dashboard/page.tsx');
  assert.match(header, /const publicName = user\?\.profile\?\.public_nickname\?\.trim\(\) \|\| 'Campus member'/);
  assert.doesNotMatch(header, /user\.profile\?\.full_name/);
  assert.match(dashboard, /user\.profile\?\.public_nickname\?\.trim\(\)/);
  assert.doesNotMatch(dashboard, /user\.profile\?\.full_name/);
});

test('public product and business reviews request nicknames rather than account names', () => {
  for (const path of ['lib/data/public-queries.ts', 'lib/data/student-client.ts', 'lib/data/vendor-client.ts',
    'app/marketplace/product/[id]/page.tsx', 'app/marketplace/service/[id]/page.tsx']) {
    const source = read(path);
    assert.match(source, /reviewer:profiles!reviews_reviewer_id_fkey\(public_nickname, avatar_url\)/);
    assert.doesNotMatch(source, /reviewer:profiles!reviews_reviewer_id_fkey\(full_name, avatar_url\)/);
  }
});
