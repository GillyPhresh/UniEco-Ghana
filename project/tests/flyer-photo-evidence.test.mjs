import assert from 'node:assert/strict';
import test from 'node:test';
import { testModules } from './helpers/load-typescript.mjs';

const use = testModules();
const { licensedPhoto, findFlyerPhotoEvidence } = use('lib/ai/flyer-image-evidence.ts');
const { resolveFlyerVisual } = use('lib/ai/flyer-media.ts');
const article = new URL('https://news.campus.edu.gh/news/design-award');
const title = 'Professor Ama Mensah wins national design award';
const excerpt = 'Professor Daniel Asare spoke at the ceremony. Kofi Adjei attended.';
const photo = (filename) => ({ '@type': 'ImageObject', contentUrl: '/images/' + filename + '.jpg',
  creator: { '@type': 'Person', name: 'Campus photographer' }, license: 'https://creativecommons.org/licenses/by/4.0/' });
const person = (name, jobTitle, image) => ({ '@type': 'Person', name, jobTitle, image });
const author = person('Kofi Adjei', 'Professor', photo('author'));
const story = (extra) => ({ '@type': 'NewsArticle', headline: title, image: photo('ceremony'), author, ...extra });
const markup = (obj) => `<script type="application/ld+json">${JSON.stringify(obj)}</script>`;

test('photo reuse is specific to the resource, the license and the publisher', () => {
  assert.equal(licensedPhoto(photo('match'), article).license, 'CC BY 4.0');
  assert.equal(licensedPhoto({ ...photo('match'), license: 'http://creativecommons.org/publicdomain/zero/1.0/' }, article).license, 'CC0');
  for (const candidate of [
    photo('../tracking'), { ...photo('match'), license: undefined }, { ...photo('match'), creator: undefined },
    { ...photo('match'), license: 'https://creativecommons.org/licenses/by-nc/4.0/' },
    { ...photo('match'), license: 'https://creativecommons.org.example.com/licenses/by/4.0/' },
    { ...photo('match'), contentUrl: 'https://other.campus.edu.gh/photo.jpg' },
    { ...photo('match'), contentUrl: 'https://127.0.0.1/photo.jpg' },
    { ...photo('match'), contentUrl: '/images/photo.jpg?redirect=http://169.254.169.254' },
    { ...photo('match'), contentUrl: '/images/active.svg' },
  ]) assert.equal(licensedPhoto(candidate, article), undefined);
});

test('two named public subjects can appear, but no byline, guessed face or private student portrait is used', () => {
  const result = findFlyerPhotoEvidence(markup({ '@graph': [
    story({ about: { '@id': '#ama' }, mentions: [
      person('Kofi Adjei', 'Student', photo('student')),
      person('Not In Story', 'Dean', photo('unrelated')),
      person('Daniel Asare', 'Dean', photo('asare')),
      person('Ama Mensah', 'Professor', photo('duplicate')),
    ] }),
    { '@id': '#ama', ...person('Ama Mensah', 'Professor', photo('mensah')) },
  ] }), article, title, excerpt);
  assert.equal(result.background.url, new URL('/images/ceremony.jpg', article).href);
  assert.deepEqual(result.portraits.map((portrait) => portrait.name), ['Ama Mensah', 'Daniel Asare']);
  for (const blocked of [
    '<meta property="og:image" content="/images/og.jpg">',
    '<meta name="robots" content="noimageindex">' + markup(story({})),
    '<link rel="canonical" href="//other.campus.edu.gh/news">' + markup(story({})),
    markup(story({ headline: 'Different news article' })),
    markup(story({ isAccessibleForFree: false })),
  ]) assert.deepEqual(findFlyerPhotoEvidence(blocked, article, title, excerpt), { portraits: [] });
});

test('known campus without article evidence never substitutes its landmark or a stock person', async () => {
  const v=await resolveFlyerVisual({id:'one',source_id:'academic-city',university_name:'Academic City University',title:'Robotics prize',excerpt:''},false);
  assert.equal(v.background.description,'Editorial illustration');
  assert.deepEqual(v.portraits,[]);
});

test('a cached JPEG is still unavailable after its story is withdrawn', async () => {
  const id = '1bb72701-5287-464e-90dc-643817312d4d';
  let publicData = { id, source_id: 'test-source', title, canonical_url: article.href };
  let renders = 0;
  const get = testModules({
    '@/lib/supabase/server': { createClient: async () => ({ from(view) {
      if (view === 'campus_feed_public_sources') return { select: () => ({ eq: (_, sourceId) => {
        assert.equal(sourceId, 'test-source');
        return { maybeSingle: async () => ({ data: { source_kind: 'campus' }, error: null }) };
      } }) };
      assert.equal(view, 'campus_feed_public_items');
      return { select: () => ({ eq: (_, lookup) => {
        assert.equal(lookup, id);
        return { maybeSingle: async () => ({ data: publicData, error: null }) };
      } }) };
    } }) },
    '@/lib/ai/flyer': { renderUpdateFlyer: async (value, options) => {
      renders++;
      assert.equal(value.canonical_url, article.href);
      assert.equal(options.format, 'jpeg');
      return new Response(new Uint8Array([0xff, 0xd8, 0xff, 0xd9]));
    } },
  })('app/api/campus-feed/alert-card/route.tsx').GET;
  const request = new Request('https://www.uniecoghana.com/api/campus-feed/alert-card?id=' + id
    + '&format=jpeg&download=1&image=https://evil.example.org/photo.jpg');
  const first = await get(request);
  assert.equal(first.status, 200);
  assert.equal(first.headers.get('content-type'), 'image/jpeg');
  assert.match(first.headers.get('content-disposition'), /^attachment/);
  assert.equal((await get(request)).status, 200);
  assert.equal(renders, 1, 'only software raster data is cached');
  publicData = null;
  assert.equal((await get(request)).status, 404);
  assert.equal(renders, 1);
});
