'use client';

import { useEffect, useId } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase/client';
import { getHeaderUnreadCounts, type HeaderUnreadCounts } from '@/lib/data/header-unread';
import { unreadChangedEvent } from '@/lib/notifications/unread-events';

export function useCommunicationUnread(userId: string | undefined, includeRegistrationReminders: boolean) {
  const client = useQueryClient();
  const instance = useId();
  const result = useQuery<HeaderUnreadCounts>({
    queryKey: ['communication-unread', userId, includeRegistrationReminders],
    queryFn: () => getHeaderUnreadCounts(userId!, includeRegistrationReminders),
    enabled: Boolean(userId), staleTime: 5_000, retry: 1,
    refetchInterval: 30_000, refetchIntervalInBackground: false, refetchOnWindowFocus: true,
    // Chat is full-screen without SiteHeader; returning must recheck even if
    // the previous navigation count was cached only a few seconds ago.
    refetchOnMount: 'always',
  });
  useEffect(() => {
    if (!userId) return;
    let active = true;
    const refresh = () => {
      if (active) void client.invalidateQueries({ queryKey: ['communication-unread', userId, includeRegistrationReminders], exact: true });
    };
    const channel = supabase.channel('header-unread:' + userId + ':' + instance)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'messages', filter: 'recipient_id=eq.' + userId }, refresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'notifications', filter: 'user_id=eq.' + userId }, refresh)
      .subscribe();
    window.addEventListener(unreadChangedEvent, refresh);
    window.addEventListener('focus', refresh);
    return () => {
      active = false;
      window.removeEventListener(unreadChangedEvent, refresh);
      window.removeEventListener('focus', refresh);
      void supabase.removeChannel(channel);
    };
  }, [userId, includeRegistrationReminders, instance, client]);
  return userId && result.data ? result.data : { messages: 0, notifications: 0 };
}
