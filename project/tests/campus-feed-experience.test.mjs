import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { testModules } from './helpers/load-typescript.mjs';

const { appendCampusFeed, pageCampusFeed, getCampusMoments, chooseFeedPlayback, isFeedDoubleTap, feedAspectRatio, resolveFeedScope } =
  testModules()('lib/community/feed-experience.ts');

test('Across Ghana stays selected when a campus profile loads; narrower feeds require an explicit eligible choice', () => {
  for (const hasUniversity of [false, true]) for (const canFollow of [false, true]) {
    assert.equal(resolveFeedScope(null, hasUniversity, canFollow, false), 'all');
    assert.equal(resolveFeedScope('university', hasUniversity, canFollow, false), hasUniversity ? 'university' : 'all');
    assert.equal(resolveFeedScope('following', hasUniversity, canFollow, false), canFollow ? 'following' : 'all');
    assert.equal(resolveFeedScope('university', hasUniversity, canFollow, true), 'all');
  }
});

test('direct links do not change the chronological cursor or make the feed stop after a full page', () => {
  const rows = [{ id: 'new', created_at: '2026-11-16' }, { id: 'next', created_at: '2026-11-15' }];
  const linked = { id: 'link', created_at: '2026-10-01' };
  assert.deepEqual(pageCampusFeed(rows, 2, linked), { entries: [linked, ...rows], cursor: rows[1], hasMore: true });
  assert.deepEqual(pageCampusFeed(rows, 3, rows[0]), { entries: rows, cursor: rows[1], hasMore: false });
  assert.deepEqual(pageCampusFeed([], 2, linked), { entries: [linked], cursor: null, hasMore: false });
  assert.deepEqual(appendCampusFeed([linked, ...rows], [linked, { id: 'older' }, { id: 'older' }]).map((row) => row.id), ['link', 'new', 'next', 'older']);
});

test('Campus Moments are real, playable timeline media and show at most one entry per author', () => {
  const post = (id, author_id, media_type, media_url = '/media/' + id) => ({ id, author_id, media_type, media_url });
  const posts = [post('x', 'a', 'file'), post('1', 'a', 'image'), post('2', 'a', 'video'), post('3', 'b', 'video'),
    post('x2', 'd', 'image', null), post('4', 'c', 'image')];
  assert.deepEqual(getCampusMoments(posts, 2).map((item) => item.id), ['1', '3']);
  assert.deepEqual(getCampusMoments(posts).map((item) => item.id), ['1', '3', '4']);
  assert.deepEqual(getCampusMoments(posts, 0), []);
});

test('visible playback selects one video and preloads no more than one nearby clip', () => {
  const viewport = { top: 68, bottom: 560 };
  const item = (id, top, bottom, playable = true) => ({ id, top, bottom, playable });
  assert.deepEqual(chooseFeedPlayback([
    item('previous', -420, 75), item('center', 92, 450), item('attachment', 456, 512, false),
    item('next', 545, 852), item('far', 1050, 1400),
  ], viewport, null), { active: 'center', preload: 'next' });
  assert.deepEqual(chooseFeedPlayback([item('past', 0, 60), item('too-far-away', 950, 1350)], viewport, null), { active: null, preload: null });
  assert.deepEqual(chooseFeedPlayback([item('portrait', -120, 700)], viewport, null), { active: 'portrait', preload: null });
});

test('explicit play takes priority until that video is scrolled out of view', () => {
  const viewport = { top: 68, bottom: 720 };
  const other = { id: 'other', top: 85, bottom: 540, playable: true };
  const myVideo = { id: 'manual', top: 555, bottom: 880, playable: true };
  assert.equal(chooseFeedPlayback([other, myVideo], viewport, 'manual').active, 'manual');
  assert.equal(chooseFeedPlayback([other, { ...myVideo, top: 695, bottom: 1020 }], viewport, 'manual').active, 'other');
});

test('double tap rejects simultaneous, delayed and spatially separated taps', () => {
  const first = { at: 1000, x: 16, y: 40 };
  assert.equal(isFeedDoubleTap(first, { at: 1190, x: 27, y: 46 }), true);
  assert.equal(isFeedDoubleTap(first, { at: 1005, x: 16, y: 40 }), false);
  assert.equal(isFeedDoubleTap(first, { at: 1350, x: 16, y: 40 }), false);
  assert.equal(isFeedDoubleTap(first, { at: 1150, x: 16, y: 79 }), false);
});

test('natural aspect ratio fits wide and tall media into a stable viewport', () => {
  assert.equal(feedAspectRatio(0, 0), 1);
  assert.equal(feedAspectRatio(1080, 1920), 0.8);
  assert.equal(feedAspectRatio(1920, 1080), 16 / 9);
  assert.equal(feedAspectRatio(4000, 900), 2);
});

test('feed accents and their button text meet normal-text contrast in both themes', async () => {
  const css = await readFile(new URL('../app/globals.css', import.meta.url), 'utf8');
  const luminance = (hsl) => {
    const [h, s, l] = hsl.split(/\s+/).map(parseFloat);
    const level = l / 100;
    const a = (s / 100) * Math.min(level, 1 - level);
    const rgb = [0, 8, 4].map((n) => {
      const k = (n + h / 30) % 12;
      const channel = level - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
      return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2];
  };
  for (const selector of [/^\.campus-feed-surface\s*\{([^}]+)}/m, /^\.dark \.campus-feed-surface\s*\{([^}]+)}/m]) {
    const scope = css.match(selector)?.[1] ?? '';
    const color = scope.match(/--primary:\s*([^;]+);/)?.[1];
    const text = scope.match(/--primary-foreground:\s*([^;]+);/)?.[1];
    assert.ok(color && text, 'Both feed accent variables are defined');
    const a = luminance(color);
    const b = luminance(text);
    assert.ok((Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05) >= 4.5);
  }
});

test('Following reads from the signed-in viewer’s relation and cannot expose restricted posts', async () => {
  const sql = await readFile(new URL('../supabase/migrations/20261116110000_0202_campus_community_following_feed.sql', import.meta.url), 'utf8');
  assert.match(sql, /v_viewer_id uuid := auth\.uid\(\)/);
  assert.match(sql, /IF NOT public\.can_use_campus_community\(v_viewer_id\)/);
  assert.match(sql, /WHERE follow\.follower_id = v_viewer_id/);
  assert.match(sql, /post\.status = 'published'/);
  assert.match(sql, /public\.can_use_campus_community\(author\.id\)/);
  assert.match(sql, /public\.community_users_can_interact\(v_viewer_id, author\.id\)/);
  assert.match(sql, /\(post\.created_at, post\.id\) < \(p_before_created_at, p_before_id\)/);
  assert.match(sql, /ORDER BY post\.created_at DESC, post\.id DESC/);
  assert.match(sql, /REVOKE ALL ON FUNCTION public\.get_campus_community_following_feed[^;]+FROM PUBLIC, anon/);
  assert.match(sql, /GRANT EXECUTE ON FUNCTION public\.get_campus_community_following_feed[^;]+TO authenticated;/);
  assert.doesNotMatch(sql, /\b(email|phone|student_id_number|student_id_document_url)\b/i);
});
