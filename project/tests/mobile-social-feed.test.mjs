import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read = file => readFileSync(new URL('../'+file, import.meta.url),'utf8');

test('Home has a social tab bar without rendering the marketplace bar twice',()=>{
  const header=read('components/layout/site-header.tsx');
  const bar=header.slice(header.indexOf('{feedControls && <nav'),header.indexOf('</nav>}',header.indexOf('{feedControls && <nav')));
  for(const action of ['feedControls.select(false)','feedControls.select(true)',"'/dashboard/messages'",'href="/search"', "'/profile'"])
    assert.ok(bar.includes(action),action);
  assert.match(read('components/pwa/mobile-bottom-nav.tsx'),/pathname === '\/' \|\| HIDDEN_SECTIONS/);
  assert.match(bar,/unread\.messages/);
  assert.doesNotMatch(bar,/unread\.notifications/);
});

test('reposts and private sends are explicit actions using the existing permission-checked paths',()=>{
  const sheet=read('components/feed/post-share-sheet.tsx');
  assert.match(sheet,/if\(lock.current\)return/);
  assert.match(sheet,/create_campus_community_post_with_attachment/);
  assert.match(sheet,/p_media_path:null/);
  assert.match(sheet,/getOrCreateConversation\(recipient\)/);
  assert.match(sheet,/sendMessage\(conv.id,recipient,url,'link'\)/);
  assert.match(read('components/feed/community-post-actions.tsx'),/registrationAccess\?\.can_publish && <button[^>]*onClick=/);
});
