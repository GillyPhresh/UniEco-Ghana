'use client';

import { useState, useEffect } from 'react';
import { AdminRouteGuard, AdminLayout } from '@/components/admin/admin-layout';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { getAdminCategories, createCategory, updateCategory, deleteCategory } from '@/lib/data/admin-client';
import type { Category } from '@/lib/types/admin';
import { FolderTree, Plus, Edit, Trash2, Eye, EyeOff } from 'lucide-react';
import { toast } from 'sonner';

export default function AdminCategoriesPage() {
  return (
    <AdminRouteGuard><AdminLayout><Content /></AdminLayout></AdminRouteGuard>
  );
}

function Content() {
  const [loading, setLoading] = useState(true);
  const [categories, setCategories] = useState<Category[]>([]);
  const [showDialog, setShowDialog] = useState(false);
  const [editing, setEditing] = useState<Category | null>(null);
  const [form, setForm] = useState({ name: '', slug: '', description: '', icon: '', sort_order: 0, is_visible: true });
  const [saving, setSaving] = useState(false);

  useEffect(() => { loadCategories(); }, []);

  async function loadCategories() {
    setLoading(true);
    const data = await getAdminCategories();
    setCategories(data);
    setLoading(false);
  }

  function openCreate() {
    setEditing(null);
    setForm({ name: '', slug: '', description: '', icon: '', sort_order: 0, is_visible: true });
    setShowDialog(true);
  }

  function openEdit(cat: Category) {
    setEditing(cat);
    setForm({ name: cat.name, slug: cat.slug, description: cat.description || '', icon: cat.icon || '', sort_order: cat.sort_order, is_visible: cat.is_visible });
    setShowDialog(true);
  }

  const handleSave = async () => {
    if (!form.name || !form.slug) { toast.error('Name and slug are required'); return; }
    setSaving(true);
    if (editing) {
      const { error } = await updateCategory(editing.id, form);
      if (error) { toast.error(error); } else { toast.success('Category updated'); setShowDialog(false); loadCategories(); }
    } else {
      const { error } = await createCategory(form);
      if (error) { toast.error(error); } else { toast.success('Category created'); setShowDialog(false); loadCategories(); }
    }
    setSaving(false);
  };

  const handleDelete = async (cat: Category) => {
    if (!confirm(`Delete "${cat.name}"? This cannot be undone.`)) return;
    const { error } = await deleteCategory(cat.id);
    if (error) { toast.error(error); } else { toast.success('Category deleted'); loadCategories(); }
  };

  const handleToggleVisibility = async (cat: Category) => {
    const { error } = await updateCategory(cat.id, { is_visible: !cat.is_visible });
    if (error) { toast.error(error); } else { loadCategories(); }
  };

  return (
    <div className="p-4 sm:p-6 space-y-4 max-w-4xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold text-foreground flex items-center gap-2">
            <FolderTree className="h-6 w-6 text-primary" /> Categories
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">{categories.length} categories</p>
        </div>
        <Button onClick={openCreate}><Plus className="mr-2 h-4 w-4" /> Add category</Button>
      </div>

      {loading ? (
        <div className="space-y-2">{[1, 2, 3, 4, 5].map(i => <Skeleton key={i} className="h-14 rounded-lg" />)}</div>
      ) : (
        <div className="space-y-1.5">
          {categories.map(cat => (
            <Card key={cat.id}>
              <CardContent className="flex items-center gap-3 p-3">
                <span className="text-xl">{cat.icon || '📁'}</span>
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium text-foreground">{cat.name}</p>
                    {!cat.is_visible && <Badge variant="outline" className="text-xs">Hidden</Badge>}
                  </div>
                  <p className="text-xs text-muted-foreground">{cat.slug} | Order: {cat.sort_order}</p>
                </div>
                <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => handleToggleVisibility(cat)}>
                  {cat.is_visible ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                </Button>
                <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => openEdit(cat)}><Edit className="h-4 w-4" /></Button>
                <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive" onClick={() => handleDelete(cat)}><Trash2 className="h-4 w-4" /></Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>{editing ? 'Edit Category' : 'Add Category'}</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1.5"><Label>Name</Label><Input value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} /></div>
            <div className="space-y-1.5"><Label>Slug</Label><Input value={form.slug} onChange={e => setForm(p => ({ ...p, slug: e.target.value }))} placeholder="food-and-drinks" /></div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5"><Label>Icon (emoji)</Label><Input value={form.icon} onChange={e => setForm(p => ({ ...p, icon: e.target.value }))} placeholder="🍽️" /></div>
              <div className="space-y-1.5"><Label>Sort Order</Label><Input type="number" value={form.sort_order} onChange={e => setForm(p => ({ ...p, sort_order: Number(e.target.value) }))} /></div>
            </div>
            <div className="space-y-1.5"><Label>Description</Label><Input value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} /></div>
            <div className="flex items-center gap-2">
              <input type="checkbox" id="cat_visible" checked={form.is_visible} onChange={e => setForm(p => ({ ...p, is_visible: e.target.checked }))} />
              <Label htmlFor="cat_visible" className="text-sm">Visible to public</Label>
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
