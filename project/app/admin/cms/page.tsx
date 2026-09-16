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
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { getAdminCmsPages, createCmsPage, updateCmsPage, deleteCmsPage, getAdminFaq, createFaqEntry, updateFaqEntry, deleteFaqEntry } from '@/lib/data/admin-client';
import type { CmsPage, CmsFaqEntry } from '@/lib/types/admin';
import { FileText, Plus, Edit, Trash2, HelpCircle, Globe } from 'lucide-react';
import { toast } from 'sonner';

export default function AdminCmsPage() {
  return (
    <AdminRouteGuard><AdminLayout><Content /></AdminLayout></AdminRouteGuard>
  );
}

function Content() {
  const [loading, setLoading] = useState(true);
  const [pages, setPages] = useState<CmsPage[]>([]);
  const [faq, setFaq] = useState<CmsFaqEntry[]>([]);
  const [tab, setTab] = useState('pages');
  const [showDialog, setShowDialog] = useState(false);
  const [editingPage, setEditingPage] = useState<CmsPage | null>(null);
  const [pageForm, setPageForm] = useState({ slug: '', title: '', content: '', page_type: 'blog', meta_description: '', is_published: false });
  const [saving, setSaving] = useState(false);
  const [showFaqDialog, setShowFaqDialog] = useState(false);
  const [editingFaq, setEditingFaq] = useState<CmsFaqEntry | null>(null);
  const [faqForm, setFaqForm] = useState({ question: '', answer: '', category: 'General' });

  useEffect(() => { loadData(); }, []);

  async function loadData() {
    setLoading(true);
    const [p, f] = await Promise.all([getAdminCmsPages(), getAdminFaq()]);
    setPages(p);
    setFaq(f);
    setLoading(false);
  }

  function openCreatePage() {
    setEditingPage(null);
    setPageForm({ slug: '', title: '', content: '', page_type: 'blog', meta_description: '', is_published: false });
    setShowDialog(true);
  }

  function openEditPage(p: CmsPage) {
    setEditingPage(p);
    setPageForm({ slug: p.slug, title: p.title, content: p.content || '', page_type: p.page_type, meta_description: p.meta_description || '', is_published: p.is_published });
    setShowDialog(true);
  }

  const handleSavePage = async () => {
    if (!pageForm.slug || !pageForm.title) { toast.error('Slug and title are required'); return; }
    setSaving(true);
    if (editingPage) {
      const { error } = await updateCmsPage(editingPage.id, pageForm);
      if (error) { toast.error(error); } else { toast.success('Page updated'); setShowDialog(false); loadData(); }
    } else {
      const { error } = await createCmsPage(pageForm);
      if (error) { toast.error(error); } else { toast.success('Page created'); setShowDialog(false); loadData(); }
    }
    setSaving(false);
  };

  const handleDeletePage = async (p: CmsPage) => {
    if (!confirm(`Delete "${p.title}"?`)) return;
    const { error } = await deleteCmsPage(p.id);
    if (error) { toast.error(error); } else { toast.success('Page deleted'); loadData(); }
  };

  function openCreateFaq() {
    setEditingFaq(null);
    setFaqForm({ question: '', answer: '', category: 'General' });
    setShowFaqDialog(true);
  }

  function openEditFaq(f: CmsFaqEntry) {
    setEditingFaq(f);
    setFaqForm({ question: f.question, answer: f.answer, category: f.category || 'General' });
    setShowFaqDialog(true);
  }

  const handleSaveFaq = async () => {
    if (!faqForm.question || !faqForm.answer) { toast.error('Question and answer are required'); return; }
    setSaving(true);
    if (editingFaq) {
      const { error } = await updateFaqEntry(editingFaq.id, faqForm);
      if (error) { toast.error(error); } else { toast.success('FAQ updated'); setShowFaqDialog(false); loadData(); }
    } else {
      const { error } = await createFaqEntry(faqForm);
      if (error) { toast.error(error); } else { toast.success('FAQ created'); setShowFaqDialog(false); loadData(); }
    }
    setSaving(false);
  };

  const handleDeleteFaq = async (f: CmsFaqEntry) => {
    if (!confirm('Delete this FAQ entry?')) return;
    const { error } = await deleteFaqEntry(f.id);
    if (error) { toast.error(error); } else { toast.success('FAQ deleted'); loadData(); }
  };

  return (
    <div className="p-4 sm:p-6 space-y-4 max-w-4xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold text-foreground flex items-center gap-2">
            <FileText className="h-6 w-6 text-primary" /> Content Management
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">Manage pages, FAQ, and site content</p>
        </div>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="pages"><Globe className="mr-1.5 h-3.5 w-3.5" /> Pages</TabsTrigger>
          <TabsTrigger value="faq"><HelpCircle className="mr-1.5 h-3.5 w-3.5" /> FAQ</TabsTrigger>
        </TabsList>
      </Tabs>

      {loading ? (
        <div className="space-y-2">{[1, 2, 3].map(i => <Skeleton key={i} className="h-16 rounded-lg" />)}</div>
      ) : tab === 'pages' ? (
        <>
          <Button onClick={openCreatePage} className="w-full"><Plus className="mr-2 h-4 w-4" /> Add page</Button>
          <div className="space-y-2">
            {pages.map(p => (
              <Card key={p.id}>
                <CardContent className="flex items-center gap-3 p-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium text-foreground truncate">{p.title}</p>
                      <Badge variant="outline" className="capitalize">{p.page_type}</Badge>
                      {p.is_published ? <Badge className="bg-success/10 text-success">Published</Badge> : <Badge variant="outline">Draft</Badge>}
                    </div>
                    <p className="text-xs text-muted-foreground">/{p.slug} | By {p.author?.full_name || 'Admin'} | {new Date(p.created_at).toLocaleDateString('en-GH')}</p>
                  </div>
                  <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => openEditPage(p)}><Edit className="h-3.5 w-3.5" /></Button>
                  <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => handleDeletePage(p)}><Trash2 className="h-3.5 w-3.5" /></Button>
                </CardContent>
              </Card>
            ))}
            {pages.length === 0 && <Card><CardContent className="py-12 text-center text-sm text-muted-foreground">No pages yet</CardContent></Card>}
          </div>
        </>
      ) : (
        <>
          <Button onClick={openCreateFaq} className="w-full"><Plus className="mr-2 h-4 w-4" /> Add FAQ entry</Button>
          <div className="space-y-2">
            {faq.map(f => (
              <Card key={f.id}>
                <CardContent className="flex items-start gap-3 p-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium text-foreground">{f.question}</p>
                      {f.category && <Badge variant="outline" className="text-xs">{f.category}</Badge>}
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground line-clamp-2">{f.answer}</p>
                  </div>
                  <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => openEditFaq(f)}><Edit className="h-3.5 w-3.5" /></Button>
                  <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => handleDeleteFaq(f)}><Trash2 className="h-3.5 w-3.5" /></Button>
                </CardContent>
              </Card>
            ))}
            {faq.length === 0 && <Card><CardContent className="py-12 text-center text-sm text-muted-foreground">No FAQ entries yet</CardContent></Card>}
          </div>
        </>
      )}

      {/* Page dialog */}
      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editingPage ? 'Edit Page' : 'Add Page'}</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1.5"><Label>Title</Label><Input value={pageForm.title} onChange={e => setPageForm(p => ({ ...p, title: e.target.value }))} /></div>
            <div className="space-y-1.5"><Label>Slug</Label><Input value={pageForm.slug} onChange={e => setPageForm(p => ({ ...p, slug: e.target.value }))} placeholder="about-us" /></div>
            <div className="space-y-1.5"><Label>Page Type</Label>
              <div className="flex flex-wrap gap-1.5">
                {['blog', 'help', 'terms', 'privacy', 'guidelines', 'about', 'banner'].map(t => (
                  <Button key={t} size="sm" variant={pageForm.page_type === t ? 'default' : 'outline'} className="h-7 text-xs capitalize" onClick={() => setPageForm(p => ({ ...p, page_type: t }))}>{t}</Button>
                ))}
              </div>
            </div>
            <div className="space-y-1.5"><Label>Content</Label><Textarea rows={6} value={pageForm.content} onChange={e => setPageForm(p => ({ ...p, content: e.target.value }))} placeholder="Write your content here..." /></div>
            <div className="space-y-1.5"><Label>Meta Description (optional)</Label><Input value={pageForm.meta_description} onChange={e => setPageForm(p => ({ ...p, meta_description: e.target.value }))} /></div>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={pageForm.is_published} onChange={e => setPageForm(p => ({ ...p, is_published: e.target.checked }))} /> Publish immediately</label>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDialog(false)}>Cancel</Button>
            <Button disabled={saving} onClick={handleSavePage}>{saving ? 'Saving...' : 'Save'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* FAQ dialog */}
      <Dialog open={showFaqDialog} onOpenChange={setShowFaqDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>{editingFaq ? 'Edit FAQ' : 'Add FAQ'}</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1.5"><Label>Question</Label><Input value={faqForm.question} onChange={e => setFaqForm(p => ({ ...p, question: e.target.value }))} /></div>
            <div className="space-y-1.5"><Label>Answer</Label><Textarea rows={4} value={faqForm.answer} onChange={e => setFaqForm(p => ({ ...p, answer: e.target.value }))} /></div>
            <div className="space-y-1.5"><Label>Category</Label><Input value={faqForm.category} onChange={e => setFaqForm(p => ({ ...p, category: e.target.value }))} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowFaqDialog(false)}>Cancel</Button>
            <Button disabled={saving} onClick={handleSaveFaq}>{saving ? 'Saving...' : 'Save'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
