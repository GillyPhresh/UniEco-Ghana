'use client';

import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { Home, MapPinned, ShoppingCart, Newspaper, User } from 'lucide-react';
import { useAuth } from '@/lib/auth/auth-context';
import { cn } from '@/lib/utils';

const NAV_ITEMS = [
  { href: '/', label: 'Home', icon: Home, sections: ['/community'] },
  { href: '/marketplace', label: 'Shop', icon: ShoppingCart, sections: ['/business', '/cart', '/orders', '/wishlist', '/categories'] },
  { href: '/campus-mate', label: 'Mate', icon: MapPinned, sections: [] },
  { href: '/updates', label: 'Updates', icon: Newspaper, sections: ['/events'] },
  { href: '/dashboard', label: 'Account', icon: User, sections: ['/profile'] },
] as const;

const HIDDEN_SECTIONS = [
  '/admin', '/vendor-dashboard', '/dashboard/messages', '/signin', '/signup',
  '/onboarding', '/auth', '/forgot-password', '/verify-email', '/payments', '/checkout',
];

function withinSection(pathname: string, section: string) {
  return pathname === section || (section !== '/' && pathname.startsWith(`${section}/`));
}

export function MobileBottomNav() {
  const pathname = usePathname();
  const { user } = useAuth();

  if (HIDDEN_SECTIONS.some((section) => withinSection(pathname, section))) return null;

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-50 border-t border-border/80 bg-background/95 backdrop-blur-xl lg:hidden"
      aria-label="Mobile bottom navigation"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <div className="mx-auto grid min-h-[3.75rem] max-w-xl grid-cols-5 items-stretch gap-1 px-2 pb-1 pt-1">
        {NAV_ITEMS.map((item) => {
          const isActive = withinSection(pathname, item.href) || item.sections.some((section) => withinSection(pathname, section));
          const href = item.label === 'Account' && !user ? '/signin?next=%2Fdashboard' : item.href;
          const current = isActive && (pathname === item.href ? 'page' : 'location');
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={href}
              className={cn(
                'relative flex min-h-[3.25rem] min-w-0 touch-manipulation flex-col items-center justify-center gap-0.5 rounded-lg px-1 py-1 transition-colors duration-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring',
                isActive ? 'text-foreground' : 'text-muted-foreground hover:text-foreground',
              )}
              aria-current={current || undefined}
            >
              <span className={cn('flex h-9 w-10 items-center justify-center transition-colors', isActive ? 'text-foreground' : 'text-muted-foreground')}>
                <Icon aria-hidden="true" className="h-[23px] w-[23px]" strokeWidth={isActive ? 2.6 : 1.8} fill={isActive && item.href === '/' ? 'currentColor' : 'none'} />
              </span>
              <span className="text-[10px] font-medium leading-none">{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
