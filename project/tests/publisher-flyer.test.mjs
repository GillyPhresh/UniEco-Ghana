import test from 'node:test';
import assert from 'node:assert/strict';
import {testModules} from './helpers/load-typescript.mjs';
const use=testModules();
const {wires,parseWire}=use('lib/ai/publisher-wire.ts');
test('uses only image media belonging to the individual feed item and trusted image host',()=>{
 const xml=u=>'<rss><channel><item><title>Source headline with picture</title><link>https://3news.com/news/story</link><pubDate>27 Nov 2026 01:00:00 GMT</pubDate><enclosure type="image/jpeg" url="'+u+'"/></item></channel></rss>';
 assert.equal(parseWire(xml('https://media.3news.com/story.webp'),wires[0])[0].thumbnail,'https://media.3news.com/story.webp');
 assert.equal(parseWire(xml('https://unrelated.org/story.jpg'),wires[0])[0].thumbnail,undefined);
 assert.equal(parseWire(xml('https://media.3news.com/story.svg'),wires[0])[0].thumbnail,undefined);
});
test('an earlier newsletter H1 does not hide the matched article photo; metadata alone is insufficient',()=>{
 const {findFlyerPhotoEvidence}=use('lib/ai/flyer-image-evidence.ts'),url=new URL('https://www.myjoyonline.com/report/'),title='Grid power report',photo='https://www.myjoyonline.com/report.jpg';
 const markup='<h1>Newsletter</h1><meta property="og:image" content="'+photo+'"><div class="article-body"><h1>'+title+'</h1><p>'+('Report text '.repeat(12))+'</p><img src="'+photo+'"></div>';
 assert.equal(findFlyerPhotoEvidence(markup,url,title,'',{publisher:'MyJoyOnline'}).background.url,photo);
 assert.equal(findFlyerPhotoEvidence(markup,url,title,'').background,undefined);
 assert.equal(findFlyerPhotoEvidence(markup,url,'Another story','',{publisher:'MyJoyOnline'}).background,undefined);
});
test('publisher exports use only current catalogue data and never copy request-supplied content',async()=>{
 const url='https://3news.com/news/story', row={url,title:'Real headline',published:'2026-11-27T01:00:00Z',desk:'Ghanaian press',publisher:'3News'};
 const use=testModules({'server-only':{},'./publisher-wire.server':{lookupPublisherItem:async key=>key===url?row:undefined}});
 const {publisherCard}=use('lib/ai/publisher-card.server.ts');
 assert.equal((await publisherCard(url)).title,row.title);
 assert.equal(await publisherCard('https://3news.com/not-on-the-wire'),null);
 assert.equal(await publisherCard('https://unrelated.org/'),null);
});
test('publisher JPEG download rechecks the item even on a cached render',async()=>{
 const url='https://3news.com/news/story';let listed=true,renders=0;
 const use=testModules({
   '@/lib/supabase/server':{createClient:()=>{throw Error('Not a reviewed-row lookup');}},
   '@/lib/ai/publisher-card.server':{publisherCard:async key=>listed&&key===url?{id:url,title:'Real headline',canonical_url:url}:null},
   '@/lib/ai/flyer':{renderUpdateFlyer:async(data,opts)=>{renders++;assert.equal(data.title,'Real headline');assert.equal(opts.format,'jpeg');return new Response(new Uint8Array([255,216,255,217]));}}
 });
 const get=use('app/api/campus-feed/alert-card/route.tsx').GET;
 const req=new Request('https://www.uniecoghana.com/api/campus-feed/alert-card?publisher='+encodeURIComponent(url)+'&format=jpeg&download=1');
 const response=await get(req);assert.equal(response.status,200);assert.match(response.headers.get('content-disposition'),/^attachment/);
 assert.equal(response.headers.get('content-type'),'image/jpeg');await get(req);assert.equal(renders,1);
 listed=false;assert.equal((await get(req)).status,404);
});
