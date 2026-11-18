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

async function checkPng(response, letterhead = false) {
  assert.equal(response.headers.get('content-type'), 'image/png');
  assert.equal(response.headers.get('cache-control'), 'no-store');
  const png = Buffer.from(await response.arrayBuffer());
  assert.equal(png.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
  assert.equal(png.readUInt32BE(16), 1080);
  assert.equal(png.readUInt32BE(20), letterhead ? 1350 : 1440);
  assert.ok(png.length > 15_000);
  if (!letterhead) {
    const photo = await sharp(png).extract({ left: 96, top: 145, width: 865, height: 420 }).stats();
    assert.ok(photo.channels.slice(0, 3).every((channel) => channel.stdev > 24), 'lead region contains a photograph, not a blank placeholder');
    const colorAt = (x, y) => sharp(png).extract({ left: x, top: y, width: 1, height: 1 }).removeAlpha().raw().toBuffer().then((p) => [...p]);
    assert.deepEqual(await colorAt(76, 49), [255, 255, 255], 'small white corner logo tile');
    assert.deepEqual(await colorAt(105, 889), [163, 23, 34], 'red category tag below the full-bleed photo');
    const footer = await colorAt(105, 1435);
    assert.ok(footer.every((component) => component > 215 && component < 240), 'thin, light-gray credits footer');
    return;
  }
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

test('JPEG sharing exports a real, compact portrait-format file', async () => {
  const response = await renderUpdateFlyer({ ...item, title: 'Academic City Robotics Club wins Engineers League at 2026 Ghana Robotics Competition' }, { format: 'jpeg', download: true });
  assert.equal(response.headers.get('content-type'), 'image/jpeg');
  assert.match(response.headers.get('content-disposition'), /^attachment; filename="unieco-campus-update\.jpg"/);
  const bytes = Buffer.from(await response.arrayBuffer());
  const meta = await sharp(bytes).metadata();
  assert.deepEqual([meta.format, meta.width, meta.height], ['jpeg', 1080, 1440]);
  assert.ok(bytes.length > 25_000 && bytes.length < 1_200_000);
});

test('places two verified portraits side by side within the bottom of the lead photo, with white circular frames', async () => {
  const photo = async (color, name) => ({
    src: 'data:image/png;base64,' + (await sharp({ create: { width: 300, height: 300, channels: 3, background: color } }).png().toBuffer()).toString('base64'),
    description: 'Publisher photo', credit: 'Test university', name,
  });
  const visual = {
    background: await photo('#211c2b'),
    portraits: [await photo('#137aa7', 'First verified subject'), await photo('#65512e', 'Second verified subject')],
  };
  const { renderUpdateFlyer: render } = testModules({
    './flyer-media': { resolveFlyerVisual: async () => visual },
  })('lib/ai/flyer.tsx');
  const bytes = Buffer.from(await (await render(item)).arrayBuffer());
  const colorAt = (x, y) => sharp(bytes).extract({ left: x, top: y, width: 1, height: 1 }).removeAlpha().raw().toBuffer().then((p) => [...p]);
  assert.deepEqual(await colorAt(236, 644), [19, 122, 167]);
  assert.deepEqual(await colorAt(844, 644), [101, 81, 46]);
  assert.deepEqual(await colorAt(236, 512), [255, 255, 255]);
  assert.deepEqual(await colorAt(104, 512), [33, 28, 43], 'corners are clipped to expose the lead image');
});

test('briefing renders a numbered page with multiple source-attributed updates', async () => {
  const response = await renderBulletinFlyer({
    items: [item, { ...item, id: 'item-2' }, { ...item, id: 'item-3' }],
    heading: 'Campus network', period: 'Last 30 days', page: 2, pages: 3, link: 'uniecoghana.com/updates/bulletin',
  }, true);
  assert.match(response.headers.get('content-disposition'), /briefing-2[.]png/);
  await checkPng(response, true);
});

test('strips duplicated headline, publisher contact, and publication metadata from short summaries', () => {
  const excerpt = item.title + ' news@campus Thu, 11/12/2026 - 16:56 ' + item.title
    + ' The school shared a health education notice for the tertiary community.';
  assert.equal(updateSummary(excerpt, item.title), 'The school shared a health education notice for the tertiary community.');
});
