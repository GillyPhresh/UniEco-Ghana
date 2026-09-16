'use client';

import { AdminLayout, AdminRouteGuard } from '@/components/admin/admin-layout';
import { Card, CardContent } from '@/components/ui/card';
import { Gift } from 'lucide-react';

export default function AdminReferralsPage() {
  return (
    <AdminRouteGuard>
      <AdminLayout>
        <div className="mx-auto max-w-2xl p-4 sm:p-6">
          <Card>
            <CardContent className="p-6 text-center">
              <Gift className="mx-auto h-8 w-8 text-muted-foreground" />
              <h1 className="mt-4 font-display text-xl font-bold text-foreground">Referral programme deferred</h1>
              <p className="mt-2 text-sm text-muted-foreground">
                Referral rewards have no active financial model, balance, or payout workflow.
              </p>
            </CardContent>
          </Card>
        </div>
      </AdminLayout>
    </AdminRouteGuard>
  );
}
