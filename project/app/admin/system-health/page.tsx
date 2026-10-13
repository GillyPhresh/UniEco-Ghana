'use client';

import { useEffect, useState } from 'react';
import { AdminRouteGuard, AdminLayout } from '@/components/admin/admin-layout';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Activity, Database, Shield, HardDrive, Zap, AlertCircle, CheckCircle } from 'lucide-react';

type HealthStatus = 'healthy' | 'warning' | 'critical' | 'disabled' | 'not_configured' | 'not_measured';
type HealthCheck = { name: string; status: HealthStatus; detail: string; icon: typeof Database };
type HealthResponse = {
  checkedAt: string;
  application: { status: HealthStatus; environment: string | null; buildId: string | null };
  database: { status: HealthStatus; detail: string };
  communicationQueue: {
    status: HealthStatus;
    queued: number;
    failed: number;
    exhausted: number;
    stuckProcessing: number;
    agedQueued: number;
    detail: string;
  };
  paymentProviders: {
    status: HealthStatus;
    externalConfigured: number;
    externalEnabled: number;
    detail: string;
  };
  storage: { status: HealthStatus; detail: string };
  edgeFunctions: { status: HealthStatus; detail: string };
};

export default function AdminSystemHealthPage() {
  return <AdminRouteGuard><AdminLayout><Content /></AdminLayout></AdminRouteGuard>;
}

function Content() {
  const [loading, setLoading] = useState(true);
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { void loadHealth(); }, []);

  async function loadHealth() {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/admin/system-health', { credentials: 'same-origin', cache: 'no-store' });
      if (!response.ok) throw new Error('Health request failed');
      setHealth(await response.json() as HealthResponse);
    } catch {
      setHealth(null);
      setError('Unable to load authorized system health. Try again.');
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return <div className="p-6 space-y-4"><Skeleton className="h-8 w-48" /><div className="grid gap-3 sm:grid-cols-2">{[1, 2, 3, 4, 5, 6].map(i => <Skeleton key={i} className="h-24 rounded-xl" />)}</div></div>;
  }

  if (!health) {
    return <div className="p-6 max-w-4xl space-y-4" role="alert"><p className="text-sm text-destructive">{error}</p><Button variant="outline" onClick={loadHealth}>Retry</Button></div>;
  }

  const checks: HealthCheck[] = [
    { name: 'Application', status: health.application.status, detail: `Environment: ${health.application.environment || 'not identified'} · Build: ${health.application.buildId || 'not available'}`, icon: Zap },
    { name: 'Database', status: health.database.status, detail: health.database.detail, icon: Database },
    {
      name: 'Communication Queue', status: health.communicationQueue.status,
      detail: `${health.communicationQueue.queued} queued · ${health.communicationQueue.failed} failed · ${health.communicationQueue.stuckProcessing} processing over 15 min. ${health.communicationQueue.detail}`,
      icon: Activity,
    },
    {
      name: 'External Payment Provider Configuration', status: health.paymentProviders.status,
      detail: `${health.paymentProviders.externalEnabled} enabled of ${health.paymentProviders.externalConfigured} configured. ${health.paymentProviders.detail}`,
      icon: Shield,
    },
    { name: 'Storage Service', status: health.storage.status, detail: health.storage.detail, icon: HardDrive },
    { name: 'Edge Functions', status: health.edgeFunctions.status, detail: health.edgeFunctions.detail, icon: Activity },
  ];

  const statusClass: Record<HealthStatus, string> = {
    healthy: 'bg-success/10 text-success',
    warning: 'bg-warning/10 text-warning',
    critical: 'bg-destructive/10 text-destructive',
    disabled: 'bg-muted text-muted-foreground',
    not_configured: 'bg-muted text-muted-foreground',
    not_measured: 'bg-muted text-muted-foreground',
  };

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-4xl">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold text-foreground flex items-center gap-2"><Activity className="h-6 w-6 text-primary" /> System Health</h1>
          <p className="mt-1 text-sm text-muted-foreground">Verified application and operational signals; unprobed services are marked accordingly.</p>
        </div>
        <Button variant="outline" size="sm" onClick={loadHealth}>Refresh</Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {checks.map(check => {
          const Icon = check.icon;
          return (
            <Card key={check.name}>
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${statusClass[check.status]}`}><Icon className="h-5 w-5" /></div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-semibold text-foreground">{check.name}</p>
                      <Badge className={statusClass[check.status]}>
                        {check.status === 'healthy' && <CheckCircle className="mr-1 h-3 w-3" />}
                        {(check.status === 'critical' || check.status === 'warning') && <AlertCircle className="mr-1 h-3 w-3" />}
                        {check.status.replace(/_/g, ' ')}
                      </Badge>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">{check.detail}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <p className="text-xs text-muted-foreground">Last checked: {new Date(health.checkedAt).toLocaleString()}</p>
    </div>
  );
}
