import { handleAdminCsvExport } from '@/lib/server/admin-csv-export';
import type { NextRequest } from 'next/server';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export function POST(request: NextRequest) {
  return handleAdminCsvExport(request, {
    rpcName: 'export_admin_payments',
    filename: 'unieco-payments.csv',
    allowedStatuses: new Set(['all', 'pending', 'initiated', 'success', 'failed', 'cancelled', 'refunded']),
    columns: [
      { key: 'reference', label: 'Reference' }, { key: 'provider', label: 'Provider' },
      { key: 'type', label: 'Type' }, { key: 'user', label: 'User' }, { key: 'amount', label: 'Amount' },
      { key: 'currency', label: 'Currency' }, { key: 'status', label: 'Status' }, { key: 'created_at', label: 'Date' },
    ],
  });
}
