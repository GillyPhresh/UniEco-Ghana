import {load} from 'cheerio/slim';
import {articleIdentity,cleanArticleUrl,sourceLink} from './public-source-url';
import {oneLine} from './update-copy';

export const wires = [
  {publisher:'3News', feed:'https://3news.com/feed.xml', hosts:['3news.com'], desk:'Ghanaian press'},
  {publisher:'BBC News', feed:'https://feeds.bbci.co.uk/news/world/rss.xml', hosts:['bbc.co.uk','bbc.com'], desk:'World'},
  {publisher:'MyJoyOnline', feed:'https://www.myjoyonline.com/feed/', hosts:['myjoyonline.com'], desk:'Ghanaian press'},
  {publisher:'BBC News', feed:'https://feeds.bbci.co.uk/news/entertainment_and_arts/rss.xml', hosts:['bbc.co.uk','bbc.com'], desk:'Culture'},
  {publisher:'Opportunities for Youth', feed:'https://opportunitiesforyouth.org/feed/', hosts:['opportunitiesforyouth.org'], desk:'Opportunity reports'},
  {publisher:'DAAD Ghana', feed:'https://www.daad-ghana.org/en/feed/', hosts:['daad-ghana.org'], desk:'Opportunity reports'},
] as const;
export type WireItem = {title:string; url:string; published:string; desk:string; publisher:string; thumbnail?:string};
const feedImageHosts:Record<string,readonly string[]> = {
  '3News':['media.3news.com','3news.com'], 'BBC News':['ichef.bbci.co.uk'],
  'MyJoyOnline':['myjoyonline.com'], 'Opportunities for Youth':['opportunitiesforyouth.org'], 'DAAD Ghana':['daad-ghana.org'],
};
const horizon = 48*3600_000;
export function parseWire(xml:string,spec:typeof wires[number]): WireItem[] {
  if(/<!DOCTYPE|<!ENTITY/i.test(xml)) return [];
  const $=load(xml,{xmlMode:true});
  return $('rss > channel > item').slice(0,60).toArray().flatMap(node=>{
    const item=$(node), url=sourceLink(item.children('link').text(),spec.feed,spec.hosts);
    const title=oneLine(item.children('title').text(),245),time=Date.parse(item.children('pubDate').text());
    if(!url || url.pathname==='/' || title.length<12 || !Number.isFinite(time)) return [];
    // Keep publisher boilerplate, sponsored material and index pages out of an editorial edition.
    if(/^(?:home(?:page)?|latest news|news room|breaking news|integrity,? creativity,? (?:and|&) excellence)$/i.test(title)
      || /^(?:advertorial|sponsored(?: post| content)?|paid partnership)\s*[:|–-]/i.test(title)
      || item.children('category').toArray().some(e=>/^(?:sponsored|advertorial|paid content)$/i.test($(e).text().trim()))
      || /^\/(?:tag|category|author|search|feed)(?:\/|$)/i.test(url.pathname))return [];
    if(spec.desk==='Opportunity reports' && !/scholarship|fellowship|internship|apprenticeship|call for applications/i.test(title))return [];
    const tags=spec.desk==='Opportunity reports' ? '' : item.children('category').map((_,e)=>$(e).text()).get().join(' ');
    const desk=/\b(showbiz|entertainment|music|celebrities)\b/i.test(tags)?'Culture':/\b(sport[s]?|football)\b/i.test(tags)?'Sport':spec.desk;
    const raw=item.children().toArray().find(n=>n.name==='media:thumbnail' ||
      (n.name==='media:content'||n.name==='enclosure') && (/^image\//i.test($(n).attr('type')||'') || $(n).attr('medium')==='image'));
    const image=raw && sourceLink($(raw).attr('url'),url.href,feedImageHosts[spec.publisher]||[]);
    const thumbnail=image && /\.(?:jpe?g|png|webp|avif)$/i.test(image.pathname) ? image.href : undefined;
    return [{title,url:cleanArticleUrl(url).href,published:new Date(time).toISOString(),publisher:spec.publisher,desk,...(thumbnail?{thumbnail}:{})}];
  });
}
// Interleave sources so a busy publisher can't displace the other desks.
export function assembleWire(groups:WireItem[][],now=Date.now(),limit=16) {
  const fresh=groups.map(g=>g.filter(x=>{const age=now-Date.parse(x.published);return age>=0 && age<=horizon}).sort((a,b)=>b.published.localeCompare(a.published)));
  const seen=new Set<string>(), result:WireItem[]=[];
  for(let i=0;i<Math.max(0,...fresh.map(g=>g.length));i++) for(const g of fresh){
    const x=g[i]; if(!x)continue;
    const url=articleIdentity(x.url),title=x.title.toLowerCase().replace(/[^\p{L}\p{N}]+/gu,' ').trim();
    if(!title||seen.has(url)||seen.has(title))continue;
    seen.add(url);seen.add(title);result.push(x);if(result.length>=limit)return result;
  }
  return result;
}
