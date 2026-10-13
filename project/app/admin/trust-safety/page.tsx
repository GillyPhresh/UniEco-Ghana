'use client';

import { useCallback, useDeferredValue, useEffect, useRef, useState } from 'react';
import { AdminRouteGuard, AdminLayout } from '@/components/admin/admin-layout';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import {
  assignAdminModerationCase, getAdminModerationCaseEvents, getAdminModerationCases,
  getAdminModerationReviewers, updateAdminModerationCase,
} from '@/lib/data/admin-client';
import type { AdminModerationCase, AdminModerationCaseEvent, AdminModerationReviewer } from '@/lib/types/admin';
import { AlertTriangle, ChevronLeft, ChevronRight } from 'lucide-react';
import { toast } from 'sonner';

const statusTransitions: Record<AdminModerationCase['status'], AdminModerationCase['status'][]> = {
  open: ['investigating', 'waiting_info', 'dismissed', 'escalated'],
  investigating: ['waiting_info', 'resolved', 'dismissed', 'escalated'],
  waiting_info: ['investigating', 'resolved', 'dismissed', 'escalated'],
  escalated: ['investigating', 'resolved', 'dismissed'],
  resolved: [],
  dismissed: [],
};

export default function AdminTrustSafetyPage() {
  return <AdminRouteGuard><AdminLayout><Content /></AdminLayout></AdminRouteGuard>;
}

