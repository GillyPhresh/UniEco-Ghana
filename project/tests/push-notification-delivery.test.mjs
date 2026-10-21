import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('..', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');

test('push setup registers the service worker immediately on direct route loads', async () => {
  const [register, card] = await Promise.all([
    read('components/pwa/service-worker-register.tsx'),
    read('components/notifications/push-permission-card.tsx'),
  ]);

  assert.match(register, /serviceWorker\.register\('\/sw\.js'/);
  assert.match(register, /void register\(\)/);
  assert.doesNotMatch(register, /window\.addEventListener\(['"]load['"], register\)/);
  assert.match(card, /getRegistration\('\/'\)/);
  assert.match(card, /serviceWorker\.register\('\/sw\.js'/);
});

test('direct messages create an in-app notification and queue push only for subscribed users', async () => {
  const migration = await read('supabase/migrations/20261021150000_0135_push_notification_delivery.sql');

  assert.match(migration, /CREATE OR REPLACE FUNCTION public\.queue_direct_message_notification/);
  assert.match(migration, /INSERT INTO public\.notifications/);
  assert.match(migration, /FROM public\.push_subscriptions/);
  assert.match(migration, /enqueue_trusted_communication_event/);
  assert.match(migration, /ARRAY\['push'\]::text\[\]/);
  assert.match(migration, /AFTER INSERT ON public\.messages/);
  assert.match(migration, /REVOKE ALL ON FUNCTION public\.queue_direct_message_notification/);
});
