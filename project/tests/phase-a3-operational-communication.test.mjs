import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('..', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');

test('browser messaging cannot dispatch privileged communication operations', async () => {
  const [client, dispatcher] = await Promise.all([
    read('lib/data/communication-client.ts'),
    read('lib/services/communication-service.ts'),
  ]);
  assert.doesNotMatch(client, /communication-service/);
  assert.doesNotMatch(client, /\.from\('(communication_events|communication_deliveries|communication_logs)'\)\.(insert|update|upsert|delete)/);
  assert.doesNotMatch(dispatcher, /@\/lib\/supabase\/client|supabase\.functions\.invoke/);
  assert.doesNotMatch(dispatcher, /\.from\('(communication_events|communication_deliveries|communication_logs|notifications)'\)/);
  assert.match(dispatcher, /trusted server infrastructure/);
});

test('broadcast operations use narrow authenticated RPCs and protect operational fields', async () => {
  const [migration, client, page] = await Promise.all([
    read('supabase/migrations/20260911239000_0035_operational_communication_hardening.sql'),
    read('lib/data/communication-client.ts'),
    read('app/admin/broadcasts/page.tsx'),
  ]);
  for (const fn of ['create_admin_broadcast_draft', 'update_admin_broadcast_draft', 'schedule_admin_broadcast', 'approve_admin_broadcast', 'begin_admin_broadcast_delivery', 'cancel_admin_broadcast']) {
    assert.match(migration, new RegExp(`FUNCTION public\\.${fn}`));
    assert.match(migration, new RegExp(`REVOKE ALL ON FUNCTION public\\.${fn}`));
  }
  assert.match(migration, /REVOKE INSERT, UPDATE, DELETE ON public\.admin_broadcasts FROM authenticated/);
  assert.match(migration, /auth\.uid\(\).*public\.is_staff\(\)/s);
  assert.match(migration, /public\.is_super_admin\(\)/);
  assert.match(migration, /status='pending_approval'/);
  assert.match(migration, /status='approved'/);
  assert.match(migration, /status='sending'/);
  assert.doesNotMatch(client, /from\('admin_broadcasts'\)\.(insert|update|upsert|delete)/);
  assert.doesNotMatch(page, /updateAdminBroadcast/);
});

test('event reminder scheduling is self-owned and delivery state is server-only', async () => {
  const [migration, client] = await Promise.all([
    read('supabase/migrations/20260911239000_0035_operational_communication_hardening.sql'),
    read('lib/data/communication-client.ts'),
  ]);
  assert.match(migration, /REVOKE INSERT, UPDATE, DELETE ON public\.event_reminders FROM authenticated/);
  assert.match(migration, /FUNCTION public\.schedule_event_reminder/);
  assert.match(migration, /FUNCTION public\.cancel_event_reminder/);
  assert.match(migration, /INSERT INTO public\.event_reminders \(user_id,event_id,reminder_type,custom_minutes_before\)/);
  assert.doesNotMatch(migration, /INSERT INTO public\.event_reminders[\s\S]{0,180}\b(?:is_sent|sent_at)\b/);
  assert.match(migration, /user_id=auth\.uid\(\)/);
  assert.match(client, /rpc\('schedule_event_reminder'/);
  assert.match(client, /rpc\('cancel_event_reminder'/);
  assert.doesNotMatch(client, /from\('event_reminders'\)\.(insert|update|upsert|delete)/);
});
