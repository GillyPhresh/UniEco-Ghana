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
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { AdminDeleteConfirmation } from '@/components/admin/admin-delete-confirmation';
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
  const [loadError, setLoadError] = useState<string | null>(null);
  const [tab, setTab] = useState('pages');
  const [showDialog, setShowDialog] = useState(false);
  const [editingPage, setEditingPage] = useState<CmsPage | null>(null);
  const [pageForm, setPageForm] = useState({ slug: '', title: '', content: '', page_type: 'blog', meta_description: '', is_published: false });
  const [saving, setSaving] = useState(false);
  const [pendingPageSave, setPendingPageSave] = useState(false);
  const [showFaqDialog, setShowFaqDialog] = useState(false);
  const [editingFaq, setEditingFaq] = useState<CmsFaqEntry | null>(null);
  const [pendingFaqSave, setPendingFaqSave] = useState(false);
  const [pendingDeletion, setPendingDeletion] = useState<{ kind: 'page' | 'faq'; id: string; title: string } | null>(null);
  const [faqForm, setFaqForm] = useState({ question: '', answer: '', category: 'General' });

  const loadData = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const [p, f] = await Promise.all([getAdminCmsPages(), getAdminFaq()]);
      setPages(p);
      setFaq(f);
    } catch {
      setPages([]);
      setFaq([]);
      setLoadError('Unable to load CMS content. Please retry.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void loadData(); }, [loadData]);

  function openCreatePage() {
    setEditingPage(null);
    setPendingPageSave(false);
    setPageForm({ slug: '', title: '', content: '', page_type: 'blog', meta_description: '', is_published: false });
    setShowDialog(true);
  }

  function openEditPage(p: CmsPage) {
    setEditingPage(p);
    setPendingPageSave(false);
    setPageForm({ slug: p.slug, title: p.title, content: p.content || '', page_type: p.page_type, meta_description: p.meta_description || '', is_published: p.is_published });
    setShowDialog(true);
  }

  const handleSavePage = async () => {
    if (!pageForm.slug || !pageForm.title) { toast.error('Slug and title are required'); return; }
    setSaving(true);
    try {
      const result = editingPage
        ? await updateCmsPage(editingPage.id, { ...editingPage, ...pageForm })
        : await createCmsPage(pageForm);
      if (result.error) {
        toast.error(result.error);
      } else {
        toast.success(editingPage ? 'Page updated' : 'Page created');
        setShowDialog(false);
        setPendingPageSave(false);
        void loadData();
      }
    } catch {
      toast.error('Unable to save the CMS page. Please retry.');
    } finally {
      setSaving(false);
    }
  };

  const requestSavePage = () => {
    if (!pageForm.slug || !pageForm.title) { toast.error('Slug and title are required'); return; }
    if (pageForm.is_published || editingPage?.is_published) setPendingPageSave(true);
    else void handleSavePage();
  };

  const handleDeletePage = (page: CmsPage) => {
    setPendingDeletion({ kind: 'page', id: page.id, title: page.title });
  };

  function openCreateFaq() {
    setEditingFaq(null);
    setPendingFaqSave(false);
    setFaqForm({ question: '', answer: '', category: 'General' });
    setShowFaqDialog(true);
  }

  function openEditFaq(f: CmsFaqEntry) {
    setEditingFaq(f);
    setPendingFaqSave(false);
    setFaqForm({ question: f.question, answer: f.answer, category: f.category || 'General' });
    setShowFaqDialog(true);
  }

  const handleSaveFaq = async () => {
    if (!faqForm.question || !faqForm.answer) { toast.error('Question and answer are required'); return; }
    setSaving(true);
    try {
      const result = editingFaq
        ? await updateFaqEntry(editingFaq.id, { ...editingFaq, ...faqForm })
        : await createFaqEntry(faqForm);
      if (result.error) {
        toast.error(result.error);
      } else {
        toast.success(editingFaq ? 'FAQ updated' : 'FAQ created');
        setShowFaqDialog(false);
        setPendingFaqSave(false);
        void loadData();
      }
    } catch {
      toast.error('Unable to save the FAQ entry. Please retry.');
    } finally {
      setSaving(false);
    }
  };

  const requestSaveFaq = () => {
    if (!faqForm.question || !faqForm.answer) { toast.error('Question and answer are required'); return; }
    if (!editingFaq || editingFaq.is_published) setPendingFaqSave(true);
    else void handleSaveFaq();
  };

  const handleDeleteFaq = (entry: CmsFaqEntry) => {
    setPendingDeletion({ kind: 'faq', id: entry.id, title: entry.question });
  };

  const confirmContentDeletion = async (reason: string): Promise<boolean> => {
    if (!pendingDeletion) return false;
    const result = pendingDeletion.kind === 'page'
      ? await deleteCmsPage(pendingDeletion.id, reason)
      : await deleteFaqEntry(pendingDeletion.id, reason);
    if (result.error) { toast.error(result.error); return false; }
    toast.success(pendingDeletion.kind === 'page' ? 'Page deleted' : 'FAQ deleted');
    void loadData();
    return true;
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
      ) : loadError ? (
        <Card><CardContent className="py-8 text-center space-y-3">
          <p role="alert" className="text-sm text-destructive">{loadError}</p>
          <Button variant="outline" size="sm" onClick={() => void loadData()}>Retry</Button>
        </CardContent></Card>
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
                  <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" aria-label={`Delete page ${p.title}`} onClick={() => handleDeletePage(p)}><Trash2 className="h-3.5 w-3.5" /></Button>
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
                  <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" aria-label={`Delete FAQ ${f.question}`} onClick={() => handleDeleteFaq(f)}><Trash2 className="h-3.5 w-3.5" /></Button>
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
            <Button disabled={saving} onClick={requestSavePage}>{saving ? 'Saving...' : pageForm.is_published || editingPage?.is_published ? 'Review publication' : 'Save draft'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={pendingPageSave} onOpenChange={open => { if (!open && !saving) setPendingPageSave(false); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{pageForm.is_published ? editingPage?.is_published ? 'Confirm public page update' : 'Confirm page publication' : 'Confirm page unpublication'}</AlertDialogTitle>
            <AlertDialogDescription>
              {pageForm.is_published
                ? `Save “${pageForm.title}” at /${pageForm.slug} as public content? This ${editingPage?.is_published ? 'updates the currently published page' : 'publishes the page immediately'}.`
                : `Unpublish “${pageForm.title}” at /${pageForm.slug}? It will no longer be available as a published page.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="max-h-40 overflow-y-auto rounded-md border p-3 text-sm"><p className="whitespace-pre-wrap">{pageForm.content || 'No page content'}</p></div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={saving}>Back to editing</AlertDialogCancel>
            <AlertDialogAction disabled={saving} onClick={event => { event.preventDefault(); void handleSavePage(); }}>
              {saving ? 'Saving…' : pageForm.is_published ? 'Confirm and publish' : 'Confirm unpublish'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

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
            <Button disabled={saving} onClick={requestSaveFaq}>{saving ? 'Saving...' : !editingFaq || editingFaq.is_published ? 'Review public FAQ' : 'Save draft FAQ'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <AlertDialog open={pendingFaqSave} onOpenChange={open => { if (!open && !saving) setPendingFaqSave(false); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{editingFaq ? 'Confirm public FAQ update' : 'Confirm FAQ publication'}</AlertDialogTitle>
            <AlertDialogDescription>
              {editingFaq
                ? `Save changes to the published FAQ “${faqForm.question}” in category ${faqForm.category || 'General'}?`
                : `Publish this FAQ in category ${faqForm.category || 'General'}? It will be public immediately.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="max-h-40 space-y-2 overflow-y-auto rounded-md border p-3 text-sm">
            <p className="font-medium">{faqForm.question}</p>
            <p className="whitespace-pre-wrap">{faqForm.answer}</p>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={saving}>Back to editing</AlertDialogCancel>
            <AlertDialogAction disabled={saving} onClick={event => { event.preventDefault(); void handleSaveFaq(); }}>
              {saving ? 'Saving…' : editingFaq ? 'Confirm public update' : 'Confirm and publish'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <AdminDeleteConfirmation
        open={pendingDeletion !== null}
        itemName={pendingDeletion?.title || ''}
        resourceLabel={pendingDeletion?.kind === 'faq' ? 'FAQ entry' : 'CMS page'}
        onOpenChange={open => { if (!open) setPendingDeletion(null); }}
        onConfirm={confirmContentDeletion}
      />
    </div>
  );
}
