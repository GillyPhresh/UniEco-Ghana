export function safeInternalPath(value: string | null | undefined, fallback = '/') {
  const candidate = value?.trim() || '';
  if (!candidate.startsWith('/') || candidate.startsWith('//') || candidate.includes('\\')) {
    return fallback;
  }
  return candidate;
}

export function withNext(path: string, next: string | null | undefined) {
  const destination = safeInternalPath(next);
  if (destination === '/' || destination.startsWith('/onboarding')) return path;
  return `${path}${path.includes('?') ? '&' : '?'}next=${encodeURIComponent(destination)}`;
}
