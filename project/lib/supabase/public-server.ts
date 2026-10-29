import { createClient } from '@supabase/supabase-js';
import { getSupabaseConfig } from './config';

/**
 * Public, cacheable Supabase client for pages that only read publicly visible
 * data. It deliberately has no cookie/session handling so Next can cache and
 * prefetch those pages quickly on mobile connections.
 */
export function createPublicServerClient() {
  const { url, anonKey } = getSupabaseConfig();
  return createClient(
    url,
    anonKey,
    {
      auth: {
        autoRefreshToken: false,
        detectSessionInUrl: false,
        persistSession: false,
      },
    },
  );
}
