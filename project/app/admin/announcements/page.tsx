'use client';

import { useState, useEffect, useCallback } from 'react';
import { AdminRouteGuard, AdminLayout } from '@/components/admin/admin-layout';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { AdminDeleteConfirmation } from '@/components/admin/admin-delete-confirmation';
import { getAdminAnnouncements, getAdminUniversities, createAnnouncement, updateAnnouncement, deleteAnnouncement } from '@/lib/data/admin-client';
import type { Announcement } from '@/lib/types/admin';
import { Bell, Plus, Edit, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

export default function AdminAnnouncementsPage() {
  return (
    <AdminRouteGuard><AdminLayout><Content /></AdminLayout></AdminRouteGuard>
  );
}

function Content() {
  const [loading, setLoading] = useState(true);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [universities, setUniversities] = useState<Awaited<ReturnType<typeof getAdminUniversities>>>([]);
  const [universityLoadError, setUniversityLoadError] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [showDialog, setShowDialog] = useState(false);
  const [editing, setEditing] = useState<Announcement | null>(null);
  const [announcementToDelete, setAnnouncementToDelete] = useState<Announcement | null>(null);
  const [form, setForm] = useState({ title: '', body: '', type: 'platform', target_audience: 'all', university_id: '', reason: '' });
  const [saving, setSaving] = useState(false);
  const [pendingAnnouncementSave, setPendingAnnouncementSave] = useState(false);

  const loadAnnouncements = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      setAnnouncements(await getAdminAnnouncements());
    } catch {
      setAnnouncements([]);
      setLoadError('Unable to load announcements. Please retry.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void loadAnnouncements(); }, [loadAnnouncements]);

  const loadUniversities = useCallback(async () => {
    setUniversityLoadError(false);
    try {
      setUniversities(await getAdminUniversities());
    } catch {
      setUniversities([]);
      setUniversityLoadError(true);
    }
  }, []);

  useEffect(() => { void loadUniversities(); }, [loadUniversities]);

  function openCreate() {
    setEditing(null);
    setPendingAnnouncementSave(false);
    setForm({ title: '', body: '', type: 'platform', target_audience: 'all', university_id: '', reason: '' });
    setShowDialog(true);
  }

  function openEdit(a: Announcement) {
    setEditing(a);
    setPendingAnnouncementSave(false);
    setForm({ title: a.title, body: a.body, type: a.type, target_audience: a.target_audience, university_id: a.university_id || '', reason: '' });
    setShowDialog(true);
  }

  const handleSave = async () => {
    if (!form.title || !form.body) { toast.error('Title and body are required'); return; }
    if (form.reason.trim().length < 10 || form.reason.trim().length > 500) { toast.error('Enter a reason between 10 and 500 characters'); return; }
    if ((form.type === 'university' || form.target_audience === 'specific_university') && !form.university_id) {
      toast.error('Select the university for this announcement');
      return;
    }
    setSaving(true);
    try {
      const result = editing
        ? await updateAnnouncement(editing.id, { ...editing, ...form, university_id: form.university_id || null, reason: form.reason.trim() })
        : await createAnnouncement({ ...form, university_id: form.university_id || null, reason: form.reason.trim() });
      if (result.error) {
        toast.error(result.error);
      } else {
        toast.success(editing ? 'Announcement updated' : 'Announcement created');
        setShowDialog(false);
        setPendingAnnouncementSave(false);
        void loadAnnouncements();
      }
    } catch {
      toast.error('Unable to save the announcement. Please retry.');
    } finally {
      setSaving(false);
    }
  };

  const requestSave = () => {
    if (!form.title || !form.body) { toast.error('Title and body are required'); return; }
    if (form.reason.trim().length < 10 || form.reason.trim().length > 500) { toast.error('Enter a reason between 10 and 500 characters'); return; }
    if ((form.type === 'university' || form.target_audience === 'specific_university') && !form.university_id) {
      toast.error('Select the university for this announcement');
      return;
    }
    if (!editing || editing.is_active) setPendingAnnouncementSave(true);
    else void handleSave();
  };

  const confirmAnnouncementDeletion = async (reason: string): Promise<boolean> => {
    if (!announcementToDelete) return false;
    const { error } = await deleteAnnouncement(announcementToDelete.id, reason);
    if (error) { toast.error(error); return false; }
    toast.success('Announcement deleted');
    void loadAnnouncements();
    return true;
  };

  const handleToggleActive = async (a: Announcement, reason: string) => {
    const { error } = await updateAnnouncement(a.id, { ...a, is_active: !a.is_active, reason });
    if (error) { toast.error(error); } else { loadAnnouncements(); }
  };

  return (
    <div className="p-4 sm:p-6 space-y-4 max-w-4xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold text-foreground flex items-center gap-2">
            <Bell className="h-6 w-6 text-primary" /> Announcements
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">{announcements.length} announcements</p>
        </div>
        <Button onClick={openCreate}><Plus className="mr-2 h-4 w-4" /> New announcement</Button>
      </div>

      {loading ? (
        <div className="space-y-2">{[1, 2, 3].map(i => <Skeleton key={i} className="h-24 rounded-xl" />)}</div>
      ) : loadError ? (
        <Card><CardContent className="py-8 text-center space-y-3">
          <p role="alert" className="text-sm text-destructive">{loadError}</p>
          <Button variant="outline" size="sm" onClick={() => void loadAnnouncements()}>Retry</Button>
        </CardContent></Card>
      ) : announcements.length === 0 ? (
        <Card><CardContent className="py-12 text-center text-sm text-muted-foreground">No announcements yet</CardContent></Card>
      ) : (
        <div className="space-y-2">
          {announcements.map(a => (
            <Card key={a.id}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-semibold text-foreground">{a.title}</p>
                      <Badge variant="outline" className="capitalize">{a.type}</Badge>
                      <Badge className={a.is_active ? 'bg-success/10 text-success' : 'bg-muted text-muted-foreground'}>{a.is_active ? 'Active' : 'Inactive'}</Badge>
                      <Badge variant="outline">{a.target_audience}</Badge>
                      <Badge variant="outline">{a.university?.name || 'Platform-wide'}</Badge>
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground line-clamp-2">{a.body}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{new Date(a.starts_at).toLocaleDateString('en-GH')} → {new Date(a.ends_at).toLocaleDateString('en-GH')}</p>
                  </div>
                  <div className="flex flex-col gap-1">
                    <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => openEdit(a)}><Edit className="h-3.5 w-3.5" /></Button>
                    <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" aria-label={`Delete announcement ${a.title}`} onClick={() => setAnnouncementToDelete(a)}><Trash2 className="h-3.5 w-3.5" /></Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>{editing ? 'Edit Announcement' : 'New Announcement'}</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1.5"><Label>Title</Label><Input value={form.title} onChange={e => setForm(p => ({ ...p, title: e.target.value }))} /></div>
            <div className="space-y-1.5"><Label>Body</Label><Textarea rows={3} value={form.body} onChange={e => setForm(p => ({ ...p, body: e.target.value }))} /></div>
            <div className="space-y-1.5"><Label htmlFor="announcement-reason">Reason (10–500 characters)</Label><Textarea id="announcement-reason" maxLength={500} value={form.reason} onChange={e => setForm(p => ({ ...p, reason: e.target.value }))} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5"><Label>Type</Label>
                <Select value={form.type} onValueChange={v => setForm(p => ({ ...p, type: v, university_id: v === 'university' || p.target_audience === 'specific_university' ? p.university_id : '' }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="platform">Platform</SelectItem>
                    <SelectItem value="university">University</SelectItem>
                    <SelectItem value="maintenance">Maintenance</SelectItem>
                    <SelectItem value="promotional">Promotional</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5"><Label>Target Audience</Label>
                <Select value={form.target_audience} onValueChange={v => setForm(p => ({ ...p, target_audience: v, university_id: v === 'specific_university' || p.type === 'university' ? p.university_id : '' }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All users</SelectItem>
                    <SelectItem value="students">Students only</SelectItem>
                    <SelectItem value="vendors">Vendors only</SelectItem>
                    <SelectItem value="specific_university">Specific university</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            {(form.type === 'university' || form.target_audience === 'specific_university') && (
              <div className="space-y-1.5">
                <Label>University scope</Label>
                {universityLoadError ? (
                  <div className="space-y-1"><p role="alert" className="text-xs text-destructive">Unable to load universities in your management scope.</p><Button variant="outline" size="sm" onClick={() => void loadUniversities()}>Retry universities</Button></div>
                ) : (
                  <Select value={form.university_id || '__none__'} onValueChange={value => setForm(current => ({ ...current, university_id: value === '__none__' ? '' : value }))}>
                    <SelectTrigger aria-label="Select announcement university"><SelectValue placeholder="Choose a university" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">Choose a university</SelectItem>
                      {universities.map(university => <SelectItem key={university.id} value={university.id}>{university.name} ({university.short_name})</SelectItem>)}
                    </SelectContent>
                  </Select>
                )}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDialog(false)}>Cancel</Button>
            <Button disabled={saving} onClick={requestSave}>{saving ? 'Saving...' : !editing || editing.is_active ? 'Review publication' : 'Save inactive announcement'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <AlertDialog open={pendingAnnouncementSave} onOpenChange={open => { if (!open && !saving) setPendingAnnouncementSave(false); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{editing ? 'Confirm public announcement update' : 'Confirm announcement publication'}</AlertDialogTitle>
            <AlertDialogDescription>
              {editing
                ? `Save changes to the active announcement “${form.title}” for ${form.target_audience.replace(/_/g, ' ')}?`
                : `Publish “${form.title}” to ${form.target_audience.replace(/_/g, ' ')} immediately? The database will enforce platform or university scope.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <p className="text-sm text-muted-foreground">Scope: {universities.find(university => university.id === form.university_id)?.name || 'Platform-wide'} · {form.target_audience.replace(/_/g, ' ')}</p>
          <div className="max-h-40 overflow-y-auto rounded-md border p-3 text-sm"><p className="whitespace-pre-wrap">{form.body}</p></div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={saving}>Back to editing</AlertDialogCancel>
            <AlertDialogAction disabled={saving} onClick={event => { event.preventDefault(); void handleSave(); }}>
              {saving ? 'Saving…' : editing ? 'Confirm public update' : 'Confirm and publish'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <AdminDeleteConfirmation
        open={announcementToDelete !== null}
        itemName={announcementToDelete?.title || ''}
        resourceLabel="announcement"
        onOpenChange={open => { if (!open) setAnnouncementToDelete(null); }}
        onConfirm={confirmAnnouncementDeletion}
      />
    </div>
  );
}
