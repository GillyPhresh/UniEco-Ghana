'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Menu, User, LogOut, Settings, LayoutDashboard, Heart, MessageSquare, Bell, Store, Briefcase, ShoppingCart, Package } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetTrigger, SheetClose } from '@/components/ui/sheet';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Logo } from '@/components/layout/logo';
import { ThemeToggle } from '@/components/layout/theme-toggle';
import { navLinks } from '@/lib/constants/site';
import { useAuth } from '@/lib/auth/auth-context';
import { getPublicAvatarUrl } from '@/lib/storage/avatar-url';
import { ROLE_LABELS, isVendor } from '@/lib/auth/permissions';
import { Loader2 } from 'lucide-react';
import { getUnreadNotificationCount } from '@/lib/data/student-client';

export function SiteHeader() {
  const [scrolled, setScrolled] = useState(false);
  const { user, loading, signOut } = useAuth();
  const router = useRouter();
  const [unreadNotifs, setUnreadNotifs] = useState(0);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    if (!user) return;
    getUnreadNotificationCount().then(setUnreadNotifs);
  }, [user]);

  const handleSignOut = async () => {
    await signOut();
    router.push('/');
  };

  const initials = (user?.profile?.full_name || user?.email || 'U')
    .split(' ')
    .map((n) => n[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  return (
    <header
      className={`sticky top-0 z-50 w-full transition-all duration-300 ${
        scrolled
          ? 'glass border-b border-border/60 shadow-sm'
          : 'border-b border-transparent bg-transparent'
      }`}
    >
      <div className="container flex h-16 items-center justify-between gap-4">
        <Logo />

        <nav className="hidden items-center gap-1 lg:flex" aria-label="Primary">
          {navLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
            >
              {link.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          <ThemeToggle />

          {loading ? (
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          ) : user ? (
            <>
              {/* Student nav icons */}
              <div className="hidden items-center gap-1 sm:flex">
                <Link href="/marketplace" className="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground" title="Marketplace">
                  <ShoppingCart className="h-5 w-5" />
                </Link>
                <Link href="/orders" className="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground" title="My orders">
                  <Package className="h-5 w-5" />
                </Link>
                <Link href="/wishlist" className="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground" title="Wishlist">
                  <Heart className="h-5 w-5" />
                </Link>
                <Link href="/dashboard/messages" className="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground" title="Messages">
                  <MessageSquare className="h-5 w-5" />
                </Link>
                <Link href="/dashboard/notifications" className="relative rounded-lg p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground" title="Notifications">
                  <Bell className="h-5 w-5" />
                  {unreadNotifs > 0 && (
                    <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold text-primary-foreground">
                      {unreadNotifs}
                    </span>
                  )}
                </Link>
              </div>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="flex items-center gap-2 rounded-full border border-border p-0.5 pr-2 transition-colors hover:border-primary/40">
                  <Avatar className="h-8 w-8">
                    <AvatarImage src={getPublicAvatarUrl(user.profile?.avatar_url)} alt={user.profile?.full_name || ''} />
                    <AvatarFallback className="bg-primary/10 text-xs font-semibold text-primary">
                      {initials}
                    </AvatarFallback>
                  </Avatar>
                  <span className="hidden text-sm font-medium text-foreground sm:inline">
                    {user.profile?.full_name?.split(' ')[0] || user.email}
                  </span>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel>
                  <div className="flex flex-col gap-1">
                    <span className="text-sm font-semibold">{user.profile?.full_name || user.email}</span>
                    <span className="text-xs text-muted-foreground">{user.email}</span>
                    <Badge variant="secondary" className="mt-1 w-fit text-xs">
                      {ROLE_LABELS[user.role]}
                    </Badge>
                  </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => router.push('/profile')}>
                  <Settings className="mr-2 h-4 w-4" />
                  Profile &amp; settings
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => router.push('/marketplace')}>
                  <ShoppingCart className="mr-2 h-4 w-4" />
                  Marketplace
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => router.push('/orders')}>
                  <Package className="mr-2 h-4 w-4" />
                  My Orders
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => router.push('/wishlist')}>
                  <Heart className="mr-2 h-4 w-4" />
                  Wishlist
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => router.push('/dashboard')}>
                  <LayoutDashboard className="mr-2 h-4 w-4" />
                  Dashboard
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => router.push('/dashboard/saved')}>
                  <Heart className="mr-2 h-4 w-4" />
                  Saved items
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => router.push('/dashboard/messages')}>
                  <MessageSquare className="mr-2 h-4 w-4" />
                  Messages
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => router.push('/dashboard/notifications')}>
                  <Bell className="mr-2 h-4 w-4" />
                  Notifications
                </DropdownMenuItem>
                {isVendor(user.role) && (
                  <DropdownMenuItem onClick={() => router.push('/vendor-dashboard')}>
                    <Briefcase className="mr-2 h-4 w-4" />
                    Vendor Dashboard
                  </DropdownMenuItem>
                )}
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={handleSignOut} className="text-destructive">
                  <LogOut className="mr-2 h-4 w-4" />
                  Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            </>
          ) : (
            <>
              <Button asChild variant="ghost" size="sm" className="hidden sm:inline-flex">
                <Link href="/signin">Sign in</Link>
              </Button>
              <Button asChild size="sm" className="hidden sm:inline-flex">
                <Link href="/signup">Get started</Link>
              </Button>
            </>
          )}

          <Sheet>
            <SheetTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="lg:hidden"
                aria-label="Open navigation menu"
              >
                <Menu className="h-5 w-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className="w-full sm:w-80">
              <div className="flex h-full flex-col">
                <div className="flex items-center justify-between">
                  <Logo />
                  <SheetClose aria-label="Close menu" />
                </div>
                <nav className="mt-8 flex flex-col gap-1" aria-label="Mobile">
                  <AnimatePresence>
                    {navLinks.map((link, i) => (
                      <motion.div
                        key={link.href}
                        initial={{ opacity: 0, x: 20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: i * 0.05 }}
                      >
                        <SheetClose asChild>
                          <Link
                            href={link.href}
                            className="block rounded-lg px-4 py-3 text-base font-medium text-foreground/80 transition-colors hover:bg-muted hover:text-foreground"
                          >
                            {link.label}
                          </Link>
                        </SheetClose>
                      </motion.div>
                    ))}
                  </AnimatePresence>
                </nav>
                {user && (
                  <nav className="flex flex-col gap-1 border-t border-border pt-4" aria-label="Student">
                    <SheetClose asChild>
                      <Link href="/marketplace" className="flex items-center gap-3 rounded-lg px-4 py-3 text-base font-medium text-foreground/80 transition-colors hover:bg-muted hover:text-foreground">
                        <ShoppingCart className="h-5 w-5" /> Marketplace
                      </Link>
                    </SheetClose>
                    <SheetClose asChild>
                      <Link href="/orders" className="flex items-center gap-3 rounded-lg px-4 py-3 text-base font-medium text-foreground/80 transition-colors hover:bg-muted hover:text-foreground">
                        <Package className="h-5 w-5" /> My Orders
                      </Link>
                    </SheetClose>
                    <SheetClose asChild>
                      <Link href="/wishlist" className="flex items-center gap-3 rounded-lg px-4 py-3 text-base font-medium text-foreground/80 transition-colors hover:bg-muted hover:text-foreground">
                        <Heart className="h-5 w-5" /> Wishlist
                      </Link>
                    </SheetClose>
                    <SheetClose asChild>
                      <Link href="/dashboard" className="flex items-center gap-3 rounded-lg px-4 py-3 text-base font-medium text-foreground/80 transition-colors hover:bg-muted hover:text-foreground">
                        <LayoutDashboard className="h-5 w-5" /> Dashboard
                      </Link>
                    </SheetClose>
                    <SheetClose asChild>
                      <Link href="/dashboard/saved" className="flex items-center gap-3 rounded-lg px-4 py-3 text-base font-medium text-foreground/80 transition-colors hover:bg-muted hover:text-foreground">
                        <Heart className="h-5 w-5" /> Saved items
                      </Link>
                    </SheetClose>
                    <SheetClose asChild>
                      <Link href="/dashboard/messages" className="flex items-center gap-3 rounded-lg px-4 py-3 text-base font-medium text-foreground/80 transition-colors hover:bg-muted hover:text-foreground">
                        <MessageSquare className="h-5 w-5" /> Messages
                      </Link>
                    </SheetClose>
                    <SheetClose asChild>
                      <Link href="/dashboard/notifications" className="flex items-center gap-3 rounded-lg px-4 py-3 text-base font-medium text-foreground/80 transition-colors hover:bg-muted hover:text-foreground">
                        <Bell className="h-5 w-5" /> Notifications
                      </Link>
                    </SheetClose>
                    <SheetClose asChild>
                      <Link href="/start-business" className="flex items-center gap-3 rounded-lg px-4 py-3 text-base font-medium text-foreground/80 transition-colors hover:bg-muted hover:text-foreground">
                        <Store className="h-5 w-5" /> Start a business
                      </Link>
                    </SheetClose>
                    {isVendor(user.role) && (
                      <SheetClose asChild>
                        <Link href="/vendor-dashboard" className="flex items-center gap-3 rounded-lg px-4 py-3 text-base font-medium text-foreground/80 transition-colors hover:bg-muted hover:text-foreground">
                          <Briefcase className="h-5 w-5" /> Vendor Dashboard
                        </Link>
                      </SheetClose>
                    )}
                  </nav>
                )}
                <div className="mt-auto flex flex-col gap-2 pt-6">
                  {user ? (
                    <>
                      <SheetClose asChild>
                        <Button asChild variant="outline">
                          <Link href="/profile">Profile & settings</Link>
                        </Button>
                      </SheetClose>
                      <SheetClose asChild>
                        <Button variant="destructive" onClick={handleSignOut}>
                          <LogOut className="mr-2 h-4 w-4" />
                          Sign out
                        </Button>
                      </SheetClose>
                    </>
                  ) : (
                    <>
                      <SheetClose asChild>
                        <Button asChild variant="outline">
                          <Link href="/signin">Sign in</Link>
                        </Button>
                      </SheetClose>
                      <SheetClose asChild>
                        <Button asChild>
                          <Link href="/signup">Get started</Link>
                        </Button>
                      </SheetClose>
                    </>
                  )}
                </div>
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </header>
  );
}
