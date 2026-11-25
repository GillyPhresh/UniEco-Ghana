import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import React from 'react';
import {testModules} from './helpers/load-typescript.mjs';
const read = file => readFileSync(new URL('../'+file, import.meta.url),'utf8');

test('the first worker claim does not interrupt an open sheet, but an actual update reloads', (t)=>{
  assert.doesNotMatch(read('hooks/use-sw-update.ts'), /addEventListener\(['"]controllerchange/);
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
  assert.deepEqual([...bar.matchAll(/aria-label="([^"]+)"/g)].map(m=>m[1]),['Mobile bottom navigation','Home','Shop','Campus Mate','Updates','Account']);
  for(const action of ['feedControls.select(false)','href="/marketplace"','href="/campus-mate"','href="/updates"', "'/dashboard'","'/signin?next=%2Fdashboard'"]) assert.ok(bar.includes(action),action);
  assert.match(read('components/pwa/mobile-bottom-nav.tsx'),/pathname === '\/' \|\| HIDDEN_SECTIONS/);
  assert.match(header, /aria-label={`Messages, \${unread\.messages} unread`}/);
  assert.doesNotMatch(bar,/unread\.(messages|notifications)/);
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

test('own stories share one watch button, with a separate permission-checked composer',()=>{
  const expires_at=new Date(Date.now()+60000).toISOString();
  const rows=['other','mine1','mine2'].map(id=>({id,mine:id!=='other',author_name:id==='other'?'Ama':'Jo',ext:'jpg',expires_at}));
  let cursor=0;
  const state=[rows];
  const hooks={...React,useCallback:fn=>fn,useEffect:()=>{},useRef:value=>({current:value}),
    useState:initial=>{const i=cursor++;if(!(i in state))state[i]=initial;return [state[i],value=>{state[i]=value}]}};
  const {CampusStories}=testModules({react:hooks,'@/lib/supabase/client':{supabase:{}},
    '@/components/ui/button':{Button:'button'},'@/components/ui/dialog':{Dialog:'dialog',DialogContent:'div',DialogDescription:'p',DialogTitle:'h3'}})('components/feed/campus-stories.tsx');
  function render(canPost=true){
    cursor=0;
    const nodes=[];
    function walk(node){if(Array.isArray(node))return node.forEach(walk);if(node?.props){nodes.push(node);walk(node.props.children)}}
    walk(CampusStories({canPost,userId:'viewer',avatar:'avatar.jpg'}));
    return nodes;
  }
  const by=(nodes,label)=>nodes.find(n=>n.props['aria-label']===label);
  let nodes=render();
  assert.ok(by(nodes,'View story by Ama'));
  assert.equal(by(nodes,'View story by Jo'),undefined);
  by(nodes,'View your story').props.onClick();
  nodes=render();
  assert.ok(nodes.some(n=>n.props.src?.endsWith('id=mine1')));
  nodes.find(n=>n.props.children==='Next').props.onClick();
  assert.ok(render().some(n=>n.props.src?.endsWith('id=mine2')));
  assert.equal(by(render(false),'Add story'),undefined);
  by(render(),'Add story').props.onClick();
  assert.equal(render().find(n=>n.type==='dialog').props.open,true);
});
