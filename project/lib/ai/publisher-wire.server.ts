import 'server-only';
import {unstable_cache} from 'next/cache';
import {fetchPublisher} from './publisher-fetch';
import {articleIdentity,publisherHost} from './public-source-url';
import {wires,parseWire,assembleWire} from './publisher-wire';

const reads = wires.map(source=>unstable_cache(async()=>{
  const host=publisherHost(new URL(source.feed).hostname);
  const doc=await fetchPublisher(source.feed,[host],{maxBytes:768*1024,timeoutMs:4500,mimeTypes:['application/rss+xml','application/xml','text/xml']});
  if(!doc.indexable) return [];
  const rows=parseWire(doc.bytes.toString('utf8'),source);
  return doc.imagesAllowed===false ? rows.map(row=>({...row,thumbnail:undefined})) : rows;
},['publisher-headline-wire-v3',source.feed],{revalidate:900}));
export async function getPublisherWire(){
  const groups=await Promise.all(reads.map(read=>read().catch(()=>[])));
  const news=assembleWire(groups.map(g=>g.filter(x=>x.desk!=='Opportunity reports')));
  const opportunities=assembleWire(groups.map(g=>g.filter(x=>x.desk==='Opportunity reports')),Date.now(),4);
  return [...news,...opportunities];
}

// An item can drop out of the homepage top 16 while someone is sharing it.
export async function lookupPublisherItem(url:string){
  const batches=await Promise.all(reads.map(read=>read().catch(()=>[])));
  let key:string;
  try { key=articleIdentity(url); } catch { return undefined; }
  return assembleWire(batches,Date.now(),360).find(item=>articleIdentity(item.url)===key);
}
