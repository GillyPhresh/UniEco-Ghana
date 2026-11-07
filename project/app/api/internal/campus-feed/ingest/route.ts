import { timingSafeEqual } from 'node:crypto';
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const noStore = { 'Cache-Control': 'no-store, max-age=0', 'X-Content-Type-Options': 'nosniff' };
const categories = new Set(['news', 'events', 'opportunities', 'research', 'notices', 'campus_life']);
const maxBodyBytes = 160 * 1024;

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: noStore });
}

function tokenMatches(request: Request): boolean {
  const expected = process.env.UNIECO_FEED_INGEST_TOKEN || '';
  const provided = request.headers.get('authorization')?.match(/^Bearer\s+(.+)$/i)?.[1] || '';
  const expectedBytes = Buffer.from(expected);
  const providedBytes = Buffer.from(provided);
  if (expectedBytes.length < 32 || providedBytes.length !== expectedBytes.length) return false;
  return timingSafeEqual(providedBytes, expectedBytes);
}

async function readBoundedJson(request: Request): Promise<unknown> {
  const declared = Number(request.headers.get('content-length') || 0);
  if (declared > maxBodyBytes || !request.body) throw new Error('invalid_body');
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    length += value.byteLength;
    if (length > maxBodyBytes) {
      await reader.cancel();
      throw new Error('invalid_body');
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function validUrl(value: unknown, required: boolean): value is string | null {
  if (value === null || value === undefined || value === '') return !required;
  if (typeof value !== 'string' || value.length > 2048) return false;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password && !url.port;
  } catch { return false; }
}

function validateItems(value: unknown): Record<string, unknown>[] | null {
  if (!isRecord(value) || !Array.isArray(value.items) || value.items.length < 1 || value.items.length > 80) return null;
  const output: Record<string, unknown>[] = [];
  for (const raw of value.items) {
    if (!isRecord(raw)) return null;
    const { source_id, source_item_key, title, excerpt, canonical_url, published_at, media_url, media_type, category } = raw;
    if (typeof source_id !== 'string' || !/^[a-z0-9-]{2,48}$/.test(source_id)
      || typeof source_item_key !== 'string' || !/^[a-f0-9]{64}$/.test(source_item_key)
      || typeof title !== 'string' || title.trim().length < 8 || title.length > 220
      || typeof excerpt !== 'string' || excerpt.length > 600
      || !validUrl(canonical_url, true)
      || !validUrl(media_url, false)
      || (media_url ? !['image', 'video'].includes(String(media_type)) : media_type !== null && media_type !== undefined)
      || !categories.has(String(category))) return null;
    if (published_at !== null && published_at !== undefined) {
      if (typeof published_at !== 'string' || published_at.length > 40
        || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:?\d{2})$/.test(published_at)
        || Number.isNaN(Date.parse(published_at))) return null;
    }
    output.push({ source_id, source_item_key, title: title.trim(), excerpt: excerpt.trim(), canonical_url, published_at: published_at || null, media_url: media_url || null, media_type: media_url ? media_type : null, category });
  }
  return output;
}

export async function POST(request: Request) {
  if (!tokenMatches(request)) return json({ error: 'Ingestion is not authorized.' }, 401);
  let body: unknown;
  try { body = await readBoundedJson(request); }
  catch { return json({ error: 'Invalid or oversized feed batch.' }, 400); }
  const items = validateItems(body);
  if (!items) return json({ error: 'Feed batch failed validation.' }, 400);

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) return json({ error: 'Feed ingestion is not configured.' }, 503);
  const supabase = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await supabase.rpc('ingest_campus_feed_items', { p_items: items });
  if (error) return json({ error: 'Feed batch could not be queued for review.' }, 503);
  const result = isRecord(data) ? data : {};
  return json({ accepted: Number(result.accepted) || 0, ignored: Number(result.ignored) || 0, status: 'pending_review' });
}

export async function GET(request: Request) {
  if (!tokenMatches(request)) return json({ error: 'Feed source access is not authorized.' }, 401);
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) return json({ error: 'Feed ingestion is not configured.' }, 503);
  const supabase = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
  let { data, error } = await supabase
    .from('campus_feed_sources')
    .select('id, label, university_name, website_url, feed_url, source_domain, source_kind')
    .eq('enabled', true)
    .order('label')
    .limit(120);
  // Keep the existing campus worker online during the short window before
  // migration 0186 is applied. The opportunity sources appear after migration.
  if (error) {
    const legacy = await supabase
      .from('campus_feed_sources')
      .select('id, label, university_name, website_url, feed_url, source_domain')
      .eq('enabled', true)
      .order('label')
      .limit(120);
    data = (legacy.data || []).map((source) => ({ ...source, source_kind: 'campus' }));
    error = legacy.error;
  }
  if (error) return json({ error: 'Trusted feed sources could not be loaded.' }, 503);
  return json({ sources: data || [] });
}
