'use client';

import { useEffect } from 'react';
import { Badge } from '@/components/ui/badge';
import { trackAnalyticsEvent } from '@/lib/data/analytics-client';

/** Clear paid-placement labeling; never blend promoted content into organic rank. */
export function PromotedLabel({ label, advertisementId }: { label: 'Sponsored' | 'Featured' | 'Promoted'; advertisementId?: string }) {
  useEffect(() => {
    if (advertisementId) trackAnalyticsEvent({ event_type: 'ad_impression', subject_type: 'advertisement', subject_id: advertisementId });
  }, [advertisementId]);
  return <Badge variant="secondary" className="text-xs">{label}</Badge>;
}
