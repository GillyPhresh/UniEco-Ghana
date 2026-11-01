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
  onBackClick,
  wide = false,
}: {
  children: React.ReactNode;
  title?: string;
  subtitle?: string;
  backHref?: string;
  backLabel?: string;
  showBackLink?: boolean;
  onBackClick?: () => void;
  wide?: boolean;
}) {
  return (
    <div className="workspace-page flex min-h-screen flex-col lg:flex-row">
      {/* Brand panel — hidden on mobile, visible on large screens */}
      <div className={`relative hidden flex-col justify-between overflow-hidden border-r border-border bg-[#0e3b32] p-8 text-white lg:flex ${wide ? 'lg:flex-[0.85] lg:p-10' : 'flex-1 lg:p-12'}`}>
        <div className="absolute inset-x-0 top-0 h-1 ghana-stripe" />

        <div className="relative">
          <Link href="/" className="inline-flex items-center gap-3 font-display text-xl font-bold text-white">
            <img src="/unieco-ghana-dark-logo.png" alt="UniEco Ghana" className="h-24 w-24 object-contain" />
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
      <div className={`flex flex-1 flex-col ${wide ? 'lg:flex-[1.15]' : ''}`}>
        <div className="flex items-center justify-between border-b border-border bg-card p-4 sm:p-6">
          <div className="lg:hidden">
            <Logo />
          </div>
          <div className="ml-auto flex items-center gap-2">
            {showBackLink && (
              onBackClick ? (
                <Button variant="ghost" size="sm" onClick={onBackClick}>
                  <ArrowLeft className="mr-1.5 h-4 w-4" />
                  <span className="hidden sm:inline">{backLabel}</span>
                  <span className="sm:hidden">{backLabel === 'Sign out' ? 'Sign out' : 'Back'}</span>
                </Button>
              ) : (
                <Button asChild variant="ghost" size="sm">
                  <Link href={backHref}>
                    <ArrowLeft className="mr-1.5 h-4 w-4" />
                    <span className="hidden sm:inline">{backLabel}</span>
                    <span className="sm:hidden">Back</span>
                  </Link>
                </Button>
              )
            )}
          </div>
        </div>

        <div className="flex flex-1 items-center justify-center px-4 pb-12 sm:px-6">
          <div className={`workspace-card w-full p-5 sm:p-8 ${wide ? 'max-w-3xl' : 'max-w-md'}`}>
            {title && (
              <div className={`mb-8 ${wide ? 'text-center lg:text-left' : 'text-center'}`}>
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
