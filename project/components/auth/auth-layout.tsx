'use client';

import Link from 'next/link';
import { Logo } from '@/components/layout/logo';
import { ThemeToggle } from '@/components/layout/theme-toggle';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';

export function AuthLayout({
  children,
  title,
  subtitle,
  backHref = '/',
  backLabel = 'Back to home',
  showBackLink = true,
}: {
  children: React.ReactNode;
  title?: string;
  subtitle?: string;
  backHref?: string;
  backLabel?: string;
  showBackLink?: boolean;
}) {
  return (
    <div className="flex min-h-screen flex-col lg:flex-row">
      {/* Brand panel — hidden on mobile, visible on large screens */}
      <div className="relative hidden flex-1 flex-col justify-between overflow-hidden bg-gradient-to-br from-primary to-primary-700 p-12 text-primary-foreground lg:flex">
        <div className="absolute inset-0 bg-dot opacity-20" />
        <div className="absolute -right-20 top-1/4 h-72 w-72 rounded-full bg-white/10 blur-3xl" />
        <div className="absolute -bottom-20 -left-20 h-72 w-72 rounded-full bg-secondary/20 blur-3xl" />

        <div className="relative">
          <Link href="/" className="inline-flex items-center gap-2 font-display text-xl font-bold text-primary-foreground">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/20">
              <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" aria-hidden="true">
                <path d="M12 3L20 18H4L12 3Z" fill="currentColor" fillOpacity="0.95" />
                <circle cx="12" cy="15.5" r="2.2" fill="#f59e0b" />
              </svg>
            </span>
            UniEco Ghana
          </Link>
        </div>

        <div className="relative space-y-6">
          <h2 className="font-display text-3xl font-bold leading-tight">
            Connecting Students, Businesses &amp; Opportunities
          </h2>
          <p className="max-w-md text-primary-foreground/80">
            The campus marketplace built for every tertiary institution in Ghana.
            Join your campus community today.
          </p>
          <p className="max-w-md text-sm text-primary-foreground/70">
            Start with your verified university profile and discover campus businesses,
            services, products, and events as UniEco launches across Ghana.
          </p>
        </div>

        <div className="relative text-sm text-primary-foreground/60">
          &copy; {new Date().getFullYear()} UniEco Ghana. Made in Ghana.
        </div>
      </div>

      {/* Form panel */}
      <div className="flex flex-1 flex-col">
        <div className="flex items-center justify-between p-4 sm:p-6">
          <div className="lg:hidden">
            <Logo />
          </div>
          <div className="ml-auto flex items-center gap-2">
            {showBackLink && (
              <Button asChild variant="ghost" size="sm">
                <Link href={backHref}>
                  <ArrowLeft className="mr-1.5 h-4 w-4" />
                  <span className="hidden sm:inline">{backLabel}</span>
                  <span className="sm:hidden">Back</span>
                </Link>
              </Button>
            )}
            <ThemeToggle />
          </div>
        </div>

        <div className="flex flex-1 items-center justify-center px-4 pb-12 sm:px-6">
          <div className="w-full max-w-md">
            {title && (
              <div className="mb-8 text-center">
                <h1 className="font-display text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
                  {title}
                </h1>
                {subtitle && (
                  <p className="mt-2 text-sm text-muted-foreground">{subtitle}</p>
                )}
              </div>
            )}
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}
