import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import {testModules} from './helpers/load-typescript.mjs';
test('only an authorised editor can save a matching asset with evidence; inspection never writes',async()=>{
 let auth=false,writes=[];
 const use=testModules({
  '@/lib/ai/admin-access':{requireResearchAdmin:async()=>auth?{ok:true,userId:'editor'}:{ok:false,error:new Response(null,{status:403})},acceptsAdminMutation:()=>true,privateJson:(d,status=200)=>Response.json(d,{status})},
  '@/lib/ai/research-catalog':{campusFeedUuid:/^never$/},'@/lib/ai/research-service':{createResearchClient:()=>({from:()=>({insert:async r=>{writes.push(r);return {error:null};}})})},
  '@/lib/ai/story-photo-wire.server':{withWirePhoto:async r=>r},
  '@/lib/ai/photo-permissions.server':{photoKey:()=>'expected',photoCredit:async()=>null},'@/lib/ai/publisher-card.server':{publisherCard:async k=>k===story.canonical_url?story:null},
 });
 const post=use('app/api/admin/campus-feed/photo-permission/route.ts').POST;
 const send=b=>post(new Request('https://unieco.test/review',{method:'POST',body:JSON.stringify({id:story.canonical_url,...b})}));
 assert.equal((await send({action:'inspect'})).status,403);auth=true;
 assert.equal((await (await send({action:'inspect'})).json()).asset,'expected');assert.equal(writes.length,0);
 assert.equal((await send({action:'allow',asset:'changed'})).status,409);
 assert.equal((await send({action:'allow',asset:'expected',credit:'AP'})).status,400);
 assert.equal((await send({action:'allow',asset:'expected',credit:'Photo desk',evidence:'Permission fixture'})).status,200);
 assert.equal(writes.length,1);assert.equal(writes[0].reviewer,'editor');
});
const story={id:'example',title:'A real source report for the news desk',canonical_url:'https://3news.com/news/item',source_id:'publisher-wire',source_kind:'news',media_url:'https://media.3news.com/story.webp',media_type:'image',source_label:'3News',excerpt:'',category:'news',published_at:null};
test('a reviewed record missing its image recovers only its exact publisher feed photo',async()=>{
 let reads=0;
 const use=testModules({'server-only':{},'./publisher-wire.server':{lookupPublisherItem:async url=>{reads++;return url===story.canonical_url?{thumbnail:story.media_url}:undefined;}}});
 const {withWirePhoto}=use('lib/ai/story-photo-wire.server.ts');
 const old={...story,media_url:null,media_type:null};
 assert.equal((await withWirePhoto(old)).media_url,story.media_url);
 assert.equal((await withWirePhoto({...old,canonical_url:'https://3news.com/news/other'})).media_url,null);
 await withWirePhoto(story);assert.equal(reads,2);
});
test('permission binds one article and exact asset, not another CDN or story',()=>{
 const use=testModules({'server-only':{},'./research-service':{}});
 const {photoKey}=use('lib/ai/photo-permissions.server.ts');
 assert.ok(photoKey(story));assert.notEqual(photoKey(story),photoKey({...story,media_url:'https://media.3news.com/other.webp'}));
 assert.notEqual(photoKey(story),photoKey({...story,canonical_url:'https://3news.com/other'}));
 assert.equal(photoKey({...story,media_url:'https://unknown.org/a.jpg'}),null);
});
test('real raster export uses the exact cleared source photo and prints its credit',async()=>{
 const bytes=await sharp({create:{width:720,height:480,channels:3,background:'#dc3355'}}).webp().toBuffer();
 const reads=[];
 const use=testModules({'./publisher-fetch':{publisherDeadline:()=>new AbortController().signal,fetchPublisher:async(url,hosts,opts)=>{reads.push(url);assert.deepEqual(hosts,['media.3news.com']);assert.equal(opts.allowsPath(new URL(url)),true);assert.equal(opts.allowsPath(new URL('https://media.3news.com/other.webp')),false);return {bytes,indexable:true,imagesAllowed:true,url};}},'./publisher-policy':{loadPublisherPolicy:async()=>({}),allowsPublisherPath:()=>true}});
 const {renderUpdateFlyer}=use('lib/ai/flyer.tsx');
 const response=await renderUpdateFlyer({...story,clearedCredit:'Test photographer'},{format:'jpeg'});
 const img=sharp(Buffer.from(await response.arrayBuffer()));
 assert.deepEqual(reads,[story.media_url]);assert.equal(response.headers.get('X-UniEco-Photo-Type'),'story');
 const pixel=await img.extract({left:540,top:400,width:1,height:1}).raw().toBuffer();assert.ok(pixel[0]>195&&pixel[1]<85);
});
test('every desk exports a portrait JPEG with the resolved visual embedded, even without a source photo',async()=>{
 const use=testModules({'./publisher-policy':{loadPublisherPolicy:async()=>{throw Error('No verified image')}}});
 for(const [title,category,kind] of [['World leaders meet','news','illustration'],['Premature BECE: assessment of candidates','news','illustrative'],['Graduate scholarship in Ghana','opportunities','illustrative'],['Campus notice','events','illustration']]){
   const item={...story,title,category,clearedCredit:null};
   const r=await use('lib/ai/flyer.tsx').renderUpdateFlyer(item,{format:'jpeg',download:true});
   const img=sharp(Buffer.from(await r.arrayBuffer()));
   const m=await img.metadata();assert.deepEqual([m.format,m.width,m.height],['jpeg',1080,1440]);
   assert.equal(r.headers.get('X-UniEco-Photo-Type'),kind);
   assert.match(r.headers.get('Content-Disposition'),/attachment/);
   const visual=await use('lib/ai/flyer-media.ts').resolveFlyerVisual({...item,licensedOnly:true},false);
   const expected=sharp(Buffer.from(visual.background.src.split(',')[1],'base64'));
   const region={left:220,top:220,width:580,height:360};
   const sample=image=>image.extract(region).resize(8,8).removeAlpha().raw().toBuffer();
   const [a,b]=await Promise.all([sample(img),sample(expected)]);
   assert.ok(a.every((v,i)=>Math.abs(v-b[i])<12),'the exported hero must match the selected visual');
 }
});
test('batch counts conflicts accurately and stops on loss of management access',async()=>{
 const {publishEdition}=testModules()('lib/ai/publish-edition.ts');
 const statuses=[200,409,200,403,200];let calls=0;
 const r=await publishEdition(statuses.map((_,i)=>({id:String(i),updated_at:'version'})),async()=>{const status=statuses[calls++];return {status,ok:status===200}},()=>{});
 assert.deepEqual(r,{published:2,unconfirmed:3});assert.equal(calls,4);
});
test('publisher wire excludes advertorial and index URLs without discarding original reports',()=>{
 const {wires,parseWire}=testModules()('lib/ai/publisher-wire.ts');
 const item=(url,tag)=>'<item><title>A timely original report</title><link>https://3news.com/'+url+'</link><pubDate>27 Nov 2026 11:00:00 GMT</pubDate><category>'+tag+'</category></item>';
 const rows=parseWire('<rss><channel>'+item('news/report','News')+item('tag/politics','Politics')+item('news/ad','Advertorial')+'</channel></rss>',wires[0]);assert.equal(rows.length,1);assert.equal(rows[0].url,'https://3news.com/news/report');
});
