'use client';

import { useState, useEffect } from 'react';
import { AdminRouteGuard, AdminLayout } from '@/components/admin/admin-layout';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { getAdminTickets, getTicketById, getTicketReplies, replyToTicket, assignTicket, closeTicket, exportToCsv } from '@/lib/data/admin-client';
import type { SupportTicket, TicketReply } from '@/lib/types/admin';
import { LifeBuoy, Send, UserCog, X, Download, ChevronLeft, ChevronRight } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/lib/auth/auth-context';

export default function AdminSupportPage() {
  return (
    <AdminRouteGuard><AdminLayout><Content /></AdminLayout></AdminRouteGuard>
  );
}

function Content() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [filter, setFilter] = useState('all');
  const [selected, setSelected] = useState<SupportTicket | null>(null);
  const [replies, setReplies] = useState<TicketReply[]>([]);
  const [replyBody, setReplyBody] = useState('');
  const [isInternal, setIsInternal] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const pageSize = 20;

  useEffect(() => { loadTickets(); }, [page, filter]);

  async function loadTickets() {
    setLoading(true);
    const { tickets, total } = await getAdminTickets({ status: filter, limit: pageSize, offset: page * pageSize });
    setTickets(tickets);
    setTotal(total);
    setLoading(false);
  }

  async function openTicket(ticket: SupportTicket) {
    setSelected(ticket);
    setReplyBody('');
    setIsInternal(false);
    setDetailLoading(true);
    const [t, r] = await Promise.all([getTicketById(ticket.id), getTicketReplies(ticket.id)]);
    if (t) setSelected(t);
    setReplies(r);
    setDetailLoading(false);
  }

  const handleReply = async () => {
    if (!selected || !replyBody.trim()) return;
    const { error } = await replyToTicket(selected.id, replyBody, isInternal);
    if (error) { toast.error(error); }
    else {
      setReplyBody('');
      const r = await getTicketReplies(selected.id);
      setReplies(r);
      toast.success('Reply sent');
    }
  };

  const handleAssign = async () => {
    if (!selected || !user) return;
    const { error } = await assignTicket(selected.id, user.id);
    if (error) { toast.error(error); } else { toast.success('Ticket assigned to you'); const t = await getTicketById(selected.id); if (t) setSelected(t); }
  };

  const handleClose = async () => {
    if (!selected) return;
    const { error } = await closeTicket(selected.id);
    if (error) { toast.error(error); } else { toast.success('Ticket closed'); setSelected(null); loadTickets(); }
  };

  const handleExport = () => {
    exportToCsv(tickets.map(t => ({
      id: t.id, ticket_number: t.ticket_number || '', subject: t.subject,
      category: t.category, status: t.status, priority: t.priority,
      user: t.user?.email || '', created: t.created_at,
    })), 'support_tickets');
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
        <Button variant="outline" size="sm" onClick={handleExport}><Download className="mr-2 h-4 w-4" /> Export</Button>
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
              <div className="rounded-lg border border-border p-3 space-y-1 text-sm">
                <p className="font-medium">{selected.subject}</p>
                {selected.description && <p className="text-muted-foreground">{selected.description}</p>}
                <p className="text-xs text-muted-foreground">From: {selected.user?.full_name || selected.user?.email || '—'}</p>
                <p className="text-xs text-muted-foreground">Category: {selected.category} | Priority: {selected.priority}</p>
                {selected.assigned_to && <p className="text-xs text-muted-foreground">Assigned to: {selected.assignee?.full_name || 'Admin'}</p>}
              </div>

              {/* Replies */}
              {detailLoading ? (
                <Skeleton className="h-20 rounded-lg" />
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
                  <Textarea rows={2} placeholder="Reply..." value={replyBody} onChange={e => setReplyBody(e.target.value)} />
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
                    {!selected.assigned_to && <Button variant="outline" size="sm" onClick={handleAssign}><UserCog className="mr-2 h-4 w-4" /> Assign to me</Button>}
                    <Button variant="outline" size="sm" className="ml-auto text-destructive" onClick={handleClose}><X className="mr-2 h-4 w-4" /> Close ticket</Button>
                  </>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
