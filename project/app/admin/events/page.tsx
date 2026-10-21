'use client';

import { useCallback, useEffect, useState } from 'react';
import { AdminRouteGuard, AdminLayout } from '@/components/admin/admin-layout';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import { useAuth } from '@/lib/auth/auth-context';
import { getAdminEventModerationFlags, getAdminEventOperations, reviewAdminEventFlag, setAdminEventVisibility } from '@/lib/data/admin-client';
import type { AdminEventModerationFlag, AdminEventOperationRow } from '@/lib/types/admin';
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react';
import { toast } from 'sonner';

export default function AdminEventsPage() {
  return <AdminRouteGuard><AdminLayout><Content /></AdminLayout></AdminRouteGuard>;
}

function Content() {
  const { user } = useAuth();
  // UI-only affordance: each event RPC still independently checks role and scope.
  const canManageEventVisibility = user?.role === 'super_admin' || user?.role === 'university_admin';
  const [flags, setFlags] = useState<AdminEventModerationFlag[]>([]);
  const [selected, setSelected] = useState<AdminEventModerationFlag | null>(null);
  const [status, setStatus] = useState('pending');
  const [reason, setReason] = useState('');
  const [page, setPage] = useState(0);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(false);
  const [events, setEvents] = useState<AdminEventOperationRow[]>([]);
  const [eventsError, setEventsError] = useState(false);
  const [eventsLoading, setEventsLoading] = useState(true);
  const [eventPage, setEventPage] = useState(0);
  const [eventTotal, setEventTotal] = useState(0);
  const [visibility, setVisibility] = useState<'all' | 'published' | 'draft'>('all');
  const [selectedEvent, setSelectedEvent] = useState<AdminEventOperationRow | null>(null);
  const [publish, setPublish] = useState(false);
  const pageSize = 30;

  const loadFlags = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const result = await getAdminEventModerationFlags({ status, limit: pageSize, offset: page * pageSize });
      setFlags(result.flags);
      setTotal(result.total);
    } catch {
      setFlags([]);
      setTotal(0);
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [page, status]);

  useEffect(() => { void loadFlags(); }, [loadFlags]);

  const loadEvents = useCallback(async () => {
    if (!canManageEventVisibility) {
      setEventsLoading(false);
      return;
    }
    setEventsLoading(true);
    setEventsError(false);
    try {
      const result = await getAdminEventOperations({ visibility, limit: pageSize, offset: eventPage * pageSize });
      setEvents(result.events);
      setEventTotal(result.total);
    } catch {
      setEvents([]);
      setEventTotal(0);
      setEventsError(true);
    } finally { setEventsLoading(false); }
  }, [canManageEventVisibility, eventPage, visibility]);

  useEffect(() => { void loadEvents(); }, [loadEvents]);

  const applyVisibility = async () => {
    if (!selectedEvent || reason.trim().length < 10) return;
    setSaving(true);
    const result = await setAdminEventVisibility(selectedEvent.event_id, publish, reason);
    setSaving(false);
    if (result.error) { toast.error(result.error); return; }
    toast.success(publish ? 'Event published and audited.' : 'Event unpublished and audited.');
    setSelectedEvent(null);
    setReason('');
    void loadEvents();
  };

  const applyAction = async (action: 'dismiss' | 'hide' | 'publish') => {
    if (!selected || reason.trim().length < 10) {
      toast.error('Enter a moderation reason of at least 10 characters.');
      return;
    }
    setSaving(true);
    const result = await reviewAdminEventFlag(selected.flag_id, action, reason);
    setSaving(false);
    if (result.error) { toast.error(result.error); return; }
    toast.success(action === 'dismiss' ? 'Event report dismissed.' : action === 'hide' ? 'Event hidden and moderation audited.' : 'Event approved and published.');
    setSelected(null);
    setReason('');
    void loadFlags();
  };

  return (
    <div className="max-w-7xl space-y-4 p-4 sm:p-6">
      <div>
        <h1 className="flex items-center gap-2 font-display text-2xl font-bold text-foreground"><CalendarDays className="h-6 w-6 text-primary" /> Event Moderation</h1>
        <p className="mt-1 text-sm text-muted-foreground">Review reported events within your authorized scope. Visibility changes require a reason and trusted audit record.</p>
      </div>

      {canManageEventVisibility && <section aria-labelledby="event-operations-heading" className="space-y-3">
        <div><h2 id="event-operations-heading" className="text-lg font-semibold">Event operations</h2><p className="text-sm text-muted-foreground">Manage event visibility in your authorized scope. Every change requires a reason and is audited; cancellation and archival are not supported by the current event schema.</p></div>
        <Select value={visibility} onValueChange={value => { setVisibility(value as typeof visibility); setEventPage(0); }}>
          <SelectTrigger className="max-w-xs" aria-label="Filter events by visibility"><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value="all">All events</SelectItem><SelectItem value="published">Published</SelectItem><SelectItem value="draft">Drafts</SelectItem></SelectContent>
        </Select>
        <Card><CardContent className="p-0">
          {eventsLoading ? <div className="space-y-2 p-4">{[1, 2, 3].map(row => <Skeleton key={row} className="h-12 rounded-lg" />)}</div>
            : eventsError ? <div className="space-y-3 py-8 text-center text-sm text-muted-foreground"><p role="alert">Unable to load event operations.</p><Button variant="outline" size="sm" onClick={() => void loadEvents()}>Retry</Button></div>
              : events.length === 0 ? <p className="py-8 text-center text-sm text-muted-foreground">No events available in your authorized scope.</p>
                : <>
                  <div className="space-y-3 p-3 lg:hidden" aria-label="Mobile event operations">
                    {events.map(event => <article key={event.event_id} className="rounded-xl border border-border bg-background p-4 shadow-sm"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><h3 className="break-words font-semibold">{event.title}</h3><p className="mt-1 break-words text-sm text-muted-foreground">{event.university_name || 'Platform-wide'}</p></div><Badge variant="outline" className="shrink-0">{event.is_published ? 'Published' : 'Draft'}</Badge></div><dl className="mt-4 grid gap-3 border-t border-border pt-3 text-sm"><div><dt className="text-xs text-muted-foreground">Start</dt><dd className="mt-0.5">{event.start_time ? new Date(event.start_time).toLocaleString('en-GH') : 'Not set'}</dd></div><div><dt className="text-xs text-muted-foreground">Location</dt><dd className="mt-0.5 break-words">{event.location || 'Not set'}</dd></div></dl><Button className="mt-4 min-h-11 w-full" variant="outline" onClick={() => { setSelectedEvent(event); setPublish(!event.is_published); setReason(''); }}>{event.is_published ? 'Unpublish event' : 'Publish event'}</Button></article>)}
                  </div>
                  <div className="hidden overflow-x-auto lg:block"><Table><TableHeader><TableRow><TableHead>Event</TableHead><TableHead>University</TableHead><TableHead>Start</TableHead><TableHead>Location</TableHead><TableHead>Visibility</TableHead><TableHead>Action</TableHead></TableRow></TableHeader>
                  <TableBody>{events.map(event => <TableRow key={event.event_id}><TableCell className="min-w-44 font-medium">{event.title}</TableCell><TableCell>{event.university_name || 'Platform-wide'}</TableCell><TableCell>{event.start_time ? new Date(event.start_time).toLocaleString('en-GH') : 'Not set'}</TableCell><TableCell>{event.location || 'Not set'}</TableCell><TableCell><Badge variant="outline">{event.is_published ? 'Published' : 'Draft'}</Badge></TableCell><TableCell><Button size="sm" variant="outline" onClick={() => { setSelectedEvent(event); setPublish(!event.is_published); setReason(''); }}>{event.is_published ? 'Unpublish' : 'Publish'}</Button></TableCell></TableRow>)}</TableBody></Table></div>
                  </>}
        </CardContent></Card>
        {eventTotal > pageSize && <div className="flex items-center justify-between"><p className="text-xs text-muted-foreground">Page {eventPage + 1} of {Math.ceil(eventTotal / pageSize)}</p><div className="flex gap-1"><Button variant="outline" size="sm" aria-label="Previous events" disabled={eventPage === 0} onClick={() => setEventPage(current => current - 1)}><ChevronLeft className="h-4 w-4" /></Button><Button variant="outline" size="sm" aria-label="Next events" disabled={(eventPage + 1) * pageSize >= eventTotal} onClick={() => setEventPage(current => current + 1)}><ChevronRight className="h-4 w-4" /></Button></div></div>}
      </section>}

      <Select value={status} onValueChange={value => { setStatus(value); setPage(0); }}>
        <SelectTrigger className="max-w-xs" aria-label="Filter event reports by status"><SelectValue /></SelectTrigger>
        <SelectContent><SelectItem value="pending">Pending review</SelectItem><SelectItem value="reviewing">In review</SelectItem><SelectItem value="all">All reports</SelectItem></SelectContent>
      </Select>

      <Card><CardContent className="p-0">
        {loading ? <div className="space-y-2 p-4">{[1, 2, 3, 4].map(row => <Skeleton key={row} className="h-12 rounded-lg" />)}</div>
          : error ? <div className="space-y-3 py-12 text-center text-sm text-muted-foreground"><p role="alert">Unable to load event moderation. Please try again.</p><Button variant="outline" size="sm" onClick={() => void loadFlags()}>Retry</Button></div>
            : flags.length === 0 ? <div className="py-12 text-center text-sm text-muted-foreground">No event reports match your filters.</div>
              : <>
              <div className="space-y-3 p-3 lg:hidden" aria-label="Mobile event reports">
                {flags.map(flag => <article key={flag.flag_id} className="rounded-xl border border-border bg-background p-4 shadow-sm"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><h3 className="break-words font-semibold">{flag.event_title}</h3><p className="mt-1 break-words text-sm text-muted-foreground">{flag.university_name || 'Platform'}</p></div><Badge variant="outline" className="shrink-0">{flag.flag_status}</Badge></div><p className="mt-3 break-words text-sm">{flag.flag_reason}</p><dl className="mt-4 grid grid-cols-2 gap-3 border-t border-border pt-3 text-sm"><div><dt className="text-xs text-muted-foreground">Visibility</dt><dd className="mt-0.5">{flag.is_published ? 'Published' : 'Unpublished'}</dd></div><div><dt className="text-xs text-muted-foreground">Reported</dt><dd className="mt-0.5 text-xs text-muted-foreground">{new Date(flag.flagged_at).toLocaleDateString('en-GH')}</dd></div></dl><Button className="mt-4 min-h-11 w-full" variant="outline" onClick={() => { setSelected(flag); setReason(''); }}>Review report</Button></article>)}
              </div>
              <div className="hidden overflow-x-auto lg:block"><Table>
                <TableHeader><TableRow><TableHead>Event</TableHead><TableHead>University</TableHead><TableHead>Flag reason</TableHead><TableHead>Visibility</TableHead><TableHead>Flag status</TableHead><TableHead>Reported</TableHead><TableHead>Review</TableHead></TableRow></TableHeader>
                <TableBody>{flags.map(flag => <TableRow key={flag.flag_id}>
                  <TableCell className="min-w-48 font-medium">{flag.event_title}</TableCell><TableCell>{flag.university_name || 'Platform'}</TableCell><TableCell>{flag.flag_reason}</TableCell><TableCell><Badge variant="outline">{flag.is_published ? 'Published' : 'Unpublished'}</Badge></TableCell><TableCell><Badge variant="outline">{flag.flag_status}</Badge></TableCell><TableCell className="text-xs text-muted-foreground">{new Date(flag.flagged_at).toLocaleDateString('en-GH')}</TableCell><TableCell><Button variant="outline" size="sm" onClick={() => { setSelected(flag); setReason(''); }}>Review</Button></TableCell>
                </TableRow>)}</TableBody>
              </Table></div>
              </>}
      </CardContent></Card>

      {total > pageSize && <div className="flex items-center justify-between"><p className="text-xs text-muted-foreground">Page {page + 1} of {Math.ceil(total / pageSize)}</p><div className="flex gap-1"><Button variant="outline" size="sm" aria-label="Previous page" disabled={page === 0} onClick={() => setPage(current => current - 1)}><ChevronLeft className="h-4 w-4" /></Button><Button variant="outline" size="sm" aria-label="Next page" disabled={(page + 1) * pageSize >= total} onClick={() => setPage(current => current + 1)}><ChevronRight className="h-4 w-4" /></Button></div></div>}

      <Dialog open={selected !== null} onOpenChange={open => { if (!open) setSelected(null); }}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader><DialogTitle>Review event report</DialogTitle></DialogHeader>
          {selected && <div className="space-y-4 text-sm">
            <div><h2 className="font-semibold">{selected.event_title}</h2><p className="text-muted-foreground">{selected.university_name || 'Platform-wide'} · {selected.event_start_time ? new Date(selected.event_start_time).toLocaleString('en-GH') : 'Date not set'}</p></div>
            <p className="whitespace-pre-wrap text-muted-foreground">{selected.event_description || 'No event description provided.'}</p>
            <div><p><span className="font-medium">Report:</span> {selected.flag_reason}</p>{selected.flag_details && <p className="mt-1 whitespace-pre-wrap text-muted-foreground">{selected.flag_details}</p>}</div>
            <Textarea value={reason} onChange={event => setReason(event.target.value)} minLength={10} maxLength={1000} placeholder="Required moderation reason (10–1000 characters)" aria-label="Moderation reason" />
          </div>}
          <DialogFooter className="flex-col gap-2 sm:flex-row sm:justify-between">
            <Button variant="outline" disabled={saving || reason.trim().length < 10 || !selected || !['pending', 'reviewing'].includes(selected.flag_status)} onClick={() => void applyAction('dismiss')}>Dismiss report</Button>
            <div className="flex flex-wrap gap-2">
              {selected && (selected.is_published
                ? <Button variant="destructive" disabled={saving || reason.trim().length < 10 || !['pending', 'reviewing'].includes(selected.flag_status)} onClick={() => void applyAction('hide')}>Hide event</Button>
                : <Button disabled={saving || reason.trim().length < 10 || !['pending', 'reviewing'].includes(selected.flag_status)} onClick={() => void applyAction('publish')}>Approve and publish</Button>)}
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={selectedEvent !== null} onOpenChange={open => { if (!open) setSelectedEvent(null); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>{publish ? 'Publish event' : 'Unpublish event'}</DialogTitle></DialogHeader>
          {selectedEvent && <div className="space-y-3 text-sm"><p>Confirm visibility change for <strong>{selectedEvent.title}</strong>. This does not delete the event.</p><Textarea value={reason} onChange={event => setReason(event.target.value)} minLength={10} maxLength={1000} placeholder="Required reason (10–1000 characters)" aria-label="Event visibility reason" /></div>}
          <DialogFooter><Button variant="outline" onClick={() => setSelectedEvent(null)} disabled={saving}>Cancel</Button><Button disabled={saving || reason.trim().length < 10} onClick={() => void applyVisibility()}>{saving ? 'Saving…' : publish ? 'Confirm publish' : 'Confirm unpublish'}</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
