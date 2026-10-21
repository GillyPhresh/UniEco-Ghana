'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { AdminRouteGuard, AdminLayout } from '@/components/admin/admin-layout';
import { useAuth } from '@/lib/auth/auth-context';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { getAdminUsers, suspendUser, reactivateUser, assignUserRole, resetNonAdminAccounts } from '@/lib/data/admin-client';
import type { AdminUserDirectoryItem } from '@/lib/types/admin';
import { ROLE_LABELS } from '@/lib/auth/permissions';
import { ROLE_IDS, type UserRole } from '@/lib/types';
import { Search, Ban, CheckCircle, ChevronLeft, ChevronRight, AlertTriangle, Trash2, UserPlus } from 'lucide-react';
import { toast } from 'sonner';

export default function AdminUsersPage() {
  return (
    <AdminRouteGuard><AdminLayout><UsersContent /></AdminLayout></AdminRouteGuard>
  );
}

function UsersContent() {
  const { user } = useAuth();
  const isSuperAdmin = user?.role === 'super_admin';
  const [loading, setLoading] = useState(true);
  const [users, setUsers] = useState<AdminUserDirectoryItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [selectedUser, setSelectedUser] = useState<AdminUserDirectoryItem | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<{ kind: 'suspend' | 'reactivate' | 'role'; roleId?: number; roleLabel?: string } | null>(null);
  const [resetOpen, setResetOpen] = useState(false);
  const [resetConfirmation, setResetConfirmation] = useState('');
  const [resetReason, setResetReason] = useState('');
  const [resetLoading, setResetLoading] = useState(false);
  const [resetError, setResetError] = useState<string | null>(null);
  const pageSize = 20;

  const loadUsers = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await getAdminUsers({ search: search || undefined, role: roleFilter !== 'all' ? Number(roleFilter) : undefined, status: statusFilter, limit: pageSize, offset: page * pageSize });
      setUsers(result.users);
      setTotal(result.total);
    } catch (loadError) {
      setUsers([]); setTotal(0);
      setError(loadError instanceof Error ? loadError.message : 'Unable to load user directory. Please try again.');
    } finally { setLoading(false); }
  }, [page, roleFilter, search, statusFilter]);

  useEffect(() => { void loadUsers(); }, [loadUsers]);

  function handleSearch() { setPage(0); loadUsers(); }

  const requestUserAction = (action: NonNullable<typeof pendingAction>) => {
    if (!selectedUser) return;
    if (reason.trim().length < 10 || reason.trim().length > 500) { toast.error('Provide a reason between 10 and 500 characters'); return; }
    setPendingAction(action);
  };

  const confirmUserAction = async () => {
    if (!selectedUser || !pendingAction) return;
    setActionLoading(true);
    try {
      const result = pendingAction.kind === 'suspend'
        ? await suspendUser(selectedUser.id, reason.trim())
        : pendingAction.kind === 'reactivate'
          ? await reactivateUser(selectedUser.id, reason.trim())
          : await assignUserRole(selectedUser.id, pendingAction.roleId!, reason.trim());
      if (result.error) {
        toast.error(result.error);
      } else {
        toast.success(pendingAction.kind === 'role' ? `Role updated to ${pendingAction.roleLabel}` : `User ${pendingAction.kind === 'suspend' ? 'suspended' : 'reactivated'}`);
        setSelectedUser(null);
        setReason('');
        void loadUsers();
      }
    } catch {
      toast.error('Unable to complete this user action. Please retry.');
    } finally {
      setPendingAction(null);
      setActionLoading(false);
    }
  };

  const confirmAccountReset = async () => {
    const confirmation = resetConfirmation.trim();
    if (confirmation !== 'DELETE ALL NON-ADMIN USERS') {
      toast.error('Enter the confirmation phrase exactly');
      return;
    }
    if (resetReason.trim().length < 10) {
      toast.error('Provide a reason of at least 10 characters');
      return;
    }
    setResetLoading(true);
    setResetError(null);
    try {
      const result = await resetNonAdminAccounts(confirmation, resetReason.trim());
      toast.success(`${result.deletedUserCount} non-admin account(s) removed`);
      setResetOpen(false);
      setResetConfirmation('');
      setResetReason('');
      void loadUsers();
    } catch (resetError) {
      const message = resetError instanceof Error ? resetError.message : 'Account reset failed. No changes were committed.';
      setResetError(message);
      toast.error(message);
    } finally {
      setResetLoading(false);
    }
  };

  return (
    <div className="p-4 sm:p-6 space-y-4 max-w-7xl">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold text-foreground">User Management</h1>
          <p className="mt-1 text-sm text-muted-foreground">{total} total users</p>
        </div>
        {isSuperAdmin && <Button asChild variant="outline"><Link href="/admin/universities"><UserPlus className="mr-2 h-4 w-4" /> Invite institution administrator</Link></Button>}
      </div>

      {isSuperAdmin && (
        <Card className="border-destructive/40 bg-destructive/5">
          <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex gap-3">
              <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
              <div>
                <p className="font-semibold text-destructive">Production account reset</p>
                <p className="text-sm text-muted-foreground">Permanently removes every non-admin account and its user-owned records. Platform configuration is preserved.</p>
              </div>
            </div>
            <Button variant="destructive" onClick={() => setResetOpen(true)} disabled={resetLoading}>
              <Trash2 className="mr-2 h-4 w-4" /> Delete all non-admin users
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input className="pl-9" placeholder="Search by name or email..." value={search} onChange={e => setSearch(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleSearch()} />
        </div>
        <Select value={roleFilter} onValueChange={v => { setRoleFilter(v); setPage(0); }}>
          <SelectTrigger className="w-40"><SelectValue placeholder="All roles" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All roles</SelectItem>
            {Object.entries(ROLE_LABELS).map(([key, label]) => (
              <SelectItem key={key} value={String(ROLE_IDS[key as keyof typeof ROLE_IDS])}>{label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={v => { setStatusFilter(v); setPage(0); }}>
          <SelectTrigger className="w-36"><SelectValue placeholder="All status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All status</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="suspended">Suspended</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="space-y-2 p-4">{[1, 2, 3, 4, 5].map(i => <Skeleton key={i} className="h-12 rounded-lg" />)}</div>
          ) : error ? (
            <div className="space-y-3 py-12 text-center text-sm text-muted-foreground"><p>{error}</p><Button variant="outline" size="sm" onClick={() => void loadUsers()}>Retry</Button></div>
          ) : users.length === 0 ? (
            <div className="py-12 text-center text-sm text-muted-foreground">No users found</div>
          ) : (
            <>
            <div className="space-y-3 p-3 lg:hidden" aria-label="Mobile user directory">
              {users.map(u => {
                const roleName = (u.role as { name?: string })?.name || 'student';
                return (
                  <article key={u.id} className="rounded-xl border border-border bg-background p-4 shadow-sm">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h2 className="break-words font-semibold text-foreground">{u.full_name || 'Name unavailable'}</h2>
                        <a className="mt-1 block break-all text-sm text-muted-foreground underline-offset-2 hover:underline" href={`mailto:${u.email}`}>{u.email}</a>
                      </div>
                      <Badge variant="outline" className="shrink-0 capitalize">{roleName.replaceAll('_', ' ')}</Badge>
                    </div>
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <Badge className={u.status === 'active' ? 'bg-success/10 text-success' : u.status === 'suspended' ? 'bg-destructive/10 text-destructive' : 'bg-warning/10 text-warning'}>
                        {u.status}
                      </Badge>
                      {u.university?.name && <span className="text-xs text-muted-foreground">{u.university.name}</span>}
                    </div>
                    <dl className="mt-4 grid grid-cols-2 gap-3 border-t border-border pt-3 text-sm">
                      <div className="min-w-0"><dt className="text-xs text-muted-foreground">University</dt><dd className="mt-0.5 break-words font-medium">{u.university?.name || 'Unassigned'}</dd></div>
                      <div><dt className="text-xs text-muted-foreground">Joined</dt><dd className="mt-0.5 font-medium">{new Date(u.created_at).toLocaleDateString('en-GH')}</dd></div>
                    </dl>
                    <Button className="mt-4 min-h-11 w-full" variant="outline" onClick={() => { setSelectedUser(u); setReason(''); }}>
                      Manage user
                    </Button>
                  </article>
                );
              })}
            </div>
            <div className="hidden w-full overflow-x-auto lg:block">
            <Table className="min-w-[48rem]">
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>University</TableHead>
                  <TableHead>Joined</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.map(u => (
                  <TableRow key={u.id}>
                    <TableCell className="font-medium">{u.full_name || '—'}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{u.email}</TableCell>
                    <TableCell><Badge variant="outline">{(u.role as { name?: string })?.name || 'student'}</Badge></TableCell>
                    <TableCell>
                      <Badge className={u.status === 'active' ? 'bg-success/10 text-success' : u.status === 'suspended' ? 'bg-destructive/10 text-destructive' : 'bg-warning/10 text-warning'}>
                        {u.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">{u.university?.name || '—'}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{new Date(u.created_at).toLocaleDateString('en-GH')}</TableCell>
                    <TableCell><Button variant="ghost" size="sm" onClick={() => { setSelectedUser(u); setReason(''); }}>Manage</Button></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Pagination */}
      {total > pageSize && (
        <div className="flex items-center justify-between">
          <p className="text-xs text-muted-foreground">Page {page + 1} of {Math.ceil(total / pageSize)}</p>
          <div className="flex gap-1">
            <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage(p => p - 1)}><ChevronLeft className="h-4 w-4" /></Button>
            <Button variant="outline" size="sm" disabled={(page + 1) * pageSize >= total} onClick={() => setPage(p => p + 1)}><ChevronRight className="h-4 w-4" /></Button>
          </div>
        </div>
      )}

      {/* User detail dialog */}
      <Dialog open={!!selectedUser} onOpenChange={open => { if (!open) setSelectedUser(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Manage User</DialogTitle></DialogHeader>
          {selectedUser && (
            <div className="space-y-4 py-2">
              <div>
                <p className="text-sm font-semibold text-foreground">{selectedUser.full_name || 'No name'}</p>
                <p className="text-xs text-muted-foreground">{selectedUser.email}</p>
                <div className="mt-2 flex gap-2">
                  <Badge variant="outline">{(selectedUser.role as { name?: string })?.name || 'student'}</Badge>
                  <Badge className={selectedUser.status === 'active' ? 'bg-success/10 text-success' : 'bg-destructive/10 text-destructive'}>{selectedUser.status}</Badge>
                </div>
              </div>

              <div className="space-y-1.5">
                <label htmlFor="user-action-reason" className="text-xs font-semibold text-muted-foreground">Reason for this privileged action</label>
                <Input id="user-action-reason" value={reason} onChange={event => setReason(event.target.value)} placeholder="At least 10 characters" maxLength={500} />
              </div>

              {/* Role assignment */}
              <div>
                <p className="text-xs font-semibold text-muted-foreground mb-2">Assign Role</p>
                <div className="flex flex-wrap gap-1.5">
                  {Object.entries(ROLE_LABELS).filter(([key]) => !['university_admin', 'super_admin'].includes(key)).map(([key, label]) => (
                    <Button
                      key={key}
                      size="sm"
                      variant={selectedUser.role_id === ROLE_IDS[key as keyof typeof ROLE_IDS] ? 'default' : 'outline'}
                      className="h-7 text-xs"
                      disabled={actionLoading}
                      onClick={() => requestUserAction({ kind: 'role', roleId: ROLE_IDS[key as keyof typeof ROLE_IDS], roleLabel: label })}
                    >
                      {label}
                    </Button>
                  ))}
                </div>
              </div>

              {/* Actions */}
              <div className="flex gap-2 pt-2">
                {selectedUser.status === 'active' ? (
                  <Button variant="destructive" size="sm" className="flex-1" disabled={actionLoading} onClick={() => requestUserAction({ kind: 'suspend' })}>
                    <Ban className="mr-2 h-4 w-4" /> Suspend
                  </Button>
                ) : (
                  <Button size="sm" className="flex-1" disabled={actionLoading} onClick={() => requestUserAction({ kind: 'reactivate' })}>
                    <CheckCircle className="mr-2 h-4 w-4" /> Reactivate
                  </Button>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
      <AlertDialog open={pendingAction !== null} onOpenChange={open => { if (!open && !actionLoading) setPendingAction(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm user {pendingAction?.kind === 'role' ? 'role change' : pendingAction?.kind === 'suspend' ? 'suspension' : 'reactivation'}</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingAction?.kind === 'role'
                ? `Change ${selectedUser?.full_name || selectedUser?.email || 'this user'} to the ${pendingAction.roleLabel} role? The change will be recorded with your required reason.`
                : `${pendingAction?.kind === 'suspend' ? 'Suspend' : 'Reactivate'} ${selectedUser?.full_name || selectedUser?.email || 'this user'}? The account status will change and the decision will be audited.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <p className="whitespace-pre-wrap text-sm text-muted-foreground">Reason: {reason.trim()}</p>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={actionLoading}>Cancel</AlertDialogCancel>
            <AlertDialogAction disabled={actionLoading} onClick={event => { event.preventDefault(); void confirmUserAction(); }}>
              {actionLoading ? 'Saving…' : pendingAction?.kind === 'role' ? `Confirm ${pendingAction.roleLabel} role` : pendingAction?.kind === 'suspend' ? 'Confirm suspension' : 'Confirm reactivation'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={resetOpen} onOpenChange={open => { if (!open && !resetLoading) setResetOpen(false); }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader><DialogTitle className="text-destructive">Delete all non-admin users?</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <p className="text-sm text-muted-foreground">This permanently removes all users except <strong>info.uniecoghana@gmail.com</strong>, including test profiles, vendors, payments, orders, referrals, notifications, and related records. This cannot be undone.</p>
            {resetError && <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive" role="alert">{resetError}</div>}
            <div className="space-y-1.5">
              <label htmlFor="reset-confirmation" className="text-xs font-semibold text-muted-foreground">Type DELETE ALL NON-ADMIN USERS</label>
              <Input id="reset-confirmation" value={resetConfirmation} onChange={event => setResetConfirmation(event.target.value)} autoComplete="off" />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="reset-reason" className="text-xs font-semibold text-muted-foreground">Reason</label>
              <Input id="reset-reason" value={resetReason} onChange={event => setResetReason(event.target.value)} placeholder="Registration testing is complete" maxLength={1000} />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setResetOpen(false)} disabled={resetLoading}>Cancel</Button>
              <Button variant="destructive" onClick={() => void confirmAccountReset()} disabled={resetLoading || resetConfirmation.trim() !== 'DELETE ALL NON-ADMIN USERS'}>
                {resetLoading ? 'Deleting…' : 'Permanently delete accounts'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
