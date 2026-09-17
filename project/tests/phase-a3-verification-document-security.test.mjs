import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('..', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');

test('verification documents are normalized, private, and authorized by document id only', async () => {
  const migration = await read('supabase/migrations/20260911241000_0037_verification_document_authorization.sql');
  assert.match(migration, /CREATE TABLE IF NOT EXISTS public\.verification_request_documents/);
  assert.match(migration, /verification_request_id uuid NOT NULL REFERENCES public\.verification_requests/);
  assert.match(migration, /vendor_id uuid NOT NULL REFERENCES public\.vendors/);
  assert.match(migration, /CHECK \(bucket_id = 'vendor-documents'\)/);
  assert.match(migration, /FUNCTION public\.authorize_verification_document_access\(p_document_id uuid\)/);
  assert.match(migration, /auth\.uid\(\)/);
  assert.match(migration, /current_app_role\(\)='university_admin'/);
  assert.match(migration, /can_manage_university\(v_university\)/);
  assert.match(migration, /REVOKE ALL ON FUNCTION public\.authorize_verification_document_access\(uuid\) FROM PUBLIC, anon, authenticated, service_role/);
  assert.match(migration, /GRANT EXECUTE ON FUNCTION public\.submit_own_vendor_verification_request\(text,jsonb\), public\.authorize_verification_document_access\(uuid\) TO authenticated/);
  assert.doesNotMatch(migration, /get_signed_url\s*\(\s*path/i);
});

test('private verification signing authenticates then authorizes before service signing', async () => {
  const signer = await read('supabase/functions/get-verification-document-url/index.ts');
  assert.match(signer, /auth\.getUser\(\)/);
  assert.match(signer, /rpc\('authorize_verification_document_access', \{ p_document_id: documentId \}\)/);
  assert.match(signer, /bucket_id !== 'vendor-documents'/);
  assert.match(signer, /type AuthorizedDocument = \{[\s\S]*bucket_id: string;[\s\S]*object_path: string;[\s\S]*owner_id: string;/);
  assert.match(signer, /const authorizedDocument = authorizationData as AuthorizedDocument \| null/);
  assert.match(signer, /object_path\.startsWith\(`\$\{authorizedDocument\.owner_id\}\/`\)/);
  assert.match(signer, /createSignedUrl\(authorizedDocument\.object_path, URL_TTL_SECONDS\)/);
  assert.match(signer, /const URL_TTL_SECONDS = 300/);
  assert.match(signer, /const \{ documentId \} = await request\.json\(\)\.catch/);
  assert.doesNotMatch(signer, /const \{[^}]*?(?:bucket|objectPath|vendorId|requestId)[^}]*?\} = await request\.json/);
});

test('vendor verification UI never creates a public URL or browser-owned request', async () => {
  const page = await read('app/vendor-dashboard/verification/page.tsx');
  assert.doesNotMatch(page, /getPublicUrl\(/);
  assert.match(page, /rpc\('submit_own_vendor_verification_request'/);
  assert.doesNotMatch(page, /from\('verification_requests'\)\s*\.insert/);
  assert.match(page, /from\('vendor-documents'\)\s*\.upload/);
});