function Content() {
  const [cases, setCases] = useState<AdminModerationCase[]>([]);
  const [selected, setSelected] = useState<AdminModerationCase | null>(null);
  const [nextStatus, setNextStatus] = useState('');
  const [reason, setReason] = useState('');
  const [assignmentReason, setAssignmentReason] = useState('');
  const [assignmentChoice, setAssignmentChoice] = useState('unassigned');
  const [pendingCaseAction, setPendingCaseAction] = useState<{ kind: 'assignment'; assigneeId: string | null } | { kind: 'decision' } | null>(null);
  const [reviewers, setReviewers] = useState<AdminModerationReviewer[]>([]);
  const [reviewersError, setReviewersError] = useState(false);
  const [events, setEvents] = useState<AdminModerationCaseEvent[]>([]);
  const [eventsLoading, setEventsLoading] = useState(false);
  const [eventsError, setEventsError] = useState(false);
  const historyRequestId = useRef(0);
  const [status, setStatus] = useState('open');
  const [severity, setSeverity] = useState('all');
  const [search, setSearch] = useState('');
  const deferredSearch = useDeferredValue(search);
  const [page, setPage] = useState(0);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(false);
  const pageSize = 30;

  const loadCases = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const result = await getAdminModerationCases({ status, severity, search: deferredSearch, limit: pageSize, offset: page * pageSize });
      setCases(result.cases);
      setTotal(result.total);
    } catch {
      setCases([]);
      setTotal(0);
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [deferredSearch, page, severity, status]);

  useEffect(() => { void loadCases(); }, [loadCases]);

  const loadReviewers = useCallback(async () => {
    try {
      const value = await getAdminModerationReviewers();
      setReviewers(value);
      setReviewersError(false);
    } catch {
      setReviewersError(true);
    }
  }, []);

  useEffect(() => { void loadReviewers(); }, [loadReviewers]);

  const openCase = (item: AdminModerationCase) => {
    historyRequestId.current += 1;
    const requestId = historyRequestId.current;
    setSelected(item);
    setNextStatus(statusTransitions[item.status][0] || '');
    setReason('');
    setAssignmentReason('');
    setAssignmentChoice(item.assigned_to_id || 'unassigned');
    setEvents([]);
    setEventsError(false);
    setEventsLoading(true);
    void getAdminModerationCaseEvents(item.id)
      .then(value => { if (historyRequestId.current === requestId) setEvents(value); })
      .catch(() => { if (historyRequestId.current === requestId) setEventsError(true); })
      .finally(() => { if (historyRequestId.current === requestId) setEventsLoading(false); });
  };

  const saveAssignment = async (assigneeId: string | null) => {
    if (!selected || assignmentReason.trim().length < 10 || assignmentReason.trim().length > 500) {
      toast.error('Enter an assignment reason between 10 and 500 characters.');
      return;
    }
    setSaving(true);
    try {
      const result = await assignAdminModerationCase(selected.id, assigneeId, assignmentReason);
      if (result.error) { toast.error(result.error); return; }
      const assigneeName = reviewers.find(reviewer => reviewer.user_id === assigneeId)?.full_name || null;
      const updatedCase = { ...selected, assigned_to_id: assigneeId, assigned_to_name: assigneeName };
      setCases(current => current.map(item => item.id === selected.id ? updatedCase : item));
      setSelected(updatedCase);
      setAssignmentChoice(assigneeId || 'unassigned');
      setAssignmentReason('');
      toast.success(assigneeId ? 'Case assigned and audited.' : 'Case unassigned and audited.');
      void loadCases();
      openCase(updatedCase);
    } catch {
      toast.error('Unable to assign the case. Please retry.');
    } finally {
      setPendingCaseAction(null);
      setSaving(false);
    }
  };

  const requestAssignment = () => {
    if (!selected || assignmentReason.trim().length < 10 || assignmentReason.trim().length > 500) {
      toast.error('Enter an assignment reason between 10 and 500 characters.');
      return;
    }
    setPendingCaseAction({ kind: 'assignment', assigneeId: assignmentChoice === 'unassigned' ? null : assignmentChoice });
  };

  const saveDecision = async () => {
    if (!selected || !nextStatus || reason.trim().length < 10 || reason.trim().length > 1000) {
      toast.error('Choose an allowed next status and enter a reason between 10 and 1,000 characters.');
      return;
    }
    setSaving(true);
    try {
      const result = await updateAdminModerationCase(selected.id, nextStatus, reason);
      if (result.error) { toast.error(result.error); return; }
      toast.success('Trust & Safety case updated and audited.');
      setSelected(null);
      void loadCases();
    } catch {
      toast.error('Unable to update the case. Please retry.');
    } finally {
      setPendingCaseAction(null);
      setSaving(false);
    }
  };

  const requestDecision = () => {
    if (!selected || !statusTransitions[selected.status].includes(nextStatus as AdminModerationCase['status']) || reason.trim().length < 10 || reason.trim().length > 1000) {
      toast.error('Choose an allowed next status and enter a reason between 10 and 1,000 characters.');
      return;
    }
    setPendingCaseAction({ kind: 'decision' });
  };

  return (
    <div className="max-w-7xl space-y-4 p-4 sm:p-6">
      <div>
        <h1 className="flex items-center gap-2 font-display text-2xl font-bold text-foreground"><AlertTriangle className="h-6 w-6 text-primary" /> Trust & Safety</h1>
        <p className="mt-1 text-sm text-muted-foreground">Review and resolve platform safety cases. Decisions require a reason and are recorded in the existing audit trail.</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Select value={status} onValueChange={value => { setStatus(value); setPage(0); }}>
          <SelectTrigger aria-label="Filter trust cases by status"><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value="open">Open</SelectItem><SelectItem value="investigating">Investigating</SelectItem><SelectItem value="waiting_info">Waiting for information</SelectItem><SelectItem value="escalated">Escalated</SelectItem><SelectItem value="resolved">Resolved</SelectItem><SelectItem value="dismissed">Dismissed</SelectItem><SelectItem value="all">All statuses</SelectItem></SelectContent>
        </Select>
        <Select value={severity} onValueChange={value => { setSeverity(value); setPage(0); }}>
          <SelectTrigger aria-label="Filter trust cases by severity"><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value="all">All severities</SelectItem><SelectItem value="critical">Critical</SelectItem><SelectItem value="high">High</SelectItem><SelectItem value="medium">Medium</SelectItem><SelectItem value="low">Low</SelectItem></SelectContent>
        </Select>
        <Input value={search} onChange={event => { setSearch(event.target.value); setPage(0); }} placeholder="Search case number, title, or type (3+ characters)" aria-label="Search Trust and Safety cases" />
      </div>

      <Card><CardContent className="p-0">
        {loading ? <div className="space-y-2 p-4">{[1, 2, 3, 4].map(row => <Skeleton key={row} className="h-12 rounded-lg" />)}</div>
          : error ? <div className="space-y-3 py-12 text-center text-sm text-muted-foreground"><p role="alert">Unable to load Trust & Safety cases. Please try again.</p><Button variant="outline" size="sm" onClick={() => void loadCases()}>Retry</Button></div>
            : cases.length === 0 ? <div className="py-12 text-center text-sm text-muted-foreground">No Trust & Safety cases match your filters.</div>
              : <div className="overflow-x-auto"><Table>
                <TableHeader><TableRow><TableHead>Case</TableHead><TableHead>Title</TableHead><TableHead>Type</TableHead><TableHead>Severity</TableHead><TableHead>Status</TableHead><TableHead>University</TableHead><TableHead>Assigned to</TableHead><TableHead>Updated</TableHead></TableRow></TableHeader>
                <TableBody>{cases.map(item => <TableRow key={item.id}>
                  <TableCell className="font-mono text-xs">{item.case_number}</TableCell><TableCell><Button variant="link" className="h-auto whitespace-normal p-0 text-left" onClick={() => openCase(item)}>{item.title}</Button></TableCell><TableCell>{item.case_type}</TableCell><TableCell><Badge variant={item.severity === 'critical' || item.severity === 'high' ? 'destructive' : 'outline'}>{item.severity}</Badge></TableCell><TableCell><Badge variant="outline">{item.status.replaceAll('_', ' ')}</Badge></TableCell><TableCell>{item.university_name || 'Platform'}</TableCell><TableCell>{item.assigned_to_name || 'Unassigned'}</TableCell><TableCell className="text-xs text-muted-foreground">{new Date(item.updated_at).toLocaleString('en-GH', { dateStyle: 'short', timeStyle: 'short' })}</TableCell>
                </TableRow>)}</TableBody>
              </Table></div>}
      </CardContent></Card>

      {total > pageSize && <div className="flex items-center justify-between"><p className="text-xs text-muted-foreground">Page {page + 1} of {Math.ceil(total / pageSize)}</p><div className="flex gap-1"><Button variant="outline" size="sm" aria-label="Previous page" disabled={page === 0} onClick={() => setPage(current => current - 1)}><ChevronLeft className="h-4 w-4" /></Button><Button variant="outline" size="sm" aria-label="Next page" disabled={(page + 1) * pageSize >= total} onClick={() => setPage(current => current + 1)}><ChevronRight className="h-4 w-4" /></Button></div></div>}

      <Dialog open={selected !== null} onOpenChange={open => { if (!open) { historyRequestId.current += 1; setSelected(null); } }}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader><DialogTitle>{selected?.case_number}: {selected?.title}</DialogTitle></DialogHeader>
          {selected && <div className="space-y-4 text-sm">
            <div className="flex flex-wrap gap-2"><Badge variant="outline">{selected.severity}</Badge><Badge variant="outline">{selected.status.replaceAll('_', ' ')}</Badge><Badge variant="outline">{selected.case_type}</Badge></div>
            <p className="whitespace-pre-wrap text-muted-foreground">{selected.description || 'No case description provided.'}</p>
            <dl className="grid gap-2 sm:grid-cols-2"><div><dt className="text-muted-foreground">Subject type</dt><dd>{selected.subject_type}</dd></div><div><dt className="text-muted-foreground">Subject reference</dt><dd className="break-all font-mono text-xs">{selected.subject_id}</dd></div><div><dt className="text-muted-foreground">University</dt><dd>{selected.university_name || 'Platform-wide'}</dd></div><div><dt className="text-muted-foreground">Priority</dt><dd>{selected.priority}</dd></div></dl>
            {selected.resolution && <div><p className="font-medium">Last resolution</p><p className="whitespace-pre-wrap text-muted-foreground">{selected.resolution}</p></div>}
            <section className="space-y-3 rounded-md border p-3">
              <h2 className="font-semibold">Case assignment</h2>
              <p className="text-muted-foreground">Currently assigned to {selected.assigned_to_name || 'nobody'}.</p>
              {reviewersError ? <div className="space-y-2"><p role="alert" className="text-destructive">Unable to load eligible reviewers. Assignment is unavailable.</p><Button variant="outline" size="sm" onClick={() => void loadReviewers()}>Retry reviewers</Button></div> : <>
                <Select value={assignmentChoice} onValueChange={setAssignmentChoice} disabled={saving || ['resolved', 'dismissed'].includes(selected.status)}>
                  <SelectTrigger aria-label="Assign this case to an authorized reviewer"><SelectValue placeholder="Choose reviewer" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="unassigned">Unassigned</SelectItem>
                    {reviewers.map(reviewer => <SelectItem key={reviewer.user_id} value={reviewer.user_id}>{reviewer.full_name || 'Unnamed reviewer'} ({reviewer.role_name.replace('_', ' ')})</SelectItem>)}
                  </SelectContent>
                </Select>
                {!['resolved', 'dismissed'].includes(selected.status) && <>
                  <Textarea value={assignmentReason} onChange={event => setAssignmentReason(event.target.value)} maxLength={500} placeholder="Reason for assigning or unassigning (10-500 characters)" aria-label="Case assignment reason" />
                  <Button variant="outline" onClick={requestAssignment} disabled={saving || assignmentReason.trim().length < 10 || assignmentReason.trim().length > 500 || assignmentChoice === (selected.assigned_to_id || 'unassigned')}>Review assignment</Button>
                </>}
              </>}
            </section>
            <section className="space-y-2 rounded-md border p-3">
              <h2 className="font-semibold">Case activity</h2>
              {eventsLoading ? <Skeleton className="h-16" /> : eventsError ? <div className="space-y-2"><p role="alert" className="text-destructive">Unable to load case activity.</p><Button variant="outline" size="sm" onClick={() => openCase(selected)}>Retry activity</Button></div> : events.length === 0 ? <p className="text-muted-foreground">No case activity recorded yet.</p> : <ol className="space-y-3">{events.map(event => <li key={event.event_id} className="border-l-2 pl-3"><p className="font-medium">{event.event_type.replaceAll('_', ' ')}</p><p className="text-xs text-muted-foreground">{event.actor_name || 'System'} · {new Date(event.created_at).toLocaleString('en-GH')}</p>{event.event_type === 'assignment_changed' && <p className="text-xs">{event.previous_assignee_name || 'Unassigned'} → {event.assignee_name || 'Unassigned'}</p>}{event.assignee_name && event.event_type !== 'assignment_changed' && <p className="text-xs">Assigned to {event.assignee_name}</p>}{event.reason && <p className="whitespace-pre-wrap text-sm text-muted-foreground">{event.reason}</p>}</li>)}</ol>}
            </section>
            {statusTransitions[selected.status].length > 0 && <>
              <Select value={nextStatus} onValueChange={setNextStatus}><SelectTrigger aria-label="Select next case status"><SelectValue placeholder="Choose next status" /></SelectTrigger><SelectContent>{statusTransitions[selected.status].map(option => <SelectItem key={option} value={option}>{option.replaceAll('_', ' ')}</SelectItem>)}</SelectContent></Select>
              <Textarea value={reason} onChange={event => setReason(event.target.value)} maxLength={1000} placeholder="Required decision reason (10–1000 characters)" aria-label="Decision reason" />
            </>}
          </div>}
          <DialogFooter>{selected && statusTransitions[selected.status].length > 0 && <Button onClick={requestDecision} disabled={saving || reason.trim().length < 10 || reason.trim().length > 1000}>{saving ? 'Saving…' : 'Review decision'}</Button>}</DialogFooter>
        </DialogContent>
      </Dialog>
      <AlertDialog open={pendingCaseAction !== null} onOpenChange={open => { if (!open && !saving) setPendingCaseAction(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm Trust &amp; Safety {pendingCaseAction?.kind === 'assignment' ? 'assignment' : 'decision'}</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingCaseAction?.kind === 'assignment'
                ? `${pendingCaseAction.assigneeId ? `Assign ${reviewers.find(reviewer => reviewer.user_id === pendingCaseAction.assigneeId)?.full_name || 'the selected reviewer'} to` : 'Unassign the reviewer from'} case ${selected?.case_number || ''}? This will be audited.`
                : `Change case ${selected?.case_number || ''} to ${nextStatus.replaceAll('_', ' ')}? This will affect case handling and will be audited.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <p className="rounded-md bg-muted p-3 text-sm">Reason: {(pendingCaseAction?.kind === 'assignment' ? assignmentReason : reason).trim()}</p>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={saving}>Cancel</AlertDialogCancel>
            <AlertDialogAction disabled={saving} onClick={event => {
              event.preventDefault();
              if (pendingCaseAction?.kind === 'assignment') void saveAssignment(pendingCaseAction.assigneeId);
              else if (pendingCaseAction?.kind === 'decision') void saveDecision();
            }}>
              {saving ? 'Saving…' : pendingCaseAction?.kind === 'assignment' ? 'Confirm assignment' : 'Confirm decision'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
