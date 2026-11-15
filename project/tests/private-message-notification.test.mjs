import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('message email uses a privacy-safe prompt and a direct view-message action', () => {
  const email = read('supabase/functions/send-email/index.ts');
  assert.match(email, /template === 'new_message'/);
  assert.match(email, /You have a new private message waiting for you on UniEco Ghana/);
  assert.match(email, />View message<\/a>/);
  assert.match(email, /template === 'new_message' \? messagePath/);
  assert.match(email, /dashboard\/messages\?conversation=\$\{conversationId\}/);
});

test('push notification never serializes a direct-message body preview', () => {
  const push = read('supabase/functions/send-push/index.ts');
  assert.match(push, /eventType === "new_message" \? "New message" : title/);
  assert.match(push, /eventType === "new_message" \? "You have a new message\. Tap to view it in UniEco\." : body/);
  assert.match(push, /eventType === "new_message" \? "\/dashboard\/messages"/);
});

test('message links open a conversation only from the signed-in user conversation list', () => {
  const messages = read('app/dashboard/messages/page.tsx');
  assert.match(messages, /const conversationParam = searchParams\.get\('conversation'\)/);
  assert.match(messages, /conversations\.find\(\(item\) => item\.id === conversationParam\)/);
  assert.match(messages, /openConversation\(conversation\)/);
  assert.match(messages, /unavailable or you no longer have access/);
});
