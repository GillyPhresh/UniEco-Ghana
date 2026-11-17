import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = path => readFile(new URL('../' + path, import.meta.url), 'utf8');

test('private voice notes use only the conversation attachment bucket and supported audio formats', async () => {
  const [page, client, types, migration] = await Promise.all([
    read('app/dashboard/messages/page.tsx'),
    read('lib/data/communication-client.ts'),
    read('lib/types/communication.ts'),
    read('supabase/migrations/20261117170000_0206_richer_business_messaging.sql'),
  ]);
  assert.match(page, /getUserMedia\(\{ audio: true \}\)/);
  assert.match(page, /uploadMessageAttachment\(activeConvId, outgoingFile\)/);
  assert.match(page, /messageType === 'audio'/);
  assert.match(client, /\.from\('message-attachments'\)/);
  assert.match(types, /'audio\/webm'[\s\S]*?'audio\/ogg'[\s\S]*?'audio\/mp4'[\s\S]*?'audio\/mpeg'/);
  assert.match(migration, /unnest\(allowed_mime_types \|\| ARRAY\['audio\/webm'[\s\S]*?'audio\/mp4'/);
  assert.match(migration, /AND public IS FALSE/);
  assert.match(migration, /o\.metadata->>'mimetype' IN \('audio\/webm'/);
});

test('location and catalogue shares are explicit, typed, rendered as constrained links, and never attachment URLs', async () => {
  const [page, migration] = await Promise.all([
    read('app/dashboard/messages/page.tsx'),
    read('supabase/migrations/20261117170000_0206_richer_business_messaging.sql'),
  ]);
  assert.match(page, /navigator\.geolocation\.getCurrentPosition/);
  assert.match(page, /setLocationDraft\(\{ conversationId: activeConvId, latitude: coords\.latitude, longitude: coords\.longitude/);
  assert.match(page, /locationDraft\.conversationId !== activeConvId/);
  assert.match(page, /confirmLocationShare\(\)/);
  assert.match(page, /SharedMessageCard body=\{msg\.body\} type="location"/);
  assert.match(page, /new URL\('https:\/\/www\.google\.com\/maps\/search\/'\)/);
  assert.match(page, /Share a UniEco catalogue/);
  assert.match(page, /shared\.pathname === '\/marketplace' \|\| .*\.test\(shared\.pathname\)/);
  assert.match(page, /origin !== window\.location\.origin/);
  assert.match(migration, /p_message_type IN \('location','product'\) AND p_attachment_url IS NOT NULL/);
  assert.match(migration, /v_latitude NOT BETWEEN -90 AND 90/);
  assert.match(migration, /www\\\.google\\\.com\/maps\/search/);
  assert.match(migration, /Only UniEco catalogue links can be shared/);
});

test('production permits prompted recording and narrowly scoped private audio playback', async () => {
  const config = await read('next.config.js');
  assert.match(config, /microphone=\(self\), geolocation=\(self\)/);
  assert.match(config, /media-src 'self' blob: https:\/\/\*\.supabase\.co\/storage\/v1\/object\/sign\/message-attachments\//);
  const page = await read('app/dashboard/messages/page.tsx');
  assert.match(page, /generation !== composerGeneration\.current/);
  assert.match(page, /mediaStreamRef\.current\?\.getTracks\(\)\.forEach\(track => track\.stop\(\)\)/);
  assert.match(page, /if \(activeConversationIdRef\.current === conversationId\) setMessages\(latest\)/);
  assert.match(page, /openedNotificationRef\.current = conversationParam;/);
  assert.match(page, /void openConversation\(conversation\);\s*router\.replace\('\/dashboard\/messages', \{ scroll: false \}\);/);
});

test('email and push alerts contain no message text, location, or attachment data', async () => {
  const migration = await read('supabase/migrations/20261117170000_0206_richer_business_messaging.sql');
  const notification = migration.split('CREATE OR REPLACE FUNCTION public.queue_direct_message_notification()')[1]
    .split('CREATE OR REPLACE FUNCTION public.send_direct_message')[0];
  assert.match(notification, /'Open UniEco to view your message\.'/);
  assert.match(notification, /'\/dashboard\/messages\?conversation=' \|\| NEW\.conversation_id::text/);
  assert.doesNotMatch(notification, /NEW\.body|NEW\.attachment_url|coords|latitude/);
  assert.match(migration, /'text','image','document','link','audio','location','product'/);
  assert.match(migration, /p_message_type NOT IN/);
});

test('mobile chats own the viewport and put attachments in one accessible composer menu', async () => {
  const [page, css, nav, invite] = await Promise.all([
    read('app/dashboard/messages/page.tsx'), read('app/globals.css'),
    read('components/pwa/mobile-bottom-nav.tsx'), read('components/pwa/install-prompt.tsx'),
  ]);
  assert.doesNotMatch(page, /<SiteHeader|<Card/);
  assert.match(page, /data-chat-app data-chat-view=/);
  assert.match(page, /window\.visualViewport/);
  assert.match(css, /height: var\(--chat-viewport-height, 100dvh\)/);
  assert.match(css, /\.chat-composer[^}]*env\(safe-area-inset-bottom\)/);
  assert.match(nav, /pathname === '\/dashboard\/messages'/);
  assert.match(invite, /pathname !== '\/dashboard\/messages'/);
  assert.match(page, /data-chat-composer[^]*?aria-label="Add to message"[^]*?Photo or document[^]*?Location[^]*?Catalogue/);
  assert.match(page, /capture="environment"/);
  assert.match(page, /hasDraft && !recording[^]*?aria-label="Send message"[^]*?Record voice note/);
  assert.match(page, /aria-label="Message options"/);
  assert.doesNotMatch(page, /group-hover:flex/);
  assert.match(page, /url\.protocol === 'https:' \|\| url\.protocol === 'http:'/);
});

test('local inbox preferences are account-scoped and closing a thread releases its read state', async () => {
  const [page, client] = await Promise.all([read('app/dashboard/messages/page.tsx'), read('lib/data/communication-client.ts')]);
  assert.match(page, /unieco:chat-flags:v1:\$\{user\.id\}/);
  assert.match(page, /chatFlags\?\.owner !== chatFlagsKey/);
  assert.match(page, /filter\(conv => chatFilter !== 'unread' \|\| conv\.unread_count > 0\)/);
  assert.match(page, /filter\(conv => chatFilter !== 'favourites' \|\| flags\.favourites\.includes\(conv\.id\)\)/);
  assert.match(page, /const backToChats = \(\) => \{[^]*?activeConversationIdRef\.current = null;[^]*?resetRichComposer\(\);/);
  assert.match(client, /select\('body, created_at, sender_id, message_type'\)/);
  assert.match(page, /case 'audio': return 'Voice message'/);
});
