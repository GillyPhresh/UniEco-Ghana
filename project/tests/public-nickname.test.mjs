import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

import { testModules } from './helpers/load-typescript.mjs';

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('profiles let users set a nickname separately from the registered name', () => {
  const profile = read('app/profile/page.tsx');
  assert.match(profile, /public_nickname: nickname \|\| null/);
  assert.match(profile, /Public nickname/);
  assert.match(profile, /Registered name/);
  assert.match(profile, /Show my registered name when I have no nickname/);
  assert.match(profile, /nickname\.length > 30/);
  assert.match(profile, /\.select\('id, public_nickname'\)/);
  assert.match(profile, /if \(!data\) throw new Error\('Your profile was not updated/);
  assert.match(profile, /setPublicNickname\(user\.profile\.public_nickname \|\| ''\)/);
});

test('original nickname migration grants only the nickname update privilege', () => {
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

test('personal names prefer the nickname, then the registered name, never contact data', () => {
  const { publicDisplayName } = testModules()('lib/community/public-display-name.ts');
  for (const [nickname, registered, expected] of [
    ['  Kiki  ', 'Akua Mensah', 'Kiki'], [null, ' Akua Mensah ', 'Akua Mensah'],
    ['   ', 'Akua Mensah', 'Akua Mensah'], [null, '', 'Unnamed user'],
    [null, 'hidden@example.test', 'Unnamed user'], [null, '+233 555 123456', 'Unnamed user'],
  ]) assert.equal(publicDisplayName({public_nickname: nickname, full_name: registered, show_registered_name: true}), expected);
  for (const flag of [false, undefined]) {
    assert.equal(publicDisplayName({full_name: 'Kwame', show_registered_name: flag}), 'UniEco user');
    assert.equal(publicDisplayName({public_nickname: 'Kiki', full_name: 'Kwame', show_registered_name: flag}), 'Kiki');
  }
  for (const page of ['app/profile/page.tsx', 'components/layout/site-header.tsx', 'app/dashboard/page.tsx'])
    assert.match(read(page), /publicDisplayName\(user\?\.profile\)/);
});

test('the following feed and student search use the same resolved identity', () => {
  const sql = read('supabase/migrations/20261125120000_0216_public_display_name_fallback.sql');
  assert.match(sql, /public_profile_display_name\(author\.id\)/);
  assert.match(sql, /public_profile_display_name\(p\.id\) ILIKE/);
  assert.doesNotMatch(sql, /Campus member|GRANT SELECT/i);
});

test('public product and business reviews only request resolved reviewer identities', () => {
  for (const path of ['lib/data/public-queries.ts', 'lib/data/student-client.ts', 'lib/data/vendor-client.ts',
    'app/marketplace/product/[id]/page.tsx', 'app/marketplace/service/[id]/page.tsx']) {
    const source = read(path);
    assert.match(source, /reviewer:review_public_identity/);
    assert.doesNotMatch(source, /reviewer:profiles!reviews_reviewer_id_fkey\(full_name, avatar_url\)/);
  }
});
