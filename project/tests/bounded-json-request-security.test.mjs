import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('high-cost payment and push endpoints enforce streamed byte limits before JSON parsing', async () => {
  const [helper, payment, push] = await Promise.all([
    read('lib/http/read-json-limited.ts'),
    read('app/api/payments/paystack/initialize/route.ts'),
    read('app/api/notifications/push-subscription/route.ts'),
  ]);

  assert.match(helper, /content-length/);
  assert.match(helper, /value\.byteLength/);
  assert.match(helper, /reader\.cancel\(\)/);
  assert.match(helper, /JSON\.parse\(/);
  assert.match(payment, /readJsonLimited<RequestBody>\(request, 32 \* 1024\)/);
  assert.match(payment, /RequestBodyTooLargeError[\s\S]*status: 413/);
  assert.match(push, /readJsonLimited<PushSubscriptionBody>\(request, 16 \* 1024\)/);
  assert.match(push, /RequestBodyTooLargeError[\s\S]*status: error instanceof RequestBodyTooLargeError \? 413/);
  assert.doesNotMatch(payment, /request\.json\(\)/);
  assert.doesNotMatch(push, /request\.json\(\)/);
});
