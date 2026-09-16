'use client';

import { useState, useEffect } from 'react';
import { AdminRouteGuard, AdminLayout } from '@/components/admin/admin-layout';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { getAdminActions } from '@/lib/data/admin-client';
import type { AdminAction } from '@/lib/types/admin';
import { ScrollText, ChevronLeft, ChevronRight } from 'lucide-react';

export default function AdminAuditLogsPage() {
  return (
    <AdminRouteGuard><AdminLayout><Content /></AdminLayout></AdminRouteGuard>
  );
}

function Content() {
  const [loading, setLoading] = useState(true);
  const [actions, setActions] = useState<AdminAction[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [moduleFilter, setModuleFilter] = useState('all');
  const pageSize = 50;

  useEffect(() => { loadActions(); }, [page, moduleFilter]);

  async function loadActions() {
    setLoading(true);
    const { actions, total } = await getAdminActions({ module: moduleFilter, limit: pageSize, offset: page * pageSize });
    setActions(actions);
    setTotal(total);
    setLoading(false);
  }

  return (
    <div className="p-4 sm:p-6 space-y-4 max-w-5xl">
      <div>
        <h1 className="font-display text-2xl font-bold text-foreground flex items-center gap-2">
          <ScrollText className="h-6 w-6 text-primary" /> Audit Logs
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">Immutable record of all administrative actions ({total} entries)</p>
      </div>

      <Select value={moduleFilter} onValueChange={v => { setModuleFilter(v); setPage(0); }}>
        <SelectTrigger className="w-48"><SelectValue placeholder="All modules" /></SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All modules</SelectItem>
          <SelectItem value="users">Users</SelectItem>
          <SelectItem value="verification">Verification</SelectItem>
          <SelectItem value="businesses">Businesses</SelectItem>
          <SelectItem value="university">Universities</SelectItem>
          <SelectItem value="categories">Categories</SelectItem>
          <SelectItem value="subscriptions">Subscriptions</SelectItem>
          <SelectItem value="advertisements">Advertisements</SelectItem>
          <SelectItem value="moderation">Moderation</SelectItem>
          <SelectItem value="support">Support</SelectItem>
          <SelectItem value="cms">CMS</SelectItem>
          <SelectItem value="announcements">Announcements</SelectItem>
        </SelectContent>
      </Select>

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="space-y-2 p-4">{[1, 2, 3, 4, 5].map(i => <Skeleton key={i} className="h-12 rounded-lg" />)}</div>
          ) : actions.length === 0 ? (
            <div className="py-12 text-center text-sm text-muted-foreground">No audit log entries found</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Admin</TableHead>
                  <TableHead>Action</TableHead>
                  <TableHead>Module</TableHead>
                  <TableHead>Target</TableHead>
                  <TableHead>Result</TableHead>
                  <TableHead>Time</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {actions.map(a => (
                  <TableRow key={a.id}>
                    <TableCell className="text-sm">{a.admin?.full_name || a.admin?.email || '—'}</TableCell>
                    <TableCell className="font-mono text-xs">{a.action}</TableCell>
                    <TableCell><Badge variant="outline">{a.module}</Badge></TableCell>
                    <TableCell className="text-xs text-muted-foreground">{a.target_type || '—'}</TableCell>
                    <TableCell><Badge className={a.result === 'success' ? 'bg-success/10 text-success' : 'bg-destructive/10 text-destructive'}>{a.result}</Badge></TableCell>
                    <TableCell className="text-xs text-muted-foreground">{new Date(a.created_at).toLocaleString('en-GH', { dateStyle: 'short', timeStyle: 'short' })}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {total > pageSize && (
        <div className="flex items-center justify-between">
          <p className="text-xs text-muted-foreground">Page {page + 1} of {Math.ceil(total / pageSize)}</p>
          <div className="flex gap-1">
            <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage(p => p - 1)}><ChevronLeft className="h-4 w-4" /></Button>
            <Button variant="outline" size="sm" disabled={(page + 1) * pageSize >= total} onClick={() => setPage(p => p + 1)}><ChevronRight className="h-4 w-4" /></Button>
          </div>
        </div>
      )}
    </div>
  );
}
