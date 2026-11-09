import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('..', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');

test('all provider emails use the official UniEco letterhead and text identity', async () => {
  const source = await read('supabase/functions/send-email/index.ts');
  assert.match(source, /EMAIL_LOGO_URL = `\$\{PUBLIC_ORIGIN\}\/UniEco%20Ghana/);
  assert.match(source, /alt="UniEco Ghana logo"/);
  assert.match(source, /Your Campus\. Your Marketplace\. Your Community\./);
  assert.match(source, /Connecting students, businesses and opportunities/);
  assert.match(source, /© UniEco Ghana/);
  assert.match(source, /role="presentation"/);
  assert.doesNotMatch(source, /unieco-favicon\.png/);
});

test('low-priority onboarding emails are suppressed without muting payment or verification email', async () => {
  const migration = await read('supabase/migrations/20261109160000_0193_reduce_onboarding_email_noise.sql');
  assert.match(migration, /registration_welcome','student_welcome','vendor_welcome','referral_link_ready/);
  assert.match(migration, /v_channels := array_remove\(v_channels, 'email'\)/);
  assert.match(migration, /IF cardinality\(v_channels\) = 0 THEN RETURN NULL/);
  assert.match(migration, /GRANT EXECUTE ON FUNCTION public\.enqueue_trusted_communication_event.*TO service_role/);
  assert.doesNotMatch(migration, /payment_successful|payment_failed|student_verification_|vendor_verification_/);
});
