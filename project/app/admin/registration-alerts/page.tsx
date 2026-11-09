'use client';

import { useCallback, useEffect, useState } from 'react';
import { AdminLayout, AdminRouteGuard } from '@/components/admin/admin-layout';
import { supabase } from '@/lib/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Mail, Phone, RefreshCw, UserCheck } from 'lucide-react';
import Link from 'next/link';

type RegistrationAlert = {
  id: string;
  user_id: string;
  alert_type: 'student_completed' | 'vendor_completed' | 'student_incomplete' | 'vendor_incomplete';
  created_at: string;
  resolved_at: string | null;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  role_name: string;
  university_name: string | null;
  business_name: string | null;
};

function titleFor(type: RegistrationAlert['alert_type']) {
  if (type === 'student_completed') return 'Student joined';
  if (type === 'vendor_completed') return 'Vendor joined';
  if (type === 'student_incomplete') return 'Student needs follow-up';
  return 'Vendor needs follow-up';
}

function RegistrationAlertsContent() {
  const [alerts, setAlerts] = useState<RegistrationAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadAlerts = useCallback(async () => {
    setLoading(true);
    setError('');
    const { data, error: queryError } = await supabase.rpc('get_admin_registration_followups', { p_limit: 100 });
    if (queryError) {
      setAlerts([]);
      setError('Could not load registration follow-ups. Refresh and check Super Admin access.');
    } else {
      setAlerts((data || []) as RegistrationAlert[]);
    }
    void fetch('/api/notifications/dispatch-queue', { method: 'POST', credentials: 'same-origin', cache: 'no-store' }).catch(() => undefined);
    setLoading(false);
  }, []);

  useEffect(() => { void loadAlerts(); }, [loadAlerts]);

  const unresolvedCount = alerts.filter((alert) => alert.alert_type.endsWith('_incomplete') && !alert.resolved_at).length;

  return (
    <div className="mx-auto w-full max-w-6xl space-y-5 p-3 sm:space-y-6 sm:p-6 lg:p-8">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-primary sm:text-xs">Super Admin · private contacts</p>
          <h1 className="font-display text-2xl font-bold tracking-tight text-foreground sm:text-3xl">Registration follow-ups</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">Completed registrations and stalled registrations (30 minutes without completion). Contact details are visible only to Super Admins.</p>
        </div>
        <Button variant="outline" onClick={() => void loadAlerts()} disabled={loading} className="min-h-10 self-start sm:self-auto">
          <RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> Refresh
        </Button>
      </header>

      <p className="text-sm text-muted-foreground">For phone alerts, enable push notifications on this device: <Link className="font-medium text-primary underline underline-offset-4" href="/dashboard/notifications/preferences">Notification settings</Link>. Push previews omit contact details; open this private list to see them.</p>

      <Card><CardContent className="flex items-center gap-3 p-4">
        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary"><UserCheck className="h-5 w-5" /></span>
        <div><p className="text-2xl font-bold leading-none">{unresolvedCount}</p><p className="mt-1 text-xs text-muted-foreground">Incomplete registrations to contact</p></div>
      </CardContent></Card>

      {error && <p role="alert" className="rounded-lg border border-destructive/30 p-3 text-sm text-destructive">{error}</p>}
      {loading ? <div className="space-y-3">{[1, 2, 3].map((item) => <Skeleton key={item} className="h-36 rounded-xl" />)}</div>
        : alerts.length === 0 ? <Card><CardContent className="p-8 text-center text-sm text-muted-foreground">No registration follow-ups yet.</CardContent></Card>
          : <div className="space-y-3">{alerts.map((alert) => {
            const incomplete = alert.alert_type.endsWith('_incomplete');
            const resolved = Boolean(alert.resolved_at);
            return <Card key={alert.id} className={resolved ? 'opacity-75' : ''}>
              <CardContent className="space-y-3 p-4 sm:p-5">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h2 className="font-semibold">{alert.full_name || 'Name not provided'}</h2>
                    <p className="text-sm text-muted-foreground">{alert.business_name || alert.university_name || alert.role_name.replaceAll('_', ' ')}</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Badge variant={incomplete && !resolved ? 'destructive' : 'secondary'}>{titleFor(alert.alert_type)}</Badge>
                    {resolved && <Badge variant="outline">Completed later</Badge>}
                  </div>
                </div>
                <div className="grid gap-2 text-sm sm:grid-cols-2">
                  {alert.email ? <a className="flex min-h-10 items-center gap-2 break-all text-primary underline-offset-4 hover:underline" href={`mailto:${alert.email}`}><Mail className="h-4 w-4 shrink-0" />{alert.email}</a> : <p className="text-muted-foreground">Email unavailable</p>}
                  {alert.phone ? <a className="flex min-h-10 items-center gap-2 text-primary underline-offset-4 hover:underline" href={`tel:${alert.phone}`}><Phone className="h-4 w-4 shrink-0" />{alert.phone}</a> : <p className="text-muted-foreground">Phone not provided yet</p>}
                </div>
                <p className="text-xs text-muted-foreground">{new Date(alert.created_at).toLocaleString('en-GH', { dateStyle: 'medium', timeStyle: 'short' })}</p>
              </CardContent>
            </Card>;
          })}</div>}
    </div>
  );
}

export default function RegistrationAlertsPage() {
  return <AdminRouteGuard><AdminLayout><RegistrationAlertsContent /></AdminLayout></AdminRouteGuard>;
}
