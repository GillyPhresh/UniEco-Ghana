import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { getSupabaseConfig } from './config';

type CookieStore = Awaited<ReturnType<typeof cookies>>;

type CookieToSet = {
  name: string;
  value: string;
  options: Parameters<CookieStore['set']>[2];
};

export async function createClient() {
  const { url, anonKey } = getSupabaseConfig();
  let cookieStore: CookieStore | null = null;

  try {
    cookieStore = await cookies();
  } catch {
    cookieStore = null;
  }

  return createServerClient(
    url,
    anonKey,
    {
      cookies: {
        getAll() {
          return cookieStore?.getAll() ?? [];
        },
        setAll(cookiesToSet: CookieToSet[]) {
          if (!cookieStore) return;
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore?.set(name, value, options)
            );
          } catch {
            // Server Components cannot write refreshed cookies.
          }
        },
      },
    }
  );
}
