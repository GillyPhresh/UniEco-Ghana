'use client';

import { useState, useEffect } from 'react';
import { AdminRouteGuard, AdminLayout } from '@/components/admin/admin-layout';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { getStudentVerifications, approveStudentVerification, rejectStudentVerification } from '@/lib/data/admin-client';
import { Check, X, UserCheck, AlertTriangle, FileText } from 'lucide-react';
import { toast } from 'sonner';

type StudentRecord = {
  id: string;
  user_id: string;
  student_id_number: string | null;
  program_of_study: string | null;
  faculty: string | null;
  department: string | null;
  level: string | null;
  verification_status: string;
  is_verified_student: boolean;
  student_id_document_url: string | null;
  rejection_reason: string | null;
  created_at: string;
  user: { id: string; email: string; full_name: string | null; avatar_url: string | null; university: { name: string } | null } | null;
};

export default function StudentVerificationPage() {
  return (
    <AdminRouteGuard><AdminLayout><Content /></AdminLayout></AdminRouteGuard>
  );
}

function Content() {
  const [loading, setLoading] = useState(true);
  const [students, setStudents] = useState<StudentRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [filter, setFilter] = useState('pending');
  const [selected, setSelected] = useState<StudentRecord | null>(null);
  const [rejectMode, setRejectMode] = useState(false);
  const [reason, setReason] = useState('');
  const [actionLoading, setActionLoading] = useState(false);

  useEffect(() => { loadStudents(); }, [filter]);

  async function loadStudents() {
    setLoading(true);
    const { students, total } = await getStudentVerifications({ status: filter, limit: 30 });
    setStudents(students as unknown as StudentRecord[]);
    setTotal(total);
    setLoading(false);
  }

  const handleApprove = async () => {
    if (!selected) return;
    setActionLoading(true);
    const { error } = await approveStudentVerification(selected.id);
    if (error) { toast.error(error); } else { toast.success('Student verified'); setSelected(null); loadStudents(); }
    setActionLoading(false);
  };

  const handleReject = async () => {
    if (!selected || !reason.trim()) { toast.error('Please provide a reason'); return; }
    setActionLoading(true);
    const { error } = await rejectStudentVerification(selected.id, reason);
    if (error) { toast.error(error); } else { toast.success('Verification rejected'); setRejectMode(false); setSelected(null); setReason(''); loadStudents(); }
    setActionLoading(false);
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
      ) : students.length === 0 ? (
        <Card><CardContent className="py-12 text-center text-sm text-muted-foreground">No records found</CardContent></Card>
      ) : (
        <div className="space-y-2">
          {students.map(s => (
            <Card key={s.id} className="cursor-pointer hover:border-primary/30 transition-colors" >
              <CardContent className="flex items-center gap-3 p-4" onClick={() => { setSelected(s); setRejectMode(false); }}>
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
      <Dialog open={!!selected} onOpenChange={open => { if (!open) { setSelected(null); setRejectMode(false); } }}>
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

              {selected.student_id_document_url && (
                <div>
                  <p className="text-xs font-semibold text-muted-foreground mb-1">Student ID Document</p>
                  <a href={selected.student_id_document_url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-sm text-primary hover:underline">
                    <FileText className="h-4 w-4" /> View document
                  </a>
                </div>
              )}

              {selected.verification_status === 'rejected' && selected.rejection_reason && (
                <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-3">
                  <p className="text-xs font-semibold text-destructive">Rejection Reason</p>
                  <p className="mt-1 text-sm text-foreground">{selected.rejection_reason}</p>
                </div>
              )}

              {rejectMode ? (
                <div className="space-y-3">
                  <Textarea rows={3} placeholder="Reason for rejection..." value={reason} onChange={e => setReason(e.target.value)} />
                  <div className="flex gap-2">
                    <Button variant="outline" className="flex-1" onClick={() => setRejectMode(false)}>Cancel</Button>
                    <Button variant="destructive" className="flex-1" disabled={actionLoading || !reason.trim()} onClick={handleReject}>
                      <X className="mr-2 h-4 w-4" /> Confirm rejection
                    </Button>
                  </div>
                </div>
              ) : (
                selected.verification_status !== 'verified' && (
                  <div className="flex gap-2">
                    <Button className="flex-1" disabled={actionLoading} onClick={handleApprove}>
                      <Check className="mr-2 h-4 w-4" /> Approve
                    </Button>
                    <Button variant="outline" className="flex-1 text-destructive" disabled={actionLoading} onClick={() => setRejectMode(true)}>
                      <X className="mr-2 h-4 w-4" /> Reject
                    </Button>
                  </div>
                )
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
