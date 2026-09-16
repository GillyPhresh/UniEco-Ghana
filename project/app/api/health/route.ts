import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

/** Lightweight process liveness endpoint for infrastructure checks. */
export function GET() {
  return NextResponse.json(
    { status: 'ok' },
    { status: 200, headers: { 'Cache-Control': 'no-store, max-age=0' } },
  );
}
