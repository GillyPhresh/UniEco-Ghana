import { supabase } from '@/lib/supabase/client';

/**
 * Profiles created during older onboarding flows can store an object path
 * rather than the public URL. The avatars bucket is intentionally public;
 * resolve only those paths here and never use this helper for private files.
 */
export function getPublicAvatarUrl(reference: string | null | undefined): string {
  const value = reference?.trim();
  if (!value) return '';
  if (/^https?:\/\//i.test(value)) return value;
  return supabase.storage.from('avatars').getPublicUrl(value).data.publicUrl;
}
