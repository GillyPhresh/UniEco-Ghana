'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { AdminRouteGuard, AdminLayout } from '@/components/admin/admin-layout';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { getAdminStudents, setStudentAccountStatus } from '@/lib/data/admin-client';
import type { AdminStudentDirectoryItem } from '@/lib/types/admin';
import { ChevronLeft, ChevronRight, GraduationCap, Search, ShieldAlert, ShoppingBag, Store } from 'lucide-react';

const PAGE_SIZE = 25;

export default function AdminStudentsPage() {
  return <AdminRouteGuard><AdminLayout><Content /></AdminLayout></AdminRouteGuard>;
}

function Content() {
  const [students, setStudents] = useState<AdminStudentDirectoryItem[]>([]);
  const [total, setTotal] = useState(0);
  const [searchText, setSearchText] = useState('');
  const [search, setSearch] = useState('');
  const [verificationStatus, setVerificationStatus] = useState('all');
  const [accountStatus, setAccountStatus] = useState('all');
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<AdminStudentDirectoryItem | null>(null);
  const [actionReason, setActionReason] = useState('');
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [pendingStatus, setPendingStatus] = useState<'active' | 'suspended' | null>(null);
  const requestVersion = useRef(0);

  const loadStudents = useCallback(async () => {
    const version = ++requestVersion.current;
    setLoading(true);
    setError(null);
    try {
      const result = await getAdminStudents({
        search,
        verificationStatus,
        accountStatus,
        limit: PAGE_SIZE,
        offset,
      });
      if (version !== requestVersion.current) return;
      setStudents(result.students);
      setTotal(result.total);
    } catch {
      if (version !== requestVersion.current) return;
      setStudents([]);
      setTotal(0);
      setError('Unable to load the student directory. Please try again.');
    } finally {
      if (version === requestVersion.current) setLoading(false);
    }
  }, [accountStatus, offset, search, verificationStatus]);

  useEffect(() => {
    void loadStudents();
    return () => { requestVersion.current += 1; };
  }, [loadStudents]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setSearch(searchText.trim());
      setOffset(0);
    }, 300);
    return () => window.clearTimeout(timer);
  }, [searchText]);

  const pageNumber = Math.floor(offset / PAGE_SIZE) + 1;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const requestAccountStatus = (status: 'active' | 'suspended') => {
    if (!selected) return;
    const reason = actionReason.trim();
    if (reason.length < 10 || reason.length > 500) {
      setActionError('Enter a reason between 10 and 500 characters.');
      return;
    }
    setActionError(null);
    setPendingStatus(status);
  };

  const confirmAccountStatus = async () => {
    if (!selected || !pendingStatus) return;
    const status = pendingStatus;
    const reason = actionReason.trim();
    setActionLoading(true);
    setActionError(null);
    try {
      const result = await setStudentAccountStatus(selected.student_id, status, reason);
      if (result.error) {
        setActionError(result.error);
        setPendingStatus(null);
        return;
      }
      setSelected(null);
      setActionReason('');
      setPendingStatus(null);
      await loadStudents();
    } catch {
      setActionError('Unable to update this student account. Please retry.');
      setPendingStatus(null);
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <div className="mx-auto max-w-7xl space-y-5 p-4 sm:p-6">
      <header className="space-y-1">
        <h1 className="flex items-center gap-2 font-display text-2xl font-bold text-foreground">
          <GraduationCap className="h-6 w-6 text-primary" /> Student Directory
        </h1>
        <p className="text-sm text-muted-foreground">Account and marketplace activity summaries are limited to authorized university scope. Student ID numbers, documents, and payment amounts are not shown.</p>
      </header>

      <Card>
        <CardContent className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-[minmax(16rem,1fr)_13rem_13rem]">
          <div className="space-y-1.5">
            <Label htmlFor="student-search">Search by student name</Label>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input id="student-search" className="pl-9" value={searchText} maxLength={100} onChange={event => setSearchText(event.target.value)} placeholder="Enter at least 3 characters" />
            </div>
            {searchText.trim().length > 0 && searchText.trim().length < 3 && <p className="text-xs text-muted-foreground">Type at least 3 characters to search.</p>}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="student-verification-filter">Verification</Label>
            <Select value={verificationStatus} onValueChange={value => { setVerificationStatus(value); setOffset(0); }}>
              <SelectTrigger id="student-verification-filter"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All verification states</SelectItem>
                <SelectItem value="unsubmitted">Not submitted</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="verified">Verified</SelectItem>
                <SelectItem value="rejected">Rejected</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="student-account-filter">Account status</Label>
            <Select value={accountStatus} onValueChange={value => { setAccountStatus(value); setOffset(0); }}>
              <SelectTrigger id="student-account-filter"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All account states</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="suspended">Suspended</SelectItem>
                <SelectItem value="inactive">Inactive</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <p className="text-sm text-muted-foreground" aria-live="polite">{loading ? 'Loading students…' : `${total} students`}</p>
      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="space-y-2 p-4" aria-label="Loading students">{[1, 2, 3, 4].map(item => <Skeleton key={item} className="h-12 rounded-lg" />)}</div>
          ) : error ? (
            <div className="space-y-3 py-12 text-center" role="alert">
              <p className="text-sm text-destructive">{error}</p>
              <Button variant="outline" size="sm" onClick={() => void loadStudents()}>Retry</Button>
            </div>
          ) : students.length === 0 ? (
            <div className="py-12 text-center text-sm text-muted-foreground">No students match these filters.</div>
          ) : (
            <>
            <div className="space-y-3 p-3 lg:hidden" aria-label="Mobile student directory">
              {students.map(student => (
                <article key={student.student_id} className="rounded-xl border border-border bg-background p-4 shadow-sm">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h2 className="break-words font-semibold text-foreground">{student.full_name || 'Name unavailable'}</h2>
                      <p className="mt-1 text-sm text-muted-foreground">{student.university_name || 'Unassigned'}</p>
                      <p className="text-xs text-muted-foreground">{student.role_name === 'student_vendor' ? 'Student vendor' : 'Student'}</p>
                    </div>
                    <Badge className="shrink-0" variant={student.is_active && student.account_status === 'active' ? 'default' : 'destructive'}>{student.account_status}</Badge>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Badge variant={student.verification_status === 'verified' ? 'default' : student.verification_status === 'rejected' ? 'destructive' : 'outline'}>{student.verification_status.replace('_', ' ')}</Badge>
                    {student.vendor_status && <Badge variant="outline">Vendor: {student.vendor_status}</Badge>}
                  </div>
                  <dl className="mt-4 grid grid-cols-2 gap-3 border-t border-border pt-3 text-sm">
                    <div><dt className="text-xs text-muted-foreground">Marketplace</dt><dd className="mt-0.5 font-medium">{student.total_orders} orders</dd></div>
                    <div><dt className="text-xs text-muted-foreground">Completed</dt><dd className="mt-0.5 font-medium">{student.completed_orders}</dd></div>
                    <div><dt className="text-xs text-muted-foreground">Account flags</dt><dd className={student.active_account_flags > 0 ? 'mt-0.5 font-medium text-destructive' : 'mt-0.5 font-medium'}>{student.active_account_flags}</dd></div>
                    <div><dt className="text-xs text-muted-foreground">Support tickets</dt><dd className="mt-0.5 font-medium">{student.unresolved_support_tickets}</dd></div>
                  </dl>
                  <Button className="mt-4 min-h-11 w-full gap-2" variant="outline" onClick={() => setSelected(student)}>
                    {student.active_account_flags > 0 && <ShieldAlert className="h-4 w-4 text-destructive" />}
                    View student operations
                  </Button>
                </article>
              ))}
            </div>
            <div className="hidden lg:block">
            <Table>
              <TableHeader><TableRow>
                <TableHead>Student</TableHead><TableHead>University</TableHead><TableHead>Verification</TableHead>
                <TableHead>Account</TableHead><TableHead>Vendor</TableHead><TableHead>Activity</TableHead><TableHead>Flags / Support</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {students.map(student => (
                  <TableRow key={student.student_id}>
                    <TableCell>
                      <p className="font-medium">{student.full_name || 'Name unavailable'}</p>
                      <p className="text-xs text-muted-foreground">{student.role_name === 'student_vendor' ? 'Student vendor' : 'Student'}</p>
                    </TableCell>
                    <TableCell>{student.university_name || 'Unassigned'}</TableCell>
                    <TableCell><Badge variant={student.verification_status === 'verified' ? 'default' : student.verification_status === 'rejected' ? 'destructive' : 'outline'}>{student.verification_status.replace('_', ' ')}</Badge></TableCell>
                    <TableCell><Badge variant={student.is_active && student.account_status === 'active' ? 'default' : 'destructive'}>{student.account_status}</Badge></TableCell>
                    <TableCell>{student.vendor_status ? <Badge variant="outline">{student.vendor_status}</Badge> : <span className="text-muted-foreground">None</span>}</TableCell>
                    <TableCell className="whitespace-nowrap">{student.total_orders} orders · {student.completed_orders} completed</TableCell>
                    <TableCell>
                      <Button variant="ghost" size="sm" className="gap-1" onClick={() => setSelected(student)}>
                        {student.active_account_flags > 0 && <ShieldAlert className="h-4 w-4 text-destructive" />}
                        {student.active_account_flags} / {student.unresolved_support_tickets}
                        <span className="sr-only">flags and unresolved support tickets; open student details</span>
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            </div>
            </>
          )}
        </CardContent>
      </Card>

      <nav className="flex items-center justify-between" aria-label="Student directory pages">
        <p className="text-sm text-muted-foreground">Page {pageNumber} of {pageCount}</p>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" disabled={loading || offset === 0} onClick={() => setOffset(value => Math.max(0, value - PAGE_SIZE))}><ChevronLeft className="mr-1 h-4 w-4" />Previous</Button>
          <Button variant="outline" size="sm" disabled={loading || offset + PAGE_SIZE >= total} onClick={() => setOffset(value => value + PAGE_SIZE)}>Next<ChevronRight className="ml-1 h-4 w-4" /></Button>
        </div>
      </nav>

      <Dialog open={!!selected} onOpenChange={open => { if (!open) setSelected(null); }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Student operations summary</DialogTitle>
            <DialogDescription>Aggregated operational data only; no private documents, student ID numbers, or payment amounts are included.</DialogDescription>
          </DialogHeader>
          {selected && (
            <dl className="grid grid-cols-2 gap-4 rounded-md border p-4 text-sm">
              <div><dt className="text-muted-foreground">Student</dt><dd className="font-medium">{selected.full_name || 'Name unavailable'}</dd></div>
              <div><dt className="text-muted-foreground">University</dt><dd>{selected.university_name || 'Unassigned'}</dd></div>
              <div><dt className="text-muted-foreground">Verification</dt><dd>{selected.verification_status}</dd></div>
              <div><dt className="text-muted-foreground">Account</dt><dd>{selected.account_status}{selected.is_active ? '' : ' · inactive'}</dd></div>
              <div><dt className="text-muted-foreground">Vendor status</dt><dd className="flex items-center gap-1">{selected.vendor_status || 'None'}{selected.vendor_status && <Store className="h-3.5 w-3.5" />}</dd></div>
              <div><dt className="text-muted-foreground">Marketplace</dt><dd className="flex items-center gap-1">{selected.total_orders} orders, {selected.completed_orders} completed <ShoppingBag className="h-3.5 w-3.5" /></dd></div>
              <div><dt className="text-muted-foreground">Active account flags</dt><dd>{selected.active_account_flags}</dd></div>
              <div><dt className="text-muted-foreground">Unresolved support</dt><dd>{selected.unresolved_support_tickets}</dd></div>
              <div className="col-span-2"><dt className="text-muted-foreground">Registered</dt><dd>{new Date(selected.registered_at).toLocaleString('en-GH')}</dd></div>
            </dl>
          )}
          {selected && ['active', 'suspended', 'inactive'].includes(selected.account_status) && (
            <section className="space-y-3 border-t pt-4" aria-label="Student account action">
              <p className="text-sm">This changes the student account&apos;s active status. It does not change student verification or vendor status.</p>
              <div className="space-y-1.5">
                <Label htmlFor="student-account-action-reason">Reason (required)</Label>
                <Input id="student-account-action-reason" value={actionReason} maxLength={500} onChange={event => setActionReason(event.target.value)} aria-describedby="student-account-action-reason-help" />
                <p id="student-account-action-reason-help" className="text-xs text-muted-foreground">10–500 characters. The decision is recorded in the audit history.</p>
              </div>
              {actionError && <p role="alert" className="text-sm text-destructive">{actionError}</p>}
              <Button
                variant={selected.account_status === 'active' ? 'destructive' : 'default'}
                disabled={actionLoading}
                onClick={() => requestAccountStatus(selected.account_status === 'active' ? 'suspended' : 'active')}
              >
                {actionLoading ? 'Saving…' : selected.account_status === 'active' ? 'Suspend student' : 'Reactivate student'}
              </Button>
            </section>
          )}
        </DialogContent>
      </Dialog>
      <AlertDialog open={pendingStatus !== null} onOpenChange={open => { if (!open && !actionLoading) setPendingStatus(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm student account {pendingStatus === 'suspended' ? 'suspension' : 'reactivation'}</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingStatus === 'suspended'
                ? `Suspend ${selected?.full_name || 'this student'}? Their account will be marked suspended. This does not change verification or vendor status.`
                : `Reactivate ${selected?.full_name || 'this student'}? Their account will be marked active. This does not change verification or vendor status.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={actionLoading}>Cancel</AlertDialogCancel>
            <AlertDialogAction disabled={actionLoading} onClick={event => { event.preventDefault(); void confirmAccountStatus(); }}>
              {actionLoading ? 'Saving…' : pendingStatus === 'suspended' ? 'Confirm suspension' : 'Confirm reactivation'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
