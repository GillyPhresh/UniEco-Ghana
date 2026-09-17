/**
 * Outbound providers are deliberately disabled unless a future, separately
 * approved deployment explicitly enables the trusted worker.  This guard is
 * evaluated only inside Edge Functions; it is never available to the browser.
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
