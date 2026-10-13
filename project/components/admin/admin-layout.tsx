'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/lib/auth/auth-context';
import { supabase } from '@/lib/supabase/client';
import { ADMIN_NAV_GROUPS } from '@/lib/types/admin';
import { Loader2, Menu, Shield, ArrowLeft } from 'lucide-react';
import { cn } from '@/lib/utils';

const ICON_MAP: Record<string, typeof Shield> = {
  LayoutDashboard: Shield, BarChart3: Shield, Wallet: Shield, Activity: Shield,
  Search: Shield,
  Users: Shield, Store: Shield, GraduationCap: Shield, FolderTree: Shield,
  ShoppingBag: Shield, CreditCard: Shield, Megaphone: Shield, Truck: Shield,
  UserCheck: Shield, StoreCheck: Shield, Flag: Shield, Star: Shield, LifeBuoy: Shield,
  Bell: Shield, FileText: Shield, ScrollText: Shield, ShieldCheck: Shield, CalendarDays: Shield,
  ShieldAlert: Shield,
  Receipt: Shield, Ticket: Shield,
  RotateCcw: Shield,
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
  const { user } = useAuth();
  const [moderatorPermissions, setModeratorPermissions] = useState<Set<string>>(new Set());

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

  const sidebar = (
    <div className="flex h-full flex-col">
      <div className="flex h-14 items-center gap-2 border-b border-border px-4">
        <Shield className="h-5 w-5 text-primary" />
        <span className="font-display text-sm font-bold">Admin Panel</span>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-6">
        {navGroups.map(group => (
          <div key={group.label}>
            <p className="px-3 mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground/60">{group.label}</p>
            <div className="space-y-0.5">
              {group.items.map(item => {
                const Icon = ICON_MAP[item.icon] || Shield;
                const isActive = pathname === item.href || (item.href !== '/admin' && pathname.startsWith(item.href));
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setMobileNavOpen(false)}
                    className={cn(
                      'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                      isActive
                        ? 'bg-primary text-primary-foreground'
                        : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                    )}
                  >
                    <Icon className="h-4 w-4 shrink-0" />
                    {item.label}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      <div className="border-t border-border p-3">
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
    <div className="flex h-screen bg-background">
      {/* Desktop sidebar */}
      <aside className="hidden w-60 shrink-0 border-r border-border bg-card lg:block">
        {sidebar}
      </aside>

      {/* Mobile sidebar */}
      <Sheet open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
        <div className="flex h-full flex-1 flex-col">
          {/* Top bar */}
          <header className="flex h-14 items-center gap-3 border-b border-border bg-card px-4">
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="lg:hidden">
                <Menu className="h-5 w-5" />
              </Button>
            </SheetTrigger>
            <span className="font-display text-sm font-bold lg:hidden">Admin Panel</span>
          </header>

          {/* Main content */}
          <main className="flex-1 overflow-y-auto">
            {children}
          </main>
        </div>
        <SheetContent side="left" className="w-64 p-0">
          {sidebar}
        </SheetContent>
      </Sheet>

      {/* Desktop content area */}
      <div className="hidden min-w-0 lg:flex flex-1 flex-col overflow-hidden">
        <main className="flex-1 overflow-y-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
