'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/lib/auth/auth-context';
import { RouteGuard } from '@/lib/auth/route-guard';
import { SiteHeader } from '@/components/layout/site-header';
import { SiteFooter } from '@/components/layout/site-footer';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Search, Store, Calendar, Heart, Bell, MessageSquare, Star,
  TrendingUp, Clock, ArrowRight, ShoppingBag, Sparkles,
  GraduationCap, ShieldCheck, Briefcase, Settings, ChevronRight,
} from 'lucide-react';
import { BusinessCard } from '@/components/shared/business-card';
import {
  getSavedItemCounts, getRecentlyViewed, getNotifications,
  getUnreadNotificationCount, getStudentPreferences, calculateProfileCompletion,
} from '@/lib/data/student-client';
import { supabase } from '@/lib/supabase/client';
import type { VendorWithRelations } from '@/lib/types/extended';
import type { RecentlyViewed } from '@/lib/types/student';

const QUICK_ACTIONS = [
  { icon: Store, label: 'Explore Businesses', href: '/discover', color: 'bg-primary/10 text-primary' },
  { icon: ShoppingBag, label: 'Find Food', href: '/discover?category=Food%20%26%20Drinks', color: 'bg-success/10 text-success' },
  { icon: Calendar, label: 'View Events', href: '/events', color: 'bg-accent/10 text-accent' },
  { icon: Search, label: 'Search Services', href: '/search', color: 'bg-secondary/15 text-secondary' },
  { icon: Briefcase, label: 'Sell Something', href: '/start-business', color: 'bg-warning/10 text-warning' },
  { icon: Settings, label: 'Manage Profile', href: '/profile', color: 'bg-muted text-muted-foreground' },
];

export default function DashboardPage() {
  return (
    <RouteGuard requireAuth>
      <DashboardContent />
    </RouteGuard>
  );
}

