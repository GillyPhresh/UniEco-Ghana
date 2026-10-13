import { handleAdminCsvExport } from '@/lib/server/admin-csv-export';
import type { NextRequest } from 'next/server';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export function POST(request: NextRequest) {
  return handleAdminCsvExport(request, {
    rpcName: 'export_admin_invoices',
    filename: 'unieco-invoices.csv',
    allowedStatuses: new Set(['all', 'draft', 'issued', 'paid', 'void', 'refunded']),
    columns: [
      { key: 'number', label: 'Invoice number' }, { key: 'user', label: 'User' },
      { key: 'vendor', label: 'Vendor' }, { key: 'type', label: 'Type' }, { key: 'amount', label: 'Amount' },
      { key: 'currency', label: 'Currency' }, { key: 'status', label: 'Status' }, { key: 'created_at', label: 'Date' },
    ],
  });
}
