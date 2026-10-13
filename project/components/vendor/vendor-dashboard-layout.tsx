'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Sheet, SheetContent, SheetTrigger, SheetClose } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  LayoutDashboard, Store, Package, Wrench, Image as ImageIcon,
  Clock, MessageSquare, Star, BarChart3, CreditCard, Receipt,
  Megaphone, Settings, ShieldCheck, Menu, ChevronRight, Wallet,
} from 'lucide-react';
import { useAuth } from '@/lib/auth/auth-context';
import { isVendor } from '@/lib/auth/permissions';

const NAV_ITEMS = [
  { icon: LayoutDashboard, label: 'Overview', href: '/vendor-dashboard' },
  { icon: Store, label: 'Business Profile', href: '/vendor-dashboard/profile' },
  { icon: Package, label: 'Orders', href: '/vendor-dashboard/orders' },
  { icon: ShieldCheck, label: 'Verification', href: '/vendor-dashboard/verification' },
  { icon: Package, label: 'Products', href: '/vendor-dashboard/products' },
  { icon: Wrench, label: 'Services', href: '/vendor-dashboard/services' },
  { icon: ImageIcon, label: 'Gallery', href: '/vendor-dashboard/gallery' },
  { icon: Clock, label: 'Business Hours', href: '/vendor-dashboard/hours' },
  { icon: MessageSquare, label: 'Messages', href: '/vendor-dashboard/messages' },
  { icon: Star, label: 'Reviews', href: '/vendor-dashboard/reviews' },
  { icon: BarChart3, label: 'Analytics', href: '/vendor-dashboard/analytics' },
  { icon: CreditCard, label: 'Subscription', href: '/vendor-dashboard/subscription' },
  { icon: Wallet, label: 'Financial', href: '/vendor-dashboard/financial' },
  { icon: Receipt, label: 'Invoices', href: '/vendor-dashboard/invoices' },
  { icon: Wallet, label: 'Payment History', href: '/vendor-dashboard/payment-history' },
  { icon: Megaphone, label: 'Promotions', href: '/vendor-dashboard/promotions' },
  { icon: Settings, label: 'Settings', href: '/vendor-dashboard/settings' },
];

export function VendorSidebar({ vendorName, isVerified, subscriptionStatus }: {
  vendorName: string;
  isVerified: boolean;
  subscriptionStatus: string;
}) {
  const pathname = usePathname();

  return (
    <nav className="flex flex-col gap-1">
      <div className="mb-3 px-3">
        <p className="truncate text-sm font-semibold text-foreground">{vendorName}</p>
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {isVerified ? (
            <Badge className="bg-success/10 text-success border-success/20 text-xs">
              <ShieldCheck className="mr-1 h-3 w-3" /> Verified
            </Badge>
          ) : (
            <Badge variant="outline" className="text-muted-foreground text-xs">
              Unverified
            </Badge>
          )}
          <Badge
            className={`text-xs ${
              subscriptionStatus === 'active'
                ? 'bg-primary/10 text-primary border-primary/20'
                : 'bg-warning/10 text-warning border-warning/20'
            }`}
          >
            {subscriptionStatus === 'active' ? 'Active Plan' : 'No Plan'}
          </Badge>
        </div>
      </div>

      {NAV_ITEMS.map((item) => {
        const isActive = pathname === item.href ||
          (item.href !== '/vendor-dashboard' && pathname.startsWith(item.href));

        return (
          <Link
            key={item.href}
            href={item.href}
            className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
              isActive
                ? 'bg-primary/10 text-primary'
                : 'text-muted-foreground hover:bg-muted hover:text-foreground'
            }`}
          >
            <item.icon className="h-4 w-4 shrink-0" />
            <span className="flex-1">{item.label}</span>
            {isActive && <ChevronRight className="h-3.5 w-3.5" />}
          </Link>
        );
      })}
    </nav>
  );
}

export function VendorDashboardLayout({ children, vendorName, isVerified, subscriptionStatus }: {
  children: React.ReactNode;
  vendorName: string;
  isVerified: boolean;
  subscriptionStatus: string;
}) {
  const pathname = usePathname();

  return (
    <div className="flex min-h-screen">
      {/* Desktop sidebar */}
      <aside className="sticky top-16 hidden h-[calc(100vh-4rem)] w-64 shrink-0 border-r border-border bg-card/50 lg:block">
        <div className="h-full overflow-y-auto p-3">
          <VendorSidebar
            vendorName={vendorName}
            isVerified={isVerified}
            subscriptionStatus={subscriptionStatus}
          />
        </div>
      </aside>

      {/* Mobile sidebar trigger */}
      <div className="fixed bottom-4 left-4 z-40 lg:hidden">
        <Sheet>
          <SheetTrigger asChild>
            <Button size="icon" className="h-12 w-12 rounded-full shadow-lg">
              <Menu className="h-5 w-5" />
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="w-72 p-0">
            <div className="flex h-full flex-col">
              <div className="flex items-center justify-between border-b border-border p-4">
                <span className="text-sm font-semibold">Vendor Menu</span>
                <SheetClose />
              </div>
              <div className="flex-1 overflow-y-auto p-3">
                <VendorSidebar
                  vendorName={vendorName}
                  isVerified={isVerified}
                  subscriptionStatus={subscriptionStatus}
                />
              </div>
            </div>
          </SheetContent>
        </Sheet>
      </div>

      {/* Main content */}
      <div className="flex-1 min-w-0">
        <div className="container max-w-6xl py-6 sm:py-8 px-4 sm:px-6">
          {children}
        </div>
      </div>
    </div>
  );
}

export function VendorRouteGuard({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4">
        <p className="text-muted-foreground">Please sign in to access your vendor dashboard.</p>
        <Button asChild>
          <Link href="/signin">Sign in</Link>
        </Button>
      </div>
    );
  }

  if (!isVendor(user.role)) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4">
        <Store className="h-12 w-12 text-muted-foreground/40" />
        <div className="text-center">
          <p className="text-lg font-semibold text-foreground">Not a vendor account</p>
          <p className="mt-1 text-sm text-muted-foreground">
            You need a vendor account to access this page.
          </p>
        </div>
        <Button asChild>
          <Link href="/start-business">Register your business</Link>
        </Button>
      </div>
    );
  }

  return <>{children}</>;
}
