'use client';

import { VendorDashboardLayout, VendorRouteGuard } from '@/components/vendor/vendor-dashboard-layout';
import { Card, CardContent } from '@/components/ui/card';
import { Gift } from 'lucide-react';

export default function ReferralsPage() {
  return (
    <VendorRouteGuard>
      <VendorDashboardLayout vendorName="" isVerified={false} subscriptionStatus="none">
        <div className="mx-auto max-w-2xl p-4 sm:p-6">
          <Card>
            <CardContent className="p-6 text-center">
              <Gift className="mx-auto h-8 w-8 text-muted-foreground" />
              <h1 className="mt-4 font-display text-xl font-bold text-foreground">Referral programme coming later</h1>
              <p className="mt-2 text-sm text-muted-foreground">
                Referral rewards, credits, and payouts are not available in UniEco at this time.
              </p>
            </CardContent>
          </Card>
        </div>
      </VendorDashboardLayout>
    </VendorRouteGuard>
  );
}
