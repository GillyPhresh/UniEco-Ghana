import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('..', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');

test('admin mutations use narrow audited RPCs with authenticated authority', async () => {
  const migration = await read('supabase/migrations/20260911242000_0038_admin_authority_consolidation.sql');
  const procedures = ['create_admin_university','update_admin_university','set_admin_university_enabled','set_admin_university_branding','create_admin_category','update_admin_category','delete_admin_category','review_admin_advertisement','resolve_admin_report','add_admin_ticket_reply','assign_admin_support_ticket','close_admin_support_ticket','create_admin_cms_page','update_admin_cms_page','delete_admin_cms_page','create_admin_faq','update_admin_faq','delete_admin_faq','create_admin_announcement','update_admin_announcement','delete_admin_announcement'];
  for (const procedure of procedures) assert.match(migration, new RegExp(`FUNCTION public\\.${procedure}\\(`));
  assert.match(migration, /SECURITY DEFINER/);
  assert.match(migration, /REVOKE ALL ON FUNCTION public\.create_admin_university[\s\S]*FROM PUBLIC,anon,authenticated,service_role/);
  assert.match(migration, /GRANT EXECUTE ON FUNCTION public\.create_admin_university[\s\S]*TO authenticated/);
  assert.match(migration, /INSERT INTO public\.admin_actions \(admin_id[\s\S]*auth\.uid\(\)/);
  assert.match(migration, /DROP POLICY IF EXISTS advertisements_staff_manage/);
  assert.match(migration, /DROP POLICY IF EXISTS reports_staff_update/);
  assert.match(migration, /DROP POLICY IF EXISTS tickets_owner_manage/);
  assert.match(migration, /DROP POLICY IF EXISTS announcements_staff_manage/);
  assert.match(migration, /CREATE POLICY support_tickets_owner_insert[\s\S]*WITH CHECK\(user_id=auth\.uid\(\)\)/);
});

test('admin state machines and university scope are database enforced', async () => {
  const migration = await read('supabase/migrations/20260911242000_0038_admin_authority_consolidation.sql');
  assert.match(migration, /p_decision NOT IN \('approved','rejected'\)/);
  assert.match(migration, /status='pending' FOR UPDATE/);
  assert.match(migration, /status='open'/);
  assert.match(migration, /status IN \('open','in_progress','resolved'\)/);
  assert.match(migration, /p_type NOT IN \('platform','university','maintenance','promotional'\)/);
  assert.match(migration, /public\.can_manage_university\(p_university_id\)/);
  assert.match(migration, /public\.current_app_role\(\)='university_admin'/);
  assert.match(migration, /university_branding_admin_write/);
});

test('active admin browser paths no longer write protected resources directly', async () => {
  const client = await read('lib/data/admin-client.ts');
  const protectedTables = 'universities|categories|advertisements|reports|cms_pages|cms_faq_entries|announcements|admin_actions';
  assert.doesNotMatch(client, new RegExp(`from\\('(?:${protectedTables})'\\)[\\s\\S]{0,180}?\\.(?:insert|update|upsert|delete)\\(`));
  assert.doesNotMatch(client, /from\('support_tickets'\)[\s\S]{0,180}?\.(?:update|upsert|delete)\(/);
  assert.doesNotMatch(client, /from\('ticket_replies'\)[\s\S]{0,180}?\.insert\(/);
  for (const procedure of ['create_admin_university','update_admin_university','review_admin_advertisement','resolve_admin_report','add_admin_ticket_reply','create_admin_cms_page','create_admin_announcement']) assert.match(client, new RegExp(`rpc\\('${procedure}'`));
  assert.doesNotMatch(client, /logAdminAction/);
});
