import type { SupabaseClient } from '@supabase/supabase-js';

// An immutable draft can only publish during its first 15 minutes. After
// 48 hours even the latest allowed publication has already expired. Read
// access ends at 24h independently of this housekeeping job.
export async function cleanExpiredStories(db: SupabaseClient) {
  const cutoff = new Date(Date.now()-48*3_600_000).toISOString();
  const {data,error} = await db.from('campus_stories').select('id,author_id,ext')
    .lt('created_at',cutoff).order('created_at').limit(100);
  if(error) {
    if(error.code==='PGRST205' || error.code==='42P01') return; // before migration 0215
    throw new Error('Story retention query failed');
  }
  if(!data?.length)return;
  const paths=data.filter(row=>row.ext!=='text').map(row=>row.author_id+'/'+row.id+'.'+row.ext);
  if(paths.length && (await db.storage.from('campus-stories').remove(paths)).error) throw new Error('Story media retention failed');
  if((await db.from('campus_stories').delete().in('id',data.map(row=>row.id)).lt('created_at',cutoff)).error)
    throw new Error('Story record retention failed');
}
