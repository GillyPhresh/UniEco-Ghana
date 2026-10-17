/**
 * Outbound providers stay disabled until the deployment has been explicitly
 * configured with provider credentials and the trusted worker is approved.
 * This guard runs only inside Edge Functions, never in the browser.
 */
export function outboundProvidersEnabled(): boolean {
  return Deno.env.get('UNIECO_ENABLE_OUTBOUND_PROVIDERS') === 'true';
}

export function providersDisabledResponse(): Response {
  return new Response(JSON.stringify({
    success: false,
    error: 'Outbound communication providers are disabled.',
    provider: null,
  }), {
    status: 503,
    headers: { 'Content-Type': 'application/json' },
  });
}
