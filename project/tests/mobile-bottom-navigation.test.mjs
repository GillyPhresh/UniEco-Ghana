import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('mobile navigation prioritizes campus updates and keeps orders in the marketplace', () => {
  const navigation = read('components/pwa/mobile-bottom-nav.tsx');
  const marketplace = read('app/marketplace/page.tsx');

  assert.match(navigation, /href: '\/updates', label: 'Updates', icon: Newspaper/);
  assert.doesNotMatch(navigation, /href: '\/orders', label: 'Orders'/);
  assert.match(navigation, /text-\[10px\] font-medium leading-none/);
  assert.match(marketplace, /<Link href="\/orders">[\s\S]*?My orders/);
});
