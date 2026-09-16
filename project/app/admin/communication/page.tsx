'use client';

import { useState, useEffect, useCallback } from 'react';
import { AdminRouteGuard, AdminLayout } from '@/components/admin/admin-layout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  getCommunicationLogs, getCommunicationStats,
} from '@/lib/data/communication-client';
import type { CommunicationLog } from '@/lib/types/communication';
import { CHANNEL_LABELS, DELIVERY_STATUS_LABELS } from '@/lib/types/communication';
import {
  Mail, Bell, Smartphone, MessageCircle, Phone, Send,
  TrendingUp, AlertCircle, CheckCircle2, Clock, Activity,
} from 'lucide-react';

const CHANNEL_ICONS: Record<string, typeof Mail> = {
  in_app: Bell,
  email: Mail,
  push: Smartphone,
  whatsapp: MessageCircle,
  sms: Phone,
};

const STATUS_COLORS: Record<string, string> = {
  sent: 'bg-info/10 text-info',
  delivered: 'bg-success/10 text-success',
  failed: 'bg-destructive/10 text-destructive',
  queued: 'bg-muted text-muted-foreground',
  opened: 'bg-info/10 text-info',
  read: 'bg-success/10 text-success',
};

export default function CommunicationDashboardPage() {
  return (
    <AdminRouteGuard>
      <AdminLayout>
        <Content />
      </AdminLayout>
    </AdminRouteGuard>
  );
}

function Content() {
  const [loading, setLoading] = useState(true);
  const [logs, setLogs] = useState<CommunicationLog[]>([]);
  const [stats, setStats] = useState({ total: 0, byChannel: {} as Record<string, number>, byStatus: {} as Record<string, number>, failed: 0 });
  const [filters, setFilters] = useState({ channel: '', status: '', eventType: '' });

  const loadData = useCallback(async () => {
    setLoading(true);
    const [logData, statData] = await Promise.all([
      getCommunicationLogs({
        channel: filters.channel || undefined,
        status: filters.status || undefined,
        eventType: filters.eventType || undefined,
        limit: 50,
      }),
      getCommunicationStats(),
    ]);
    setLogs(logData);
    setStats(statData);
    setLoading(false);
  }, [filters]);

  useEffect(() => { loadData(); }, [loadData]);

  const channels = ['in_app', 'email', 'push', 'whatsapp', 'sms'];
  const statuses = ['queued', 'sent', 'delivered', 'failed', 'opened', 'read'];

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-6xl">
      <div>
        <h1 className="font-display text-2xl font-bold text-foreground flex items-center gap-2">
          <Activity className="h-6 w-6 text-primary" /> Communication Hub
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Monitor all outbound communications across every channel.
        </p>
      </div>

      {/* Stats cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground">Total Sent</p>
                <p className="text-2xl font-bold text-foreground">{stats.total}</p>
              </div>
              <Send className="h-8 w-8 text-primary/20" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground">Delivered</p>
                <p className="text-2xl font-bold text-success">{stats.byStatus.delivered || 0}</p>
              </div>
              <CheckCircle2 className="h-8 w-8 text-success/20" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground">Failed</p>
                <p className="text-2xl font-bold text-destructive">{stats.failed}</p>
              </div>
              <AlertCircle className="h-8 w-8 text-destructive/20" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground">Queued</p>
                <p className="text-2xl font-bold text-muted-foreground">{stats.byStatus.queued || 0}</p>
              </div>
              <Clock className="h-8 w-8 text-muted-foreground/20" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Channel breakdown */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        {channels.map((ch) => {
          const Icon = CHANNEL_ICONS[ch] || Mail;
          const count = stats.byChannel[ch] || 0;
          return (
            <Card key={ch}>
              <CardContent className="flex items-center gap-3 p-3">
                <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10">
                  <Icon className="h-4 w-4 text-primary" />
                </span>
                <div>
                  <p className="text-xs text-muted-foreground">{CHANNEL_LABELS[ch as keyof typeof CHANNEL_LABELS] || ch}</p>
                  <p className="text-lg font-bold text-foreground">{count}</p>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-end">
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">Channel</label>
          <Select value={filters.channel || 'all'} onValueChange={(v) => setFilters((p) => ({ ...p, channel: v === 'all' ? '' : v }))}>
            <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All channels</SelectItem>
              {channels.map((ch) => <SelectItem key={ch} value={ch}>{CHANNEL_LABELS[ch as keyof typeof CHANNEL_LABELS] || ch}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">Status</label>
          <Select value={filters.status || 'all'} onValueChange={(v) => setFilters((p) => ({ ...p, status: v === 'all' ? '' : v }))}>
            <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              {statuses.map((s) => <SelectItem key={s} value={s}>{DELIVERY_STATUS_LABELS[s as keyof typeof DELIVERY_STATUS_LABELS]?.label || s}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">Event Type</label>
          <Input
            placeholder="e.g. order_placed"
            className="w-44"
            value={filters.eventType}
            onChange={(e) => setFilters((p) => ({ ...p, eventType: e.target.value }))}
          />
        </div>
        <Button variant="outline" size="sm" onClick={() => setFilters({ channel: '', status: '', eventType: '' })}>
          Clear filters
        </Button>
      </div>

      {/* Communication logs table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Recent Communications</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="space-y-2 p-4">
              {[1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-12 rounded-lg" />)}
            </div>
          ) : logs.length === 0 ? (
            <div className="py-12 text-center text-sm text-muted-foreground">
              No communication logs found
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b border-border bg-muted/30">
                  <tr className="text-left text-xs text-muted-foreground">
                    <th className="px-4 py-2 font-medium">Type</th>
                    <th className="px-4 py-2 font-medium">Channel</th>
                    <th className="px-4 py-2 font-medium">Status</th>
                    <th className="px-4 py-2 font-medium">Provider</th>
                    <th className="px-4 py-2 font-medium">Recipient</th>
                    <th className="px-4 py-2 font-medium">Time</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {logs.map((log) => {
                    const Icon = CHANNEL_ICONS[log.channel] || Mail;
                    return (
                      <tr key={log.id} className="hover:bg-muted/20">
                        <td className="px-4 py-2.5 font-medium text-foreground">{log.event_type}</td>
                        <td className="px-4 py-2.5">
                          <div className="flex items-center gap-1.5">
                            <Icon className="h-3.5 w-3.5 text-muted-foreground" />
                            <span className="text-muted-foreground">{CHANNEL_LABELS[log.channel as keyof typeof CHANNEL_LABELS] || log.channel}</span>
                          </div>
                        </td>
                        <td className="px-4 py-2.5">
                          <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_COLORS[log.status] || 'bg-muted text-muted-foreground'}`}>
                            {DELIVERY_STATUS_LABELS[log.status as keyof typeof DELIVERY_STATUS_LABELS]?.label || log.status}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 text-muted-foreground">{log.provider || '—'}</td>
                        <td className="px-4 py-2.5 text-muted-foreground text-xs">{log.recipient_identifier || '—'}</td>
                        <td className="px-4 py-2.5 text-xs text-muted-foreground">
                          {new Date(log.created_at).toLocaleString('en-GH', { dateStyle: 'short', timeStyle: 'short' })}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
