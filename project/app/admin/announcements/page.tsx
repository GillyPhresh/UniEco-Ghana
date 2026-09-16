'use client';

import { useState, useEffect } from 'react';
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
import { getAdminAnnouncements, createAnnouncement, updateAnnouncement, deleteAnnouncement } from '@/lib/data/admin-client';
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
  const [showDialog, setShowDialog] = useState(false);
  const [editing, setEditing] = useState<Announcement | null>(null);
  const [form, setForm] = useState({ title: '', body: '', type: 'platform', target_audience: 'all', university_id: '' });
  const [saving, setSaving] = useState(false);

  useEffect(() => { loadAnnouncements(); }, []);

  async function loadAnnouncements() {
    setLoading(true);
    const data = await getAdminAnnouncements();
    setAnnouncements(data);
    setLoading(false);
  }

  function openCreate() {
    setEditing(null);
    setForm({ title: '', body: '', type: 'platform', target_audience: 'all', university_id: '' });
    setShowDialog(true);
  }

  function openEdit(a: Announcement) {
    setEditing(a);
    setForm({ title: a.title, body: a.body, type: a.type, target_audience: a.target_audience, university_id: a.university_id || '' });
    setShowDialog(true);
  }

  const handleSave = async () => {
    if (!form.title || !form.body) { toast.error('Title and body are required'); return; }
    setSaving(true);
    if (editing) {
      const { error } = await updateAnnouncement(editing.id, { ...form, university_id: form.university_id || null });
      if (error) { toast.error(error); } else { toast.success('Announcement updated'); setShowDialog(false); loadAnnouncements(); }
    } else {
      const { error } = await createAnnouncement({ ...form, university_id: form.university_id || null });
      if (error) { toast.error(error); } else { toast.success('Announcement created'); setShowDialog(false); loadAnnouncements(); }
    }
    setSaving(false);
  };

  const handleDelete = async (a: Announcement) => {
    if (!confirm('Delete this announcement?')) return;
    const { error } = await deleteAnnouncement(a.id);
    if (error) { toast.error(error); } else { toast.success('Announcement deleted'); loadAnnouncements(); }
  };

  const handleToggleActive = async (a: Announcement) => {
    const { error } = await updateAnnouncement(a.id, { is_active: !a.is_active });
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
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground line-clamp-2">{a.body}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{new Date(a.starts_at).toLocaleDateString('en-GH')} → {new Date(a.ends_at).toLocaleDateString('en-GH')}</p>
                  </div>
                  <div className="flex flex-col gap-1">
                    <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => openEdit(a)}><Edit className="h-3.5 w-3.5" /></Button>
                    <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => handleDelete(a)}><Trash2 className="h-3.5 w-3.5" /></Button>
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
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5"><Label>Type</Label>
                <Select value={form.type} onValueChange={v => setForm(p => ({ ...p, type: v }))}>
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
                <Select value={form.target_audience} onValueChange={v => setForm(p => ({ ...p, target_audience: v }))}>
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
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDialog(false)}>Cancel</Button>
            <Button disabled={saving} onClick={handleSave}>{saving ? 'Saving...' : 'Save'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
