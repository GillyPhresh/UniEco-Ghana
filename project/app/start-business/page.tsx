'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/lib/auth/auth-context';
import { RouteGuard } from '@/lib/auth/route-guard';
import { SiteHeader } from '@/components/layout/site-header';
import { SiteFooter } from '@/components/layout/site-footer';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { CheckCircle2, Store, ShieldCheck, FileText, Camera, ArrowRight, Sparkles } from 'lucide-react';

export default function StartBusinessPage() {
  return (
    <RouteGuard requireAuth>
      <StartBusinessContent />
    </RouteGuard>
  );
}

function StartBusinessContent() {
  const { user } = useAuth();
  const [verificationStatus, setVerificationStatus] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    setVerificationStatus(user.studentProfile?.verification_status || null);
  }, [user]);

  if (!user) return null;

  const isVerifiedStudent = user.studentProfile?.is_verified_student;

  const steps = [
    {
      icon: ShieldCheck,
      title: 'Verify your student account',
      description: 'Before you can list a business, we need to confirm you are a real student at your university. This builds trust with buyers.',
      action: 'Go to verification',
      href: '/profile',
      done: isVerifiedStudent,
    },
    {
      icon: Store,
      title: 'Register your business',
      description: 'Tell us about your business — name, what you sell, your campus, and how students can reach you.',
      action: 'Start registration',
      href: '/onboarding/vendor',
      done: false,
    },
    {
      icon: FileText,
      title: 'Submit for review',
      description: 'Our team reviews your business details. Student businesses usually get approved within 24 hours.',
      action: null,
      done: false,
    },
    {
      icon: Camera,
      title: 'Start selling',
      description: 'Once approved, your business goes live. Add products, upload photos, and start receiving messages from students.',
      action: null,
      done: false,
    },
  ];

  return (
    <>
      <SiteHeader />
      <main className="container py-6 sm:py-8">
        {/* Hero */}
        <div className="mb-8 rounded-2xl border border-primary/20 bg-gradient-to-br from-primary/5 to-accent/5 p-6 sm:p-8">
          <div className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            <span className="text-sm font-semibold text-primary">Student Business Program</span>
          </div>
          <h1 className="mt-3 font-display text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
            Start your student business
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground sm:text-base">
            Selling food from your hall? Doing alterations? Offering tutorials?
            Turn your side hustle into a verified campus business and reach
            thousands of students at your university.
          </p>
        </div>

        {/* Verification status banner */}
        {verificationStatus && verificationStatus !== 'approved' && (
          <Card className="mb-6 border-warning/30 bg-warning/5">
            <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-2">
                {verificationStatus === 'pending' ? (
                  <Badge className="bg-warning/10 text-warning border-warning/20">Verification pending</Badge>
                ) : verificationStatus === 'rejected' ? (
                  <Badge className="bg-destructive/10 text-destructive border-destructive/20">Verification rejected</Badge>
                ) : (
                  <Badge variant="outline">Not verified</Badge>
                )}
                <p className="text-sm text-muted-foreground">
                  {verificationStatus === 'pending'
                    ? 'Your student verification is being reviewed. You can start your business profile while you wait.'
                    : verificationStatus === 'rejected'
                    ? 'Your verification was rejected. Please check your profile for details and re-submit.'
                    : 'Verify your student account first to unlock business registration.'}
                </p>
              </div>
              <Button asChild size="sm" variant="outline">
                <Link href="/profile">Check status</Link>
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Benefits */}
        <div className="mb-8 grid gap-4 sm:grid-cols-3">
          {[
            { icon: Store, title: 'Free to start', desc: 'No listing fees, no subscription. List your business and products for free.' },
            { icon: ShieldCheck, title: 'Verified badge', desc: 'A "Verified Student Business" badge tells students you are legit.' },
            { icon: ArrowRight, title: 'Reach every student', desc: 'Get discovered by students across your entire campus, not just your hall.' },
          ].map((b) => (
            <Card key={b.title}>
              <CardContent className="p-5">
                <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <b.icon className="h-5 w-5" />
                </span>
                <h3 className="mt-3 text-sm font-semibold text-foreground">{b.title}</h3>
                <p className="mt-1 text-sm text-muted-foreground">{b.desc}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Steps */}
        <h2 className="mb-4 text-lg font-semibold text-foreground">How it works</h2>
        <div className="space-y-4">
          {steps.map((step, i) => (
            <Card key={step.title} className={step.done ? 'border-success/30' : ''}>
              <CardContent className="flex items-start gap-4 p-5">
                <div className="flex items-center gap-3">
                  <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${
                    step.done ? 'bg-success/10 text-success' : 'bg-primary/10 text-primary'
                  }`}>
                    {step.done ? <CheckCircle2 className="h-5 w-5" /> : <step.icon className="h-5 w-5" />}
                  </span>
                  <span className="hidden text-2xl font-bold text-muted-foreground/30 sm:block">{i + 1}</span>
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-semibold text-foreground">{step.title}</h3>
                    {step.done && <Badge className="bg-success/10 text-success text-xs">Done</Badge>}
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">{step.description}</p>
                  {step.action && !step.done && (
                    <Button asChild size="sm" variant="outline" className="mt-3">
                      <Link href={step.href}>
                        {step.action}
                        <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
                      </Link>
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* CTA */}
        <Card className="mt-8 border-primary/20 bg-gradient-to-br from-primary/5 to-accent/5">
          <CardContent className="flex flex-col items-center gap-4 p-6 text-center sm:flex-row sm:justify-between sm:text-left">
            <div>
              <h3 className="font-display text-lg font-semibold text-foreground">Ready to get started?</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                {isVerifiedStudent
                  ? 'Your student account is verified. You can register your business now.'
                  : 'Verify your student account first, then register your business.'}
              </p>
            </div>
            <Button asChild size="lg">
              <Link href={isVerifiedStudent ? '/onboarding/vendor' : '/profile'}>
                {isVerifiedStudent ? 'Register your business' : 'Verify your account'}
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
          </CardContent>
        </Card>
      </main>
      <SiteFooter />
    </>
  );
}
