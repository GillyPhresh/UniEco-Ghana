import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { discoverCampusItems } from '@/lib/campus-discovery';
import { readJsonLimited, RequestBodyTooLargeError } from '@/lib/http/read-json-limited';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const maxDuration = 60;

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { 'Cache-Control': 'private, no-store, max-age=0', 'X-Content-Type-Options': 'nosniff' } });
}

async function authorize() {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return { supabase, response: json({ error: 'Authentication required.' }, 401) };
  const { data: role, error: roleError } = await supabase.rpc('current_app_role');
  if (roleError) return { supabase, response: json({ error: 'Unable to verify management authority.' }, 503) };
  if (role !== 'super_admin') return { supabase, response: json({ error: 'Super administrator access required.' }, 403) };
  return { supabase, response: null };
}

export async function GET() {
  const auth = await authorize();
  if (auth.response) return auth.response;
  const [schools, leads] = await Promise.all([
    auth.supabase.from('universities').select('id, name, short_name, website_url').order('name').limit(250),
    auth.supabase.from('campus_discovery_listings')
      .select('id, university_id, listing_type, title, summary, location, starts_at, ends_at, source_url, source_label, external_url, status, first_seen_at, last_checked_at, expires_at, university:universities(name, short_name, slug)')
      .in('status', ['pending_review', 'published']).order('last_checked_at', { ascending: false }).limit(500),
  ]);
  if (schools.error) return json({ error: 'Unable to load the institution directory.' }, 503);
  if (leads.error) return json({ error: 'Campus discovery storage is not available yet. Apply migration 0197 before using this tool.' }, 503);
  return json({ schools: schools.data || [], listings: leads.data || [] });
}

export async function POST(request: Request) {
  const auth = await authorize();
  if (auth.response) return auth.response;
  let body: Record<string, unknown>;
  try { body = await readJsonLimited<Record<string, unknown>>(request, 16 * 1024); }
  catch (error) { return json({ error: error instanceof RequestBodyTooLargeError ? 'Request is too large.' : 'Invalid request body.' }, error instanceof RequestBodyTooLargeError ? 413 : 400); }

  if (body.action === 'scan') {
    const universityId = typeof body.universityId === 'string' ? body.universityId : '';
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(universityId)) return json({ error: 'Choose a valid institution.' }, 400);
    const { data: university, error } = await auth.supabase.from('universities').select('id, name, website_url').eq('id', universityId).maybeSingle();
    if (error || !university) return json({ error: 'Institution not found.' }, 404);
    const items = await discoverCampusItems(university);
    if (!items.length) return json({ discovered: 0, message: university.website_url ? 'No current structured event or business listings were found on this official site.' : 'This institution has no verified HTTPS website configured.' });
    const rows = items.map((item) => ({ ...item, university_id: university.id }));
    const { error: saveError } = await auth.supabase.from('campus_discovery_listings')
      .upsert(rows, { onConflict: 'university_id,source_fingerprint', ignoreDuplicates: true });
    if (saveError) return json({ error: 'Could not save discovered leads. Check that migration 0197 is applied.' }, 503);
    return json({ discovered: rows.length, message: `${rows.length} source-attributed leads were added to private review. Nothing was published.` });
  }

  if (body.action === 'review') {
    const id = typeof body.id === 'string' ? body.id : '';
    const status = body.status === 'published' || body.status === 'rejected' ? body.status : null;
    if (!status || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) return json({ error: 'Choose a valid lead and review decision.' }, 400);
    const { data, error } = await auth.supabase.from('campus_discovery_listings')
      .update({ status, reviewed_by: (await auth.supabase.auth.getUser()).data.user?.id, reviewed_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq('id', id).eq('status', 'pending_review').select('id').maybeSingle();
    if (error) return json({ error: 'Unable to save this review decision.' }, 503);
    if (!data) return json({ error: 'This lead was already reviewed or no longer exists.' }, 409);
    return json({ ok: true, status });
  }
  return json({ error: 'Unsupported action.' }, 400);
}
