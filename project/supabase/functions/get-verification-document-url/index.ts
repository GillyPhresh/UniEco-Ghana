import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, content-type' };
const URL_TTL_SECONDS = 300;

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return Response.json({ error: 'Method not allowed' }, { status: 405, headers: corsHeaders });
  const authorization = request.headers.get('Authorization');
  if (!authorization) return Response.json({ error: 'Authentication required' }, { status: 401, headers: corsHeaders });
  const { documentId } = await request.json().catch(() => ({}));
  if (typeof documentId !== 'string') return Response.json({ error: 'documentId is required' }, { status: 400, headers: corsHeaders });
  const url = Deno.env.get('SUPABASE_URL')!;
  const anon = Deno.env.get('SUPABASE_ANON_KEY')!;
  const caller = createClient(url, anon, { global: { headers: { Authorization: authorization } } });
  const { data: authData, error: authError } = await caller.auth.getUser();
  if (authError || !authData.user) return Response.json({ error: 'Authentication required' }, { status: 401, headers: corsHeaders });
  const { data: authorizationData, error: authorizationError } = await caller.rpc('authorize_verification_document_access', { p_document_id: documentId }).single();
  if (authorizationError || !authorizationData) return Response.json({ error: 'Document access denied' }, { status: 403, headers: corsHeaders });
  if (authorizationData.bucket_id !== 'vendor-documents' || typeof authorizationData.object_path !== 'string' || typeof authorizationData.owner_id !== 'string' || !authorizationData.object_path.startsWith(`${authorizationData.owner_id}/`)) {
    return Response.json({ error: 'Invalid authorized document reference' }, { status: 403, headers: corsHeaders });
  }
  const service = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const { data, error } = await service.storage.from('vendor-documents').createSignedUrl(authorizationData.object_path, URL_TTL_SECONDS);
  if (error || !data?.signedUrl) return Response.json({ error: 'Unable to create document URL' }, { status: 500, headers: corsHeaders });
  return Response.json({ signedUrl: data.signedUrl, expiresIn: URL_TTL_SECONDS }, { headers: corsHeaders });
});
