const BUILD_PLACEHOLDER_URL = 'https://build-placeholder.supabase.co';
const BUILD_PLACEHOLDER_KEY = 'build-only-placeholder';

/**
 * Keep production strict while allowing Next to compile routes that only
 * import Supabase helpers. Real requests still require the configured keys;
 * the placeholder is never used outside `next build`.
 */
export function getSupabaseConfig() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (url && anonKey) return { url, anonKey };
  if (process.env.NEXT_PHASE === 'phase-production-build') {
    return { url: BUILD_PLACEHOLDER_URL, anonKey: BUILD_PLACEHOLDER_KEY };
  }
  throw new Error('Supabase URL and public key are required for this environment.');
}
