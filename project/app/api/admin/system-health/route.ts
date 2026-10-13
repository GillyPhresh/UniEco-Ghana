import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

type HealthSummary = {
  communicationQueue: {
    queued: number;
    failed: number;
    exhausted: number;
    stuckProcessing: number;
    agedQueued: number;
  };
  paymentProviders: {
    externalConfigured: number;
    externalEnabled: number;
  };
};

export async function GET() {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: 'Authentication required.' }, {
      status: 401,
      headers: { 'Cache-Control': 'private, no-store, max-age=0' },
    });
  }

  const { data: role, error: roleError } = await supabase.rpc('current_app_role');
  if (roleError) {
    return NextResponse.json({ error: 'Unable to verify management authority.' }, {
      status: 503,
      headers: { 'Cache-Control': 'private, no-store, max-age=0' },
    });
  }
  if (role !== 'super_admin') {
    return NextResponse.json({ error: 'Super administrator access required.' }, {
      status: 403,
      headers: { 'Cache-Control': 'private, no-store, max-age=0' },
    });
  }

  // This RPC enforces super-admin authority and returns counts only. Provider
  // credentials, recipients, messages, and error payloads never leave the DB.
  const { data, error } = await supabase.rpc('get_admin_system_health_summary');
  if (error || !data || typeof data !== 'object') {
    return NextResponse.json({ error: 'Unable to measure system health.' }, {
      status: 503,
      headers: { 'Cache-Control': 'private, no-store, max-age=0' },
    });
  }

  const summary = data as HealthSummary;
  const queue = summary.communicationQueue;
  const queueCritical = queue.exhausted > 0 || queue.stuckProcessing > 0;
  const queueWarning = !queueCritical && (queue.failed > 0 || queue.agedQueued > 0);
  const externalProvidersConfigured = summary.paymentProviders.externalConfigured > 0;
  const externalProvidersEnabled = summary.paymentProviders.externalEnabled > 0;
  const commit = process.env.RAILWAY_GIT_COMMIT_SHA;

  return NextResponse.json({
    checkedAt: new Date().toISOString(),
    application: {
      status: 'healthy',
      environment: process.env.NEXT_PUBLIC_APP_ENV === 'staging' ? 'staging' : process.env.NODE_ENV,
      buildId: commit && /^[a-f0-9]{7,40}$/i.test(commit) ? commit.slice(0, 12) : null,
    },
    database: { status: 'healthy', detail: 'Authenticated database health query succeeded.' },
    communicationQueue: {
      status: queueCritical ? 'critical' : queueWarning ? 'warning' : 'healthy',
      ...queue,
      detail: 'Queue counts only; external provider reachability is not probed.',
    },
    paymentProviders: {
      status: !externalProvidersConfigured ? 'not_configured' : !externalProvidersEnabled ? 'disabled' : 'warning',
      externalConfigured: summary.paymentProviders.externalConfigured,
      externalEnabled: summary.paymentProviders.externalEnabled,
      detail: externalProvidersEnabled
        ? 'At least one external provider is enabled; provider reachability is not probed.'
        : 'External payment providers are disabled; no live provider health claim is made.',
    },
    storage: { status: 'not_measured', detail: 'No authorized storage health probe is configured.' },
    edgeFunctions: { status: 'not_measured', detail: 'No authorized Edge Function health probe is configured.' },
  }, {
    headers: {
      'Cache-Control': 'private, no-store, max-age=0',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
