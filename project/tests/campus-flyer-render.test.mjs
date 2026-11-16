import assert from 'node:assert/strict';
import test from 'node:test';
import sharp from 'sharp';
import { testModules } from './helpers/load-typescript.mjs';

const use = testModules();
const { renderUpdateFlyer, renderBulletinFlyer } = use('lib/ai/flyer.tsx');
const { updateSummary } = use('lib/ai/update-copy.ts');
const item = {
  id: 'a123be10-21b0-49fa-a333-83a5ada39fd3', title: 'Campus health and research community briefing for tertiary students',
  excerpt: 'Campus health and research community briefing for tertiary students. Check the university website for instructions and additional evidence related to the campus event.',
  source_label: 'College of Health, Yamfo', university_name: 'College of Health, Yamfo',
  published_at: '2026-11-11T11:00:00Z', category: 'news',
};

async function checkPng(response) {
  assert.equal(response.headers.get('content-type'), 'image/png');
  assert.equal(response.headers.get('cache-control'), 'no-store');
  const png = Buffer.from(await response.arrayBuffer());
  assert.equal(png.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
  assert.equal(png.readUInt32BE(16), 1080);
  assert.equal(png.readUInt32BE(20), 1350);
  assert.ok(png.length > 15_000);
  const footer = await sharp(png).extract({ left: 400, top: 1130, width: 400, height: 100 }).removeAlpha().raw().toBuffer();
  let linePixels = 0;
  for (let i = 0; i < footer.length; i += 3) {
    if (footer[i] === 200 && footer[i + 1] === 216 && footer[i + 2] === 202) linePixels++;
  }
  assert.ok(linePixels >= 380, 'letter footer must span the lower part of the image, not flow beside the story');
}

test('renders a real downloadable portrait PNG without needing a remote image', async () => {
  const response = await renderUpdateFlyer(item, { download: true });
  assert.match(response.headers.get('content-disposition'), /^attachment;/);
  await checkPng(response);
});

test('draft flyer does not produce a cacheable or indexable public asset', async () => {
  const response = await renderUpdateFlyer(item, { draft: true });
  assert.equal(response.headers.get('x-robots-tag'), 'noindex, nofollow');
  await checkPng(response);
});

test('briefing renders a numbered page with multiple source-attributed updates', async () => {
  const response = await renderBulletinFlyer({
    items: [item, { ...item, id: 'item-2' }, { ...item, id: 'item-3' }],
    heading: 'Campus network', period: 'Last 30 days', page: 2, pages: 3, link: 'uniecoghana.com/updates/bulletin',
  }, true);
  assert.match(response.headers.get('content-disposition'), /briefing-2[.]png/);
  await checkPng(response);
});

test('strips duplicated headline, publisher contact, and publication metadata from short summaries', () => {
  const excerpt = item.title + ' news@campus Thu, 11/12/2026 - 16:56 ' + item.title
    + ' The school shared a health education notice for the tertiary community.';
  assert.equal(updateSummary(excerpt, item.title), 'The school shared a health education notice for the tertiary community.');
});
