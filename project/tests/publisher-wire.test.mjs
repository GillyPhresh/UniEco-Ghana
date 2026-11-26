import test from 'node:test';
import assert from 'node:assert/strict';
import {testModules} from './helpers/load-typescript.mjs';
const use=testModules();
const {parseWire,wires,assembleWire}=use('lib/ai/publisher-wire.ts');
const {openOpportunities}=use('lib/ai/opportunity-board.ts');
const now=Date.parse('2026-11-26T12:00:00Z');
test('RSS links stay on the publisher and double-encoded headlines display as text',()=>{
  const item=(link)=>'<item><title><![CDATA[Ghana&amp;#8217;s winning team]]></title><link>'+link+'</link><pubDate>Thu, 26 Nov 2026 07:00:00 GMT</pubDate><category>Football</category></item>';
  const xml='<rss><channel>'+item('https://3news.com/story/?utm_source=rss')+item('https://untrusted.example.com/stolen')+'</channel></rss>';
  const [s,...rest]=parseWire(xml,wires[0]);
  assert.deepEqual(rest,[]);assert.equal(s.title,'Ghana’s winning team');assert.equal(s.desk,'Sport');assert.equal(s.url,'https://3news.com/story/');
  assert.deepEqual(parseWire('<!DOCTYPE rss>'+xml,wires[0]),[]);
});
test('balanced recent edition without stale, duplicate, or future headlines even when a feed fails',()=>{
  const row=(i,age=0)=>({title:'Headline '+i,url:'https://3news.com/'+i,published:new Date(now-age).toISOString(),publisher:'3News',desk:'Ghana'});
  const rows=Array.from({length:21},(_,i)=>row(i));
  const world={...row('world'),publisher:'BBC News'};
  const edition=assembleWire([rows,[],[world,{...rows[0],url:'https://3news.com/another'},row('expired',49*3600000),row('future',-3600000)]],now);
  assert.equal(edition.length,16);assert.equal(edition[1].publisher,'BBC News');assert.equal(new Set(edition.map(x=>x.title)).size,16);
  assert.deepEqual(assembleWire([[row('expired',49*3600000),row('future',-1)]],now),[]);
});
test('local and overseas scholarships expire at their advertised date or time',()=>{
  assert.deepEqual(new Set(openOpportunities(now).map(n=>n.scope)),new Set(['Ghana','Abroad']));
  assert.equal(openOpportunities(Date.parse('2026-11-28T00:00:00Z')).length,2);
  assert.equal(openOpportunities(Date.parse('2026-12-07T00:00:00Z')).length,1);
  assert.equal(openOpportunities(Date.parse('2026-12-08T16:00:00Z')).length,0);
});
