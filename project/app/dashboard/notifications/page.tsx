'use client';

import { useEffect, useState, useCallback } from 'react';
import { useAuth } from '@/lib/auth/auth-context';
import { RouteGuard } from '@/lib/auth/route-guard';
import { SiteHeader } from '@/components/layout/site-header';
import { SiteFooter } from '@/components/layout/site-footer';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/shared/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Bell, CheckCheck, Trash2, MessageSquare, Calendar, Star, Megaphone,
  ShieldCheck, ShoppingBag, CreditCard, Store, RefreshCw, Settings,
  Filter,
} from 'lucide-react';
import {
  getNotifications, markNotificationRead, markAllNotificationsRead, deleteNotification,
  getUnreadCountsByCategory,
} from '@/lib/data/communication-client';
import type { NotificationWithMeta, NotificationCategory } from '@/lib/types/communication';
import { NOTIFICATION_CATEGORIES_FULL, NOTIFICATION_CATEGORY_LABELS } from '@/lib/types/communication';
import Link from 'next/link';

const TYPE_ICONS: Record<string, typeof Bell> = {
  message: MessageSquare,
  event: Calendar,
  review: Star,
  announcement: Megaphone,
  verification: ShieldCheck,
  order_placed: ShoppingBag,
  order_accepted: ShoppingBag,
  order_cancelled: ShoppingBag,
  payment_successful: CreditCard,
  payment_failed: CreditCard,
  subscription_expiring: RefreshCw,
  vendor_approved: ShieldCheck,
  vendor_rejected: ShieldCheck,
  student_verified: ShieldCheck,
  new_message: MessageSquare,
  new_review: Star,
  event_reminder: Calendar,
  ad_approved: Megaphone,
  support_ticket_update: MessageSquare,
};

function timeAgo(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diff = Math.floor((now.getTime() - date.getTime()) / 1000);
  if (diff < 60) return 'Just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
  return date.toLocaleDateString('en-GH', { month: 'short', day: 'numeric' });
}

type FilterCategory = 'all' | NotificationCategory;

export default function NotificationsPage() {
  return (
    <RouteGuard requireAuth>
      <NotificationsContent />
    </RouteGuard>
  );
}

function NotificationsContent() {
  const [loading, setLoading] = useState(true);
  const [notifications, setNotifications] = useState<NotificationWithMeta[]>([]);
  const [activeFilter, setActiveFilter] = useState<FilterCategory>('all');
  const [unreadCounts, setUnreadCounts] = useState<Record<string, number>>({});
  const [showUnreadOnly, setShowUnreadOnly] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    const [notifs, counts] = await Promise.all([
      getNotifications(100),
      getUnreadCountsByCategory(),
    ]);
    setNotifications(notifs);
    setUnreadCounts(counts);
    setLoading(false);
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleMarkRead = async (id: string) => {
    setNotifications((prev) => prev.map((n) => n.id === id ? { ...n, is_read: true } : n));
    await markNotificationRead(id);
    loadData();
  };

  const handleMarkAllRead = async () => {
    setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
    await markAllNotificationsRead(activeFilter === 'all' ? undefined : activeFilter);
    loadData();
  };

  const handleDelete = async (id: string) => {
    setNotifications((prev) => prev.filter((n) => n.id !== id));
    await deleteNotification(id);
  };

  const filtered = notifications.filter((n) => {
    if (activeFilter !== 'all' && n.category !== activeFilter) return false;
    if (showUnreadOnly && n.is_read) return false;
    return true;
  });

  const totalUnread = Object.values(unreadCounts).reduce((a, b) => a + b, 0);
  const categories: { key: FilterCategory; label: string; count: number }[] = [
    { key: 'all', label: 'All', count: totalUnread },
    ...NOTIFICATION_CATEGORIES_FULL.map((c) => ({
      key: c.key as FilterCategory,
      label: c.label,
      count: unreadCounts[c.key] || 0,
    })),
  ];

  return (
    <>
      <SiteHeader />
      <main className="container py-6 sm:py-8 max-w-4xl">
        <div className="mb-6 flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="font-display text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
              Notifications
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {totalUnread > 0 ? `${totalUnread} unread notification${totalUnread > 1 ? 's' : ''}` : 'You are all caught up'}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant={showUnreadOnly ? 'default' : 'outline'}
              size="sm"
              onClick={() => setShowUnreadOnly(!showUnreadOnly)}
            >
              <Filter className="mr-1.5 h-4 w-4" />
              Unread only
            </Button>
            {totalUnread > 0 && (
              <Button variant="outline" size="sm" onClick={handleMarkAllRead}>
                <CheckCheck className="mr-1.5 h-4 w-4" />
                Mark all read
              </Button>
            )}
            <Button variant="ghost" size="sm" asChild>
              <Link href="/dashboard/notifications/preferences">
                <Settings className="mr-1.5 h-4 w-4" />
                Preferences
              </Link>
            </Button>
          </div>
        </div>

        {/* Category tabs */}
        <div className="mb-5 flex flex-wrap gap-2">
          {categories.map((cat) => (
            <button
              key={cat.key}
              onClick={() => setActiveFilter(cat.key)}
              className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium transition-colors ${
                activeFilter === cat.key
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-muted-foreground hover:bg-muted/80'
              }`}
            >
              {cat.label}
              {cat.count > 0 && (
                <span className={`flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-xs font-bold ${
                  activeFilter === cat.key ? 'bg-primary-foreground/20' : 'bg-primary/10 text-primary'
                }`}>
                  {cat.count}
                </span>
              )}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-20 rounded-xl" />)}
          </div>
        ) : filtered.length > 0 ? (
          <ScrollArea className="h-[calc(100vh-340px)]">
            <div className="space-y-3 pr-4">
              {filtered.map((n) => {
                const Icon = TYPE_ICONS[n.type || ''] || Bell;
                const actionUrl = n.action_url || n.link;
                return (
                  <Card
                    key={n.id}
                    className={n.is_read ? '' : 'border-primary/30 bg-primary/5'}
                  >
                    <CardContent className="flex items-start gap-3 p-4">
                      <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${n.is_read ? 'bg-muted text-muted-foreground' : 'bg-primary/10 text-primary'}`}>
                        <Icon className="h-5 w-5" />
                      </span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-semibold text-foreground">{n.title}</p>
                          <Badge variant="secondary" className="text-xs">
                            {NOTIFICATION_CATEGORY_LABELS[n.category] || n.category}
                          </Badge>
                        </div>
                        {n.body && <p className="mt-0.5 text-sm text-muted-foreground">{n.body}</p>}
                        <div className="mt-2 flex items-center gap-3">
                          <p className="text-xs text-muted-foreground/70">{timeAgo(n.created_at)}</p>
                          {actionUrl && (
                            <Link
                              href={actionUrl}
                              onClick={() => !n.is_read && handleMarkRead(n.id)}
                              className="text-xs font-medium text-primary hover:underline"
                            >
                              View
                            </Link>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-1">
                        {!n.is_read && (
                          <button
                            onClick={() => handleMarkRead(n.id)}
                            className="flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-primary/10 hover:text-primary"
                            title="Mark as read"
                          >
                            <CheckCheck className="h-3.5 w-3.5" />
                          </button>
                        )}
                        <button
                          onClick={() => handleDelete(n.id)}
                          className="flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-destructive hover:text-destructive-foreground"
                          title="Delete"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </ScrollArea>
        ) : (
          <EmptyState
            icon={Bell}
            title="No notifications"
            description="You will see messages, event reminders, review responses, order updates, and platform announcements here."
          />
        )}
      </main>
      <SiteFooter />
    </>
  );
}
