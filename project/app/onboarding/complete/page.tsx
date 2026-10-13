'use client';

import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { RouteGuard } from '@/lib/auth/route-guard';
import { useAuth } from '@/lib/auth/auth-context';
import { AuthLayout } from '@/components/auth/auth-layout';
import { Button } from '@/components/ui/button';
import { CheckCircle2, GraduationCap, Store, ArrowRight } from 'lucide-react';

export default function OnboardingCompletePage() {
  return (
    <RouteGuard requireAuth>
      <CompleteScreen />
    </RouteGuard>
  );
}

function CompleteScreen() {
  const { user } = useAuth();
  const router = useRouter();

  const isStudent = user?.role === 'student' || user?.role === 'student_vendor';
  const isVendor = user?.role === 'external_vendor' || user?.role === 'student_vendor';

  return (
    <AuthLayout title="You're all set!" showBackLink={false}>
      <div className="space-y-8 text-center">
        <motion.div
          initial={{ scale: 0, rotate: -180 }}
          animate={{ scale: 1, rotate: 0 }}
          transition={{ type: 'spring', duration: 0.8 }}
          className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-success/10"
        >
          <CheckCircle2 className="h-10 w-10 text-success" />
        </motion.div>

        <div className="space-y-2">
          <h2 className="font-display text-2xl font-bold text-foreground">
            Welcome to UniEco Ghana!
          </h2>
          <p className="text-sm text-muted-foreground">
            Your profile has been created successfully. Here is what happens next:
          </p>
        </div>

        <div className="space-y-3 text-left">
          {isStudent && (
            <StatusCard
              icon={GraduationCap}
              title="Student verification in review"
              description="Our team is reviewing your student details. You can start exploring UniEco Ghana while we verify your account. Some features need a verified student status."
              status="pending"
            />
          )}
          {isVendor && (
            <StatusCard
              icon={Store}
              title="Business approval in review"
              description="Your business registration is being reviewed. Once approved, your business will go live and you can start listing products and receiving orders."
              status="pending"
            />
          )}
        </div>

        <Button onClick={() => router.push('/')} size="lg" className="w-full">
          Go to dashboard
          <ArrowRight className="ml-2 h-4 w-4" />
        </Button>
      </div>
    </AuthLayout>
  );
}

function StatusCard({
  icon: Icon,
  title,
  description,
  status,
}: {
  icon: typeof GraduationCap;
  title: string;
  description: string;
  status: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-muted/30 p-4">
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Icon className="h-5 w-5" />
        </span>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <p className="font-semibold text-foreground">{title}</p>
            <span className="rounded-full bg-warning/15 px-2 py-0.5 text-xs font-medium text-warning">
              {status}
            </span>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">{description}</p>
        </div>
      </div>
    </div>
  );
}