function DashboardContent() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [recommendedVendors, setRecommendedVendors] = useState<VendorWithRelations[]>([]);
  const [recentlyViewed, setRecentlyViewed] = useState<RecentlyViewed[]>([]);
  const [recentVendors, setRecentVendors] = useState<VendorWithRelations[]>([]);
  const [savedCounts, setSavedCounts] = useState({ business: 0, product: 0, service: 0, event: 0 });
  const [notifications, setNotifications] = useState<{ id: string; title: string | null; body: string | null; type: string | null; created_at: string; is_read: boolean; link: string | null }[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [profileCompletion, setProfileCompletion] = useState(0);
  const [upcomingEvents, setUpcomingEvents] = useState<{ id: string; title: string; slug: string; start_time: string | null; location: string | null }[]>([]);

  useEffect(() => {
    if (!user) return;
    loadDashboardData();
  }, [user]);

  async function loadDashboardData() {
    if (!user) return;
    setLoading(true);

    const [saved, recent, notifs, unread, prefs] = await Promise.all([
      getSavedItemCounts(),
      getRecentlyViewed(undefined, 6),
      getNotifications(4),
      getUnreadNotificationCount(),
      getStudentPreferences(),
    ]);

    setSavedCounts(saved);
    setRecentlyViewed(recent);
    setNotifications(notifs);
    setUnreadCount(unread);

    const completion = calculateProfileCompletion(
      user.profile || {},
      user.studentProfile || null,
      prefs
    );
    setProfileCompletion(completion);

    const { data: featured } = await supabase
      .from('vendors')
      .select(`*, university:universities(id, name, short_name, slug)`)
      .eq('is_active', true)
      .order('rating_avg', { ascending: false })
      .limit(4);
    setRecommendedVendors((featured || []) as unknown as VendorWithRelations[]);

    if (recent.length > 0) {
      const businessIds = recent.filter((r) => r.item_type === 'business').map((r) => r.item_id);
      if (businessIds.length > 0) {
        const { data: rv } = await supabase
          .from('vendors')
          .select(`*, university:universities(id, name, short_name, slug)`)
          .in('id', businessIds)
          .limit(4);
        setRecentVendors((rv || []) as unknown as VendorWithRelations[]);
      }
    }

    const { data: events } = await supabase
      .from('events')
      .select('id, title, slug, start_time, location')
      .eq('is_published', true)
      .gte('start_time', new Date().toISOString())
      .order('start_time', { ascending: true })
      .limit(3);
    setUpcomingEvents(events || []);

    setLoading(false);
  }

  if (!user) return null;

  const firstName = user.profile?.full_name?.split(' ')[0] || 'there';
  const uniName = user.profile?.university_id
    ? user.studentProfile?.program_of_study
      ? 'your campus'
      : 'your campus'
    : 'your campus';

  return (
    <>
      <SiteHeader />
      <main className="container py-6 sm:py-8">
        {/* Welcome area */}
        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="font-display text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
              Welcome back, {firstName}
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Discover what is happening around {uniName} today.
            </p>
          </div>
          <div className="flex items-center gap-2">
            {user.studentProfile?.is_verified_student ? (
              <Badge className="bg-success/10 text-success border-success/20">
                <ShieldCheck className="mr-1 h-3.5 w-3.5" />
                Verified Student
              </Badge>
            ) : (
              <Badge variant="outline" className="text-muted-foreground">
                <Clock className="mr-1 h-3.5 w-3.5" />
                Verification pending
              </Badge>
            )}
            <Badge variant="outline">
              {user.profile?.role_id === 2 ? 'Student' : user.profile?.role_id === 3 ? 'Student Vendor' : 'Member'}
            </Badge>
          </div>
        </div>

        {/* Profile completion bar */}
        {profileCompletion < 100 && (
          <Card className="mb-6 border-primary/20 bg-primary/5">
            <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-primary" />
                  <p className="text-sm font-semibold text-foreground">
                    Profile {profileCompletion}% complete
                  </p>
                </div>
                <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-primary/15">
                  <div
                    className="h-full rounded-full bg-primary transition-all"
                    style={{ width: `${profileCompletion}%` }}
                  />
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  {profileCompletion < 50
                    ? 'Add your photo, programme, and interests to get personalized recommendations.'
                    : profileCompletion < 80
                    ? 'Verify your student account and add a few more details to unlock everything.'
                    : 'Almost there — verify your student account to complete your profile.'}
                </p>
              </div>
              <Button asChild size="sm" variant="outline">
                <Link href="/profile">Complete profile</Link>
              </Button>
            </CardContent>
          </Card>
        )}

        <div className="grid gap-6 lg:grid-cols-3">
          {/* Left column — main content */}
          <div className="space-y-6 lg:col-span-2">
            {/* Quick actions */}
            <div>
              <h2 className="mb-3 text-sm font-semibold text-muted-foreground uppercase tracking-wider">Quick actions</h2>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {QUICK_ACTIONS.map((action) => (
                  <Link
                    key={action.label}
                    href={action.href}
                    className="group flex flex-col items-start gap-2 rounded-xl border border-border bg-card p-4 shadow-sm transition-all hover:border-primary/30 hover:shadow-md"
                  >
                    <span className={`flex h-10 w-10 items-center justify-center rounded-lg ${action.color}`}>
                      <action.icon className="h-5 w-5" />
                    </span>
                    <span className="text-sm font-medium text-foreground group-hover:text-primary transition-colors">
                      {action.label}
                    </span>
                  </Link>
                ))}
              </div>
            </div>

            {/* Recommendations */}
            <div>
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                  <TrendingUp className="h-4 w-4 text-primary" />
                  Popular businesses
                </h2>
                <Link href="/discover" className="text-xs text-primary hover:underline">
                  View all
                </Link>
              </div>
              {loading ? (
                <div className="grid gap-4 sm:grid-cols-2">
                  {[1, 2].map((i) => <Skeleton key={i} className="h-48 rounded-2xl" />)}
                </div>
              ) : recommendedVendors.length > 0 ? (
                <div className="grid gap-4 sm:grid-cols-2">
                  {recommendedVendors.slice(0, 4).map((vendor) => (
                    <BusinessCard key={vendor.id} vendor={vendor} />
                  ))}
                </div>
              ) : (
                <Card>
                  <CardContent className="p-8 text-center">
                    <Store className="mx-auto h-10 w-10 text-muted-foreground/40" />
                    <p className="mt-3 text-sm text-muted-foreground">No businesses available yet.</p>
                  </CardContent>
                </Card>
              )}
            </div>

            {/* Upcoming events */}
            <div>
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                  <Calendar className="h-4 w-4 text-primary" />
                  Upcoming events
                </h2>
                <Link href="/events" className="text-xs text-primary hover:underline">
                  View all
                </Link>
              </div>
              {loading ? (
                <div className="space-y-3">
                  {[1, 2].map((i) => <Skeleton key={i} className="h-20 rounded-xl" />)}
                </div>
              ) : upcomingEvents.length > 0 ? (
                <div className="space-y-3">
                  {upcomingEvents.map((event) => (
                    <Link
                      key={event.id}
                      href={`/events/${event.slug}`}
                      className="group flex items-center gap-4 rounded-xl border border-border bg-card p-4 shadow-sm transition-all hover:border-primary/30 hover:shadow-md"
                    >
                      <div className="flex h-12 w-12 shrink-0 flex-col items-center justify-center rounded-lg bg-primary/10 text-primary">
                        <Calendar className="h-5 w-5" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="truncate text-sm font-semibold text-foreground group-hover:text-primary transition-colors">
                          {event.title}
                        </p>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {event.start_time ? new Date(event.start_time).toLocaleDateString('en-GH', { weekday: 'short', month: 'short', day: 'numeric' }) : 'TBA'}
                          {event.location && ` · ${event.location}`}
                        </p>
                      </div>
                      <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors" />
                    </Link>
                  ))}
                </div>
              ) : (
                <Card>
                  <CardContent className="p-6 text-center">
                    <Calendar className="mx-auto h-8 w-8 text-muted-foreground/40" />
                    <p className="mt-2 text-sm text-muted-foreground">No upcoming events right now.</p>
                  </CardContent>
                </Card>
              )}
            </div>

            {/* Recently viewed */}
            {!loading && recentVendors.length > 0 && (
              <div>
                <div className="mb-3 flex items-center justify-between">
                  <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                    <Clock className="h-4 w-4 text-primary" />
                    Recently viewed
                  </h2>
                  <Link href="/dashboard/recent" className="text-xs text-primary hover:underline">
                    View all
                  </Link>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  {recentVendors.map((vendor) => (
                    <BusinessCard key={vendor.id} vendor={vendor} />
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Right column — sidebar */}
          <div className="space-y-6">
            {/* Saved items summary */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Heart className="h-4 w-4 text-primary" />
                  Saved items
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <SavedRow label="Businesses" count={savedCounts.business} href="/dashboard/saved?tab=businesses" icon={Store} />
                <SavedRow label="Products" count={savedCounts.product} href="/dashboard/saved?tab=products" icon={ShoppingBag} />
                <SavedRow label="Services" count={savedCounts.service} href="/dashboard/saved?tab=services" icon={Briefcase} />
                <SavedRow label="Events" count={savedCounts.event} href="/dashboard/saved?tab=events" icon={Calendar} />
              </CardContent>
            </Card>

            {/* Notifications preview */}
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Bell className="h-4 w-4 text-primary" />
                    Notifications
                  </CardTitle>
                  {unreadCount > 0 && (
                    <Badge className="bg-primary text-primary-foreground text-xs">{unreadCount}</Badge>
                  )}
                </div>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <div className="space-y-2">
                    {[1, 2].map((i) => <Skeleton key={i} className="h-14 rounded-lg" />)}
                  </div>
                ) : notifications.length > 0 ? (
                  <div className="space-y-2">
                    {notifications.map((n) => (
                      <div
                        key={n.id}
                        className={`rounded-lg p-3 ${n.is_read ? 'bg-muted/30' : 'bg-primary/5 border border-primary/20'}`}
                      >
                        <p className="text-sm font-medium text-foreground">{n.title}</p>
                        {n.body && <p className="mt-0.5 text-xs text-muted-foreground line-clamp-2">{n.body}</p>}
                        <p className="mt-1 text-xs text-muted-foreground/70">
                          {new Date(n.created_at).toLocaleDateString('en-GH', { month: 'short', day: 'numeric' })}
                        </p>
                      </div>
                    ))}
                    <Link href="/dashboard/notifications" className="block pt-1 text-center text-xs text-primary hover:underline">
                      View all notifications
                    </Link>
                  </div>
                ) : (
                  <div className="py-4 text-center">
                    <Bell className="mx-auto h-8 w-8 text-muted-foreground/40" />
                    <p className="mt-2 text-xs text-muted-foreground">No notifications yet</p>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Messages shortcut */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base">
                  <MessageSquare className="h-4 w-4 text-primary" />
                  Messages
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">
                  Contact vendors directly and keep track of your conversations.
                </p>
                <Button asChild variant="outline" size="sm" className="mt-3 w-full">
                  <Link href="/dashboard/messages">
                    Open messages
                    <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
                  </Link>
                </Button>
              </CardContent>
            </Card>

            {/* Start a business CTA */}
            <Card className="border-primary/20 bg-gradient-to-br from-primary/5 to-accent/5">
              <CardContent className="p-5">
                <div className="flex items-center gap-2">
                  <Briefcase className="h-5 w-5 text-primary" />
                  <p className="text-sm font-semibold text-foreground">Have a side hustle?</p>
                </div>
                <p className="mt-2 text-sm text-muted-foreground">
                  Turn it into a verified campus business and reach thousands of students.
                </p>
                <Button asChild size="sm" className="mt-3 w-full">
                  <Link href="/start-business">
                    Start your student business
                    <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
                  </Link>
                </Button>
              </CardContent>
            </Card>
          </div>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}

function SavedRow({ label, count, href, icon: Icon }: { label: string; count: number; href: string; icon: typeof Store }) {
  return (
    <Link
      href={href}
      className="flex items-center justify-between rounded-lg px-3 py-2 transition-colors hover:bg-muted/50"
    >
      <span className="flex items-center gap-2 text-sm text-foreground">
        <Icon className="h-4 w-4 text-muted-foreground" />
        {label}
      </span>
      <span className="flex items-center gap-1.5">
        <span className="text-sm font-semibold text-foreground">{count}</span>
        <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
      </span>
    </Link>
  );
}
