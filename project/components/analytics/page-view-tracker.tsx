'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { trackAnalyticsEvent } from '@/lib/data/analytics-client';

/** Records only a generic page-view classification; paths, query strings and IDs are never stored. */
export function PageViewTracker() {
  const pathname = usePathname();
  useEffect(() => {
    if (!pathname.startsWith('/admin') && !pathname.startsWith('/vendor-dashboard')) trackAnalyticsEvent({ event_type: 'page_view' });
  }, [pathname]);
  return null;
}
