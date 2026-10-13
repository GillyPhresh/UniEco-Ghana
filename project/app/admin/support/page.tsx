'use client';

import { useState, useEffect, useCallback } from 'react';
import { AdminRouteGuard, AdminLayout } from '@/components/admin/admin-layout';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { getAdminTickets, getTicketById, getTicketReplies, replyToTicket, getAdminSupportAssignees, assignTicket, closeTicket } from '@/lib/data/admin-client';
import type { AdminSupportAssignee, SupportTicket, TicketReply } from '@/lib/types/admin';
import { LifeBuoy, Send, UserCog, X, ChevronLeft, ChevronRight } from 'lucide-react';
import { toast } from 'sonner';

export default function AdminSupportPage() {
  return (
    <AdminRouteGuard><AdminLayout><Content /></AdminLayout></AdminRouteGuard>
  );
}

function Content() {
  const [loading, setLoading] = useState(true);
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [listError, setListError] = useState<string | null>(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [filter, setFilter] = useState('all');
  const [selected, setSelected] = useState<SupportTicket | null>(null);
  const [replies, setReplies] = useState<TicketReply[]>([]);
  const [replyBody, setReplyBody] = useState('');
  const [isInternal, setIsInternal] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [replyError, setReplyError] = useState<string | null>(null);
  const [assignees, setAssignees] = useState<AdminSupportAssignee[]>([]);
  const [assigneesError, setAssigneesError] = useState<string | null>(null);
  const [assigneeId, setAssigneeId] = useState('');
  const [assignmentReason, setAssignmentReason] = useState('');
  const [assignmentSaving, setAssignmentSaving] = useState(false);
  const [assignmentConfirmationOpen, setAssignmentConfirmationOpen] = useState(false);
  const [closeConfirmationOpen, setCloseConfirmationOpen] = useState(false);
  const [closeReason, setCloseReason] = useState('');
  const pageSize = 20;

  const loadTickets = useCallback(async () => {
    setLoading(true);
    setListError(null);
    try {
      const result = await getAdminTickets({ status: filter, limit: pageSize, offset: page * pageSize });
      if (!result.ok) {
        setListError(result.error);
        setTickets([]);
        setTotal(0);
      } else {
        setTickets(result.data.tickets);
        setTotal(result.data.total);
      }
    } catch {
      setListError('Unable to load support tickets. Please try again.');
      setTickets([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [filter, page]);

  useEffect(() => { void loadTickets(); }, [loadTickets]);

  useEffect(() => {
    let active = true;
    void getAdminSupportAssignees().then((result) => {
      if (!active) return;
      if (!result.ok) { setAssigneesError(result.error); setAssignees([]); }
      else { setAssigneesError(null); setAssignees(result.data); }
    });
    return () => { active = false; };
  }, []);

  async function loadReplies(ticketId: string) {
    setReplyError(null);
    const result = await getTicketReplies(ticketId);
    if (!result.ok) {
      setReplyError(result.error);
      setReplies([]);
      return;
    }
    setReplies(result.data);
  }

  async function openTicket(ticket: SupportTicket) {
    setSelected(ticket);
    setAssigneeId(ticket.assigned_to || '');
    setAssignmentReason('');
    setReplyBody('');
    setIsInternal(false);
    setDetailLoading(true);
    setDetailError(null);
    setReplyError(null);
    try {
      const detail = await getTicketById(ticket.id);
      setSelected(detail);
      setAssigneeId(detail.assigned_to || '');
      await loadReplies(ticket.id);
    } catch {
      setDetailError('Unable to load ticket details. Please try again.');
      toast.error('Unable to load ticket details.');
    } finally {
      setDetailLoading(false);
    }
  }

  const handleReply = async () => {
    if (!selected || !replyBody.trim()) return;
    const { error } = await replyToTicket(selected.id, replyBody, isInternal);
    if (error) { toast.error(error); }
    else {
      setReplyBody('');
      await loadReplies(selected.id);
      toast.success('Reply sent');
    }
  };

  const handleAssign = async () => {
    if (!selected || assignmentReason.trim().length < 10 || assignmentReason.trim().length > 500) return;
    setAssignmentSaving(true);
    const { error } = await assignTicket(selected.id, assigneeId || null, assignmentReason.trim());
    if (error) toast.error(error);
    else {
      toast.success(assigneeId ? 'Ticket assignment updated' : 'Ticket unassigned');
      setAssignmentConfirmationOpen(false);
      setAssignmentReason('');
      try {
        const detail = await getTicketById(selected.id);
        setSelected(detail);
        setAssigneeId(detail.assigned_to || '');
        await loadTickets();
      } catch { toast.error('Assignment was updated, but ticket details could not be refreshed.'); }
    }
    setAssignmentSaving(false);
  };

  const handleClose = async () => {
    if (!selected || closeReason.trim().length < 10 || closeReason.trim().length > 1000) return;
    const { error } = await closeTicket(selected.id, closeReason.trim());
    if (error) { toast.error(error); }
    else { toast.success('Ticket closed'); setCloseConfirmationOpen(false); setCloseReason(''); setSelected(null); void loadTickets(); }
  };

  return (
    <div className="p-4 sm:p-6 space-y-4 max-w-7xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold text-foreground flex items-center gap-2">
            <LifeBuoy className="h-6 w-6 text-primary" /> Support Tickets
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">{total} tickets</p>
        </div>
      </div>

      <Tabs value={filter} onValueChange={v => { setFilter(v); setPage(0); }}>
        <TabsList>
          <TabsTrigger value="all">All</TabsTrigger>
          <TabsTrigger value="open">Open</TabsTrigger>
          <TabsTrigger value="in_progress">In Progress</TabsTrigger>
          <TabsTrigger value="resolved">Resolved</TabsTrigger>
          <TabsTrigger value="closed">Closed</TabsTrigger>
        </TabsList>
      </Tabs>

      {loading ? (
        <div className="space-y-2">{[1, 2, 3].map(i => <Skeleton key={i} className="h-20 rounded-xl" />)}</div>
      ) : listError ? (
        <Card><CardContent className="py-8 text-center space-y-3">
          <p role="alert" className="text-sm text-destructive">{listError}</p>
          <Button variant="outline" size="sm" onClick={() => void loadTickets()}>Retry</Button>
        </CardContent></Card>
      ) : tickets.length === 0 ? (
        <Card><CardContent className="py-12 text-center text-sm text-muted-foreground">No tickets found</CardContent></Card>
      ) : (
        <div className="space-y-2">
          {tickets.map(t => (
            <Card key={t.id} className="cursor-pointer hover:border-primary/30 transition-colors">
              <CardContent className="p-4" onClick={() => openTicket(t)}>
                <div className="flex items-center justify-between">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs text-muted-foreground">{t.ticket_number || '—'}</span>
                      <Badge className={t.status === 'open' ? 'bg-warning/10 text-warning' : t.status === 'closed' ? 'bg-muted text-muted-foreground' : t.status === 'resolved' ? 'bg-success/10 text-success' : 'bg-info/10 text-info'}>{t.status}</Badge>
                      <Badge variant="outline" className="capitalize">{t.category}</Badge>
                      {t.priority === 'urgent' && <Badge className="bg-destructive/10 text-destructive">Urgent</Badge>}
                    </div>
                    <p className="mt-1 text-sm font-medium text-foreground truncate">{t.subject}</p>
                    <p className="text-xs text-muted-foreground">{t.user?.full_name || t.user?.email || 'Unknown'} | {new Date(t.created_at).toLocaleDateString('en-GH')}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {total > pageSize && (
        <div className="flex items-center justify-between">
          <p className="text-xs text-muted-foreground">Page {page + 1} of {Math.ceil(total / pageSize)}</p>
          <div className="flex gap-1">
            <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage(p => p - 1)}><ChevronLeft className="h-4 w-4" /></Button>
            <Button variant="outline" size="sm" disabled={(page + 1) * pageSize >= total} onClick={() => setPage(p => p + 1)}><ChevronRight className="h-4 w-4" /></Button>
          </div>
        </div>
      )}

      {/* Ticket detail dialog */}
      <Dialog open={!!selected} onOpenChange={open => { if (!open) setSelected(null); }}>
        <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Ticket {selected?.ticket_number}</DialogTitle></DialogHeader>
          {selected && (
            <div className="space-y-4 py-2">
              {detailError ? (
                <div role="alert" className="rounded-lg border border-destructive/30 p-4 text-center space-y-3">
                  <p className="text-sm text-destructive">{detailError}</p>
                  <Button variant="outline" size="sm" onClick={() => void openTicket(selected)}>Retry</Button>
                </div>
              ) : null}
              {!detailError && (
              <>
              <div className="rounded-lg border border-border p-3 space-y-1 text-sm">
                <p className="font-medium">{selected.subject}</p>
                {selected.description && <p className="text-muted-foreground">{selected.description}</p>}
                <p className="text-xs text-muted-foreground">From: {selected.user?.full_name || selected.user?.email || '—'}</p>
                <p className="text-xs text-muted-foreground">Category: {selected.category} | Priority: {selected.priority}</p>
                <p className="text-xs text-muted-foreground">Assigned to: {selected.assignee?.full_name || (selected.assigned_to ? 'Support operator' : 'Unassigned')}</p>
              </div>

              {/* Replies */}
              {detailLoading ? (
                <Skeleton className="h-20 rounded-lg" />
              ) : replyError ? (
                <div role="alert" className="rounded-lg border border-destructive/30 p-4 text-center space-y-3">
                  <p className="text-sm text-destructive">{replyError}</p>
                  <Button variant="outline" size="sm" onClick={() => void loadReplies(selected.id)}>Retry replies</Button>
                </div>
              ) : (
                <div className="max-h-48 space-y-2 overflow-y-auto">
                  {replies.map(r => (
                    <div key={r.id} className={`rounded-lg p-3 ${r.is_internal ? 'border border-warning/20 bg-warning/5' : 'bg-muted'}`}>
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-medium">{r.author?.full_name || r.author?.email || 'Unknown'}</span>
                        {r.is_internal && <Badge className="bg-warning/10 text-warning text-xs">Internal</Badge>}
                      </div>
                      <p className="mt-1 text-sm text-foreground">{r.body}</p>
                      <p className="mt-1 text-xs text-muted-foreground">{new Date(r.created_at).toLocaleString('en-GH')}</p>
                    </div>
                  ))}
                </div>
              )}

              {/* Reply input */}
              {selected.status !== 'closed' && (
                <div className="space-y-2">
                  <Textarea rows={2} maxLength={10000} placeholder="Reply..." value={replyBody} onChange={e => setReplyBody(e.target.value)} />
                  <div className="flex items-center gap-2">
                    <label className="flex items-center gap-1.5 text-xs">
                      <input type="checkbox" checked={isInternal} onChange={e => setIsInternal(e.target.checked)} /> Internal note
                    </label>
                    <Button size="sm" className="ml-auto" disabled={!replyBody.trim()} onClick={handleReply}><Send className="mr-1.5 h-3.5 w-3.5" /> Send</Button>
                  </div>
                </div>
              )}

              {/* Actions */}
              <div className="flex gap-2 pt-2">
                {selected.status !== 'closed' && (
                  <>
                    <div className="w-full space-y-2 rounded-lg border border-border p-3">
                      <p className="text-sm font-medium">Ticket assignment</p>
                      {assigneesError ? <p role="alert" className="text-xs text-destructive">{assigneesError}</p> : <>
                        <Select value={assigneeId || '__unassigned__'} onValueChange={(value) => setAssigneeId(value === '__unassigned__' ? '' : value)}>
                          <SelectTrigger aria-label="Assign support ticket"><SelectValue placeholder="Choose an operator" /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="__unassigned__">Unassigned</SelectItem>
                            {assignees.map((operator) => <SelectItem key={operator.user_id} value={operator.user_id}>{operator.full_name || 'Unnamed operator'} · {operator.role_name.replaceAll('_', ' ')}</SelectItem>)}
                          </SelectContent>
                        </Select>
                        <Textarea rows={2} maxLength={500} aria-label="Assignment reason" placeholder="Reason for assigning or unassigning (10–500 characters)" value={assignmentReason} onChange={(event) => setAssignmentReason(event.target.value)} />
                        <Button variant="outline" size="sm" disabled={assignmentSaving || assignmentReason.trim().length < 10 || assignmentReason.trim().length > 500 || assigneeId === (selected.assigned_to || '')} onClick={() => setAssignmentConfirmationOpen(true)}><UserCog className="mr-2 h-4 w-4" />Review assignment</Button>
                      </>}
                    </div>
                    <Button variant="outline" size="sm" className="ml-auto text-destructive" onClick={() => { setCloseReason(''); setCloseConfirmationOpen(true); }}><X className="mr-2 h-4 w-4" /> Close ticket</Button>
                  </>
                )}
              </div>
              </>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
      <AlertDialog open={closeConfirmationOpen} onOpenChange={setCloseConfirmationOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Close support ticket {selected?.ticket_number || ''}?</AlertDialogTitle>
            <AlertDialogDescription>This ends the active support workflow. The requester will no longer be able to continue this ticket. A closure reason is required and recorded in the audit history.</AlertDialogDescription>
          </AlertDialogHeader>
          <Textarea rows={3} maxLength={1000} aria-label="Ticket closure reason" placeholder="Reason for closing (10–1000 characters)" value={closeReason} onChange={event => setCloseReason(event.target.value)} />
          <AlertDialogFooter>
            <AlertDialogCancel>Keep open</AlertDialogCancel>
            <AlertDialogAction disabled={closeReason.trim().length < 10 || closeReason.trim().length > 1000} onClick={(event) => { event.preventDefault(); void handleClose(); }}>Close ticket</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <AlertDialog open={assignmentConfirmationOpen} onOpenChange={open => { if (!assignmentSaving) setAssignmentConfirmationOpen(open); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm ticket assignment</AlertDialogTitle>
            <AlertDialogDescription>
              {assigneeId
                ? `Assign ticket ${selected?.ticket_number || ''} to ${assignees.find(operator => operator.user_id === assigneeId)?.full_name || 'the selected operator'}?`
                : `Unassign ticket ${selected?.ticket_number || ''}?`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <p className="whitespace-pre-wrap text-sm text-muted-foreground">Reason: {assignmentReason.trim()}</p>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={assignmentSaving}>Cancel</AlertDialogCancel>
            <AlertDialogAction disabled={assignmentSaving || assignmentReason.trim().length < 10 || assignmentReason.trim().length > 500} onClick={event => { event.preventDefault(); void handleAssign(); }}>
              {assignmentSaving ? 'Saving…' : 'Confirm assignment'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
