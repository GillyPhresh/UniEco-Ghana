'use client';

import { useCallback, useState, useEffect } from 'react';
import { AdminRouteGuard, AdminLayout } from '@/components/admin/admin-layout';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { getStudentVerificationDocumentUrl, getStudentVerifications, approveStudentVerification, rejectStudentVerification } from '@/lib/data/admin-client';
import type { AdminStudentVerification } from '@/lib/types/admin';
import { Check, X, UserCheck, AlertTriangle, FileText } from 'lucide-react';
import { toast } from 'sonner';

export default function StudentVerificationPage() {
  return (
    <AdminRouteGuard><AdminLayout><Content /></AdminLayout></AdminRouteGuard>
  );
}

function Content() {
  const [loading, setLoading] = useState(true);
  const [students, setStudents] = useState<AdminStudentVerification[]>([]);
  const [total, setTotal] = useState(0);
  const [filter, setFilter] = useState('pending');
  const [selected, setSelected] = useState<AdminStudentVerification | null>(null);
  const [reason, setReason] = useState('');
  const [actionLoading, setActionLoading] = useState(false);
  const [pendingDecision, setPendingDecision] = useState<'approve' | 'reject' | null>(null);
  const [documentLoading, setDocumentLoading] = useState(false);
  const [documentUrl, setDocumentUrl] = useState<string | null>(null);
  const [documentError, setDocumentError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const loadStudents = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const result = await getStudentVerifications({ status: filter, limit: 30 });
      setStudents(result.students);
      setTotal(result.total);
    } catch {
      setStudents([]);
      setTotal(0);
      setLoadError('Unable to load student verification records. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => { void loadStudents(); }, [loadStudents]);

  async function prepareDocumentLink() {
    if (!selected?.has_student_id_document) return;
    setDocumentLoading(true);
    setDocumentError(null);
    setDocumentUrl(null);
    const result = await getStudentVerificationDocumentUrl(selected.id);
    if (result.error || !result.url) setDocumentError(result.error || 'Unable to prepare the document link.');
    else setDocumentUrl(result.url);
    setDocumentLoading(false);
  }

  const requestDecision = (decision: 'approve' | 'reject') => {
    if (!selected || reason.trim().length < 10 || reason.trim().length > 500) {
      toast.error('Provide a decision reason between 10 and 500 characters.');
      return;
    }
    setPendingDecision(decision);
  };

  const confirmDecision = async () => {
    if (!selected || !pendingDecision) return;
    const decision = pendingDecision;
    setActionLoading(true);
    try {
      const result = decision === 'approve'
        ? await approveStudentVerification(selected.id, reason.trim())
        : await rejectStudentVerification(selected.id, reason.trim());
      if (result.error) toast.error(result.error);
      else {
        toast.success(decision === 'approve' ? 'Student verified' : 'Verification rejected');
        setSelected(null);
        setReason('');
        void loadStudents();
      }
    } catch {
      toast.error('Unable to complete this verification decision. Please retry.');
    } finally {
      setPendingDecision(null);
      setActionLoading(false);
    }
  };

  return (
    <div className="p-4 sm:p-6 space-y-4 max-w-5xl">
      <div>
        <h1 className="font-display text-2xl font-bold text-foreground flex items-center gap-2">
          <UserCheck className="h-6 w-6 text-primary" /> Student Verification Center
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">{total} records</p>
      </div>

      <Tabs value={filter} onValueChange={setFilter}>
        <TabsList>
          <TabsTrigger value="pending">Pending</TabsTrigger>
          <TabsTrigger value="verified">Verified</TabsTrigger>
          <TabsTrigger value="rejected">Rejected</TabsTrigger>
          <TabsTrigger value="all">All</TabsTrigger>
        </TabsList>
      </Tabs>

      {loading ? (
        <div className="space-y-2">{[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-20 rounded-xl" />)}</div>
      ) : loadError ? (
        <Card><CardContent className="py-8 text-center space-y-3">
          <p role="alert" className="text-sm text-destructive"><AlertTriangle className="mr-1 inline h-4 w-4" />{loadError}</p>
          <Button variant="outline" size="sm" onClick={() => void loadStudents()}>Retry</Button>
        </CardContent></Card>
      ) : students.length === 0 ? (
        <Card><CardContent className="py-12 text-center text-sm text-muted-foreground">No records found</CardContent></Card>
      ) : (
        <div className="space-y-2">
          {students.map(s => (
            <Card key={s.id} className="cursor-pointer hover:border-primary/30 transition-colors" >
              <CardContent className="flex items-center gap-3 p-4" onClick={() => { setSelected(s); setReason(''); setDocumentUrl(null); setDocumentError(null); }}>
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
                  <UserCheck className="h-5 w-5 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground">{s.user?.full_name || s.user?.email || 'Unknown'}</p>
                  <p className="text-xs text-muted-foreground">
                    ID: {s.student_id_number || '—'} | {s.program_of_study || 'No program'} | {s.user?.university?.name || 'No university'}
                  </p>
                </div>
                <Badge className={
                  s.verification_status === 'verified' ? 'bg-success/10 text-success' :
                  s.verification_status === 'rejected' ? 'bg-destructive/10 text-destructive' :
                  'bg-warning/10 text-warning'
                }>{s.verification_status}</Badge>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Detail dialog */}
      <Dialog open={!!selected} onOpenChange={open => { if (!open) { setSelected(null); setReason(''); } }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Verification Review</DialogTitle></DialogHeader>
          {selected && (
            <div className="space-y-4 py-2">
              <div className="rounded-lg border border-border p-3 space-y-1 text-sm">
                <p><span className="text-muted-foreground">Name:</span> {selected.user?.full_name || '—'}</p>
                <p><span className="text-muted-foreground">Email:</span> {selected.user?.email || '—'}</p>
                <p><span className="text-muted-foreground">Student ID:</span> {selected.student_id_number || '—'}</p>
                <p><span className="text-muted-foreground">Program:</span> {selected.program_of_study || '—'}</p>
                <p><span className="text-muted-foreground">Faculty:</span> {selected.faculty || '—'}</p>
                <p><span className="text-muted-foreground">Department:</span> {selected.department || '—'}</p>
                <p><span className="text-muted-foreground">Level:</span> {selected.level || '—'}</p>
                <p><span className="text-muted-foreground">University:</span> {selected.user?.university?.name || '—'}</p>
              </div>

              {selected.has_student_id_document && (
                <div>
                  <p className="text-xs font-semibold text-muted-foreground mb-1">Student ID Document</p>
                  <Button type="button" variant="outline" size="sm" disabled={documentLoading} onClick={() => void prepareDocumentLink()}>
                    <FileText className="mr-2 h-4 w-4" /> {documentLoading ? 'Authorizing…' : 'Prepare secure link'}
                  </Button>
                  {documentError && <p role="alert" className="mt-2 text-xs text-destructive">{documentError}</p>}
                  {documentUrl && <a href={documentUrl} target="_blank" rel="noopener noreferrer" className="ml-3 text-sm text-primary hover:underline">Open document (expires in 5 minutes)</a>}
                </div>
              )}

              {selected.verification_status === 'rejected' && selected.rejection_reason && (
                <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-3">
                  <p className="text-xs font-semibold text-destructive">Rejection Reason</p>
                  <p className="mt-1 text-sm text-foreground">{selected.rejection_reason}</p>
                </div>
              )}

              {selected.verification_status !== 'verified' && (
                <div className="space-y-3">
                  <Textarea rows={3} minLength={10} maxLength={500} placeholder="Reason for this verification decision (10–500 characters)..." value={reason} onChange={event => setReason(event.target.value)} aria-label="Student verification decision reason" />
                  <div className="flex gap-2">
                    <Button className="flex-1" disabled={actionLoading || reason.trim().length < 10 || reason.trim().length > 500} onClick={() => requestDecision('approve')}>
                      <Check className="mr-2 h-4 w-4" /> Approve
                    </Button>
                    <Button variant="outline" className="flex-1 text-destructive" disabled={actionLoading || reason.trim().length < 10 || reason.trim().length > 500} onClick={() => requestDecision('reject')}>
                      <X className="mr-2 h-4 w-4" /> Reject
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
      <AlertDialog open={pendingDecision !== null} onOpenChange={open => { if (!open && !actionLoading) setPendingDecision(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm student verification {pendingDecision === 'approve' ? 'approval' : 'rejection'}</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingDecision === 'approve'
                ? `Approve ${selected?.user?.full_name || 'this student'}? The decision and reason will be recorded in the audit history.`
                : `Reject ${selected?.user?.full_name || 'this student'}? This may affect access to student features. The decision and reason will be recorded.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <p className="rounded-md bg-muted p-3 text-sm">Reason: {reason.trim()}</p>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={actionLoading}>Cancel</AlertDialogCancel>
            <AlertDialogAction disabled={actionLoading} onClick={event => { event.preventDefault(); void confirmDecision(); }}>
              {actionLoading ? 'Saving…' : pendingDecision === 'approve' ? 'Confirm approval' : 'Confirm rejection'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
