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
    const aiGenerated = false;
    const { data: draftId, error } = await auth.supabase.rpc('create_admin_broadcast_draft', {
      p_title: draft.title,
      p_body: draft.body,
      p_broadcast_type: 'update',
      p_target_audience: audience,
      p_target_filters: {
        ai_generated: aiGenerated,
        draft_mode: aiGenerated ? 'ai_assisted' : 'source_fallback',
        source_url: sourceUpdate.url,
        source_label: sourceUpdate.sourceLabel,
      },
      p_channels: ['in_app'],
      p_submit_for_approval: true,
    });
    if (error) return privateJson({ error: 'The AI message was prepared but could not be submitted to Broadcasts for review.' }, 503);
    return privateJson({ draftId, title: draft.title, mode: draft.mode, status: 'pending_approval' });
  }

  return privateJson({ error: 'Unsupported AI action.' }, 400);
}
