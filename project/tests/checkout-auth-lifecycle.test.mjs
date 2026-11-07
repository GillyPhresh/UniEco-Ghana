import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import test from 'node:test';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = readFileSync(path.join(projectRoot, 'app/checkout/page.tsx'), 'utf8');

test('checkout clears account cart state on sign-out and ignores stale async loads', () => {
  assert.match(source, /if \(!user\) \{[\s\S]*?setItems\(\[\]\);[\s\S]*?setVendorDeliveryAvailable\(false\);/);
  assert.match(source, /const loadCart = useCallback\(async \(isCurrent: \(\) => boolean\)/);
  assert.match(source, /const data = await getCartItems\(\);\s*if \(!isCurrent\(\)\) return;/);
  assert.match(source, /const provs = await getEnabledPaymentProviders\(\);\s*if \(isCurrent\(\)\) setPaymentProviders\(provs\);/);
  assert.match(source, /return \(\) => \{ isCurrent = false; \};/);
});
