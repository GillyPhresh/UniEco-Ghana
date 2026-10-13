'use client';

import { useState, useEffect } from 'react';
import { AdminRouteGuard, AdminLayout } from '@/components/admin/admin-layout';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { getRolePermissions, updateModeratorPermissions } from '@/lib/data/admin-client';
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
  const [draftPermissions, setDraftPermissions] = useState<string[]>([]);
  const [reason, setReason] = useState('');
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  useEffect(() => { loadPermissions(); }, []);

  async function loadPermissions() {
    setLoading(true);
    setLoadError(null);
    try {
      const data = await getRolePermissions();
      setDbPermissions(data);
      setDraftPermissions(data.filter(item => item.role === 'moderator').map(item => item.permission));
    } catch {
      setLoadError('Unable to load assigned permissions. Please retry.');
    } finally {
      setLoading(false);
    }
  }

  async function savePermissions() {
    setSaving(true);
    setSaveMessage(null);
    try {
      const result = await updateModeratorPermissions(draftPermissions, reason);
      if (result.error) {
        setSaveMessage(result.error);
      } else {
        setReason('');
        setSaveMessage('Moderator permissions updated and audited.');
        setConfirmOpen(false);
        await loadPermissions();
      }
    } catch {
      setSaveMessage('Unable to update moderator permissions. Please retry.');
    } finally {
      setSaving(false);
    }
  }

  // This static matrix documents UI affordances only, never effective authority.
  const roles = Object.keys(ROLE_LABELS) as Array<keyof typeof ROLE_LABELS>;
  const permissions = Object.keys(PERMISSION_LABELS) as Array<keyof typeof PERMISSION_LABELS>;
  const savedModeratorPermissions = dbPermissions.filter(item => item.role === 'moderator').map(item => item.permission).sort();
  const draftIsDirty = [...draftPermissions].sort().join(',') !== savedModeratorPermissions.join(',');
  const permissionsToGrant = draftPermissions.filter(permission => !savedModeratorPermissions.includes(permission));
  const permissionsToRevoke = savedModeratorPermissions.filter(permission => !draftPermissions.includes(permission));

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-6xl">
      <div>
        <h1 className="font-display text-2xl font-bold text-foreground flex items-center gap-2">
          <ShieldCheck className="h-6 w-6 text-primary" /> Roles & Permission Reference
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">Read-only overview of role labels and UI capability hints. Effective access is determined by database authority.</p>
      </div>

      <Card>
        <CardContent className="space-y-4 p-4">
          <div>
            <h2 className="font-semibold">Moderator operational access</h2>
            <p className="mt-1 text-sm text-muted-foreground">Assign only the workflows required. Changes are authorized and audited by the database; super-admin access cannot be granted here.</p>
          </div>
          {loading ? <Skeleton className="h-24 rounded" /> : loadError ? (
            <div role="alert" className="space-y-2 text-sm text-destructive">
              <p>{loadError}</p>
              <Button variant="outline" size="sm" onClick={() => void loadPermissions()}>Retry</Button>
            </div>
          ) : (
            <>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                {(['can_review_reports', 'can_review_verifications', 'can_manage_support', 'can_moderate_content', 'can_manage_communications'] as const).map(permission => (
                  <label key={permission} className="flex items-start gap-2 rounded-md border p-3 text-sm">
                    <input
                      type="checkbox"
                      checked={draftPermissions.includes(permission)}
                      onChange={event => setDraftPermissions(current => event.target.checked
                        ? [...current, permission]
                        : current.filter(value => value !== permission))}
                    />
                    <span>{PERMISSION_LABELS[permission]}</span>
                  </label>
                ))}
              </div>
              <label className="block space-y-1 text-sm font-medium">
                Reason for permission changes (required, at least 10 characters)
                <Textarea value={reason} onChange={event => setReason(event.target.value)} maxLength={500} rows={2} />
              </label>
              {saveMessage && <p role="status" className="text-sm text-muted-foreground">{saveMessage}</p>}
              <Button onClick={() => setConfirmOpen(true)} disabled={saving || !draftIsDirty || reason.trim().length < 10}>
                {saving ? 'Saving…' : 'Save moderator permissions'}
              </Button>
            </>
          )}
        </CardContent>
      </Card>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm moderator capability changes</DialogTitle>
            <DialogDescription>These changes affect every moderator, are enforced by database authorization, and will be added to the audit log.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 text-sm">
            {permissionsToGrant.length > 0 && <p>Grant: {permissionsToGrant.map(permission => PERMISSION_LABELS[permission as keyof typeof PERMISSION_LABELS]).join(', ')}</p>}
            {permissionsToRevoke.length > 0 && <p>Revoke: {permissionsToRevoke.map(permission => PERMISSION_LABELS[permission as keyof typeof PERMISSION_LABELS]).join(', ')}</p>}
            <p className="text-muted-foreground">Reason: {reason.trim()}</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmOpen(false)} disabled={saving}>Cancel</Button>
            <Button onClick={() => void savePermissions()} disabled={saving || reason.trim().length < 10}>
              {saving ? 'Saving...' : 'Confirm changes'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
                {ROLE_PERMISSIONS[role]?.length || 0} UI capability labels
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
            This static matrix is a UI reference only; it does not grant or enforce access. Effective privileges are resolved from the authenticated database role, active university membership, RLS policies, and narrowly scoped database procedures. The <code className="text-xs">role_permissions</code> table is consulted by database-backed permission checks where configured.
          </p>
          <p className="mt-2 text-xs text-muted-foreground">
            Assigned moderator capability records: {dbPermissions.length}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
