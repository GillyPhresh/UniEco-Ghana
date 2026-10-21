'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/lib/auth/auth-context';
import { supabase } from '@/lib/supabase/client';
import { ADMIN_NAV_GROUPS } from '@/lib/types/admin';
import {
  Activity,
  ArrowLeft,
  BarChart3,
  Bell,
  Building2,
  CalendarDays,
  CreditCard,
  FileText,
  FolderTree,
  GraduationCap,
  LayoutDashboard,
  LifeBuoy,
  Loader2,
  Menu,
  Megaphone,
  Package,
  Receipt,
  Search,
  Shield,
  ShieldAlert,
  ShieldCheck,
  ShoppingBag,
  Store,
  Ticket,
  Truck,
  Users,
  Wallet,
  WifiOff,
  Wrench,
} from 'lucide-react';
import { cn } from '@/lib/utils';

const ICON_MAP: Record<string, typeof Shield> = {
  LayoutDashboard, BarChart3, Wallet, Activity, Search, Users, Store,
  GraduationCap, FolderTree, ShoppingBag, CreditCard, Megaphone, Truck,
  LifeBuoy, Bell, FileText, ShieldCheck, CalendarDays, ShieldAlert,
  Receipt, Ticket, Building2, Package, Wrench,
  UserCheck: ShieldCheck, StoreCheck: Store, Flag: ShieldAlert, Star: ShieldCheck,
  ScrollText: FileText, RotateCcw: Activity,
};

export function AdminRouteGuard({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const pathname = usePathname();

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="text-center">
          <Shield className="mx-auto h-12 w-12 text-muted-foreground/40" />
          <p className="mt-4 text-lg font-semibold">Admin Access Required</p>
          <p className="mt-1 text-sm text-muted-foreground">Please sign in to access the admin panel.</p>
          <Button asChild className="mt-4"><Link href="/signin?next=/admin">Sign in</Link></Button>
        </div>
      </div>
    );
  }

  const isScopedUniversityAdmin = user.role === 'university_admin';
  const moderatorPath = pathname === '/admin/moderation'
    || pathname === '/admin/events'
    || pathname === '/admin/trust-safety'
    || pathname === '/admin/verification'
    || pathname.startsWith('/admin/verification/')
    || pathname === '/admin/support'
    || pathname === '/admin/advertisements'
    || pathname === '/admin/reviews'
    || pathname === '/admin/communication';
  const canAccessRoute = user.role === 'super_admin'
    || (user.role === 'moderator' && (moderatorPath || pathname === '/admin'))
    || (isScopedUniversityAdmin && (
      pathname === '/admin' || pathname === '/admin/universities' || pathname === '/admin/orders' || pathname === '/admin/delivery' || pathname === '/admin/events' || pathname === '/admin/announcements' || pathname === '/admin/search'
      || pathname === '/admin/businesses' || pathname === '/admin/verification/students' || pathname === '/admin/verification/vendors'
      || pathname === '/admin/students'
    ));

  if (!canAccessRoute) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="text-center">
          <Shield className="mx-auto h-12 w-12 text-destructive/40" />
          <p className="mt-4 text-lg font-semibold">Access Denied</p>
          <p className="mt-1 text-sm text-muted-foreground">You don&apos;t have permission to access the admin panel.</p>
          <Button asChild className="mt-4"><Link href="/">Go home</Link></Button>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}

