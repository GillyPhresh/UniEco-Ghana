'use client';

import { useState, useEffect, useRef } from 'react';
import { AdminRouteGuard, AdminLayout } from '@/components/admin/admin-layout';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Separator } from '@/components/ui/separator';
import {
  getAdminUniversities, createUniversity, updateUniversity, toggleUniversityEnabled,
  uploadUniversityImage, removeUniversityImage,
} from '@/lib/data/admin-client';
import { GraduationCap, Plus, Edit, Power, Upload, Trash2, Image as ImageIcon, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

type Uni = {
  id: string; name: string; short_name: string; slug: string;
  city: string | null; region: string | null; country: string;
  logo_url: string | null; hero_image_url: string | null;
  logo_alt_text: string | null; hero_alt_text: string | null;
  image_credit: string | null; image_source: string | null;
  website_url: string | null; description: string | null;
  is_enabled: boolean; created_at: string;
};

const EMPTY_FORM = {
  name: '', short_name: '', slug: '', city: '', region: '', country: 'Ghana',
  website_url: '', description: '', is_enabled: false,
  logo_alt_text: '', hero_alt_text: '', image_credit: '', image_source: '',
};

export default function AdminUniversitiesPage() {
  return (
    <AdminRouteGuard><AdminLayout><Content /></AdminLayout></AdminRouteGuard>
  );
}

function Content() {
  const [loading, setLoading] = useState(true);
  const [universities, setUniversities] = useState<Uni[]>([]);
  const [showDialog, setShowDialog] = useState(false);
  const [editing, setEditing] = useState<Uni | null>(null);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [saving, setSaving] = useState(false);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [heroPreview, setHeroPreview] = useState<string | null>(null);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [uploadingHero, setUploadingHero] = useState(false);
  const logoInputRef = useRef<HTMLInputElement>(null);
  const heroInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { loadUniversities(); }, []);

  async function loadUniversities() {
    setLoading(true);
    const data = await getAdminUniversities();
    setUniversities(data);
    setLoading(false);
  }

  function openCreate() {
    setEditing(null);
    setForm({ ...EMPTY_FORM });
    setLogoPreview(null);
    setHeroPreview(null);
    setShowDialog(true);
  }

  function openEdit(uni: Uni) {
    setEditing(uni);
    setForm({
      name: uni.name, short_name: uni.short_name, slug: uni.slug,
      city: uni.city || '', region: uni.region || '', country: uni.country,
      website_url: uni.website_url || '', description: uni.description || '',
      is_enabled: uni.is_enabled,
      logo_alt_text: uni.logo_alt_text || '', hero_alt_text: uni.hero_alt_text || '',
      image_credit: uni.image_credit || '', image_source: uni.image_source || '',
    });
    setLogoPreview(uni.logo_url);
    setHeroPreview(uni.hero_image_url);
    setShowDialog(true);
  }

  const handleSave = async () => {
    if (!form.name || !form.short_name || !form.slug) { toast.error('Name, short name, and slug are required'); return; }
    setSaving(true);
    const updatePayload: Record<string, unknown> = { ...form };
    if (!form.logo_alt_text) updatePayload.logo_alt_text = null;
    if (!form.hero_alt_text) updatePayload.hero_alt_text = null;
    if (!form.image_credit) updatePayload.image_credit = null;
    if (!form.image_source) updatePayload.image_source = null;

    const createPayload = {
      name: form.name,
      short_name: form.short_name,
      slug: form.slug,
      city: form.city || undefined,
      region: form.region || undefined,
      country: form.country,
      website_url: form.website_url || undefined,
      description: form.description || undefined,
      is_enabled: form.is_enabled,
      logo_alt_text: form.logo_alt_text || undefined,
      hero_alt_text: form.hero_alt_text || undefined,
      image_credit: form.image_credit || undefined,
      image_source: form.image_source || undefined,
    };

    if (editing) {
      const { error } = await updateUniversity(editing.id, updatePayload);
      if (error) { toast.error(error); } else { toast.success('University updated'); setShowDialog(false); loadUniversities(); }
    } else {
      const { error } = await createUniversity(createPayload);
      if (error) { toast.error(error); } else { toast.success('University created'); setShowDialog(false); loadUniversities(); }
    }
    setSaving(false);
  };

  const handleToggle = async (uni: Uni) => {
    const { error } = await toggleUniversityEnabled(uni.id, !uni.is_enabled);
    if (error) { toast.error(error); } else { toast.success(`University ${uni.is_enabled ? 'disabled' : 'enabled'}`); loadUniversities(); }
  };

  async function handleLogoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !editing) return;
    setUploadingLogo(true);
    const { url, error } = await uploadUniversityImage(editing.id, editing.slug, file, 'logo');
    setUploadingLogo(false);
    if (error) { toast.error(error); return; }
    setLogoPreview(url);
    toast.success('Logo uploaded');
    loadUniversities();
  }

  async function handleHeroUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !editing) return;
    setUploadingHero(true);
    const { url, error } = await uploadUniversityImage(editing.id, editing.slug, file, 'hero');
    setUploadingHero(false);
    if (error) { toast.error(error); return; }
    setHeroPreview(url);
    toast.success('Landmark image uploaded');
    loadUniversities();
  }

  async function handleRemoveLogo() {
    if (!editing) return;
    const { error } = await removeUniversityImage(editing.id, 'logo');
    if (error) { toast.error(error); return; }
    setLogoPreview(null);
    toast.success('Logo removed');
    loadUniversities();
  }

  async function handleRemoveHero() {
    if (!editing) return;
    const { error } = await removeUniversityImage(editing.id, 'hero');
    if (error) { toast.error(error); return; }
    setHeroPreview(null);
    toast.success('Landmark image removed');
    loadUniversities();
  }

  return (
    <div className="p-4 sm:p-6 space-y-4 max-w-5xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold text-foreground flex items-center gap-2">
            <GraduationCap className="h-6 w-6 text-primary" /> Universities
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">{universities.length} universities</p>
        </div>
        <Button onClick={openCreate}><Plus className="mr-2 h-4 w-4" /> Add university</Button>
      </div>

      {loading ? (
        <div className="space-y-2">{[1, 2, 3].map(i => <Skeleton key={i} className="h-20 rounded-xl" />)}</div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {universities.map(uni => (
            <Card key={uni.id}>
              <CardContent className="p-4">
                <div className="flex items-start gap-3">
                  {uni.logo_url ? (
                    <img src={uni.logo_url} alt={uni.logo_alt_text || uni.name} className="h-12 w-12 rounded-lg object-contain bg-white p-1" />
                  ) : (
                    <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10">
                      <GraduationCap className="h-6 w-6 text-primary" />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-semibold text-foreground truncate">{uni.name}</p>
                      <Badge className={uni.is_enabled ? 'bg-success/10 text-success' : 'bg-muted text-muted-foreground'}>
                        {uni.is_enabled ? 'Active' : 'Disabled'}
                      </Badge>
                      {uni.hero_image_url && (
                        <Badge className="bg-accent/10 text-accent">
                          <ImageIcon className="mr-1 h-3 w-3" /> Hero
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">{uni.short_name} | {uni.city || '—'}, {uni.region || '—'}</p>
                    <div className="mt-2 flex gap-1.5">
                      <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => openEdit(uni)}><Edit className="mr-1 h-3 w-3" /> Edit</Button>
                      <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => handleToggle(uni)}>
                        <Power className="mr-1 h-3 w-3" /> {uni.is_enabled ? 'Disable' : 'Enable'}
                      </Button>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editing ? 'Edit University' : 'Add University'}</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1.5"><Label>Name</Label><Input value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} placeholder="University of Energy and Natural Resources" /></div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5"><Label>Short Name</Label><Input value={form.short_name} onChange={e => setForm(p => ({ ...p, short_name: e.target.value }))} placeholder="UENR" /></div>
              <div className="space-y-1.5"><Label>Slug</Label><Input value={form.slug} onChange={e => setForm(p => ({ ...p, slug: e.target.value }))} placeholder="uenr" /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5"><Label>City</Label><Input value={form.city} onChange={e => setForm(p => ({ ...p, city: e.target.value }))} placeholder="Sunyani" /></div>
              <div className="space-y-1.5"><Label>Region</Label><Input value={form.region} onChange={e => setForm(p => ({ ...p, region: e.target.value }))} placeholder="Bono Region" /></div>
            </div>
            <div className="space-y-1.5"><Label>Website</Label><Input value={form.website_url} onChange={e => setForm(p => ({ ...p, website_url: e.target.value }))} placeholder="https://uenr.edu.gh" /></div>
            <div className="space-y-1.5"><Label>Description</Label><Textarea rows={2} value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} /></div>

            <Separator />

            {/* Logo section */}
            <div className="space-y-2">
              <Label className="text-sm font-semibold">University Logo</Label>
              {editing ? (
                <>
                  <div className="flex items-center gap-3">
                    {logoPreview ? (
                      <img src={logoPreview} alt="Logo preview" className="h-16 w-16 rounded-lg object-contain bg-white p-1 border border-border" />
                    ) : (
                      <div className="flex h-16 w-16 items-center justify-center rounded-lg bg-muted">
                        <GraduationCap className="h-8 w-8 text-muted-foreground" />
                      </div>
                    )}
                    <div className="flex flex-col gap-1.5">
                      <input ref={logoInputRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={handleLogoUpload} />
                      <Button size="sm" variant="outline" disabled={uploadingLogo} onClick={() => logoInputRef.current?.click()}>
                        {uploadingLogo ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <Upload className="mr-1 h-3 w-3" />}
                        {logoPreview ? 'Replace logo' : 'Upload logo'}
                      </Button>
                      {logoPreview && (
                        <Button size="sm" variant="ghost" className="text-destructive h-7 text-xs" onClick={handleRemoveLogo}>
                          <Trash2 className="mr-1 h-3 w-3" /> Remove
                        </Button>
                      )}
                    </div>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Logo alt text (accessibility)</Label>
                    <Input value={form.logo_alt_text} onChange={e => setForm(p => ({ ...p, logo_alt_text: e.target.value }))} placeholder="University of Energy and Natural Resources official logo" />
                  </div>
                </>
              ) : (
                <p className="text-xs text-muted-foreground">Save the university first, then upload a logo.</p>
              )}
            </div>

            <Separator />

            {/* Hero/Landmark image section */}
            <div className="space-y-2">
              <Label className="text-sm font-semibold">Landmark / Hero Image</Label>
              {editing ? (
                <>
                  {heroPreview ? (
                    <div className="relative rounded-lg overflow-hidden border border-border">
                      <img src={heroPreview} alt="Hero preview" className="w-full h-32 object-cover" />
                    </div>
                  ) : (
                    <div className="flex h-32 items-center justify-center rounded-lg bg-muted border border-dashed border-border">
                      <div className="text-center">
                        <ImageIcon className="h-8 w-8 text-muted-foreground mx-auto" />
                        <p className="mt-1 text-xs text-muted-foreground">No landmark image yet</p>
                      </div>
                    </div>
                  )}
                  <div className="flex gap-1.5">
                    <input ref={heroInputRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={handleHeroUpload} />
                    <Button size="sm" variant="outline" disabled={uploadingHero} onClick={() => heroInputRef.current?.click()}>
                      {uploadingHero ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <Upload className="mr-1 h-3 w-3" />}
                      {heroPreview ? 'Replace image' : 'Upload image'}
                    </Button>
                    {heroPreview && (
                      <Button size="sm" variant="ghost" className="text-destructive h-7 text-xs" onClick={handleRemoveHero}>
                        <Trash2 className="mr-1 h-3 w-3" /> Remove
                      </Button>
                    )}
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Hero image alt text (accessibility)</Label>
                    <Input value={form.hero_alt_text} onChange={e => setForm(p => ({ ...p, hero_alt_text: e.target.value }))} placeholder="UENR campus landmark building" />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">Image credit (optional)</Label>
                      <Input value={form.image_credit} onChange={e => setForm(p => ({ ...p, image_credit: e.target.value }))} placeholder="Photo by..." />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">Image source (optional)</Label>
                      <Input value={form.image_source} onChange={e => setForm(p => ({ ...p, image_source: e.target.value }))} placeholder="URL or description" />
                    </div>
                  </div>
                </>
              ) : (
                <p className="text-xs text-muted-foreground">Save the university first, then upload a landmark image.</p>
              )}
            </div>

            <Separator />

            <div className="flex items-center gap-2">
              <input type="checkbox" id="uni_enabled" checked={form.is_enabled} onChange={e => setForm(p => ({ ...p, is_enabled: e.target.checked }))} />
              <Label htmlFor="uni_enabled" className="text-sm">Enabled (visible to public)</Label>
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
