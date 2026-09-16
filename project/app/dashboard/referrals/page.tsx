'use client';

import { RouteGuard } from '@/lib/auth/route-guard';
import { Card, CardContent } from '@/components/ui/card';
import { Gift } from 'lucide-react';

export default function StudentReferralsPage() {
  return (
    <RouteGuard requireAuth>
      <main className="min-h-screen bg-background pb-20">
        <div className="mx-auto max-w-2xl p-4 sm:p-6">
          <Card>
            <CardContent className="p-6 text-center">
              <Gift className="mx-auto h-8 w-8 text-muted-foreground" />
              <h1 className="mt-4 font-display text-xl font-bold text-foreground">Referral programme coming later</h1>
              <p className="mt-2 text-sm text-muted-foreground">
                UniEco is not currently offering referral rewards, credits, or payouts.
              </p>
            </CardContent>
          </Card>
        </div>
      </main>
    </RouteGuard>
  );
}
