'use client';

import Link from 'next/link';
import { Logo } from '@/components/layout/logo';
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
    <div className="workspace-page flex min-h-screen flex-col lg:flex-row">
      {/* Brand panel — hidden on mobile, visible on large screens */}
      <div className="relative hidden flex-1 flex-col justify-between overflow-hidden border-r border-border bg-[#0e3b32] p-12 text-white lg:flex">
        <div className="absolute inset-x-0 top-0 h-1 ghana-stripe" />

        <div className="relative">
          <Link href="/" className="inline-flex items-center gap-3 font-display text-xl font-bold text-white">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-white p-1"><img src="/unieco-mark.svg" alt="" className="h-full w-full" /></span>
            <span>UniEco Ghana</span>
          </Link>
        </div>

        <div className="relative space-y-6">
          <h2 className="font-display text-3xl font-bold leading-tight">
            Your campus, in one place.
          </h2>
          <p className="max-w-md text-white/80">
            Find trusted campus businesses, useful services, events and opportunities across Ghana.
          </p>
          <p className="max-w-md text-sm text-white/65">
            A practical digital home for students and the communities around them.
          </p>
        </div>

        <div className="relative text-sm text-primary-foreground/60">
          &copy; {new Date().getFullYear()} UniEco Ghana. Made in Ghana.
        </div>
      </div>

      {/* Form panel */}
      <div className="flex flex-1 flex-col">
        <div className="flex items-center justify-between border-b border-border bg-card p-4 sm:p-6">
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
          </div>
        </div>

        <div className="flex flex-1 items-center justify-center px-4 pb-12 sm:px-6">
          <div className="workspace-card w-full max-w-md p-6 sm:p-8">
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
