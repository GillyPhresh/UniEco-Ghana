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

test('Railway Docker builds install exactly the committed dependency lockfile', () => {
  const dockerfile = read('Dockerfile');
  assert.match(dockerfile, /COPY package\.json package-lock\.json \.\//);
  assert.match(dockerfile, /RUN npm ci/);
  assert.doesNotMatch(dockerfile, /RUN npm install/);
});
