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

test('direct messages request a trusted queue flush without exposing provider secrets', async () => {
  const [client, route, scheduler] = await Promise.all([
    read('lib/data/communication-client.ts'),
    read('app/api/notifications/dispatch-queue/route.ts'),
    read('docs/SUPABASE_PUSH_QUEUE_SCHEDULER.sql'),
  ]);

  assert.match(client, /fetch\('\/api\/notifications\/dispatch-queue'/);
  assert.match(route, /UNIECO_INTERNAL_FUNCTION_SECRET/);
  assert.match(route, /x-unieco-internal-secret/);
  assert.doesNotMatch(route, /VAPID_PRIVATE_KEY/);
  assert.match(scheduler, /cron\.schedule/);
  assert.match(scheduler, /vault\.decrypted_secrets/);
  assert.match(scheduler, /dispatch-communication-queue/);
});

test('notification clicks keep trusted www and no-www destinations inside the app', async () => {
  const serviceWorker = await read('public/sw.js');

  assert.match(serviceWorker, /resolveNotificationUrl\(event\.notification\.data\?\.url\)/);
  assert.match(serviceWorker, /'www\.uniecoghana\.com'/);
  assert.match(serviceWorker, /'uniecoghana\.com'/);
  assert.match(serviceWorker, /const targetHref = new URL\(targetUrl, self\.location\.origin\)\.href/);
  assert.match(serviceWorker, /existing\.navigate\(targetHref\)/);
  assert.match(serviceWorker, /openWindow\(targetHref\)/);
  assert.match(serviceWorker, /if \(!trustedHosts\.has\(parsed\.hostname\)\) return fallback/);
});

test('push delivery distinguishes subscription lookup failure from no subscriptions and deduplicates notification tags', async () => {
  const push = await read('supabase/functions/send-push/index.ts');
  const queue = await read('supabase/functions/dispatch-communication-queue/index.ts');
  assert.match(push, /subscriptionError/);
  assert.match(push, /Could not load this user's push subscriptions/);
  assert.match(push, /tag: eventId \|\| eventType/);
  assert.match(queue, /eventId: item\.event_id/);
});

test('super admins receive a deduplicated governance digest with a management destination', async () => {
  const migration = await read('supabase/migrations/20261028160000_0146_admin_governance_digest.sql');

  assert.match(migration, /CREATE OR REPLACE FUNCTION public\.queue_admin_governance_digest/);
  assert.match(migration, /payment_reconciliation/);
  assert.match(migration, /communication_failures/);
  assert.match(migration, /pending_student_verification/);
  assert.match(migration, /pending_vendor_verification/);
  assert.match(migration, /queue_user_communication/);
  assert.match(migration, /https:\/\/www\.uniecoghana\.com\/admin/);
  assert.match(migration, /unieco-admin-governance-digest-hourly/);
  assert.match(migration, /ON CONFLICT DO NOTHING/);
});

test('the communication worker recovers stale processing claims safely', async () => {
  const migration = await read('supabase/migrations/20261028170000_0147_recover_stuck_communication_queue.sql');

  assert.match(migration, /recover_stuck_trusted_communication_events/);
  assert.match(migration, /status = 'queued'/);
  assert.match(migration, /attempt_count < 3/);
  assert.match(migration, /status = 'failed'/);
  assert.match(migration, /attempt_count >= 3/);
  assert.match(migration, /PERFORM public\.recover_stuck_trusted_communication_events\(\)/);
  assert.match(migration, /SELECT public\.recover_stuck_trusted_communication_events\(\)/);
});
