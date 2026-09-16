'use client';

import { useState, useEffect } from 'react';
import { AdminRouteGuard, AdminLayout } from '@/components/admin/admin-layout';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { getAdminUsers, suspendUser, reactivateUser, assignUserRole, exportToCsv } from '@/lib/data/admin-client';
import type { AdminUser } from '@/lib/types/admin';
import { ROLE_LABELS } from '@/lib/auth/permissions';
import { ROLE_IDS, type UserRole } from '@/lib/types';
import { Search, Download, Ban, CheckCircle, Shield, ChevronLeft, ChevronRight } from 'lucide-react';
import { toast } from 'sonner';

export default function AdminUsersPage() {
  return (
    <AdminRouteGuard><AdminLayout><UsersContent /></AdminLayout></AdminRouteGuard>
  );
}

function UsersContent() {
  const [loading, setLoading] = useState(true);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [selectedUser, setSelectedUser] = useState<AdminUser | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const pageSize = 20;

  useEffect(() => { loadUsers(); }, [page, roleFilter, statusFilter]);

  async function loadUsers() {
    setLoading(true);
    const { users, total } = await getAdminUsers({
      search: search || undefined,
      role: roleFilter !== 'all' ? Number(roleFilter) : undefined,
      status: statusFilter,
      limit: pageSize,
      offset: page * pageSize,
    });
    setUsers(users);
    setTotal(total);
    setLoading(false);
  }

  function handleSearch() { setPage(0); loadUsers(); }

  const handleSuspend = async () => {
    if (!selectedUser) return;
    setActionLoading(true);
    const { error } = await suspendUser(selectedUser.id, 'Suspended by admin');
    if (error) { toast.error(error); } else { toast.success('User suspended'); setSelectedUser(null); loadUsers(); }
    setActionLoading(false);
  };

  const handleReactivate = async () => {
    if (!selectedUser) return;
    setActionLoading(true);
    const { error } = await reactivateUser(selectedUser.id);
    if (error) { toast.error(error); } else { toast.success('User reactivated'); setSelectedUser(null); loadUsers(); }
    setActionLoading(false);
  };

  const handleRoleAssign = async (roleId: number) => {
    if (!selectedUser) return;
    setActionLoading(true);
    const { error } = await assignUserRole(selectedUser.id, roleId);
    if (error) { toast.error(error); } else { toast.success('Role updated'); setSelectedUser(null); loadUsers(); }
    setActionLoading(false);
  };

  const handleExport = () => {
    exportToCsv(users.map(u => ({
      id: u.id, name: u.full_name, email: u.email, role: (u.role as { name?: string })?.name || 'student',
      status: u.status, university: u.university?.name || '', created: u.created_at,
    })), 'users');
  };

  return (
    <div className="p-4 sm:p-6 space-y-4 max-w-7xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold text-foreground">User Management</h1>
          <p className="mt-1 text-sm text-muted-foreground">{total} total users</p>
        </div>
        <Button variant="outline" size="sm" onClick={handleExport}><Download className="mr-2 h-4 w-4" /> Export</Button>
      </div>

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
          ) : users.length === 0 ? (
            <div className="py-12 text-center text-sm text-muted-foreground">No users found</div>
          ) : (
            <Table>
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
                    <TableCell><Button variant="ghost" size="sm" onClick={() => setSelectedUser(u)}>Manage</Button></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
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

              {selectedUser.student_profile && (
                <div className="rounded-lg border border-border p-3 text-xs">
                  <p className="font-semibold text-muted-foreground">Student Profile</p>
                  <p className="mt-1">ID: {selectedUser.student_profile.student_id_number || '—'}</p>
                  <p>Program: {selectedUser.student_profile.program_of_study || '—'}</p>
                  <p>Verified: {selectedUser.student_profile.is_verified_student ? 'Yes' : 'No'}</p>
                </div>
              )}

              {selectedUser.vendor_profile && (
                <div className="rounded-lg border border-border p-3 text-xs">
                  <p className="font-semibold text-muted-foreground">Vendor Profile</p>
                  <p className="mt-1">Type: {selectedUser.vendor_profile.vendor_type}</p>
                  <p>Verification: {selectedUser.vendor_profile.verification_status}</p>
                </div>
              )}

              {/* Role assignment */}
              <div>
                <p className="text-xs font-semibold text-muted-foreground mb-2">Assign Role</p>
                <div className="flex flex-wrap gap-1.5">
                  {Object.entries(ROLE_LABELS).filter(([key]) => key !== 'university_admin').map(([key, label]) => (
                    <Button
                      key={key}
                      size="sm"
                      variant={selectedUser.role_id === ROLE_IDS[key as keyof typeof ROLE_IDS] ? 'default' : 'outline'}
                      className="h-7 text-xs"
                      disabled={actionLoading}
                      onClick={() => handleRoleAssign(ROLE_IDS[key as keyof typeof ROLE_IDS])}
                    >
                      {label}
                    </Button>
                  ))}
                </div>
              </div>

              {/* Actions */}
              <div className="flex gap-2 pt-2">
                {selectedUser.status === 'active' ? (
                  <Button variant="destructive" size="sm" className="flex-1" disabled={actionLoading} onClick={handleSuspend}>
                    <Ban className="mr-2 h-4 w-4" /> Suspend
                  </Button>
                ) : (
                  <Button size="sm" className="flex-1" disabled={actionLoading} onClick={handleReactivate}>
                    <CheckCircle className="mr-2 h-4 w-4" /> Reactivate
                  </Button>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
