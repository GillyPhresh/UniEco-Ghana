import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const projectRoot = path.resolve(import.meta.dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(projectRoot, relativePath), 'utf8');

test('every management navigation destination resolves to a page', () => {
  const types = read('lib/types/admin.ts');
  const hrefs = [...types.matchAll(/href: '([^']+)'/g)].map((match) => match[1]);
  assert.ok(hrefs.length > 0);

  for (const href of new Set(hrefs)) {
    const route = href.replace(/^\/admin\/?/, '');
    const page = route ? `app/admin/${route}/page.tsx` : 'app/admin/page.tsx';
    assert.ok(fs.existsSync(path.join(projectRoot, page)), `${href} has no page at ${page}`);
  }
});

test('university administrators have a separate member workspace, not management-console routes', () => {
  const middleware = read('lib/supabase/middleware.ts');
  const layout = read('components/admin/admin-layout.tsx');
  const workspace = read('app/university-admin/page.tsx');
  assert.match(middleware, /isUniversityWorkspaceRoute && role === 'university_admin'/);
  assert.match(middleware, /role === 'university_admin' && pathname === '\/admin\/university-admin'/);
  assert.doesNotMatch(middleware, /isAssignedUniversityAdminRoute/);
  assert.doesNotMatch(layout, /isScopedUniversityAdmin/);
  assert.match(workspace, /UniversityAdminWorkspaceContent/);
});

test('user search waits for an explicit mobile-friendly search submission', () => {
  const page = read('app/admin/users/page.tsx');
  assert.match(page, /const \[searchInput, setSearchInput\]/);
  assert.match(page, /value=\{searchInput\}/);
  assert.match(page, /enterKeyHint="search"/);
  assert.doesNotMatch(page, /onChange=\{e => setSearch\(e\.target\.value\)\}/);
});

test('management menu search opens matching groups and never promises offline saves are queued', () => {
  const layout = read('components/admin/admin-layout.tsx');
  assert.match(layout, /const navigationQuery = navigationSearch\.trim\(\)\.toLowerCase\(\)/);
  assert.match(layout, /group\.label\.toLowerCase\(\)\.includes\(navigationQuery\)/);
  assert.match(layout, /item\.href\.replace\(/);
  assert.match(layout, /const isExpanded = navigationQuery \? true/);
  assert.match(layout, /Changes aren’t being saved—reconnect and try again\./);
  assert.doesNotMatch(layout, /Changes will not be submitted until your connection returns/);
});
