import assert from 'node:assert/strict';
import test from 'node:test';
import sharp from 'sharp';
import { testModules } from './helpers/load-typescript.mjs';

const { findFlyerPhotoEvidence } = testModules()('lib/ai/flyer-image-evidence.ts');
const article = new URL('https://campus.edu.gh/news/ceremony');
const title = 'New campus teaching facilities opened';
const paragraph = 'The university opened new teaching facilities during a campus ceremony attended by staff and the wider university community.';
const html = ({ image = '/images/ceremony.jpg', heading = title, canonical = article.href, robots = '', body = true } = {}) =>
  `<link rel="canonical" href="${canonical}"><meta name="robots" content="${robots}"><meta property="og:image" content="${image}">
   <article><h1>${heading}</h1><p>${paragraph}</p>${body ? `<img src="${image}">` : ''}</article>`;
const published = { publisher: 'Test University', mediaUrl: 'https://campus.edu.gh/images/ceremony.jpg' };

test('a published story uses its current article photo with honest attribution, without inventing a CC license', () => {
  const result = findFlyerPhotoEvidence(html(), article, title, paragraph, published);
  assert.deepEqual(result.background, { url: published.mediaUrl, credit: published.publisher, license: 'Publisher image' });
  assert.deepEqual(result.portraits, []);
  assert.deepEqual(findFlyerPhotoEvidence(html(), article, title, paragraph), { portraits: [] }, 'unapproved calls do not gain photo access');
});

test('the flyer uses the exact transparent official logo as a restrained top-left watermark', async () => {
  const [renderer, logo] = await Promise.all([
    import('node:fs/promises').then(({ readFile }) => readFile(new URL('../lib/ai/flyer.tsx', import.meta.url), 'utf8')),
    sharp('public/unieco-official-logo.png').metadata(),
  ]);
  assert.match(renderer, /public', 'unieco-official-logo\.png/);
  assert.match(renderer, /position: 'absolute', top: 34, left: 40/);
  assert.match(renderer, /opacity: 0\.9/);
  assert.equal(logo.hasAlpha, true, 'the official PNG retains transparency for watermark use');
});

test('story images must match both the current article and the publisher, not merely an OG tag or a supplied URL', () => {
  for (const raw of [html({ heading: 'Different story' }), html({ canonical: 'https://other.edu.gh/news/ceremony' }),
    html({ robots: 'noimageindex' }), html({ body: false }), html({ image: 'https://other.edu.gh/photo.jpg' }),
    html({ image: 'https://127.0.0.1/secret.jpg' }), html({ image: '/images/ceremony.jpg?redirect=http://169.254.169.254' }),
    html({ image: '/images/active.svg' }), html({ image: '/images/default-share.jpg' }),
    html().replace(paragraph, 'Do not republish. ' + paragraph),
  ]) assert.equal(findFlyerPhotoEvidence(raw, article, title, paragraph, published).background, undefined);
  const result = findFlyerPhotoEvidence(html(), article, title, paragraph, { ...published, mediaUrl: 'https://attacker.example/photo.jpg' });
  assert.equal(result.background.url, published.mediaUrl, 'unsafe stored media is ignored in favor of verified current article evidence');
});

test('an image from the article body may match its resized WordPress social-preview variant', () => {
  const page = html({ image: '/images/ceremony-1024x576.jpg' }).replace('<img src="/images/ceremony-1024x576.jpg">', '<img src="/images/ceremony.jpg">');
  const result = findFlyerPhotoEvidence(page, article, title, paragraph, published);
  assert.equal(result.background.url, published.mediaUrl);
  const tokenImage = '/images/ceremony.jpg?itok=safe_CMS-token';
  const token = findFlyerPhotoEvidence(html({ image: tokenImage }), article, title, paragraph, { ...published, mediaUrl: null });
  assert.equal(token.background.url, new URL(tokenImage, article).href);
});

test('unlimited preview directives do not suppress source photos while explicit restrictions still do', () => {
  const { blocksPublisherImagePreview } = testModules()('lib/ai/publisher-image-policy.ts');
  const allowed = 'index, follow, max-snippet:-1, max-image-preview:large, max-video-preview:-1';
  assert.equal(blocksPublisherImagePreview(allowed), false);
  assert.equal(findFlyerPhotoEvidence(html({ robots: allowed }), article, title, paragraph, published).background.url, published.mediaUrl);
  for (const blocked of ['noindex', 'noimageindex', 'nosnippet', 'max-snippet:0', 'max-snippet:20', 'max-image-preview:standard', 'max-image-preview:none']) {
    assert.equal(blocksPublisherImagePreview(blocked), true, blocked);
    assert.equal(findFlyerPhotoEvidence(html({ robots: blocked }), article, title, paragraph, published).background, undefined, blocked);
  }
});

test('school file-photo selection is exact and cannot leak Legon into another institution', () => {
  const { flyerCampusAsset } = testModules()('lib/ai/flyer-campus-art.ts');
  const city = flyerCampusAsset({ university_name: 'Academic City University', canonical_url: 'https://acity.edu.gh/news/story' });
  assert.ok(city);
  assert.doesNotMatch(city.path, /ghana-tower|legon|university-of-ghana/);
  assert.equal(flyerCampusAsset({ university_name: 'Academic City University', canonical_url: 'https://ug.edu.gh/news/story' }), null);
  assert.equal(flyerCampusAsset({ university_name: 'Unknown College' }), null);
});

