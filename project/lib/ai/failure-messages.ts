export function getUniEcoAiFailureMessage(reason?: string | null): string {
  switch (reason) {
    case 'not_configured':
      return 'No AI provider key is configured. Add the server-only UNIECO_AI_API_KEY in Railway Variables.';
    case 'provider_authentication_failed':
      return 'The AI provider rejected its credentials. Check the key and provider access in Railway Variables; never use a NEXT_PUBLIC_ variable.';
    case 'provider_rate_limited':
      return 'The AI provider rate limit or quota was reached. Check the provider account quota and billing.';
    case 'provider_model_or_endpoint_not_found':
      return 'The AI model or endpoint was not found. Check UNIECO_AI_MODEL and UNIECO_AI_BASE_URL; the base URL should end at /v1, not /chat/completions.';
    case 'provider_request_rejected':
      return 'The AI provider rejected the request. Check that the selected model supports the chat-completions API.';
    case 'provider_server_error':
      return 'The AI provider returned a server error. Check its service status and try again later.';
    case 'provider_timeout':
      return 'The AI provider did not respond before the request timed out. Try again, then check the provider and model settings if it continues.';
    case 'provider_network_error':
      return 'UniEco could not reach the configured AI endpoint. Check UNIECO_AI_BASE_URL and the provider network/service status.';
    case 'provider_invalid_response':
      return 'The endpoint responded in an unsupported format. Check that UNIECO_AI_BASE_URL and the selected OpenAI-compatible model are correct.';
    case 'web_search_unavailable':
      return 'Live web search is unavailable. Regular AI chat may still work; verify the OpenAI endpoint and web-search availability.';
    default:
      return 'The AI provider did not respond successfully. Check the server-side AI settings and provider status.';
  }
}
