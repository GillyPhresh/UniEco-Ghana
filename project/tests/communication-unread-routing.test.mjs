import assert from 'node:assert/strict';
import test from 'node:test';
import { testModules } from './helpers/load-typescript.mjs';

const user = '11111111-1111-4111-8111-111111111111';
const rows = {
  messages: [
    { recipient_id: user, is_read: false, is_deleted: false },
    { recipient_id: user, is_read: false, is_deleted: true },
    { recipient_id: user, is_read: true, is_deleted: false },
    { recipient_id: 'other-user', is_read: false, is_deleted: false },
  ],
  notifications: [
    { user_id: user, category: 'messages', type: 'new_message', is_read: false },
    { user_id: user, category: 'general', type: 'message', is_read: false },
    { user_id: user, category: 'general', type: 'new_message', is_read: false },
    { user_id: user, category: 'general', type: null, is_read: false },
    { user_id: user, category: 'general', type: 'support_ticket_update', is_read: false },
    { user_id: user, category: 'general', type: 'registration_payment_required', is_read: false },
    { user_id: 'other-user', category: 'general', type: null, is_read: false },
  ],
};

function client(error = null) {
  const calls = [];
  return { calls, supabase: { from: table => {
    const filters = []; let head = false;
    const query = {
      select: (columns, options) => { calls.push({ table, columns, options }); head = Boolean(options?.head); return query; },
      eq: (key, value) => { filters.push(row => row[key] === value); return query; },
      neq: (key, value) => { filters.push(row => row[key] !== value); return query; },
      or: value => { assert.equal(value, 'type.is.null,type.not.in.(message,new_message)'); filters.push(row => row.type == null || !['message', 'new_message'].includes(row.type)); return query; },
      order: () => query, limit: () => query,
      then: (resolve, reject) => { const selected = rows[table].filter(row => filters.every(filter => filter(row))); return Promise.resolve({ count: selected.length, data: head ? null : selected, error }).then(resolve, reject); },
    };
    return query;
  } } };
}

test('chat badges count own unread undeleted messages; bells retain null-type and support alerts but exclude chat', async () => {
  const fake = client();
  const { getHeaderUnreadCounts } = testModules({ '@/lib/supabase/client': fake })('lib/data/header-unread.ts');
  assert.deepEqual(await getHeaderUnreadCounts(user, false), { messages: 1, notifications: 2 });
  assert.deepEqual(await getHeaderUnreadCounts(user, true), { messages: 1, notifications: 3 });
  for (const call of fake.calls) { assert.equal(call.columns, 'id'); assert.deepEqual(call.options, { head: true, count: 'exact' }); }
});

test('failed unread reads are not reported as an empty inbox', async () => {
  const { getHeaderUnreadCounts } = testModules({ '@/lib/supabase/client': client({ message: 'read failed' }) })('lib/data/header-unread.ts');
  await assert.rejects(getHeaderUnreadCounts(user, false), /could not load/);
});

test('bell history and totals can omit current and legacy chat alerts', async () => {
  const api = testModules({ '@/lib/supabase/client': client() })('lib/data/communication-client.ts');
  const result = await api.getNotifications(100, undefined, false, false, false);
  assert.ok(result.every(row => row.category !== 'messages' && !['message', 'new_message', 'registration_payment_required'].includes(row.type)));
  assert.equal((await api.getUnreadCountsByCategory(false, false)).messages, undefined);
});

test('read and delete actions refresh badges only after authorized RPCs succeed', async () => {
  let error = null; let refreshes = 0;
  const api = testModules({ '@/lib/supabase/client': { supabase: { rpc: async () => ({ error }) } },
    '@/lib/notifications/unread-events': { announceUnreadChange: () => refreshes++ } })('lib/data/communication-client.ts');
  for (const failed of [false, true]) {
    error = failed ? { message: 'not authorized' } : null;
    await api.markMessagesRead('conversation-a'); await api.deleteMessage('message-a');
    await api.markNotificationRead('alert-a'); await api.markAllNotificationsRead(); await api.deleteNotification('alert-a');
    assert.equal(refreshes, 5);
  }
});
