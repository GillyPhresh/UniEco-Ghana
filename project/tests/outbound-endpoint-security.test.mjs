import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const projectRoot = path.resolve(import.meta.dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(projectRoot, relativePath), 'utf8');

test('push endpoints are restricted to known browser push providers at storage and send time', () => {
  const validator = read('lib/notifications/push-endpoint.ts');
  const subscriptionRoute = read('app/api/notifications/push-subscription/route.ts');
  const sender = read('supabase/functions/send-push/index.ts');
  const migration = read('supabase/migrations/20261107140000_0187_push_subscription_endpoint_constraints.sql');

  for (const host of ['fcm.googleapis.com', 'updates.push.services.mozilla.com', 'web.push.apple.com']) {
    assert.ok(validator.includes(`'${host}'`), `expected provider allowlist to include ${host}`);
  }
  assert.match(validator, /\.notify\.windows\.com/);
  assert.match(validator, /endpoint\.protocol === 'https:'/);
  assert.match(validator, /!endpoint\.username/);
  assert.match(validator, /!endpoint\.password/);
  assert.match(subscriptionRoute, /isAllowedPushEndpoint\(endpoint\)/);
  assert.match(sender, /isAllowedPushEndpoint\(sub\.endpoint\)/);
  assert.match(sender, /is_active: false/);
  assert.match(sender, /MAX_REQUEST_BYTES = 64 \* 1024/);
  assert.match(sender, /reader\.cancel\(\)/);
  assert.match(sender, /status: 413/);
  assert.match(sender, /title\.length > 120/);
  assert.match(sender, /body\.length > 4000/);
  assert.match(migration, /ADD CONSTRAINT push_subscriptions_endpoint_provider_check/);
  assert.match(migration, /NOT VALID/);
  assert.match(migration, /updates\[\.\]push\[\.\]services\[\.\]mozilla/);
});

test('Google Places billing proxy authenticates users, bounds input, and times out upstream calls', () => {
  const route = read('app/api/maps/places/search/route.ts');
  assert.match(route, /authClient\.auth\.getUser\(\)/);
  assert.match(route, /if \(!user\)/);
  assert.match(route, /query\.length > 100/);
  assert.match(route, /latitude < -90 \|\| latitude > 90/);
  assert.match(route, /longitude < -180 \|\| longitude > 180/);
  assert.match(route, /AbortSignal\.timeout\(8000\)/);
  assert.match(route, /Cache-Control': 'no-store'/);
});

test('OpenStreetMap proxy serializes provider requests, bounds cache growth, and caps concurrent work', () => {
  const route = read('app/api/maps/open-places/search/route.ts');
  assert.match(route, /let nominatimQueue: Promise<void> = Promise\.resolve\(\)/);
  assert.match(route, /nominatimQueue = slot\.catch/);
  assert.match(route, /maxCacheEntries = 500/);
  assert.match(route, /setBoundedCache\(geocodeCache/);
  assert.match(route, /setBoundedCache\(placesCache/);
  assert.match(route, /maxConcurrentSearches = 12/);
  assert.match(route, /status: 429/);
  assert.match(route, /finally \{\s*activeSearches--/);
});

test('Railway Docker builds install exactly the committed dependency lockfile', () => {
  const dockerfile = read('Dockerfile');
  assert.match(dockerfile, /COPY package\.json package-lock\.json \.\//);
  assert.match(dockerfile, /RUN npm ci/);
  assert.doesNotMatch(dockerfile, /RUN npm install/);
});

test('internal outbound Edge Functions bound and validate provider payloads before dispatch', () => {
  const helper = read('supabase/functions/_shared/bounded-json.ts');
  const email = read('supabase/functions/send-email/index.ts');
  const sms = read('supabase/functions/send-sms/index.ts');
  const whatsapp = read('supabase/functions/send-whatsapp/index.ts');
  const dispatcher = read('supabase/functions/dispatch-communication-queue/index.ts');
  assert.match(helper, /content-length/);
  assert.match(helper, /reader\.cancel\(\)/);
  assert.match(helper, /status: tooLarge \? 413 : 400/);
  assert.match(email, /readBoundedJson\(req, 1024 \* 1024\)/);
  assert.match(email, /body\.length > 100_000/);
  assert.match(sms, /readBoundedJson\(req, 16 \* 1024\)/);
  assert.match(sms, /message\.length > 4000/);
  assert.match(whatsapp, /readBoundedJson\(req, 32 \* 1024\)/);
  assert.match(whatsapp, /templateKey\.length > 2000/);
  assert.match(dispatcher, /readBoundedJson\(req, 1024\)/);
  for (const source of [email, sms, whatsapp, dispatcher]) assert.doesNotMatch(source, /await req\.json\(\)/);
});
