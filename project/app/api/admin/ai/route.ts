import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { askUniEcoAi, createUniEcoAiDraft, isUniEcoAiConfigured, isUniEcoAiWebSearchAvailable, type UniEcoAiChatMessage } from '@/lib/ai/assistant';
import { fetchTrustedUniEcoAiUpdates, getTrustedUniEcoAiSources, type UniEcoAiUniversity } from '@/lib/ai/trusted-sources';
import { readJsonLimited, RequestBodyTooLargeError } from '@/lib/http/read-json-limited';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const maxDuration = 60;

function privateJson(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { 'Cache-Control': 'private, no-store, max-age=0', 'X-Content-Type-Options': 'nosniff' },
  });
}

async function requireSuperAdmin() {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return { supabase, error: privateJson({ error: 'Authentication required.' }, 401) };
  const { data: role, error: roleError } = await supabase.rpc('current_app_role');
  if (roleError) return { supabase, error: privateJson({ error: 'Unable to verify management authority.' }, 503) };
  if (role !== 'super_admin') return { supabase, error: privateJson({ error: 'Super administrator access required.' }, 403) };
  return { supabase, error: null };
}

export async function GET() {
  const auth = await requireSuperAdmin();
  if (auth.error) return auth.error;
  const { data: universities, error: directoryError, count } = await auth.supabase
    .from('universities')
    .select('name, slug, website_url', { count: 'exact' })
    .eq('is_enabled', true)
    .order('name')
    .limit(200);
  const directory = (universities || []) as UniEcoAiUniversity[];
  const sources = getTrustedUniEcoAiSources(directory);
  const covered = new Set(sources.filter((source) => source.id.startsWith('university-')).map((source) => source.id));
  return privateJson({
    configured: isUniEcoAiConfigured(),
    webSearchAvailable: isUniEcoAiWebSearchAvailable(),
    mode: isUniEcoAiConfigured() ? 'configured' : 'safe-fallback',
    capabilities: ['trusted_source_scan', 'admin_chat', 'draft_broadcast', 'system_snapshot'],
    sources,
    schoolCoverage: {
      total: count ?? directory.length,
      withOfficialWebsite: covered.size,
      directoryAvailable: !directoryError,
    },
  });
}

export async function POST(request: Request) {
  const auth = await requireSuperAdmin();
  if (auth.error) return auth.error;

  let body: Record<string, unknown>;
  try {
    body = await readJsonLimited<Record<string, unknown>>(request, 64 * 1024);
  } catch (error) {
    return privateJson({ error: error instanceof RequestBodyTooLargeError ? 'Request body is too large.' : 'Invalid request body.' }, error instanceof RequestBodyTooLargeError ? 413 : 400);
  }

  const action = typeof body.action === 'string' ? body.action : '';
  if (action === 'discover') {
    const sourceId = typeof body.sourceId === 'string' ? body.sourceId : undefined;
    const { data: universities, error: directoryError } = await auth.supabase
      .from('universities')
      .select('name, slug, website_url')
      .eq('is_enabled', true)
      .order('name')
      .limit(200);
    if (directoryError) return privateJson({ error: 'Unable to load the trusted university directory for this scan.' }, 503);
    const sources = getTrustedUniEcoAiSources((universities || []) as UniEcoAiUniversity[]);
    if (sourceId && !sources.some((source) => source.id === sourceId)) {
      return privateJson({ error: 'That source is not in the trusted source list. Refresh and try again.' }, 400);
    }
    const updates = await fetchTrustedUniEcoAiUpdates(sourceId, sources);
    return privateJson({ updates, checkedAt: new Date().toISOString(), sourcesChecked: sourceId ? 1 : sources.length });
  }

  if (action === 'chat') {
    const message = typeof body.message === 'string' ? body.message.trim().slice(0, 2_000) : '';
    if (!message) return privateJson({ error: 'A message is required.' }, 400);
    const rawMessages = Array.isArray(body.messages) ? body.messages : [];
    const messages: UniEcoAiChatMessage[] = rawMessages
      .filter((item): item is { role: string; content: string } => Boolean(item && typeof item === 'object' && typeof (item as { role?: unknown }).role === 'string' && typeof (item as { content?: unknown }).content === 'string'))
      .filter((item) => item.role === 'user' || item.role === 'assistant')
      .slice(-8)
      .map((item) => ({ role: item.role as 'user' | 'assistant', content: item.content.slice(0, 2_000) }));
    const { data: health } = await auth.supabase.rpc('get_admin_system_health_summary');
    const result = await askUniEcoAi({
      messages: [...messages, { role: 'user', content: message }],
      context: JSON.stringify({ systemHealth: health && typeof health === 'object' ? health : null }),
      webSearch: body.webSearch === true && isUniEcoAiWebSearchAvailable(),
    });
    return privateJson({ reply: result.text, mode: result.mode, citations: result.citations || [], webSearched: result.webSearched || false });
  }

  if (action === 'draft') {
    const update = body.update;
    const audience = body.audience === 'students' || body.audience === 'vendors' ? body.audience : 'all';
    if (!update || typeof update !== 'object') return privateJson({ error: 'A trusted source update is required.' }, 400);
    const sourceUpdate = update as { title?: unknown; summary?: unknown; url?: unknown; sourceLabel?: unknown };
    if (typeof sourceUpdate.title !== 'string' || typeof sourceUpdate.summary !== 'string' || typeof sourceUpdate.url !== 'string' || typeof sourceUpdate.sourceLabel !== 'string') {
      return privateJson({ error: 'The source update is incomplete.' }, 400);
    }
    try {
      const url = new URL(sourceUpdate.url);
      if (url.protocol !== 'https:') return privateJson({ error: 'Only secure source links are allowed.' }, 400);
    } catch {
      return privateJson({ error: 'The source link is invalid.' }, 400);
    }
    const draft = await createUniEcoAiDraft({
      update: { title: sourceUpdate.title.slice(0, 220), summary: sourceUpdate.summary.slice(0, 500), url: sourceUpdate.url, sourceLabel: sourceUpdate.sourceLabel.slice(0, 160) },
      audience,
    });
    const { data: draftId, error } = await auth.supabase.rpc('create_admin_broadcast_draft', {
      p_title: draft.title,
      p_body: draft.body,
      p_broadcast_type: 'update',
      p_target_audience: audience,
      p_target_filters: { ai_generated: true, source_url: sourceUpdate.url, source_label: sourceUpdate.sourceLabel },
      p_channels: ['in_app'],
      p_submit_for_approval: false,
    });
    if (error) return privateJson({ error: 'The draft was prepared but could not be saved to Broadcasts.' }, 503);
    return privateJson({ draftId, title: draft.title, mode: draft.mode });
  }

  return privateJson({ error: 'Unsupported AI action.' }, 400);
}
