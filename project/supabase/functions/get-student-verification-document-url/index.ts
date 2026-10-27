import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const URL_TTL_SECONDS = 300;
const corsHeaders = {
  'Access-Control-Allow-Origin': 'https://www.uniecoghana.com',
  'Access-Control-Allow-Headers': 'authorization, content-type, apikey, x-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  Vary: 'Origin',
};

type AuthorizedDocument = {
  bucket_id: string;
  object_path: string;
  owner_id: string;
};

function response(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json', 'Cache-Control': 'private, no-store' },
  });
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders });
  if (request.method !== 'POST') return response({ error: 'Method not allowed' }, 405);

  const authorization = request.headers.get('Authorization');
  if (!authorization?.match(/^Bearer\s+\S+$/i)) return response({ error: 'Authentication required' }, 401);

  let body: { studentProfileId?: unknown };
  try {
    body = await request.json();
  } catch {
    return response({ error: 'Invalid request body' }, 400);
  }
  if (typeof body.studentProfileId !== 'string' || !/^[0-9a-f-]{36}$/i.test(body.studentProfileId)) {
    return response({ error: 'Invalid student profile' }, 400);
  }

  const url = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !anonKey || !serviceRoleKey) return response({ error: 'Document service unavailable' }, 503);

  const caller = createClient(url, anonKey, { global: { headers: { Authorization: authorization } } });
  const { data: authData, error: authError } = await caller.auth.getUser();
  if (authError || !authData.user) return response({ error: 'Authentication required' }, 401);

  const { data: authorizationData, error: authorizationError } = await caller
    .rpc('authorize_student_verification_document_access', { p_student_profile_id: body.studentProfileId })
    .single();
  const authorizedDocument = authorizationData as AuthorizedDocument | null;
  if (authorizationError || !authorizedDocument) return response({ error: 'Document access denied' }, 403);

  if (
    authorizedDocument.bucket_id !== 'student-documents'
    || typeof authorizedDocument.object_path !== 'string'
    || typeof authorizedDocument.owner_id !== 'string'
    || !authorizedDocument.object_path.startsWith(`${authorizedDocument.owner_id}/`)
    || !/^[0-9a-f-]{36}\/[a-z0-9_-]{1,160}\.(jpg|jpeg|png|webp|pdf)$/i.test(authorizedDocument.object_path)
  ) {
    return response({ error: 'Invalid authorized document reference' }, 403);
  }

  const service = createClient(url, serviceRoleKey);
  const { data, error } = await service.storage
    .from('student-documents')
    .createSignedUrl(authorizedDocument.object_path, URL_TTL_SECONDS);
  if (error || !data?.signedUrl) return response({ error: 'Unable to create document URL' }, 500);
  return response({ signedUrl: data.signedUrl, expiresIn: URL_TTL_SECONDS });
});
