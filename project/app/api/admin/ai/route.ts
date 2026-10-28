import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { askUniEcoAi, createUniEcoAiDraft, isUniEcoAiConfigured, type UniEcoAiChatMessage } from '@/lib/ai/assistant';
import { fetchTrustedUniEcoAiUpdates, getTrustedUniEcoAiSources } from '@/lib/ai/trusted-sources';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

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
  return privateJson({
    configured: isUniEcoAiConfigured(),
    mode: isUniEcoAiConfigured() ? 'configured' : 'safe-fallback',
    capabilities: ['trusted_source_scan', 'admin_chat', 'draft_broadcast', 'system_snapshot'],
    sources: getTrustedUniEcoAiSources(),
  });
}

export async function POST(request: Request) {
  const auth = await requireSuperAdmin();
  if (auth.error) return auth.error;

  let body: Record<string, unknown>;
  try {
    body = await request.json() as Record<string, unknown>;
  } catch {
    return privateJson({ error: 'Invalid request body.' }, 400);
  }

  const action = typeof body.action === 'string' ? body.action : '';
  if (action === 'discover') {
    const sourceId = typeof body.sourceId === 'string' ? body.sourceId : undefined;
    const updates = await fetchTrustedUniEcoAiUpdates(sourceId);
    return privateJson({ updates, checkedAt: new Date().toISOString() });
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
    });
    return privateJson({ reply: result.text, mode: result.mode });
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
