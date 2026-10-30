export function safeInternalPath(value: string | null | undefined, fallback = '/') {
  const candidate = value?.trim() || '';
  if (!candidate.startsWith('/') || candidate.startsWith('//') || candidate.includes('\\')) {
    return fallback;
  }
  return candidate;
}

export function withNext(path: string, next: string | null | undefined) {
  const destination = safeInternalPath(next);
  // Preserve the original protected destination through onboarding and
  // payment. Only discard a missing/root destination or another onboarding
  // destination that could create a redirect loop.
  if (destination === '/' || destination.startsWith('/onboarding')) return path;
  return `${path}${path.includes('?') ? '&' : '?'}next=${encodeURIComponent(destination)}`;
}
