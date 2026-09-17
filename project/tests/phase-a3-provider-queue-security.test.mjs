import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('..', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');

test('trusted communication queue is service-role-only and keeps provider state server-owned', async () => {
  const migration = await read('supabase/migrations/20260911243000_0039_trusted_communication_provider_queue.sql');
  for (const fn of ['enqueue_trusted_communication_event', 'claim_trusted_communication_events', 'complete_trusted_communication_delivery']) {
    assert.match(migration, new RegExp(`FUNCTION public\\.${fn}`));
  }
  assert.match(migration, /SECURITY DEFINER/);
  assert.match(migration, /REVOKE ALL ON FUNCTION public\.enqueue_trusted_communication_event[\s\S]*FROM PUBLIC, anon, authenticated/);
  assert.match(migration, /GRANT EXECUTE[\s\S]*TO service_role/);
  assert.match(migration, /REVOKE INSERT, UPDATE, DELETE ON public\.communication_events, public\.communication_deliveries, public\.communication_logs FROM anon, authenticated/);
  assert.match(migration, /attempt_count < 3/);
  assert.match(migration, /p_status NOT IN \('sent','delivered','failed'\)/);
});

test('browser communication service is quarantined and cannot dispatch provider work', async () => {
  const service = await read('lib/services/communication-service.ts');
  assert.doesNotMatch(service, /@\/lib\/supabase\/client/);
  assert.doesNotMatch(service, /\.from\('(communication_events|communication_deliveries|communication_logs|notifications)'\)/);
  assert.doesNotMatch(service, /supabase\.functions\.invoke/);
  assert.match(service, /trusted server infrastructure/);
});

test('dispatcher and provider functions require the internal secret and default to disabled providers', async () => {
  const [dispatcher, email, sms, push, whatsapp, guard] = await Promise.all([
    read('supabase/functions/dispatch-communication-queue/index.ts'),
    read('supabase/functions/send-email/index.ts'),
    read('supabase/functions/send-sms/index.ts'),
    read('supabase/functions/send-push/index.ts'),
    read('supabase/functions/send-whatsapp/index.ts'),
    read('supabase/functions/_shared/internal-auth.ts'),
  ]);
  assert.match(guard, /UNIECO_INTERNAL_FUNCTION_SECRET/);
  assert.match(dispatcher, /requireInternalRequest/);
  assert.match(dispatcher, /UNIECO_COMMUNICATION_ADAPTER/);
  assert.match(dispatcher, /mock/);
  for (const fn of [email, sms, push, whatsapp]) {
    assert.match(fn, /requireInternalRequest/);
    assert.match(fn, /outboundProvidersEnabled/);
  }
});
