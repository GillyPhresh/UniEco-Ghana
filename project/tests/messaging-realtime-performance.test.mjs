import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('..', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');

test('inbox enrichment runs concurrently instead of serial network round trips', async () => {
  const client = await read('lib/data/communication-client.ts');
  const getConversations = client.slice(client.indexOf('export async function getConversations'), client.indexOf('export async function searchConversations'));
  assert.match(getConversations, /return Promise\.all\(data\.map\(async \(conv\)/);
  assert.match(getConversations, /const \[otherParticipant, lastMessageResult, unreadResult\] = await Promise\.all\(/);
  assert.doesNotMatch(getConversations, /for\s*\([^)]*\)\s*\{[\s\S]*?await getConversationRecipient/);
});

test('messages use realtime first and keep a low-frequency background fallback', async () => {
  const page = await read('app/dashboard/messages/page.tsx');
  assert.match(page, /\.channel\(`inbox:\$\{user\.id\}`\)/);
  assert.match(page, /\.channel\(`messages:\$\{activeConvId\}`\)/);
  assert.match(page, /setInterval\(refresh, 30000\)/);
  assert.match(page, /if \(!inboxRealtimeConnected\) pending\.push\(loadConversations\(false\)\)/);
  assert.doesNotMatch(page, /setInterval\([^,]+,\s*5000\)/);
});

test('new-recipient search is debounced and stale results cannot replace newer ones', async () => {
  const page = await read('app/dashboard/messages/page.tsx');
  assert.match(page, /recipientSearchRequestRef/);
  assert.match(page, /setTimeout\(async \(\) => \{[\s\S]*?searchMessageContacts\(query\)[\s\S]*?\}, 250\)/);
  assert.match(page, /requestId !== recipientSearchRequestRef\.current/);
});

test('message sends retain the draft on failure and reconcile only their optimistic bubble', async () => {
  const page = await read('app/dashboard/messages/page.tsx');
  assert.match(page, /const tempId = `temp-\$\{Date\.now\(\)\}`/);
  assert.match(page, /setMessages\(\(prev\) => prev\.filter\(\(message\) => message\.id !== tempId\)\)/);
  assert.match(page, /setNewMessage\(\(current\) => current \|\| msgText\)/);
  assert.match(page, /message\.id === tempId/);
});

test('blocking controls perform both block and unblock actions', async () => {
  const [page, client] = await Promise.all([
    read('app/dashboard/messages/page.tsx'),
    read('lib/data/communication-client.ts'),
  ]);
  assert.match(page, /blocked\s*\?\s*await unblockUser\(activeOtherUser\.id\)/);
  assert.match(page, /:\s*await blockUser\(activeOtherUser\.id/);
  assert.match(client, /export async function unblockUser\(/);
});
