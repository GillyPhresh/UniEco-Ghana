const OPTIMIZABLE_PUBLIC_IMAGE_HOSTS = new Set(['images.pexels.com']);

/** Restrict server-side image optimization to known public image locations. */
export function isOptimizablePublicImage(source: string): boolean {
  try {
    const url = new URL(source);
    if (url.protocol !== 'https:') return false;
    if (OPTIMIZABLE_PUBLIC_IMAGE_HOSTS.has(url.hostname)) {
      return url.pathname.startsWith('/photos/');
    }
    return url.hostname.endsWith('.supabase.co')
      && url.pathname.startsWith('/storage/v1/object/public/');
  } catch {
    return false;
  }
}
