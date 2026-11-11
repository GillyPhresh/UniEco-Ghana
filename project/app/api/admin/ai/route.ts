import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { askUniEcoAi, createUniEcoAiDraft, type UniEcoAiChatMessage } from '@/lib/ai/assistant';
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
    mode: 'provider-free',
    providerFree: true,
    capabilities: ['trusted_source_scan', 'admin_chat', 'draft_broadcast', 'queue_public_update_review', 'system_snapshot'],
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
  if (action === 'test') {
    return privateJson({ ok: true, mode: 'provider-free', message: 'UniEco Intelligence is ready. It uses the built-in assistant and makes no paid AI-provider requests.' });
  }

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
      // Live AI web search is intentionally disabled: the built-in assistant
      // does not call a metered provider. Public-source scans are separate.
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
      if (sourceUpdate.url.length > 650 || url.protocol !== 'https:' || url.username || url.password || (url.port && url.port !== '443')) {
        return privateJson({ error: 'Only secure public source links are allowed.' }, 400);
      }
      const { data: universities, error: directoryError } = await auth.supabase
        .from('universities')
        .select('name, slug, website_url')
        .eq('is_enabled', true)
        .order('name')
        .limit(200);
      if (directoryError) return privateJson({ error: 'Unable to verify this trusted source.' }, 503);
      const trustedSources = getTrustedUniEcoAiSources((universities || []) as UniEcoAiUniversity[]);
      const trustedSource = trustedSources.find((source) => {
        if (source.label !== sourceUpdate.sourceLabel) return false;
        try {
          const sourceHost = new URL(source.url).hostname.toLowerCase();
          const updateHost = url.hostname.toLowerCase();
          return updateHost === sourceHost || updateHost.endsWith(`.${sourceHost}`);
        } catch { return false; }
      });
      if (!trustedSource) return privateJson({ error: 'This lead does not match an approved trusted source. Scan trusted sources again and retry.' }, 400);
    } catch {
      return privateJson({ error: 'The source link is invalid.' }, 400);
    }
    const draft = await createUniEcoAiDraft({
      update: { title: sourceUpdate.title.slice(0, 220), summary: sourceUpdate.summary.slice(0, 500), url: sourceUpdate.url, sourceLabel: sourceUpdate.sourceLabel.slice(0, 160) },
      audience,
    });
    const { data: prepared, error } = await auth.supabase.rpc('prepare_admin_ai_update', {
      p_title: sourceUpdate.title.slice(0, 220),
      p_summary: sourceUpdate.summary.slice(0, 500),
      p_source_url: sourceUpdate.url,
      p_source_label: sourceUpdate.sourceLabel.slice(0, 160),
      p_broadcast_title: draft.title,
      p_broadcast_body: draft.body,
      p_target_audience: audience,
    });
    if (error) {
      const message = error.message.includes('not enabled for the public Campus Updates feed')
        ? 'This site is trusted for scanning but is not yet enabled as a public Campus Updates source.'
        : 'The story could not be queued for review. No public post or broadcast was sent.';
      return privateJson({ error: message }, 503);
    }
    const result = prepared && typeof prepared === 'object' ? prepared as Record<string, unknown> : {};
    return privateJson({
      feedItemId: result.feedItemId,
      feedStatus: result.feedStatus,
      broadcastId: result.broadcastId,
      broadcastStatus: result.broadcastStatus,
      title: draft.title,
      mode: draft.mode,
    });
  }

  if (action === 'queue_existing_broadcast') {
    const broadcastId = typeof body.broadcastId === 'string' ? body.broadcastId : '';
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(broadcastId)) {
      return privateJson({ error: 'Select a valid source-linked broadcast.' }, 400);
    }
    const { data: broadcast, error: broadcastError } = await auth.supabase
      .from('admin_broadcasts')
      .select('id, title, body, broadcast_type, target_audience, target_filters, status')
      .eq('id', broadcastId)
      .maybeSingle();
    if (broadcastError) return privateJson({ error: 'Unable to load this broadcast.' }, 503);
    if (!broadcast || broadcast.broadcast_type !== 'update' || broadcast.status === 'cancelled') {
      return privateJson({ error: 'Only an active source-linked update can enter Campus Updates review.' }, 400);
    }
    const filters = broadcast.target_filters && typeof broadcast.target_filters === 'object'
      ? broadcast.target_filters as Record<string, unknown> : {};
    const sourceUrl = typeof filters.source_url === 'string' ? filters.source_url : '';
    let parsedSource: URL;
    try {
      parsedSource = new URL(sourceUrl);
      if (sourceUrl.length > 650 || parsedSource.protocol !== 'https:' || parsedSource.username || parsedSource.password || (parsedSource.port && parsedSource.port !== '443')) {
        return privateJson({ error: 'This broadcast does not contain a secure public source link.' }, 400);
      }
    } catch {
      return privateJson({ error: 'This broadcast has no valid trusted source link.' }, 400);
    }
    const { data: universities, error: directoryError } = await auth.supabase
      .from('universities')
      .select('name, slug, website_url')
      .eq('is_enabled', true)
      .order('name')
      .limit(200);
    if (directoryError) return privateJson({ error: 'Unable to verify this trusted source.' }, 503);
    const trustedSource = getTrustedUniEcoAiSources((universities || []) as UniEcoAiUniversity[]).find((source) => {
      try {
        const trustedHost = new URL(source.url).hostname.toLowerCase();
        const candidateHost = parsedSource.hostname.toLowerCase();
        return candidateHost === trustedHost || candidateHost.endsWith(`.${trustedHost}`);
      } catch { return false; }
    });
    if (!trustedSource) return privateJson({ error: 'This link is not from an enabled trusted source.' }, 400);
    const title = typeof broadcast.title === 'string' ? broadcast.title.trim().slice(0, 220) : '';
    const summary = typeof broadcast.body === 'string' ? broadcast.body.trim().slice(0, 500) : '';
    const audience = broadcast.target_audience === 'students' || broadcast.target_audience === 'vendors' ? broadcast.target_audience : 'all';
    const { data: prepared, error } = await auth.supabase.rpc('prepare_admin_ai_update', {
      p_title: title,
      p_summary: summary,
      p_source_url: sourceUrl,
      p_source_label: trustedSource.label.slice(0, 160),
      p_broadcast_title: title.slice(0, 200),
      p_broadcast_body: summary,
      p_target_audience: audience,
    });
    if (error) return privateJson({ error: 'The story could not be queued for review. No public post or additional broadcast was sent.' }, 503);
    const result = prepared && typeof prepared === 'object' ? prepared as Record<string, unknown> : {};
    return privateJson({ feedItemId: result.feedItemId, feedStatus: result.feedStatus, broadcastId: result.broadcastId });
  }

  return privateJson({ error: 'Unsupported AI action.' }, 400);
}
