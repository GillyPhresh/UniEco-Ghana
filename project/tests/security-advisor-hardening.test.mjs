import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const root = path.resolve(process.cwd());
const migration = fs.readFileSync(path.join(root, 'supabase/migrations/20261108100000_0188_security_advisor_hardening.sql'), 'utf8');

test('security advisor hardening pins the attachment helper and removes anonymous admin RPC execution', () => {
  assert.match(migration, /ALTER FUNCTION public\.message_attachment_conversation_id\(text\)\s+SET search_path = pg_catalog, storage/);
  assert.match(migration, /REVOKE ALL ON FUNCTION public\.message_attachment_conversation_id\(text\)\s+FROM PUBLIC, anon/);
  assert.match(migration, /GRANT EXECUTE ON FUNCTION public\.message_attachment_conversation_id\(text\)\s+TO authenticated/);
  assert.match(migration, /REVOKE ALL ON FUNCTION public\.set_admin_university_launch_status\(uuid, text\)\s+FROM PUBLIC, anon, authenticated, service_role/);
  assert.match(migration, /GRANT EXECUTE ON FUNCTION public\.set_admin_university_launch_status\(uuid, text\)\s+TO authenticated/);
  assert.doesNotMatch(migration, /DROP\s+(TABLE|COLUMN)|TRUNCATE|DELETE\s+FROM|UPDATE\s+/i);
});
