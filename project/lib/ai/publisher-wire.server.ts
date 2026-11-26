import 'server-only';
import {unstable_cache} from 'next/cache';
import {fetchPublisher} from './publisher-fetch';
import {publisherHost} from './public-source-url';
import {wires,parseWire,assembleWire} from './publisher-wire';

const reads = wires.map(source=>unstable_cache(async()=>{
  const host=publisherHost(new URL(source.feed).hostname);
  const doc=await fetchPublisher(source.feed,[host],{maxBytes:768*1024,timeoutMs:4500,mimeTypes:['application/rss+xml','application/xml','text/xml']});
  if(!doc.indexable) return [];
  return parseWire(doc.bytes.toString('utf8'),source);
},['publisher-headline-wire-v1',source.feed],{revalidate:900}));
export async function getPublisherWire(){
  const groups=await Promise.all(reads.map(read=>read().catch(()=>[])));
  const news=assembleWire(groups.map(g=>g.filter(x=>x.desk!=='Opportunity reports')));
  const opportunities=assembleWire(groups.map(g=>g.filter(x=>x.desk==='Opportunity reports')),Date.now(),4);
  return [...news,...opportunities];
}