test('a bundled gallery asset can represent a story only after its exact source photo is proven', () => {
  const { bundledArticlePhoto } = testModules()('lib/ai/flyer-campus-art.ts');
  const asset = bundledArticlePhoto('https://ubids.edu.gh/wp-content/uploads/2026/11/ubids_parliament_comm.jpg');
  assert.ok(asset);
  assert.match(asset, /sdd-ubids/);
  assert.equal(bundledArticlePhoto('https://ubids.edu.gh/wp-content/uploads/2026/11/different-story.jpg'), null);
  assert.equal(bundledArticlePhoto('https://evil.example/wp-content/uploads/2026/11/ubids_parliament_comm.jpg'), null);
});

test('concurrent flyers wait for real source photos instead of silently caching generic fallbacks', async () => {
  const raster = await sharp({ create: { width: 900, height: 600, channels: 3, background: '#348571' } }).jpeg().toBuffer();
  let active = 0;
  let peak = 0;
  const visited = [];
  const { resolveFlyerVisual } = testModules({
    './publisher-policy': { loadPublisherPolicy: async () => ({}), allowsPublisherPath: () => true },
    './publisher-fetch': {
      publisherDeadline: milliseconds => AbortSignal.timeout(milliseconds),
      fetchPublisher: async url => {
        active++; peak = Math.max(peak, active); visited.push(url);
        try {
          await new Promise(resolve => setTimeout(resolve, 15));
          return { url, indexable: true, imagesAllowed: true, bytes: url.endsWith('.jpg') ? raster : Buffer.from(html({ canonical: url })) };
        } finally { active--; }
      },
    },
  })('lib/ai/flyer-media.ts');
  const results = await Promise.all([1, 2, 3].map(id => resolveFlyerVisual({ id: 'photo-' + id, source_id: 'school', source_label: 'Test University',
    title, excerpt: paragraph, canonical_url: 'https://campus.edu.gh/news/story-' + id,
    media_type: 'image', media_url: published.mediaUrl })));
  assert.ok(peak <= 2);
  assert.equal(visited.filter(url => !url.endsWith('.jpg')).length, 3);
  for (const result of results) {
    assert.equal(result.background.description, 'Publisher photo');
    assert.match(result.background.credit, /Test University · Source article photo/);
    assert.doesNotMatch(result.background.credit, /CC0|CC BY/);
  }
});

test('unknown schools receive a neutral labeled illustration rather than a Legon landmark', async () => {
  const { resolveFlyerVisual } = testModules()('lib/ai/flyer-media.ts');
  const result = await resolveFlyerVisual({ id: 'unknown', title: 'Campus notice', excerpt: '', university_name: 'Unknown College' }, false);
  assert.equal(result.background.description, 'Editorial illustration');
  assert.doesNotMatch(result.background.credit + result.background.description, /Legon|Balme|Maxx/);
});

test('general-news and scholarship flyers use editorial artwork instead of an unrelated campus photograph', async () => {
  const { resolveFlyerVisual } = testModules()('lib/ai/flyer-media.ts');
  for (const source_kind of ['news', 'opportunities']) {
    const result = await resolveFlyerVisual({ id: 'national-' + source_kind, source_kind, source_label: 'Official source',
      title: 'Current public update', excerpt: '', university_name: 'Ghana' }, false);
    assert.equal(result.background.description, 'Editorial illustration');
    assert.equal(result.background.credit, 'UniEco Ghana');
    const image = Buffer.from(result.background.src.split(',')[1], 'base64');
    const metadata = await sharp(image).metadata();
    assert.equal(metadata.width, 1080);
    assert.equal(metadata.height, 852);
    assert.doesNotMatch(result.background.description, /Photo|campus/i);
  }
});

test('the public photo endpoint uses only approved stored media and rechecks visibility on cache hits', async () => {
  const id = '1bb72701-5287-464e-90dc-643817312d4d';
  let current = { id, title, source_id: 'test-school', source_label: published.publisher, canonical_url: article.href,
    media_url: published.mediaUrl, media_type: 'image' };
  let renders = 0;
  const get = testModules({
    '@/lib/supabase/server': { createClient: async () => ({ from: view => {
      if (view === 'campus_feed_public_sources') return { select: fields => {
        assert.equal(fields, 'source_kind');
        return { eq: (_, sourceId) => {
          assert.equal(sourceId, current?.source_id || 'test-school');
          return { maybeSingle: async () => ({ data: { source_kind: 'news' }, error: null }) };
        } };
      } };
      assert.equal(view, 'campus_feed_public_items');
      return { select: fields => {
        assert.ok(fields.includes('media_url') && fields.includes('media_type'));
        return { eq: (_, lookup) => { assert.equal(lookup, id); return { maybeSingle: async () => ({ data: current, error: null }) }; } };
      } };
    } }) },
    '@/lib/ai/flyer': { renderUpdatePhoto: async data => {
      renders++;
      assert.equal(data.media_url, published.mediaUrl);
      assert.equal(data.source_kind, 'news');
      return new Response(new Uint8Array([0xff, 0xd8, 0xff, 0xd9]));
    } },
  })('app/api/campus-feed/alert-card/route.tsx').GET;
  const request = new Request('https://www.uniecoghana.com/api/campus-feed/alert-card?id=' + id + '&format=photo&image=https://evil.example/photo.jpg');
  const response = await get(request);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('content-type'), 'image/jpeg');
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.equal((await get(request)).status, 200);
  assert.equal(renders, 1);
  current = null;
  assert.equal((await get(request)).status, 404);
  assert.equal(renders, 1);
});
