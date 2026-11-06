import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('../', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');

test('assigned university admins can participate in campus community as regular members', async () => {
  const [migration, feed, actions] = await Promise.all([
    read('supabase/migrations/20261106130000_0183_university_admin_community_access.sql'),
    read('components/feed/campus-community-feed.tsx'),
    read('components/feed/community-post-actions.tsx'),
  ]);
  for (const helper of ['can_publish_campus_community', 'can_use_campus_community', 'can_upload_campus_community_media']) {
    assert.match(migration, new RegExp(`FUNCTION public\\.${helper}`));
  }
  assert.match(migration, /role\.name = 'university_admin'[\s\S]*assignment\.status = 'active'/);
  assert.match(migration, /restriction\.ends_at IS NULL OR restriction\.ends_at > now\(\)/);
  assert.match(migration, /GRANT EXECUTE ON FUNCTION public\.can_upload_campus_community_media\(\) TO authenticated, service_role/);
  assert.match(migration, /verification_status = 'verified'/);
  assert.match(feed, /'student', 'student_vendor', 'external_vendor', 'university_admin'/);
  assert.match(actions, /'student', 'student_vendor', 'external_vendor', 'university_admin'/);
  assert.doesNotMatch(migration, /is_super_admin\(\)\s+OR\s+role\.name = 'university_admin'/);
});
