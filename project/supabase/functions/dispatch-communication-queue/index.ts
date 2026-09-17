import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { requireInternalRequest } from '../_shared/internal-auth.ts';
import { outboundProvidersEnabled } from '../_shared/provider-mode.ts';

const jsonHeaders = { 'Content-Type': 'application/json' };

type QueueEvent = {
  event_id: string;
  event_type: string;
  recipient_id: string | null;
  recipient_email: string | null;
  recipient_phone: string | null;
  subject: string | null;
  metadata: Record<string, unknown>;
  delivery_id: string;
  channel: 'email' | 'push' | 'whatsapp' | 'sms';
};

/**
 * Trusted queue worker. It has no browser-authenticated path: callers must
 * hold UNIECO_INTERNAL_FUNCTION_SECRET and database mutation happens through
 * service-role-only queue RPCs. Provider mode defaults to disabled; mock mode
 * permits local/integration validation without any external network delivery.
 */
Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers: jsonHeaders });
  const authFailure = requireInternalRequest(req);
  if (authFailure) return authFailure;

  let limit = 10;
  try {
    const body = await req.json().catch(() => ({}));
    if (body.limit !== undefined) limit = Number(body.limit);
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), { status: 400, headers: jsonHeaders });
  }
  if (!Number.isInteger(limit) || limit < 1 || limit > 25) {
    return new Response(JSON.stringify({ error: 'limit must be an integer from 1 to 25' }), { status: 400, headers: jsonHeaders });
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );
  const { data: claimed, error: claimError } = await supabase.rpc('claim_trusted_communication_events', { p_limit: limit });
  if (claimError) return new Response(JSON.stringify({ error: 'Queue claim failed' }), { status: 500, headers: jsonHeaders });

  const mode = outboundProvidersEnabled()
    ? 'provider'
    : Deno.env.get('UNIECO_COMMUNICATION_ADAPTER') === 'mock' ? 'mock' : 'disabled';
  const results: Array<{ eventId: string; deliveryId: string; status: string }> = [];
  for (const item of (claimed || []) as QueueEvent[]) {
    // Live provider dispatch remains intentionally disabled. The mock adapter
    // performs no network call and exists solely for trusted test environments.
    const liveProvidersEnabled = outboundProvidersEnabled();
    let delivered = mode === 'mock' && !liveProvidersEnabled;
    let provider: string | null = delivered ? 'mock' : null;
    let providerReference: string | null = delivered ? `mock_${item.delivery_id}` : null;
    let errorMessage: string | null = delivered ? null : 'Providers disabled by deployment configuration';
    if (liveProvidersEnabled) {
      const result = await dispatchToProvider(item);
      delivered = result.success;
      provider = result.provider;
      providerReference = result.providerReference;
      errorMessage = result.error ?? null;
    }
    const { error } = await supabase.rpc('complete_trusted_communication_delivery', {
      p_event_id: item.event_id,
      p_delivery_id: item.delivery_id,
      p_status: delivered ? 'delivered' : 'failed',
      p_provider: provider,
      p_provider_reference: providerReference,
      p_error_message: errorMessage,
    });
    results.push({ eventId: item.event_id, deliveryId: item.delivery_id, status: error ? 'error' : delivered ? 'delivered' : 'failed' });
  }

  return new Response(JSON.stringify({ processed: results.length, mode, results }), { headers: jsonHeaders });
});

async function dispatchToProvider(item: QueueEvent): Promise<{
  success: boolean;
  provider: string | null;
  providerReference: string | null;
  error?: string;
}> {
  const baseUrl = Deno.env.get('SUPABASE_URL');
  const secret = Deno.env.get('UNIECO_INTERNAL_FUNCTION_SECRET');
  if (!baseUrl || !secret) return { success: false, provider: null, providerReference: null, error: 'Trusted dispatcher configuration is missing' };
  const body = typeof item.metadata.body === 'string' ? item.metadata.body : item.subject || item.event_type;
  const payload = item.channel === 'email'
    ? { to: item.recipient_email, subject: item.subject || item.event_type, body, eventType: item.event_type, recipientId: item.recipient_id }
    : item.channel === 'push'
      ? { recipientId: item.recipient_id, title: item.subject || item.event_type, body, actionUrl: item.metadata.action_url, eventType: item.event_type }
      : item.channel === 'whatsapp'
        ? { to: item.recipient_phone, templateKey: item.event_type, variables: item.metadata, recipientId: item.recipient_id }
        : { to: item.recipient_phone, message: body, recipientId: item.recipient_id };
  const endpoint = `${baseUrl}/functions/v1/send-${item.channel}`;
  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-unieco-internal-secret': secret },
      body: JSON.stringify(payload),
    });
    const result = await response.json().catch(() => ({})) as { success?: boolean; provider?: string | null; providerReference?: string | null; error?: string };
    return {
      success: response.ok && result.success === true,
      provider: result.provider ?? null,
      providerReference: result.providerReference ?? null,
      error: result.error ?? (response.ok ? undefined : 'Provider dispatch failed'),
    };
  } catch {
    return { success: false, provider: null, providerReference: null, error: 'Provider dispatch request failed' };
  }
}
