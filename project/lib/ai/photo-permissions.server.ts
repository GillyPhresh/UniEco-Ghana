import 'server-only';
import { createHash } from 'node:crypto';
import { createResearchClient } from './research-service';
import { storyAsset,type PhotoStory } from './story-photo';

export function photoKey(story:PhotoStory) {
  const asset=storyAsset(story);
  return asset && createHash('sha256').update(JSON.stringify([asset.article,asset.url])).digest('hex');
}
export async function photoCredit(story:PhotoStory) {
  const key=photoKey(story), db=key && createResearchClient();
  if(!key)return undefined;
  if(!db)return null;
  const {data,error}=await db.from('editorial_photo_permissions').select('approved,credit').eq('asset_key',key).order('id',{ascending:false}).limit(1).maybeSingle();
  if(error)return null;
  return data?.approved && typeof data.credit==='string' ? data.credit as string : data?.approved===false ? null : undefined;
}
