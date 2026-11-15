import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const projectRoot = path.resolve(import.meta.dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(projectRoot, relativePath), 'utf8');

test('email destinations are canonical, same-origin, and safe for email clients', () => {
  const source = read('supabase/functions/send-email/index.ts');
  assert.match(source, /template === 'registration_payment_required' \? registrationCheckoutPath/);
  assert.match(source, /payments\/registration-checkout\?role=\$\{registrationRole\}/);
  assert.match(source, /const PUBLIC_ORIGIN = 'https:\/\/www\.uniecoghana\.com'/);
  assert.match(source, /TRUSTED_PUBLIC_HOSTS/);
  assert.match(source, /new URL\(value\.trim\(\), PUBLIC_ORIGIN\)/);
  assert.match(source, /normalizePublicActionUrl\(meta\.referral_link\)/);
  assert.match(source, /normalizePublicActionUrl\(meta\.invite_url\)/);
});

test('push and in-app clicks share the same trusted destination contract', () => {
  const push = read('supabase/functions/send-push/index.ts');
  const page = read('app/dashboard/notifications/page.tsx');
  const serviceWorker = read('public/sw.js');
  assert.match(push, /url: normalizePushActionUrl\(actionUrl, eventType\)/);
  assert.match(push, /eventType === "registration_payment_required"/);
  assert.match(push, /payments\/registration-checkout\?role=\$\{role\}/);
  assert.match(push, /TRUSTED_PUBLIC_HOSTS/);
  assert.match(page, /normalizeNotificationActionUrl\(n\.action_url \|\| n\.link\)/);
  assert.match(serviceWorker, /function resolveNotificationUrl\(rawUrl\)/);
  assert.match(serviceWorker, /www\.uniecoghana\.com/);
});
