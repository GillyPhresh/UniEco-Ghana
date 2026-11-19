import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { QueryClient } from '@tanstack/react-query';
import { testModules } from './helpers/load-typescript.mjs';

function harness(client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } }), fetchCounts = async () => ({ messages: 4, notifications: 2 })) {
  let options;
  const effects = [], handlers = [], removed = [];
  const channel = { on: (_, filter, callback) => { handlers.push({ filter, callback }); return channel; }, subscribe: () => channel };
  const { useCommunicationUnread } = testModules({
    react: { useId: () => 'badge-test', useEffect: effect => effects.push(effect) },
    '@tanstack/react-query': { useQueryClient: () => client, useQuery: value => { options = value; return { data: client.getQueryData(value.queryKey) }; } },
    '@/lib/supabase/client': { supabase: { channel: () => channel, removeChannel: async value => removed.push(value) } },
    '@/lib/data/header-unread': { getHeaderUnreadCounts: fetchCounts },
  })('hooks/use-communication-unread.ts');
  return { client, effects, handlers, removed, channel, render: (id, reminders = false) => useCommunicationUnread(id, reminders), options: () => options };
}

test('account-keyed badges reject old responses and clear on logout', async () => {
  let finishOld;
  const h = harness(undefined, id => id === 'account-a' ? new Promise(resolve => { finishOld = resolve; }) : Promise.resolve({ messages: 2, notifications: 1 }));
  try {
    assert.deepEqual(h.render('account-a'), { messages: 0, notifications: 0 });
    const old = h.client.fetchQuery(h.options());
    await Promise.resolve();
    h.render('account-b');
    assert.deepEqual(h.options().queryKey, ['communication-unread', 'account-b', false]);
    await h.client.fetchQuery(h.options());
    finishOld({ messages: 99, notifications: 30 }); await old;
    assert.deepEqual(h.render('account-b'), { messages: 2, notifications: 1 });
    assert.deepEqual(h.render(undefined), { messages: 0, notifications: 0 });
    assert.equal(h.options().enabled, false);
  } finally { h.client.clear(); }
});

test('realtime, local actions and focus refresh own badges; cleanup ignores old callbacks', () => {
  const previous = globalThis.window;
  globalThis.window = new EventTarget();
  const invalidations = [];
  const h = harness({ getQueryData: () => undefined, invalidateQueries: async args => invalidations.push(args) });
  try {
    h.render('account-a'); const cleanup = h.effects[0]();
    assert.deepEqual(h.handlers.map(({ filter }) => [filter.table, filter.filter]), [['messages', 'recipient_id=eq.account-a'], ['notifications', 'user_id=eq.account-a']]);
    h.handlers[0].callback(); h.handlers[1].callback();
    window.dispatchEvent(new Event('unieco:communication-unread-changed')); window.dispatchEvent(new Event('focus'));
    assert.equal(invalidations.length, 4);
    for (const item of invalidations) assert.deepEqual(item, { queryKey: ['communication-unread', 'account-a', false], exact: true });
    assert.equal(h.options().refetchInterval, 30000); assert.equal(h.options().refetchIntervalInBackground, false);
    assert.equal(h.options().refetchOnMount, 'always');
    cleanup(); h.handlers[0].callback(); window.dispatchEvent(new Event('unieco:communication-unread-changed'));
    assert.equal(invalidations.length, 4); assert.deepEqual(h.removed, [h.channel]);
  } finally { if (previous === undefined) delete globalThis.window; else globalThis.window = previous; }
});

test('chat and bell use distinct counts and bell history excludes chat alerts', () => {
  const read = name => readFileSync(new URL('../' + name, import.meta.url), 'utf8');
  const header = read('components/layout/site-header.tsx');
  assert.match(header, /label="Messages" icon=\{MessageSquare\} count=\{unread\.messages\}/);
  assert.match(header, /label="Notifications" icon=\{Bell\} count=\{unread\.notifications\}/);
  const page = read('app/dashboard/notifications/page.tsx');
  assert.match(page, /getNotifications\(100, undefined, false, showPaymentReminders, false\)/);
  assert.match(page, /getUnreadCountsByCategory\(showPaymentReminders, false\)/);
  assert.match(page, /filter\(c => c\.key !== 'messages'\)/);
});
