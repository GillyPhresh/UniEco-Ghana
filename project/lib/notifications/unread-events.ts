export const unreadChangedEvent = 'unieco:communication-unread-changed';
export const nonChatNotificationTypes = 'type.is.null,type.not.in.(message,new_message)';

export function announceUnreadChange() {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(unreadChangedEvent));
}
