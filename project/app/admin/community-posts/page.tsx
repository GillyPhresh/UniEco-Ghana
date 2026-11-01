'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { AdminLayout, AdminRouteGuard } from '@/components/admin/admin-layout';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { supabase } from '@/lib/supabase/client';
import { toast } from 'sonner';
import { CircleAlert, Flag, Loader2, RefreshCw, ShieldCheck, Trash2 } from 'lucide-react';

type ReportStatus = 'open' | 'resolved' | 'dismissed' | 'all';
type CommunityReport = {
  report_id: string;
  post_id: string;
  post_caption: string;
  media_path: string;
  media_type: 'image' | 'video';
  author_name: string;
  reporter_name: string;
  reason: string;
  details: string;
  status: Exclude<ReportStatus, 'all'>;
  created_at: string;
};

const FILTERS: { value: ReportStatus; label: string }[] = [
  { value: 'open', label: 'Open' },
  { value: 'resolved', label: 'Resolved' },
  { value: 'all', label: 'All reports' },
];

export default function AdminCommunityPostsPage() {
  return <AdminRouteGuard><AdminLayout><CommunityPostsQueue /></AdminLayout></AdminRouteGuard>;
}

function CommunityPostsQueue() {
  const [filter, setFilter] = useState<ReportStatus>('open');
  const [reports, setReports] = useState<CommunityReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [selected, setSelected] = useState<CommunityReport | null>(null);
  const [decision, setDecision] = useState<'keep' | 'remove' | null>(null);
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const requestSequence = useRef(0);

  const loadReports = useCallback(async () => {
    const requestId = ++requestSequence.current;
    setLoading(true);
    setLoadError(false);
    try {
      const { data, error } = await supabase.rpc('get_campus_community_post_reports', {
        p_status: filter,
        p_limit: 50,
      });
      if (error) throw error;
      if (requestId !== requestSequence.current) return;
      setReports((data || []) as CommunityReport[]);
    } catch {
      if (requestId !== requestSequence.current) return;
      setReports([]);
      setLoadError(true);
    } finally {
      if (requestId === requestSequence.current) setLoading(false);
    }
  }, [filter]);

  useEffect(() => { void loadReports(); }, [loadReports]);

  const openDecision = (report: CommunityReport, nextDecision: 'keep' | 'remove') => {
    setSelected(report);
    setDecision(nextDecision);
    setNote('');
  };

  const submitDecision = async () => {
    if (!selected || !decision || note.trim().length < 10 || note.trim().length > 500) {
      toast.error('Add a moderation note between 10 and 500 characters.');
      return;
    }
    setSaving(true);
    try {
      const { error } = await supabase.rpc('moderate_campus_community_post_report', {
        p_report_id: selected.report_id,
        p_decision: decision,
        p_note: note.trim(),
      });
      if (error) throw error;
      toast.success(decision === 'remove' ? 'Post removed and report resolved.' : 'Post kept and report resolved.');
      setSelected(null);
      setDecision(null);
      setNote('');
      await loadReports();
    } catch {
      toast.error('We could not save this review. Refresh the queue and try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mx-auto w-full max-w-7xl space-y-5 p-4 sm:p-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-emerald-700">Community safety</p>
          <h1 className="mt-1 flex items-center gap-2 text-2xl font-bold tracking-tight text-slate-950"><Flag className="h-6 w-6 text-emerald-700" />Campus posts</h1>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">Review reports on public student and vendor photos and videos. Decisions are recorded in the audit log.</p>
        </div>
        <Button variant="outline" onClick={() => void loadReports()} disabled={loading} className="min-h-11 touch-manipulation rounded-xl">
          {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}Refresh
        </Button>
      </header>

      <div className="flex w-full gap-2 overflow-x-auto rounded-xl border bg-white p-1.5" role="tablist" aria-label="Report status">
        {FILTERS.map((item) => <button key={item.value} type="button" role="tab" aria-selected={filter === item.value} onClick={() => setFilter(item.value)} className={`min-h-10 shrink-0 rounded-lg px-4 text-sm font-semibold transition-colors ${filter === item.value ? 'bg-emerald-600 text-white' : 'text-slate-600 hover:bg-slate-100'}`}>{item.label}</button>)}
      </div>

      {loading ? <div className="grid gap-4 lg:grid-cols-2">{[0, 1].map((item) => <div key={item} className="h-72 animate-pulse rounded-2xl border bg-white" />)}</div>
        : loadError ? <Card><CardContent className="flex flex-col items-center gap-3 py-12 text-center"><CircleAlert className="h-8 w-8 text-rose-600" /><p role="alert" className="text-sm text-rose-700">Could not load campus post reports. No review action was made.</p><Button variant="outline" onClick={() => void loadReports()} className="min-h-11 rounded-xl">Try again</Button></CardContent></Card>
          : reports.length === 0 ? <Card><CardContent className="flex flex-col items-center py-14 text-center"><ShieldCheck className="h-10 w-10 text-emerald-600" /><h2 className="mt-3 font-semibold text-slate-900">No reports in this view</h2><p className="mt-1 text-sm text-muted-foreground">New reports from the campus feed will appear here.</p></CardContent></Card>
            : <div className="grid gap-4 lg:grid-cols-2">{reports.map((report) => <ReportCard key={report.report_id} report={report} onKeep={() => openDecision(report, 'keep')} onRemove={() => openDecision(report, 'remove')} />)}</div>}

      <Dialog open={Boolean(selected && decision)} onOpenChange={(open) => { if (!open && !saving) { setSelected(null); setDecision(null); } }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader><DialogTitle>{decision === 'remove' ? 'Remove this campus post?' : 'Keep this campus post?'}</DialogTitle><DialogDescription>The review decision and note are stored in the platform audit log. Enter a clear reason before submitting.</DialogDescription></DialogHeader>
          <label htmlFor="community-moderation-note" className="text-sm font-semibold">Moderation note</label>
          <Textarea id="community-moderation-note" value={note} onChange={(event) => setNote(event.target.value.slice(0, 500))} maxLength={500} rows={4} placeholder="Explain the policy reason for this decision (at least 10 characters)." disabled={saving} />
          <div className="flex justify-end text-xs text-muted-foreground">{note.trim().length}/500</div>
          <DialogFooter><Button variant="outline" disabled={saving} onClick={() => { setSelected(null); setDecision(null); }}>Cancel</Button><Button disabled={saving || note.trim().length < 10} onClick={() => void submitDecision()} className={decision === 'remove' ? 'bg-rose-600 hover:bg-rose-700' : 'bg-emerald-700 hover:bg-emerald-800'}>{saving ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Saving…</> : decision === 'remove' ? <><Trash2 className="mr-2 h-4 w-4" />Remove post</> : <><ShieldCheck className="mr-2 h-4 w-4" />Keep post</>}</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ReportCard({ report, onKeep, onRemove }: { report: CommunityReport; onKeep: () => void; onRemove: () => void }) {
  const mediaUrl = supabase.storage.from('campus-community').getPublicUrl(report.media_path).data.publicUrl;
  return (
    <Card className="overflow-hidden">
      <div className="grid sm:grid-cols-[minmax(0,12rem)_minmax(0,1fr)]">
        <div className="flex max-h-80 min-h-52 items-center justify-center bg-slate-950 sm:max-h-none">
          {report.media_type === 'video' ? <video src={mediaUrl} controls playsInline preload="metadata" className="max-h-80 w-full object-contain sm:h-full" /> : <img src={mediaUrl} alt={`Reported campus post by ${report.author_name}`} loading="lazy" className="max-h-80 w-full object-contain sm:h-full" />}
        </div>
        <CardContent className="flex min-w-0 flex-col gap-3 p-4 sm:p-5">
          <div className="flex flex-wrap items-center gap-2"><Badge variant="outline" className="capitalize">{report.status}</Badge><Badge variant="secondary" className="capitalize">{report.reason.replaceAll('_', ' ')}</Badge><span className="ml-auto text-xs text-muted-foreground">{new Intl.DateTimeFormat('en-GH', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(report.created_at))}</span></div>
          <p className="line-clamp-3 break-words text-sm text-slate-800">{report.post_caption || 'No caption'}</p>
          <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs"><div><dt className="text-muted-foreground">Posted by</dt><dd className="truncate font-medium">{report.author_name}</dd></div><div><dt className="text-muted-foreground">Reported by</dt><dd className="truncate font-medium">{report.reporter_name}</dd></div></dl>
          {report.details && <p className="rounded-lg bg-slate-50 p-3 text-sm leading-5 text-slate-700">{report.details}</p>}
          {report.status === 'open' && <div className="mt-auto grid grid-cols-2 gap-2 pt-2"><Button variant="outline" onClick={onKeep} className="min-h-11 touch-manipulation rounded-xl">Keep post</Button><Button onClick={onRemove} className="min-h-11 touch-manipulation rounded-xl bg-rose-600 hover:bg-rose-700"><Trash2 className="mr-2 h-4 w-4" />Remove</Button></div>}
        </CardContent>
      </div>
    </Card>
  );
}
