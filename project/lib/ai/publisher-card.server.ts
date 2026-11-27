import 'server-only';
import { lookupPublisherItem } from './publisher-wire.server';
import { openOpportunities } from './opportunity-board';
import type { FlyerItem } from './flyer';

// The browser supplies a lookup key only. Never fetch a user-supplied article or image.
export async function publisherCard(key:string):Promise<FlyerItem|null> {
  if(!key || key.length>2048 || !key.startsWith('https://')) return null;
  const notice=openOpportunities(Date.now()).find(n=>n.url===key);
  if(notice) return {id:key,source_id:'issuer-notice',source_kind:'opportunities',title:notice.title,
    published_at:null,category:'opportunities',source_label:notice.issuer,university_name:'',canonical_url:notice.url,
    excerpt:'Deadline: '+notice.deadline+'. '+notice.detail};
  const row=await lookupPublisherItem(key);
  if(!row)return null;
  const lead=row.desk==='Opportunity reports';
  return {id:key,source_id:'publisher-wire',source_kind:lead?'opportunities':'news',title:row.title,
    category:lead?'opportunities':'news',published_at:row.published,source_label:row.publisher,university_name:'',
    canonical_url:row.url,excerpt:lead?'Publisher lead. Confirm eligibility and closing dates with the issuing organisation.':'',
    media_url:row.thumbnail||null,media_type:row.thumbnail?'image':null};
}
