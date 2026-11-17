import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('../', import.meta.url);
const read = async (path) => (await readFile(new URL(path, root), 'utf8')).replace(/\r\n/g, '\n');

test('business role aliases are consistent and system-only senders stay private', async () => {
  const [contacts, footer] = await Promise.all([
    read('lib/constants/business-email.ts'),
    read('components/layout/site-footer.tsx'),
  ]);
  for (const email of [
    'support@uniecoghana.com', 'info@uniecoghana.com', 'director@uniecoghana.com',
    'marketing@uniecoghana.com', 'auth@uniecoghana.com', 'notifications@uniecoghana.com', 'noreply@uniecoghana.com',
  ]) assert.ok(contacts.includes(email), `missing configured role alias ${email}`);
  assert.match(contacts, /Customer support/);
  assert.match(contacts, /Managing Director/);
  assert.match(contacts, /Marketing Director/);
  assert.match(footer, /publicBusinessContacts\.map/);
  assert.doesNotMatch(contacts.split('export const publicBusinessContacts')[1], /authentication|notifications|noReply/);
});

test('Resend routes transactional, support, and no-reply messages to their correct verified roles', async () => {
  const sender = await read('supabase/functions/send-email/index.ts');
  assert.match(sender, /eventType === "support_ticket_update"[\s\S]*?"support"/);
  assert.match(sender, /eventType && eventType !== "email" \? "notifications" : "noReply"/);
  assert.match(sender, /RESEND_FROM_EMAIL_\$\{roleName\}/);
  assert.match(sender, /EMAIL_FROM_\$\{roleName\}/);
  assert.match(sender, /UniEco Ghana Notifications <notifications@uniecoghana\.com>/);
  assert.match(sender, /UniEco Ghana <noreply@uniecoghana\.com>/);
  assert.match(sender, /Authentication mail is sent by Supabase Auth via auth@ SMTP/);
  assert.doesNotMatch(sender, /Deno\.env\.get\("EMAIL_FROM_ADDRESS"\)/);
});

test('public and payment documents use domain contact addresses instead of personal Gmail or stale domains', async () => {
  const paths = [
    'app/privacy-policy/page.tsx', 'app/terms-of-service/page.tsx', 'app/code-of-conduct/page.tsx',
    'app/dashboard/transactions/[kind]/[id]/page.tsx', 'supabase/functions/send-email/university-admin-documents.ts',
  ];
  const files = await Promise.all(paths.map(read));
  for (const source of files) {
    assert.doesNotMatch(source, /info\.uniecoghana@gmail\.com|support@unieco\.gh/);
  }
  assert.match(files[3], /mailto:\$\{businessEmail\.support\}/);
  assert.match(await read('lib/constants/business-email.ts'), /support: 'support@uniecoghana\.com'/);
  assert.match(files[4], /info@uniecoghana\.com/);
});
