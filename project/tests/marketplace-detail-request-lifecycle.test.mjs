import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import test from 'node:test';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (relativePath) => readFileSync(path.join(projectRoot, relativePath), 'utf8');

for (const [kind, relativePath, loader, key] of [
  ['product', 'app/marketplace/product/[id]/page.tsx', 'loadProduct', 'productId'],
  ['service', 'app/marketplace/service/[id]/page.tsx', 'loadService', 'serviceId'],
]) {
  test(`${kind} details reload for item and account changes and discard stale responses`, () => {
    const source = read(relativePath);
    assert.match(source, new RegExp(`const ${loader} = useCallback`));
    assert.match(source, new RegExp(`\\}, \\[${key}\\]\\);`));
    assert.match(source, new RegExp(`\\}, \\[${key}, userId\\]\\);`));
    assert.match(source, /requestId !== loadRequestId\.current/);
    assert.match(source, /return \(\) => \{\s*loadRequestId\.current \+= 1;/);
    assert.match(source, /setInWishlist\(false\)/);
  });
}

test('service reviews use the vendor resolved for the current service, not stale React state', () => {
  const service = read('app/marketplace/service/[id]/page.tsx');
  assert.match(service, /\.eq\('vendor_id', v\.id\)/);
  assert.doesNotMatch(service, /\.eq\('vendor_id', vendor\?\.id/);
});
