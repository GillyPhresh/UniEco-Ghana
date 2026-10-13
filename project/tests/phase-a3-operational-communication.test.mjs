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
  const [migration, workflowMigration, client, page] = await Promise.all([
    read('supabase/migrations/20260911239000_0035_operational_communication_hardening.sql'),
    read('supabase/migrations/20260930130000_0101_reasoned_broadcast_actions.sql'),
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
  for (const fn of ['approve_admin_broadcast', 'begin_admin_broadcast_delivery', 'cancel_admin_broadcast']) {
    assert.match(workflowMigration, new RegExp(`FUNCTION public\\.${fn}\\(p_broadcast_id uuid, p_reason text\\)`));
    assert.match(workflowMigration, new RegExp(`record_trusted_admin_action\\('[^']+',[\\s\\S]*?jsonb_build_object\\('reason',v_reason\\)`));
  }
  assert.match(workflowMigration, /length\(v_reason\) NOT BETWEEN 10 AND 1000/);
  assert.match(workflowMigration, /REVOKE ALL ON FUNCTION public\.approve_admin_broadcast\(uuid\) FROM PUBLIC, anon, authenticated, service_role/);
  assert.match(workflowMigration, /REVOKE ALL ON FUNCTION public\.begin_admin_broadcast_delivery\(uuid\) FROM PUBLIC, anon, authenticated, service_role/);
  assert.match(workflowMigration, /REVOKE ALL ON FUNCTION public\.cancel_admin_broadcast\(uuid\) FROM PUBLIC, anon, authenticated, service_role/);
  assert.match(client, /approve_admin_broadcast', \{ p_broadcast_id: id, p_reason: reason\.trim\(\) \}/);
  assert.match(client, /begin_admin_broadcast_delivery', \{ p_broadcast_id: id, p_reason: reason\.trim\(\) \}/);
  assert.match(client, /cancel_admin_broadcast', \{ p_broadcast_id: id, p_reason: reason\.trim\(\) \}/);
  assert.match(page, /Approve broadcast\?/);
  assert.match(page, /Queue broadcast delivery\?/);
  assert.match(page, /Confirm and queue/);
  assert.match(page, /broadcast-action-reason/);
  assert.doesNotMatch(page, /onClick=\{\(\) => handle(?:Approve|Send|Cancel)\(b\)\}/);
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

test('admin communication operations use assigned permission, database aggregation, pagination, and privacy-minimized RPCs', async () => {
  const [migration, client, page, middleware, layout, rolesPage, permissionTypes] = await Promise.all([
    read('supabase/migrations/20260930006000_0084_admin_communication_operations.sql'),
    read('lib/data/communication-client.ts'),
    read('app/admin/communication/page.tsx'),
    read('lib/supabase/middleware.ts'),
    read('components/admin/admin-layout.tsx'),
    read('app/admin/roles/page.tsx'),
    read('lib/auth/permissions.ts'),
  ]);
  assert.match(migration, /public\.has_permission\('can_manage_communications'\)/);
  assert.match(migration, /REVOKE SELECT ON public\.communication_events, public\.communication_deliveries, public\.communication_logs FROM anon, authenticated/);
  assert.match(migration, /DROP POLICY IF EXISTS staff_only_communication_logs/);
  assert.match(migration, /get_admin_communication_logs[\s\S]*?p_limit integer DEFAULT 50[\s\S]*?p_offset integer DEFAULT 0/);
  assert.match(migration, /recipient_identifier IS NOT NULL/);
  assert.doesNotMatch(migration, /SELECT[\s\S]{0,160}recipient_identifier\s*,/);
  assert.match(migration, /get_admin_communication_stats[\s\S]*?jsonb_object_agg/);
  assert.match(migration, /record_trusted_admin_action\([\s\S]*moderator\.permissions_updated/);
  assert.match(migration, /REVOKE ALL ON FUNCTION public\.get_admin_communication_logs/);
  assert.match(migration, /GRANT EXECUTE ON FUNCTION[\s\S]*get_admin_communication_stats\(\) TO authenticated/);
  assert.doesNotMatch(client, /\.from\('communication_logs'\)/);
  assert.match(client, /rpc\('get_admin_communication_logs'/);
  assert.match(client, /rpc\('get_admin_communication_stats'/);
  assert.match(client, /recipient_identifier: row\.has_recipient \? 'Protected' : null/);
  assert.match(page, /Recipient \(protected\)/);
  assert.match(page, /Previous/);
  assert.match(page, /loadError/);
  assert.match(middleware, /'can_manage_communications'/);
  assert.match(layout, /moderatorPermissions\.has\('can_manage_communications'\)/);
  assert.match(rolesPage, /'can_manage_communications'/);
  assert.match(permissionTypes, /can_manage_communications/);
});
