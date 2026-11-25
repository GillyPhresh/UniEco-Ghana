import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {testModules} from './helpers/load-typescript.mjs';
const read = file => readFileSync(new URL('../'+file, import.meta.url),'utf8');

test('the first worker claim does not interrupt an open sheet, but an actual update reloads', (t)=>{
  let changed, reloads=0, cleanup;
  const worker={controller:null, addEventListener:(name,cb)=>{if(name==='controllerchange')changed=cb},removeEventListener:()=>{},register:async()=>({update:async()=>{},addEventListener:()=>{}})};
  const nav = Object.getOwnPropertyDescriptor(globalThis,'navigator');
  const win = Object.getOwnPropertyDescriptor(globalThis,'window');
  Object.defineProperty(globalThis,'navigator',{configurable:true,value:{serviceWorker:worker}});
  Object.defineProperty(globalThis,'window',{configurable:true,value:{location:{reload:()=>reloads++}}});
  t.after(()=>{cleanup?.();for(const [key,old] of [['window',win],['navigator',nav]]){if(old)Object.defineProperty(globalThis,key,old);else delete globalThis[key]}});
  testModules({react:{useEffect:cb=>{cleanup=cb()}}})('components/pwa/service-worker-register.tsx').ServiceWorkerRegister();
  worker.controller={};changed();changed();assert.equal(reloads,0);
  worker.controller={};changed();assert.equal(reloads,1);
});

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
