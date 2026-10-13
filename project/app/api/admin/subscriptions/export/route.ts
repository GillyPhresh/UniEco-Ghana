import { handleAdminCsvExport } from '@/lib/server/admin-csv-export';
import type { NextRequest } from 'next/server';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export function POST(request: NextRequest) {
  return handleAdminCsvExport(request, {
    rpcName: 'export_admin_subscriptions',
    filename: 'unieco-subscriptions.csv',
    allowedStatuses: new Set(['all', 'pending', 'active', 'expired', 'cancelled']),
    columns: [
      { key: 'id', label: 'ID' }, { key: 'vendor', label: 'Vendor' }, { key: 'plan', label: 'Plan' },
      { key: 'status', label: 'Status' }, { key: 'started_at', label: 'Started' }, { key: 'ends_at', label: 'Ends' },
      { key: 'amount', label: 'Amount' }, { key: 'currency', label: 'Currency' },
    ],
  });
}
