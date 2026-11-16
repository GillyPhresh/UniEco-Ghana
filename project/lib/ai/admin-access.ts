import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { siteConfig } from '@/lib/constants/site';

export const privateResponseHeaders = { 'Cache-Control': 'private, no-store, max-age=0', 'X-Content-Type-Options': 'nosniff', 'X-Robots-Tag': 'noindex, nofollow' };

export function privateJson(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: privateResponseHeaders });
}

export async function requireResearchAdmin() {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return { ok: false, error: privateJson({ error: 'Authentication required.' }, 401) } as const;
  const { data: role, error: roleError } = await supabase.rpc('current_app_role');
  if (roleError) return { ok: false, error: privateJson({ error: 'Unable to verify management authority.' }, 503) } as const;
  if (role !== 'super_admin') return { ok: false, error: privateJson({ error: 'Super administrator access required.' }, 403) } as const;
  return { ok: true, supabase, userId: user.id } as const;
}

export function acceptsAdminMutation(request: Request) {
  const origin = request.headers.get('origin');
  const fetchSite = request.headers.get('sec-fetch-site');
  return (!fetchSite || fetchSite === 'same-origin')
    && Boolean(origin && [new URL(request.url).origin, new URL(siteConfig.url).origin].includes(origin))
    && request.headers.get('content-type')?.split(';')[0].trim().toLowerCase() === 'application/json';
}
