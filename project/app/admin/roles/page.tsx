'use client';

import { useState, useEffect } from 'react';
import { AdminRouteGuard, AdminLayout } from '@/components/admin/admin-layout';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { getRolePermissions } from '@/lib/data/admin-client';
import { ROLE_LABELS, PERMISSION_LABELS, ROLE_PERMISSIONS } from '@/lib/auth/permissions';
import { ShieldCheck, Lock } from 'lucide-react';

export default function AdminRolesPage() {
  return (
    <AdminRouteGuard><AdminLayout><Content /></AdminLayout></AdminRouteGuard>
  );
}

function Content() {
  const [loading, setLoading] = useState(true);
  const [dbPermissions, setDbPermissions] = useState<Array<{ id: string; role: string; permission: string }>>([]);

  useEffect(() => { loadPermissions(); }, []);

  async function loadPermissions() {
    setLoading(true);
    const data = await getRolePermissions();
    setDbPermissions(data);
    setLoading(false);
  }

  // Build matrix from in-memory permissions (source of truth for display)
  const roles = Object.keys(ROLE_LABELS) as Array<keyof typeof ROLE_LABELS>;
  const permissions = Object.keys(PERMISSION_LABELS) as Array<keyof typeof PERMISSION_LABELS>;

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-6xl">
      <div>
        <h1 className="font-display text-2xl font-bold text-foreground flex items-center gap-2">
          <ShieldCheck className="h-6 w-6 text-primary" /> Roles & Permissions
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">Enterprise RBAC configuration — granular permission matrix</p>
      </div>

      {/* Role descriptions */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {roles.map(role => (
          <Card key={role}>
            <CardContent className="p-4">
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
                  <Lock className="h-4 w-4 text-primary" />
                </div>
                <p className="text-sm font-semibold text-foreground">{ROLE_LABELS[role]}</p>
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                {ROLE_PERMISSIONS[role]?.length || 0} permissions assigned
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Permission matrix */}
      <Card>
        <CardContent className="p-0 overflow-x-auto">
          {loading ? (
            <div className="space-y-2 p-4">{[1, 2, 3, 4, 5].map(i => <Skeleton key={i} className="h-8 rounded" />)}</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="sticky left-0 bg-card">Permission</TableHead>
                  {roles.map(role => <TableHead key={role} className="text-center text-xs">{ROLE_LABELS[role]}</TableHead>)}
                </TableRow>
              </TableHeader>
              <TableBody>
                {permissions.map(perm => (
                  <TableRow key={perm}>
                    <TableCell className="font-medium text-xs">{PERMISSION_LABELS[perm]}</TableCell>
                    {roles.map(role => (
                      <TableCell key={role} className="text-center">
                        {ROLE_PERMISSIONS[role]?.includes(perm) ? (
                          <Badge className="bg-success/10 text-success text-xs">Yes</Badge>
                        ) : (
                          <span className="text-muted-foreground/30">—</span>
                        )}
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-4">
          <p className="text-xs text-muted-foreground">
            The permission matrix is enforced at two levels: client-side via TypeScript checks for UI visibility, and server-side via Supabase Row Level Security policies using JWT role claims. Database-level permissions are stored in the <code className="text-xs">role_permissions</code> table.
          </p>
          <p className="mt-2 text-xs text-muted-foreground">
            Total database permission records: {dbPermissions.length}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
