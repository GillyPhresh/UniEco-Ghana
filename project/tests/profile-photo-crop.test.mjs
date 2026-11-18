import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const { outputText } = ts.transpileModule(read('lib/profile/photo-crop.ts'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
});
const closeTo = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-8, `${actual} ≈ ${expected}`);

function load(document) {
  const exports = {};
  runInNewContext(outputText, { exports, document });
  return exports;
}

test('portrait and landscape camera photos start with a centered square crop', () => {
  const { cropFrame, DEFAULT_CROP } = load();
  const portrait = cropFrame({ width: 1200, height: 1600 }, DEFAULT_CROP);
  assert.equal(portrait.top, 200);
  assert.equal(portrait.left, 0);
  assert.equal(portrait.side, 1200);
  const landscape = cropFrame({ width: 4000, height: 3000 }, DEFAULT_CROP);
  assert.equal(landscape.top, 0);
  assert.equal(landscape.left, 500);
  assert.equal(landscape.side, 3000);
});

test('pan and pinch keep the selected pixel under the finger when space allows', () => {
  const { cropFrame, movePhotoCrop } = load();
  const photo = { width: 2000, height: 2000 };
  const start = { x: 0.5, y: 0.5, zoom: 2 };
  const before = cropFrame(photo, start);
  const from = { x: 0.3, y: 0.4 };
  const to = { x: 0.24, y: 0.46 };
  for (const scale of [1, 1.5]) {
    const after = cropFrame(photo, movePhotoCrop(photo, start, from, to, scale));
    closeTo(before.left + from.x * before.side, after.left + to.x * after.side);
    closeTo(before.top + from.y * before.side, after.top + to.y * after.side);
  }
});

test('extreme pans and zoom cannot expose empty margins', () => {
  const { cropFrame, movePhotoCrop, DEFAULT_CROP, MAX_PHOTO_ZOOM } = load();
  for (const photo of [{ width: 375, height: 5145 }, { width: 1000, height: 300 }, { width: 72, height: 72 }]) {
    for (const delta of [-100, 100]) {
      for (const scale of [0.001, 50]) {
        const crop = movePhotoCrop(photo, DEFAULT_CROP, { x: 0.5, y: 0.5 }, { x: delta, y: -delta }, scale);
        assert.ok(crop.zoom >= 1 && crop.zoom <= MAX_PHOTO_ZOOM);
        const frame = cropFrame(photo, crop);
        assert.ok(frame.left >= 0 && frame.top >= 0);
        assert.ok(frame.left + frame.side <= photo.width && frame.top + frame.side <= photo.height);
      }
    }
  }
});

test('the exported JPEG draws exactly the preview crop, not the whole source image', async () => {
  let painted;
  const result = new Blob(['fixture'], { type: 'image/jpeg' });
  const canvas = {
    getContext: () => ({ fillRect() {}, drawImage: (...args) => { painted = args; } }),
    toBlob(callback, type) { assert.equal(type, 'image/jpeg'); callback(result); },
  };
  const { cropFrame, renderProfilePhoto, PROFILE_PHOTO_SIZE } = load({
    createElement(tag) { assert.equal(tag, 'canvas'); return canvas; },
  });
  const source = { naturalWidth: 4032, naturalHeight: 3024 };
  const crop = { x: 0.2, y: 0.75, zoom: 2.5 };
  const frame = cropFrame({ width: source.naturalWidth, height: source.naturalHeight }, crop);
  assert.equal(await renderProfilePhoto(source, crop), result);
  assert.equal(canvas.width, 768);
  assert.equal(canvas.height, 768);
  assert.deepEqual(painted, [source, frame.left, frame.top, frame.side, frame.side, 0, 0, PROFILE_PHOTO_SIZE, PROFILE_PHOTO_SIZE]);
});

test('choosing a file stays local until Save photo and saves only the photo column', () => {
  const profile = read('app/profile/page.tsx');
  const editor = read('components/profile/profile-photo-crop.tsx');
  const select = profile.slice(profile.indexOf('const handleAvatarSelection'), profile.indexOf('const saveProfilePhoto'));
  assert.match(select, /setSelectedPhoto\(file\)/);
  assert.doesNotMatch(select, /\.upload\(|\.update\(/);
  assert.match(editor, /await onSave\(await renderProfilePhoto\(image.current, crop\)\)/);
  assert.match(editor, /URL\.revokeObjectURL\(objectUrl\)/);
  assert.match(profile, /\.from\('profiles'\)\.update\(\{ avatar_url: publicUrl \}\)\.eq\('id', user\.id\)/);
});
