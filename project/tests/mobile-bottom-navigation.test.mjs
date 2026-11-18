import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const navigation = read('components/pwa/mobile-bottom-nav.tsx');

test('mobile navigation prioritizes campus updates and keeps orders in the marketplace', () => {
  const marketplace = read('app/marketplace/page.tsx');
  assert.match(navigation, /href: '\/updates', label: 'Updates', icon: Newspaper/);
  assert.doesNotMatch(navigation, /href: '\/orders', label: 'Orders'/);
  assert.match(navigation, /text-\[10px\] font-medium leading-none/);
  assert.match(marketplace, /<Link href="\/orders">[\s\S]*?My orders/);
});

test('the five shared tabs retain their order and show the current section', () => {
  const items = navigation.match(/const NAV_ITEMS = \[([\s\S]*?)\] as const/)?.[1] || '';
  assert.deepEqual([...items.matchAll(/href: '([^']+)', label: '([^']+)'/g)].map(([, href, label]) => [label, href]), [
    ['Home', '/'], ['Shop', '/marketplace'], ['Mate', '/campus-mate'], ['Updates', '/updates'], ['Account', '/dashboard'],
  ]);
  assert.match(navigation, /const isActive = withinSection\(pathname, item\.href\) \|\| item\.sections\.some/);
  assert.match(navigation, /aria-current=\{current \|\| undefined\}/);
  assert.match(navigation, /safe-area-inset-bottom/);
  assert.match(navigation, /!user \? '\/signin\?next=%2Fdashboard' : item\.href/);
});

test('detail pages highlight the right tab while private, admin and payment pages hide the bar', () => {
  assert.match(navigation, /sections: \['\/community'\]/);
  assert.match(navigation, /sections: \['\/business', '\/cart', '\/orders', '\/wishlist', '\/categories'\]/);
  assert.match(navigation, /sections: \['\/events'\]/);
  assert.match(navigation, /sections: \['\/profile'\]/);
  assert.match(navigation, /const HIDDEN_SECTIONS = \[[\s\S]*?'\/dashboard\/messages'[\s\S]*?'\/payments'[\s\S]*?'\/checkout'/);
  assert.match(navigation, /pathname === section \|\| \(section !== '\/' && pathname\.startsWith/);
});

test('shared header keeps Search, Messages, Notifications and Menu in the same order', () => {
  const source = read('components/layout/site-header.tsx');
  for (const label of ['Search', 'Messages', 'Notifications']) {
    assert.equal(source.match(new RegExp(`<HeaderIconLink[^>]+label="${label}"`, 'g'))?.length, 1, label);
  }
  assert.match(source, /<HeaderIconLink href="\/search"[^]*?<HeaderIconLink href="\/dashboard\/messages"[^]*?<HeaderIconLink href="\/dashboard\/notifications"[^]*?aria-label="Open navigation menu"/);
});
