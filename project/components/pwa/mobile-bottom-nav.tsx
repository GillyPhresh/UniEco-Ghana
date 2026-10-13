'use client';

import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { Home, Search, ShoppingCart, Package, User } from 'lucide-react';
import { motion } from 'framer-motion';
import { useAuth } from '@/lib/auth/auth-context';

const NAV_ITEMS = [
  { href: '/', label: 'Home', icon: Home },
  { href: '/marketplace', label: 'Shop', icon: ShoppingCart },
  { href: '/discover', label: 'Discover', icon: Search },
  { href: '/orders', label: 'Orders', icon: Package },
  { href: '/dashboard', label: 'Account', icon: User },
];

export function MobileBottomNav() {
  const pathname = usePathname();
  const { user } = useAuth();

  // Don't show on admin or vendor dashboard — they have their own layouts
  if (pathname.startsWith('/admin') || pathname.startsWith('/vendor-dashboard')) {
    return null;
  }

  // Adjust the last item based on auth state
  const items = user
    ? NAV_ITEMS
    : [
        { href: '/', label: 'Home', icon: Home },
        { href: '/marketplace', label: 'Shop', icon: ShoppingCart },
        { href: '/discover', label: 'Discover', icon: Search },
        { href: '/events', label: 'Events', icon: Package },
        { href: '/signin', label: 'Sign in', icon: User },
      ];

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-40 border-t border-border bg-card/95 backdrop-blur-md lg:hidden"
      aria-label="Mobile bottom navigation"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <div className="flex items-stretch justify-around">
        {items.map((item) => {
          const isActive =
            pathname === item.href ||
            (item.href !== '/' && pathname.startsWith(item.href));
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className="relative flex flex-1 flex-col items-center gap-0.5 py-2"
              aria-label={item.label}
              aria-current={isActive ? 'page' : undefined}
            >
              {isActive && (
                <motion.div
                  layoutId="bottom-nav-active"
                  className="absolute inset-x-2 top-0 h-0.5 rounded-full bg-primary"
                  transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                />
              )}
              <Icon
                className={`h-5 w-5 transition-colors ${
                  isActive ? 'text-primary' : 'text-muted-foreground'
                }`}
              />
              <span
                className={`text-[10px] font-medium transition-colors ${
                  isActive ? 'text-primary' : 'text-muted-foreground'
                }`}
              >
                {item.label}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
