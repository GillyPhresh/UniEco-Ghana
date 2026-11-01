import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';
const noStore = { 'Cache-Control': 'private, no-store, max-age=0', 'X-Content-Type-Options': 'nosniff' };
const maxReviewBodyBytes = 8 * 1024;

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: noStore });
}

async function requireSuperAdmin() {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return { supabase: null, error: json({ error: 'Authentication required.' }, 401) };
  const { data: role, error: roleError } = await supabase.rpc('current_app_role');
  if (roleError) return { supabase: null, error: json({ error: 'Unable to verify management authority.' }, 503) };
  if (role !== 'super_admin') return { supabase: null, error: json({ error: 'Super administrator access required.' }, 403) };
  return { supabase, error: null };
}

export async function GET(request: Request) {
  const auth = await requireSuperAdmin();
  if (auth.error || !auth.supabase) return auth.error;
  const requested = new URL(request.url).searchParams.get('status') || 'pending';
  if (!['pending', 'approved', 'rejected'].includes(requested)) return json({ error: 'Invalid queue filter.' }, 400);
  const { data, error } = await auth.supabase.rpc('get_campus_feed_review_items', { p_status: requested });
  if (error) return json({ error: 'Unable to load the campus feed review queue.' }, 503);
  return json({ items: data || [] });
}

export async function POST(request: Request) {
  const auth = await requireSuperAdmin();
  if (auth.error || !auth.supabase) return auth.error;
  if (Number(request.headers.get('content-length') || 0) > maxReviewBodyBytes || !request.body) return json({ error: 'Invalid review request.' }, 400);
  let body: unknown;
  try {
    const reader = request.body.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxReviewBodyBytes) { await reader.cancel(); return json({ error: 'Invalid review request.' }, 400); }
      chunks.push(value);
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    body = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  } catch { return json({ error: 'Invalid request body.' }, 400); }
  if (!body || typeof body !== 'object' || Array.isArray(body)) return json({ error: 'Invalid review request.' }, 400);
  const value = body as Record<string, unknown>;
  if (typeof value.id !== 'string' || !/^[0-9a-f-]{36}$/i.test(value.id)
    || !['approved', 'rejected'].includes(String(value.decision))
    || typeof value.reason !== 'string' || value.reason.trim().length < 10 || value.reason.trim().length > 500) {
    return json({ error: 'A valid item, decision, and 10–500 character review note are required.' }, 400);
  }
  const { data, error } = await auth.supabase.rpc('moderate_campus_feed_item', {
    p_item_id: value.id, p_decision: value.decision, p_reason: value.reason.trim(),
  });
  if (error) return json({ error: 'The feed item could not be reviewed.' }, 503);
  return json({ result: data });
}