export function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [isOnline, setIsOnline] = useState(true);
  const { user } = useAuth();
  const [moderatorPermissions, setModeratorPermissions] = useState<Set<string>>(new Set());

  useEffect(() => {
    setIsOnline(window.navigator.onLine);
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  useEffect(() => {
    setMobileNavOpen(false);
  }, [pathname]);

  useEffect(() => {
    let active = true;
    if (user?.role !== 'moderator') {
      setModeratorPermissions(new Set());
      return () => { active = false; };
    }
    // This DB lookup only controls visible navigation. Middleware and RPCs
    // independently enforce every route and operation.
    void Promise.all([
      supabase.rpc('has_permission', { p_permission: 'can_review_reports' }),
      supabase.rpc('has_permission', { p_permission: 'can_review_verifications' }),
      supabase.rpc('has_permission', { p_permission: 'can_manage_support' }),
      supabase.rpc('has_permission', { p_permission: 'can_moderate_content' }),
      supabase.rpc('has_permission', { p_permission: 'can_manage_communications' }),
    ]).then(([reports, verifications, support, content, communications]) => {
      if (!active) return;
      const permissions = new Set<string>();
      if (!reports.error && reports.data === true) permissions.add('can_review_reports');
      if (!verifications.error && verifications.data === true) permissions.add('can_review_verifications');
      if (!support.error && support.data === true) permissions.add('can_manage_support');
      if (!content.error && content.data === true) permissions.add('can_moderate_content');
      if (!communications.error && communications.data === true) permissions.add('can_manage_communications');
      setModeratorPermissions(permissions);
    }).catch(() => {
      if (active) setModeratorPermissions(new Set());
    });
    return () => { active = false; };
  }, [user?.role]);

  const navGroups = user?.role === 'university_admin'
    ? ADMIN_NAV_GROUPS
        .map(group => ({ ...group, items: group.items.filter(item => item.href === '/admin' || item.href === '/admin/universities' || item.href === '/admin/orders' || item.href === '/admin/delivery' || item.href === '/admin/events' || item.href === '/admin/announcements' || item.href === '/admin/search' || item.href === '/admin/businesses' || item.href === '/admin/verification/students' || item.href === '/admin/verification/vendors' || item.href === '/admin/students') }))
        .filter(group => group.items.length > 0)
    : user?.role === 'moderator'
      ? ADMIN_NAV_GROUPS
        .map(group => ({ ...group, items: group.items.filter(item =>
          (item.href === '/admin' && moderatorPermissions.size > 0)
          || ((item.href === '/admin/moderation' || item.href === '/admin/trust-safety') && moderatorPermissions.has('can_review_reports'))
          || (item.href.startsWith('/admin/verification') && moderatorPermissions.has('can_review_verifications'))
          || (item.href === '/admin/support' && moderatorPermissions.has('can_manage_support'))
          || (item.href === '/admin/advertisements' && moderatorPermissions.has('can_moderate_content'))
          || (item.href === '/admin/reviews' && moderatorPermissions.has('can_moderate_content'))
          || (item.href === '/admin/events' && moderatorPermissions.has('can_moderate_content'))
          || (item.href === '/admin/communication' && moderatorPermissions.has('can_manage_communications'))
        ) }))
        .filter(group => group.items.length > 0)
    : ADMIN_NAV_GROUPS;

  const activeItem = navGroups.flatMap(group => group.items).find(item => pathname === item.href || (item.href !== '/admin' && pathname.startsWith(item.href)));
  const availablePaths = new Set<string>(navGroups.flatMap(group => group.items.map(item => item.href)));
  const reviewHref = ['/admin/verification/students', '/admin/trust-safety', '/admin/students', '/admin/orders']
    .find(href => availablePaths.has(href)) || '/admin';
  const mobileQuickLinks = [
    { href: '/admin', label: 'Home', icon: LayoutDashboard },
    { href: reviewHref, label: reviewHref === '/admin/orders' ? 'Orders' : 'Review', icon: reviewHref === '/admin/orders' ? ShoppingBag : ShieldCheck },
    ...(availablePaths.has('/admin/search') ? [{ href: '/admin/search', label: 'Search', icon: Search }] : []),
  ];

  const sidebar = (
      <div className="flex h-full flex-col">
      <div className="relative flex h-16 items-center gap-3 border-b border-border px-5">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10">
          <ShieldCheck className="h-5 w-5 text-primary" />
        </div>
        <div className="min-w-0">
          <span className="block truncate font-display text-sm font-bold">UniEco Ghana</span>
          <span className="block text-[11px] text-muted-foreground">Management console</span>
        </div>
      </div>

      <nav aria-label="Admin navigation" className="scrollbar-thin flex-1 space-y-7 overflow-y-auto px-3 py-5">
        {navGroups.map(group => (
          <div key={group.label}>
            <p className="mb-2 px-3 text-[10px] font-bold uppercase tracking-[0.16em] text-muted-foreground/60">{group.label}</p>
            <div className="space-y-0.5">
              {group.items.map(item => {
                const Icon = ICON_MAP[item.icon] || Shield;
                const isActive = pathname === item.href || (item.href !== '/admin' && pathname.startsWith(item.href));
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setMobileNavOpen(false)}
                    aria-current={isActive ? 'page' : undefined}
                    className={cn(
                      'group flex min-h-11 items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
                      isActive
                        ? 'bg-primary text-primary-foreground shadow-sm'
                        : 'text-muted-foreground hover:bg-muted/80 hover:text-foreground'
                    )}
                  >
                    <Icon className="h-4 w-4 shrink-0 transition-transform group-hover:scale-105" />
                    {item.label}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      <div className="border-t border-border bg-card/80 p-3">
        <Link href="/" className="flex items-center gap-2 rounded-lg px-3 py-2 text-xs text-muted-foreground hover:bg-muted hover:text-foreground">
          <ArrowLeft className="h-3.5 w-3.5" /> Back to site
        </Link>
        {user && (
          <p className="px-3 mt-1 text-xs text-muted-foreground truncate">{user.email}</p>
        )}
      </div>
    </div>
  );

  return (
    <div className="flex min-h-screen bg-background">
      {/* Desktop sidebar */}
      <aside className="hidden w-60 shrink-0 border-r border-border bg-card lg:block">
        {sidebar}
      </aside>

      {/* Mobile sidebar */}
      <Sheet open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
        <div className="flex min-h-screen flex-1 flex-col lg:hidden">
          {/* Top bar */}
          <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-border bg-card/95 px-3 backdrop-blur sm:px-4">
            <SheetTrigger asChild>
              <Button variant="outline" size="icon" className="h-10 w-10 shrink-0 rounded-xl" aria-label="Open management menu">
                <Menu className="h-5 w-5" />
              </Button>
            </SheetTrigger>
            <div className="min-w-0 flex-1">
              <span className="block truncate font-display text-sm font-bold">{activeItem?.label || 'Management console'}</span>
              <span className="block truncate text-[11px] capitalize text-muted-foreground">UniEco Ghana · {user?.role?.replaceAll('_', ' ') || 'admin'}</span>
            </div>
            <div
              className={cn('h-2.5 w-2.5 shrink-0 rounded-full', isOnline ? 'bg-success' : 'bg-warning')}
              title={isOnline ? 'Device online' : 'Device offline'}
              aria-label={isOnline ? 'Device online' : 'Device offline'}
            />
          </header>
          <div className="ghana-stripe h-[3px] w-full" aria-hidden="true" />

          {!isOnline && (
            <div className="flex items-center gap-2 border-b border-warning/30 bg-warning/10 px-4 py-2 text-xs text-warning-foreground" role="status">
              <WifiOff className="h-4 w-4 shrink-0" />
              <span>You are offline. Changes will not be submitted until your connection returns.</span>
            </div>
          )}

          {/* Main content */}
          <main className="min-w-0 flex-1 overflow-x-hidden overflow-y-auto pb-24">
            {children}
          </main>

          <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-card/95 px-2 pb-[env(safe-area-inset-bottom)] pt-2 shadow-[0_-6px_20px_rgba(15,23,42,0.08)] backdrop-blur" aria-label="Mobile admin shortcuts">
            <div className="mx-auto grid max-w-lg grid-cols-4 gap-1">
              {mobileQuickLinks.map(({ href, label, icon: Icon }) => {
                const isActive = pathname === href || (href !== '/admin' && pathname.startsWith(href));
                return (
                  <Link
                    key={`${href}-${label}`}
                    href={href}
                    className={cn('flex min-h-12 flex-col items-center justify-center gap-0.5 rounded-xl px-1 text-[11px] font-medium transition-colors', isActive ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-muted')}
                    aria-current={isActive ? 'page' : undefined}
                  >
                    <Icon className="h-5 w-5" />
                    <span>{label}</span>
                  </Link>
                );
              })}
              <SheetTrigger asChild>
                <Button variant="ghost" className="flex min-h-12 h-auto flex-col items-center justify-center gap-0.5 rounded-xl px-1 text-[11px] font-medium text-muted-foreground hover:bg-muted" aria-label="Open management menu">
                  <Menu className="h-5 w-5" />
                  <span>Menu</span>
                </Button>
              </SheetTrigger>
            </div>
          </nav>
        </div>
        <SheetContent side="left" className="w-[88vw] max-w-[22rem] p-0">
          {sidebar}
        </SheetContent>
      </Sheet>

      {/* Desktop content area */}
      <div className="workspace-page hidden min-w-0 flex-1 flex-col overflow-hidden lg:flex">
        <main className="min-w-0 flex-1 overflow-x-hidden overflow-y-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
