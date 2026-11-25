import { createClient } from '@/lib/supabase/server';
import { createClient as storageClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';
export async function GET(request: Request) {
  const headers = { 'Cache-Control': 'private, no-store', 'Referrer-Policy': 'no-referrer' };
  const id = new URL(request.url).searchParams.get('id');
  if (!id || !/^[\da-f]{8}-(?:[\da-f]{4}-){3}[\da-f]{12}$/i.test(id)) return new Response(null,{ status:400,headers });
  const db = await createClient();
  const {data:{user}} = await db.auth.getUser();
  if (!user) return new Response(null,{status:401,headers});
  const {data,error} = await db.rpc('active_campus_stories',{p_id:id}).maybeSingle();
  const row = data as {media_path:string|null;expires_at:string}|null;
  if (error || !row?.media_path) return new Response(null,{status:404,headers});
  const ttl = Math.min(60,Math.floor((Date.parse(row.expires_at)-Date.now())/1000));
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const origin = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!(ttl>0) || !key || !origin) return new Response(null,{status:404,headers});
  const storage = storageClient(origin,key,{auth:{persistSession:false,autoRefreshToken:false}});
  const signed = await storage.storage.from('campus-stories').createSignedUrl(row.media_path,ttl);
  if (!signed.data?.signedUrl) return new Response(null,{status:503,headers});
  return new Response(null,{status:307,headers:{...headers,Location:signed.data.signedUrl}});
}
