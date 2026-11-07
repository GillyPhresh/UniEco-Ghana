'use client';

import { useEffect } from 'react';
import { trackAnalyticsEvent, type AnalyticsEventType, type AnalyticsSubjectType } from '@/lib/data/analytics-client';

type TrackedView = Extract<AnalyticsEventType, 'university_view' | 'business_view' | 'product_view' | 'service_view' | 'event_view'>;

export function EntityViewTracker({
  eventType,
  subjectType,
  subjectId,
}: {
  eventType: TrackedView;
  subjectType: AnalyticsSubjectType;
  subjectId: string;
}) {
  useEffect(() => {
    if (subjectId) trackAnalyticsEvent({ event_type: eventType, subject_type: subjectType, subject_id: subjectId });
  }, [eventType, subjectType, subjectId]);

  return null;
}
