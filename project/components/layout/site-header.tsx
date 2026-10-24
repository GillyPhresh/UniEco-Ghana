'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Bell,
  Briefcase,
  CalendarDays,
  Compass,
  Heart,
  Home,
  LayoutDashboard,
  LogOut,
  Menu,
  MessageSquare,
  Package,
  Search,
  ShieldCheck,
  Settings,
  ShoppingCart,
  Store,
  University,
} from 'lucide-react';
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
import { useAuth } from '@/lib/auth/auth-context';
import { getPublicAvatarUrl } from '@/lib/storage/avatar-url';
import { ROLE_LABELS, isVendor } from '@/lib/auth/permissions';
import { Loader2 } from 'lucide-react';
import { getUnreadNotificationCount } from '@/lib/data/student-client';

const networkLinks = [
  { href: '/', label: 'Home', icon: Home },
  { href: '/discover', label: 'Discover', icon: Compass },
  { href: '/marketplace', label: 'Marketplace', icon: ShoppingCart },
  { href: '/events', label: 'Events', icon: CalendarDays },
  { href: '/universities', label: 'Universities', icon: University },
] as const;

export function SiteHeader() {
  const [scrolled, setScrolled] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
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
    getUnreadNotificationCount().then(setUnreadNotifs).catch(() => setUnreadNotifs(0));
  }, [user]);

  const handleSignOut = async () => {
    await signOut();
    router.push('/');
  };

  const submitSearch = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const value = searchQuery.trim();
    router.push(value ? `/search?q=${encodeURIComponent(value)}` : '/search');
  };

  const initials = (user?.profile?.full_name || user?.email || 'U')
    .split(' ')
    .map((n) => n[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  return (
    <header className={`sticky top-0 z-50 w-full border-b border-border/80 bg-card/95 backdrop-blur-xl transition-shadow ${scrolled ? 'shadow-sm' : ''}`}>
      <div className="mx-auto flex h-16 max-w-7xl items-center gap-3 px-4 sm:px-6">
        <Logo />

        <form onSubmit={submitSearch} className="relative hidden min-w-0 flex-1 md:flex md:max-w-[20rem] lg:max-w-[24rem]">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            aria-label="Search UniEco Ghana"
            placeholder="Search businesses, events..."
            className="h-10 w-full rounded-lg border border-transparent bg-muted/70 pl-9 pr-3 text-sm outline-none transition-colors placeholder:text-muted-foreground focus:border-primary/40 focus:bg-background focus:ring-2 focus:ring-primary/10"
          />
        </form>

        <nav className="hidden flex-1 items-stretch justify-center gap-0.5 lg:flex" aria-label="Primary">
          {networkLinks.map(({ href, label, icon: Icon }) => (
            <Link key={href} href={href} className="group flex min-w-[4.5rem] flex-col items-center justify-center gap-0.5 rounded-lg px-2 py-1.5 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-primary">
              <Icon className="h-[18px] w-[18px] transition-transform group-hover:-translate-y-0.5" />
              <span>{label}</span>
            </Link>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-1.5">
          {loading ? (
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          ) : user ? (
            <>
              <Link href="/search" className="flex h-10 w-10 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-primary md:hidden" aria-label="Search"><Search className="h-[18px] w-[18px]" /></Link>
              <div className="hidden items-center gap-1 sm:flex">
                <HeaderIconLink href="/dashboard/messages" label="Messages" icon={MessageSquare} />
                <HeaderIconLink href="/dashboard/notifications" label="Notifications" icon={Bell} count={unreadNotifs} />
              </div>
              {user.role === 'super_admin' && (
                <Button asChild size="sm" variant="outline" className="hidden border-primary/30 text-primary hover:bg-primary/10 lg:inline-flex">
                  <Link href="/admin" aria-label="Open management system"><ShieldCheck className="mr-1.5 h-4 w-4" />Management system</Link>
                </Button>
              )}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button className="flex items-center gap-2 rounded-lg p-1 transition-colors hover:bg-muted" aria-label="Open account menu">
                    <Avatar className="h-9 w-9 border border-primary/20">
                      <AvatarImage src={getPublicAvatarUrl(user.profile?.avatar_url)} alt={user.profile?.full_name || ''} />
                      <AvatarFallback className="bg-primary/10 text-xs font-semibold text-primary">{initials}</AvatarFallback>
                    </Avatar>
                    <span className="hidden max-w-24 truncate text-sm font-semibold text-foreground xl:inline">{user.profile?.full_name?.split(' ')[0] || user.email}</span>
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-60">
                  <DropdownMenuLabel>
                    <div className="flex flex-col gap-1">
                      <span className="text-sm font-semibold">{user.profile?.full_name || user.email}</span>
                      <span className="truncate text-xs text-muted-foreground">{user.email}</span>
                      <Badge variant="secondary" className="mt-1 w-fit text-xs">{ROLE_LABELS[user.role]}</Badge>
                    </div>
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => router.push('/profile')}><Settings className="mr-2 h-4 w-4" />Profile &amp; settings</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => router.push('/dashboard')}><LayoutDashboard className="mr-2 h-4 w-4" />My dashboard</DropdownMenuItem>
                  {user.role === 'super_admin' && <DropdownMenuItem onClick={() => router.push('/admin')}><ShieldCheck className="mr-2 h-4 w-4 text-primary" />Management system</DropdownMenuItem>}
                  <DropdownMenuItem onClick={() => router.push('/marketplace')}><ShoppingCart className="mr-2 h-4 w-4" />Marketplace</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => router.push('/orders')}><Package className="mr-2 h-4 w-4" />My orders</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => router.push('/wishlist')}><Heart className="mr-2 h-4 w-4" />Saved items</DropdownMenuItem>
                  {isVendor(user.role) && <DropdownMenuItem onClick={() => router.push('/vendor-dashboard')}><Briefcase className="mr-2 h-4 w-4" />Vendor dashboard</DropdownMenuItem>}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={handleSignOut} className="text-destructive"><LogOut className="mr-2 h-4 w-4" />Sign out</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </>
          ) : (
            <>
              <Button asChild variant="ghost" size="sm" className="hidden sm:inline-flex"><Link href="/signin">Sign in</Link></Button>
              <Button asChild size="sm" className="hidden sm:inline-flex"><Link href="/signup">Join UniEco</Link></Button>
            </>
          )}

          <Sheet>
            <SheetTrigger asChild>
              <Button variant="outline" size="icon" className="h-10 w-10 lg:hidden" aria-label="Open navigation menu"><Menu className="h-5 w-5" /></Button>
            </SheetTrigger>
            <SheetContent side="right" className="w-full max-w-sm p-0">
              <div className="flex h-full flex-col">
                <div className="flex items-center justify-between border-b border-border px-5 py-4"><Logo /><SheetClose aria-label="Close menu" /></div>
                <div className="border-b border-border p-4">
                  <form onSubmit={submitSearch} className="relative">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <input value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} aria-label="Search UniEco Ghana" placeholder="Search UniEco Ghana" className="h-11 w-full rounded-lg border border-border bg-muted/50 pl-9 pr-3 text-sm outline-none focus:border-primary/40 focus:ring-2 focus:ring-primary/10" />
                  </form>
                </div>
                <nav className="flex flex-col gap-1 p-4" aria-label="Mobile primary">
                  <AnimatePresence>
                    {networkLinks.map(({ href, label, icon: Icon }, index) => (
                      <motion.div key={href} initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: index * 0.04 }}>
                        <SheetClose asChild><Link href={href} className="flex items-center gap-3 rounded-lg px-4 py-3 text-base font-semibold text-foreground/80 transition-colors hover:bg-muted hover:text-primary"><Icon className="h-5 w-5 text-primary" />{label}</Link></SheetClose>
                      </motion.div>
                    ))}
                  </AnimatePresence>
                </nav>
                {user && (
                  <nav className="flex flex-col gap-1 border-t border-border px-4 py-4" aria-label="Account">
                    <SheetClose asChild><Link href="/dashboard" className="flex items-center gap-3 rounded-lg px-4 py-3 text-sm font-semibold hover:bg-muted"><LayoutDashboard className="h-5 w-5 text-primary" />My dashboard</Link></SheetClose>
                    {user.role === 'super_admin' && <SheetClose asChild><Link href="/admin" className="flex items-center gap-3 rounded-lg border border-primary/20 bg-primary/5 px-4 py-3 text-sm font-semibold text-primary hover:bg-primary/10"><ShieldCheck className="h-5 w-5" />Management system</Link></SheetClose>}
                    <SheetClose asChild><Link href="/dashboard/messages" className="flex items-center gap-3 rounded-lg px-4 py-3 text-sm font-semibold hover:bg-muted"><MessageSquare className="h-5 w-5 text-primary" />Messages</Link></SheetClose>
                    <SheetClose asChild><Link href="/dashboard/notifications" className="flex items-center gap-3 rounded-lg px-4 py-3 text-sm font-semibold hover:bg-muted"><Bell className="h-5 w-5 text-primary" />Notifications</Link></SheetClose>
                    <SheetClose asChild><Link href="/start-business" className="flex items-center gap-3 rounded-lg px-4 py-3 text-sm font-semibold hover:bg-muted"><Store className="h-5 w-5 text-primary" />Start a business</Link></SheetClose>
                  </nav>
                )}
                <div className="mt-auto flex flex-col gap-2 border-t border-border p-5">
                  {user ? <><SheetClose asChild><Button asChild variant="outline"><Link href="/profile">Profile &amp; settings</Link></Button></SheetClose><SheetClose asChild><Button variant="destructive" onClick={handleSignOut}><LogOut className="mr-2 h-4 w-4" />Sign out</Button></SheetClose></> : <><SheetClose asChild><Button asChild variant="outline"><Link href="/signin">Sign in</Link></Button></SheetClose><SheetClose asChild><Button asChild><Link href="/signup">Join UniEco</Link></Button></SheetClose></>}
                </div>
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </div>
      <div className="ghana-stripe h-[3px] w-full" aria-hidden="true" />
    </header>
  );
}

function HeaderIconLink({ href, label, icon: Icon, count = 0 }: { href: string; label: string; icon: typeof Bell; count?: number }) {
  return (
    <Link href={href} className="relative flex h-10 w-10 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-primary" aria-label={label}>
      <Icon className="h-[18px] w-[18px]" />
      {count > 0 && <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold text-primary-foreground">{count > 99 ? '99+' : count}</span>}
    </Link>
  );
}
