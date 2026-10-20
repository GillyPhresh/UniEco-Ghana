import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export function GET() {
  return NextResponse.json({
    status: 'ok',
    service: 'uniecoghana-web',
    deployment: process.env.RAILWAY_GIT_COMMIT_SHA || process.env.VERCEL_GIT_COMMIT_SHA || 'local',
    environment: process.env.RAILWAY_ENVIRONMENT_NAME || 'production',
    timestamp: new Date().toISOString(),
  }, {
    status: 200,
    headers: { 'Cache-Control': 'no-store' },
  });
}
