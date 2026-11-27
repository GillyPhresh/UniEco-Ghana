import { acceptsAdminMutation,privateJson,requireResearchAdmin } from '@/lib/ai/admin-access';
import { campusFeedUuid } from '@/lib/ai/research-catalog';
import { createResearchClient } from '@/lib/ai/research-service';
import { publisherCard } from '@/lib/ai/publisher-card.server';
import { photoKey,photoCredit } from '@/lib/ai/photo-permissions.server';
import { storyAsset } from '@/lib/ai/story-photo';
import { withWirePhoto } from '@/lib/ai/story-photo-wire.server';
import { readJsonLimited } from '@/lib/http/read-json-limited';

export async function POST(request:Request) {
  const auth=await requireResearchAdmin(); if(!auth.ok)return auth.error;
  if(!acceptsAdminMutation(request))return privateJson({error:'Management origin required.'},403);
  let input:{id?:string;action?:string;asset?:string;credit?:string;evidence?:string};
  try {input=await readJsonLimited(request,8192);}catch{return privateJson({error:'Invalid request.'},400);}
  if(!input || typeof input.id!=='string'|| input.id.length>2048 || !['inspect','allow','revoke'].includes(input.action||''))return privateJson({error:'Invalid story decision.'},400);
  const db=createResearchClient(); if(!db)return privateJson({error:'Review service unavailable.'},503);
  const record=campusFeedUuid.test(input.id)?(await db.from('campus_feed_items').select('canonical_url,media_type,media_url').eq('id',input.id).in('status',['pending','approved']).maybeSingle()).data:await publisherCard(input.id);
  const story=record && await withWirePhoto(record);
  const asset=story && storyAsset(story), key=story && photoKey(story);
  if(!asset||!key)return privateJson({error:'No eligible source photo for this story.'},404);
  if(input.action==='inspect')return privateJson({asset:key,url:asset.url,source:asset.article,credit:await photoCredit(story)||''});
  if(input.asset!==key)return privateJson({error:'The source photo changed. Review the current photo first.'},409);
  if(typeof input.credit!=='string'||!input.credit.trim()||input.credit.length>90||typeof input.evidence!=='string'||input.evidence.trim().length<8||input.evidence.length>500)return privateJson({error:'Enter the photo credit and permission reference.'},400);
  const {error}=await db.from('editorial_photo_permissions').insert({asset_key:key,approved:input.action==='allow',credit:input.credit.trim(),evidence:input.evidence.trim(),reviewer:auth.userId});
  return error?privateJson({error:'Permission was not saved.'},503):privateJson({saved:true});
}
