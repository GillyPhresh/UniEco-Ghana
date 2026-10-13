import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';

interface AdminCsvExportOptions {
  allowedStatuses: ReadonlySet<string>;
  rpcName: 'export_admin_payments' | 'export_admin_invoices' | 'export_admin_subscriptions';
  filename: 'unieco-payments.csv' | 'unieco-invoices.csv' | 'unieco-subscriptions.csv';
  columns: ReadonlyArray<{ key: string; label: string }>;
}

const MAX_EXPORT_REQUEST_BYTES = 1024;
type LimitedJsonResult = { ok: true; value: unknown } | { ok: false; tooLarge: boolean };

async function readLimitedJson(request: NextRequest): Promise<LimitedJsonResult> {
  if (!request.body) return { ok: false, tooLarge: false };
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      totalBytes += value.byteLength;
      if (totalBytes > MAX_EXPORT_REQUEST_BYTES) {
        try { await reader.cancel(); } catch { /* The request is rejected regardless. */ }
        return { ok: false, tooLarge: true };
      }
      chunks.push(value);
    }
    const bytes = new Uint8Array(totalBytes);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return { ok: true, value: JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)) as unknown };
  } catch {
    return { ok: false, tooLarge: false };
  } finally {
    reader.releaseLock();
  }
}

function csvCell(value: unknown): string {
  const text = value === null || value === undefined ? '' : String(value);
  const safeText = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
  return `"${safeText.replace(/"/g, '""')}"`;
}

export async function handleAdminCsvExport(request: NextRequest, options: AdminCsvExportOptions) {
  const privateHeaders = {
    'Cache-Control': 'private, no-store, max-age=0',
    'X-Robots-Tag': 'noindex, nofollow, noarchive',
  };
  if (request.headers.get('origin') !== request.nextUrl.origin) {
    return NextResponse.json({ error: 'Invalid request origin.' }, { status: 403, headers: privateHeaders });
  }

  // Authenticate before consuming request-body bytes; unauthenticated callers
  // cannot make this server buffer arbitrary JSON for a high-value export API.
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: 'Authentication required.' }, { status: 401, headers: privateHeaders });
  }

  if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) {
    return NextResponse.json({ error: 'JSON export filters are required.' }, { status: 415, headers: privateHeaders });
  }
  const parsedBody = await readLimitedJson(request);
  if (!parsedBody.ok && parsedBody.tooLarge) {
    return NextResponse.json({ error: 'Export request is too large.' }, { status: 413, headers: privateHeaders });
  }
  if (!parsedBody.ok) {
    return NextResponse.json({ error: 'Invalid export request.' }, { status: 400, headers: privateHeaders });
  }
  const body = parsedBody.value;
  if (!body || typeof body !== 'object' || !('status' in body) || typeof body.status !== 'string' || !options.allowedStatuses.has(body.status)) {
    return NextResponse.json({ error: 'Invalid export filter.' }, { status: 400, headers: privateHeaders });
  }
  const status = body.status;

  // Each resource-specific RPC rechecks super-admin authority and records the export.
  const { data, error } = await supabase.rpc(options.rpcName, { p_status: status === 'all' ? null : status });
  if (error?.code === '22023') {
    return NextResponse.json({ error: 'Export exceeds the 5,000-record limit. Apply a status filter and retry.' }, { status: 422, headers: privateHeaders });
  }
  if (error || !Array.isArray(data)) {
    return NextResponse.json({ error: 'Unable to authorize or create this export.' }, { status: 403, headers: privateHeaders });
  }

  const records = data as unknown as Array<Record<string, unknown>>;
  const csvRows = [
    options.columns.map(column => csvCell(column.label)).join(','),
    ...records.map(record => options.columns.map(column => csvCell(record[column.key])).join(',')),
  ];
  return new NextResponse(`\uFEFF${csvRows.join('\r\n')}`, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${options.filename}"`,
      ...privateHeaders,
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
