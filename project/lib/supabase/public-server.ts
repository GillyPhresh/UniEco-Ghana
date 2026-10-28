import { createClient } from '@supabase/supabase-js';

/**
 * Public, cacheable Supabase client for pages that only read publicly visible
 * data. It deliberately has no cookie/session handling so Next can cache and
 * prefetch those pages quickly on mobile connections.
 */
export function createPublicServerClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      auth: {
        autoRefreshToken: false,
        detectSessionInUrl: false,
        persistSession: false,
      },
    },
  );
}
