import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
const root = new URL('..', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');

test('notification mutations are self-scoped RPCs with no direct browser writes', async () => {
  const [migration, client, student] = await Promise.all([read('supabase/migrations/20260911240000_0036_notification_announcement_hardening.sql'),read('lib/data/communication-client.ts'),read('lib/data/student-client.ts')]);
  for (const fn of ['set_own_notification_read_state','mark_all_own_notifications_read','dismiss_own_notification','set_own_notification_preferences']) { assert.match(migration,new RegExp(`FUNCTION public\\.${fn}`)); assert.match(migration,new RegExp(`public\\.${fn}[^;]*FROM PUBLIC,anon,authenticated,service_role`)); }
  assert.match(migration,/user_id=auth\.uid\(\)/);
  assert.match(client,/rpc\('set_own_notification_read_state'/); assert.match(client,/rpc\('set_own_notification_preferences'/);
  assert.doesNotMatch(client,/from\('(notifications|notification_preferences)'\)\.(insert|update|upsert|delete)/);
  assert.doesNotMatch(student,/from\('notifications'\)\.(insert|update|upsert|delete)/);
});
test('university and vendor announcements derive authority server-side', async () => {
  const [migration, client] = await Promise.all([read('supabase/migrations/20260911240000_0036_notification_announcement_hardening.sql'),read('lib/data/communication-client.ts')]);
  for (const fn of ['create_university_announcement','create_own_business_announcement','update_own_business_announcement','delete_own_business_announcement']) { assert.match(migration,new RegExp(`FUNCTION public\\.${fn}`)); assert.match(migration,new RegExp(`public\\.${fn}[^;]*FROM PUBLIC,anon,authenticated,service_role`)); }
  assert.match(migration,/public\.can_manage_university\(p_university_id\)/); assert.match(migration,/created_by\) VALUES[\s\S]*auth\.uid\(\)/);
  assert.match(migration,/v\.owner_id=auth\.uid\(\)/); assert.match(migration,/is_approved=false,reviewed_by=NULL,reviewed_at=NULL/);
  assert.match(client,/rpc\('create_university_announcement'/); assert.match(client,/rpc\('create_own_business_announcement'/);
  assert.doesNotMatch(client,/from\('(university_announcements|business_announcements)'\)\.(insert|update|upsert|delete)/);
});
