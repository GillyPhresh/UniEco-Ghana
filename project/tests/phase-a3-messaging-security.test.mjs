import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('..', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');

test('messaging writes are exposed only through narrowly granted RPCs', async () => {
  const migration = await read('supabase/migrations/20260911233000_0032_secure_messaging_write_path.sql');
  for (const functionName of [
    'get_or_create_direct_conversation', 'search_message_recipients', 'send_direct_message',
    'mark_direct_messages_read', 'soft_delete_direct_message', 'clear_direct_message_attachment',
  ]) {
    assert.match(migration, new RegExp(`FUNCTION public\\.${functionName}`));
    assert.match(migration, new RegExp(`REVOKE ALL ON FUNCTION public\\.${functionName}[\\s\\S]*?FROM PUBLIC, anon, authenticated, service_role`));
  }
  assert.doesNotMatch(migration, /CREATE POLICY[\s\S]*(?:conversations|messages)[\s\S]*FOR (?:INSERT|UPDATE|DELETE)/i);
  assert.match(migration, /auth\.uid\(\)/);
  assert.match(migration, /pg_advisory_xact_lock/);
  assert.match(migration, /p_target_user_id = v_caller/);
});

test('message RPC derives sensitive actor and recipient fields server-side', async () => {
  const migration = await read('supabase/migrations/20260911233000_0032_secure_messaging_write_path.sql');
  assert.match(migration, /WHERE c\.id = p_conversation_id AND v_caller IN/);
  assert.match(migration, /sender_id, recipient_id, body, message_type, attachment_url, order_id/);
  assert.match(migration, /v_caller, v_recipient/);
  assert.match(migration, /char_length\(v_body\) > 4000/);
  assert.match(migration, /attachment:\/\//);
});

test('student recipient search and attachment deletion remain private', async () => {
  const [migration, client, page] = await Promise.all([
    read('supabase/migrations/20260911233000_0032_secure_messaging_write_path.sql'),
    read('lib/data/communication-client.ts'),
    read('app/dashboard/messages/page.tsx'),
  ]);
  assert.match(migration, /p\.role_id = 2/);
  assert.match(migration, /LIMIT LEAST\(GREATEST/);
  assert.match(migration, /account_restrictions/);
  assert.match(client, /rpc\('search_message_recipients'/);
  assert.match(client, /message-attachments'\)\.remove/);
  assert.match(client, /rpc\('clear_direct_message_attachment'/);
  assert.match(client, /body: string \| null/);
  assert.match(page, /New student message/);
  assert.match(page, /Remove attachment/);
  assert.match(page, /min-h-0 flex-1 overflow-y-auto/);
  assert.match(page, /msgText \|\| null/);
  assert.match(page, /getPublicAvatarUrl/);
});

test('conversation recipients are disclosed only through participant-authorized RPCs', async () => {
  const [migration, client] = await Promise.all([
    read('supabase/migrations/20260911237000_0032_message_conversation_recipient_rpc.sql'),
    read('lib/data/communication-client.ts'),
  ]);
  assert.match(migration, /FUNCTION public\.get_message_conversation_recipient/);
  assert.match(migration, /v_caller IN \(conversation\.participant_one, conversation\.participant_two\)/);
  assert.match(migration, /REVOKE ALL ON FUNCTION public\.get_message_conversation_recipient\(uuid\) FROM PUBLIC, anon, authenticated, service_role/);
  assert.match(migration, /GRANT EXECUTE ON FUNCTION public\.get_message_conversation_recipient\(uuid\) TO authenticated/);
  assert.match(client, /rpc\('get_message_conversation_recipient'/);
  assert.match(client, /\.from\('conversations'\)\s*\.select\('\*'\)/);
  assert.doesNotMatch(client, /conversations_participant_one_fkey/);
});
