import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import type { AdminFinancialSummary } from '@/lib/types/payment';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

function csvCell(value: string | number): string {
  const text = String(value);
  const safeText = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
  return `"${safeText.replace(/"/g, '""')}"`;
}

export async function POST(request: NextRequest) {
  if (request.headers.get('origin') !== request.nextUrl.origin) {
    return NextResponse.json({ error: 'Invalid request origin.' }, {
      status: 403,
      headers: { 'Cache-Control': 'private, no-store, max-age=0' },
    });
  }

  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: 'Authentication required.' }, {
      status: 401,
      headers: { 'Cache-Control': 'private, no-store, max-age=0' },
    });
  }

  // The database RPC independently requires super-admin authority and writes
  // the export audit event. No role or university scope comes from the client.
  const { data, error } = await supabase.rpc('export_admin_financial_summary');
  if (error || !data || typeof data !== 'object') {
    return NextResponse.json({ error: 'Unable to authorize or create this export.' }, {
      status: 403,
      headers: { 'Cache-Control': 'private, no-store, max-age=0' },
    });
  }

  const summary = data as AdminFinancialSummary;
  const rows: Array<Array<string | number>> = [
    ['Section', 'Period or category', 'Amount (GHS)', 'Count'],
    ['Summary', 'All-time successful payments', summary.totalRevenue, ''],
    ['Summary', 'Current month successful payments', summary.monthlyRevenue, ''],
    ['Summary', 'Today successful payments', summary.dailyRevenue, ''],
    ...summary.monthlyData.map((item) => ['Monthly', item.month, item.revenue, '']),
    ...summary.revenueByType.map((item) => ['Payment type', item.type, item.revenue, '']),
    ...summary.universityRevenue.map((item) => ['University', item.name, item.revenue, item.count]),
  ];
  const csv = rows.map((row) => row.map(csvCell).join(',')).join('\r\n');

  return new NextResponse(`\uFEFF${csv}`, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="unieco-financial-summary.csv"',
      'Cache-Control': 'private, no-store, max-age=0',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
