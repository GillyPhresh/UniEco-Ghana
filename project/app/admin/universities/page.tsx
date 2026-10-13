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
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Separator } from '@/components/ui/separator';
import {
  getAdminUniversities, createUniversity, updateUniversity, toggleUniversityEnabled,
  updateUniversityBrandingMetadata, uploadUniversityImage, removeUniversityImage, getUniversityAdminMemberships,
  searchUniversityAdminCandidates, assignUniversityAdministrator, revokeUniversityAdministrator,
} from '@/lib/data/admin-client';
import { useAuth } from '@/lib/auth/auth-context';
import { GraduationCap, Plus, Edit, Power, Upload, Trash2, Image as ImageIcon, Loader2, Search, ShieldCheck, Globe2, UserPlus, UserX } from 'lucide-react';
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

const UENR_DESCRIPTION = 'The University of Energy and Natural Resources (UENR) is a public university in Sunyani, Bono Region, Ghana, focused on energy, natural resources, science, technology, and sustainable development.';

export default function AdminUniversitiesPage() {
  return (
    <AdminRouteGuard><AdminLayout><Content /></AdminLayout></AdminRouteGuard>
  );
}

function Content() {
  const { user } = useAuth();
  const isUniversityAdmin = user?.role === 'university_admin';
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [universities, setUniversities] = useState<Uni[]>([]);
  const [search, setSearch] = useState('');
  const [showDialog, setShowDialog] = useState(false);
  const [editing, setEditing] = useState<Uni | null>(null);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [saving, setSaving] = useState(false);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [heroPreview, setHeroPreview] = useState<string | null>(null);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [uploadingHero, setUploadingHero] = useState(false);
  const [managedUniversity, setManagedUniversity] = useState<Uni | null>(null);
  const [members, setMembers] = useState<Awaited<ReturnType<typeof getUniversityAdminMemberships>>>([]);
  const [membersLoading, setMembersLoading] = useState(false);
  const [candidateSearch, setCandidateSearch] = useState('');
  const [candidates, setCandidates] = useState<Awaited<ReturnType<typeof searchUniversityAdminCandidates>>>([]);
  const [searchingCandidates, setSearchingCandidates] = useState(false);
  const [membershipReason, setMembershipReason] = useState('');
  const [membershipError, setMembershipError] = useState<string | null>(null);
  const [membershipSaving, setMembershipSaving] = useState(false);
  const [pendingMembershipAction, setPendingMembershipAction] = useState<{
    kind: 'assign' | 'revoke';
    userId: string;
    targetName: string;
    universityId: string;
    universityName: string;
  } | null>(null);
  const logoInputRef = useRef<HTMLInputElement>(null);
  const heroInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { loadUniversities(); }, [isUniversityAdmin]);

  async function loadUniversities() {
    setLoading(true);
    setLoadError(null);
    try {
      // The database RPC derives university memberships from auth.uid(); the
      // browser never receives or enforces another university's scope list.
      setUniversities(await getAdminUniversities());
    } catch {
      setLoadError('Unable to load universities. Check your access and try again.');
    } finally {
      setLoading(false);
    }
  }

  async function openUniversityAdmins(uni: Uni) {
    setManagedUniversity(uni);
    setMembershipError(null);
    setCandidateSearch('');
    setCandidates([]);
    setMembershipReason('');
    setMembersLoading(true);
    try {
      setMembers(await getUniversityAdminMemberships(uni.id));
    } catch {
      setMembers([]);
      setMembershipError('Unable to load this university’s administrator memberships.');
    } finally {
      setMembersLoading(false);
    }
  }

  async function findAdministratorCandidates() {
    if (!managedUniversity || candidateSearch.trim().length < 3) {
      setMembershipError('Enter at least 3 characters to search for an eligible account.');
      return;
    }
    setSearchingCandidates(true);
    setMembershipError(null);
    try {
      setCandidates(await searchUniversityAdminCandidates(managedUniversity.id, candidateSearch.trim()));
    } catch {
      setCandidates([]);
      setMembershipError('Unable to search eligible administrator accounts.');
    } finally {
      setSearchingCandidates(false);
    }
  }

  function requestAssignAdministrator(candidate: Awaited<ReturnType<typeof searchUniversityAdminCandidates>>[number]) {
    if (!managedUniversity) return;
    if (membershipReason.trim().length < 10 || membershipReason.trim().length > 500) {
      setMembershipError('Provide an assignment reason between 10 and 500 characters.');
      return;
    }
    setMembershipError(null);
    setPendingMembershipAction({ kind: 'assign', userId: candidate.user_id, targetName: candidate.full_name || candidate.email, universityId: managedUniversity.id, universityName: managedUniversity.name });
  }

  async function revokeAdministrator(member: Awaited<ReturnType<typeof getUniversityAdminMemberships>>[number]) {
    if (!managedUniversity) return;
    if (membershipReason.trim().length < 10 || membershipReason.trim().length > 500) {
      setMembershipError('Provide a revocation reason between 10 and 500 characters.');
      return;
    }
    setMembershipError(null);
    setPendingMembershipAction({ kind: 'revoke', userId: member.user_id, targetName: member.full_name || member.email, universityId: managedUniversity.id, universityName: managedUniversity.name });
  }

  async function confirmMembershipAction() {
    const action = pendingMembershipAction;
    if (!action || !managedUniversity || managedUniversity.id !== action.universityId) return;
    setMembershipSaving(true);
    setMembershipError(null);
    try {
      const { error } = action.kind === 'assign'
        ? await assignUniversityAdministrator(action.userId, action.universityId, membershipReason.trim())
        : await revokeUniversityAdministrator(action.userId, action.universityId, membershipReason.trim());
      if (error) {
        setMembershipError(error);
      } else {
        toast.success(action.kind === 'assign' ? 'University administrator assigned' : 'University administrator access revoked');
        setMembershipReason('');
        await openUniversityAdmins(managedUniversity);
        await loadUniversities();
      }
    } catch {
      setMembershipError('Unable to update university administrator access. Please retry.');
    } finally {
      setPendingMembershipAction(null);
      setMembershipSaving(false);
    }
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
    if (isUniversityAdmin && editing) {
      const { error } = await updateUniversityBrandingMetadata(editing.id, {
        logo_alt_text: form.logo_alt_text,
        hero_alt_text: form.hero_alt_text,
        image_credit: form.image_credit,
        image_source: form.image_source,
      });
      if (error) { toast.error(error); }
      else { toast.success('University branding metadata updated'); setShowDialog(false); await loadUniversities(); }
      setSaving(false);
      return;
    }
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
    e.target.value = '';
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
    e.target.value = '';
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

  const visibleUniversities = universities.filter(uni => {
    const haystack = `${uni.name} ${uni.short_name} ${uni.city || ''} ${uni.region || ''}`.toLowerCase();
    return haystack.includes(search.trim().toLowerCase());
  });
  const brandedCount = universities.filter(uni => uni.logo_url && uni.hero_image_url).length;

  return (
    <div className="p-4 sm:p-6 space-y-4 max-w-5xl">
      <div className="flex flex-col gap-4 rounded-2xl border bg-card p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
        <div>
          <h1 className="font-display text-2xl font-bold text-foreground flex items-center gap-2">
            <GraduationCap className="h-6 w-6 text-primary" /> Universities
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">The authoritative university directory for UniEco Ghana.</p>
          <div className="mt-3 flex flex-wrap gap-2 text-xs">
            <Badge variant="outline"><ShieldCheck className="mr-1 h-3.5 w-3.5 text-primary" /> {universities.length} institutions</Badge>
            <Badge variant="outline"><ImageIcon className="mr-1 h-3.5 w-3.5 text-primary" /> {brandedCount} fully branded</Badge>
          </div>
        </div>
        {!isUniversityAdmin && <Button onClick={openCreate}><Plus className="mr-2 h-4 w-4" /> Add university</Button>}
      </div>

      <div className="relative max-w-lg">
        <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
        <Input value={search} onChange={event => setSearch(event.target.value)} className="pl-9" placeholder="Search by university, abbreviation, city, or region" />
      </div>

      {loadError && <div className="flex items-center gap-3" role="alert"><p className="text-sm text-destructive">{loadError}</p><Button variant="outline" size="sm" onClick={loadUniversities}>Retry</Button></div>}
      {loading ? (
        <div className="space-y-2">{[1, 2, 3].map(i => <Skeleton key={i} className="h-20 rounded-xl" />)}</div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {visibleUniversities.map(uni => (
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
                      <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => openEdit(uni)}><Edit className="mr-1 h-3 w-3" /> {isUniversityAdmin ? 'Update branding' : 'Edit'}</Button>
                      {!isUniversityAdmin && <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => handleToggle(uni)}>
                        <Power className="mr-1 h-3 w-3" /> {uni.is_enabled ? 'Disable' : 'Enable'}
                      </Button>}
                      {user?.role === 'super_admin' && <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => void openUniversityAdmins(uni)}>
                        <UserPlus className="mr-1 h-3 w-3" /> Admins
                      </Button>}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="sm:max-w-xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? `University record · ${editing.short_name}` : 'Add university'}</DialogTitle>
            <p className="text-sm text-muted-foreground">Changes are recorded in the platform audit trail. Branding uploads save immediately after verification.</p>
          </DialogHeader>
          <div className="space-y-3 py-2">
            {isUniversityAdmin ? (
              <p className="rounded-md bg-muted p-3 text-sm text-muted-foreground">You can update branding for your assigned university only.</p>
            ) : <>
            <div className="space-y-1.5"><Label>Name</Label><Input value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} placeholder="University of Energy and Natural Resources" /></div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5"><Label>Short Name</Label><Input value={form.short_name} onChange={e => setForm(p => ({ ...p, short_name: e.target.value }))} placeholder="UENR" /></div>
              <div className="space-y-1.5"><Label>Slug</Label><Input value={form.slug} onChange={e => setForm(p => ({ ...p, slug: e.target.value }))} placeholder="uenr" /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5"><Label>City</Label><Input value={form.city} onChange={e => setForm(p => ({ ...p, city: e.target.value }))} placeholder="Sunyani" /></div>
              <div className="space-y-1.5"><Label>Region</Label><Input value={form.region} onChange={e => setForm(p => ({ ...p, region: e.target.value }))} placeholder="Bono Region" /></div>
            </div>
            <div className="space-y-1.5"><Label className="flex items-center gap-1.5"><Globe2 className="h-3.5 w-3.5" /> Official website</Label><Input value={form.website_url} onChange={e => setForm(p => ({ ...p, website_url: e.target.value }))} placeholder="https://uenr.edu.gh" /><p className="text-xs text-muted-foreground">Use the institution’s official HTTPS website only.</p></div>
            <div className="space-y-1.5">
              <div className="flex items-center justify-between gap-3"><Label>Public directory description</Label>{editing?.slug === 'uenr' && <Button type="button" size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => setForm(p => ({ ...p, description: UENR_DESCRIPTION }))}>Use recommended UENR copy</Button>}</div>
              <Textarea rows={4} value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} placeholder="A short, factual description of the institution, its location, and academic focus." />
              <p className="text-xs text-muted-foreground">Keep this factual, current, and between one and three sentences.</p>
            </div>

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
                      <Button type="button" size="sm" variant="outline" disabled={uploadingLogo} onClick={() => logoInputRef.current?.click()}>
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
                  <p className="text-xs text-muted-foreground">PNG, JPG, or WebP only · maximum 5 MB · square logo recommended.</p>
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
                    <Button type="button" size="sm" variant="outline" disabled={uploadingHero} onClick={() => heroInputRef.current?.click()}>
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
                  <p className="text-xs text-muted-foreground">PNG, JPG, or WebP only · maximum 5 MB · use a wide campus or landmark image.</p>
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
            </>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDialog(false)}>{isUniversityAdmin ? 'Close' : 'Cancel'}</Button>
            {isUniversityAdmin
              ? <Button disabled={saving || !editing} onClick={handleSave}>{saving ? 'Saving...' : 'Save branding details'}</Button>
              : <Button disabled={saving} onClick={handleSave}>{saving ? 'Saving...' : 'Save'}</Button>}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(managedUniversity)} onOpenChange={open => { if (!open) setManagedUniversity(null); }}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>University administrators{managedUniversity ? ` · ${managedUniversity.short_name}` : ''}</DialogTitle>
            <p className="text-sm text-muted-foreground">Only platform super administrators can assign or revoke access. Each change requires a reason and is audited.</p>
          </DialogHeader>

          {membershipError && <p role="alert" className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{membershipError}</p>}

          <section className="space-y-2">
            <h2 className="text-sm font-semibold">Current and previous assignments</h2>
            {membersLoading ? <Skeleton className="h-16 w-full" /> : members.length === 0 ? (
              <p className="rounded-md bg-muted p-3 text-sm text-muted-foreground">No university administrator assignments.</p>
            ) : (
              <div className="space-y-2">
                {members.map(member => (
                  <div key={`${member.user_id}-${member.assigned_at}`} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{member.full_name || member.email}</p>
                      {member.full_name && <p className="truncate text-xs text-muted-foreground">{member.email}</p>}
                      <p className="text-xs text-muted-foreground">Assigned {new Date(member.assigned_at).toLocaleDateString()}</p>
                    </div>
                    {member.is_active ? (
                      <Button variant="outline" size="sm" disabled={membershipSaving} onClick={() => void revokeAdministrator(member)}>
                        <UserX className="mr-2 h-4 w-4" /> Revoke
                      </Button>
                    ) : <Badge variant="outline">Revoked</Badge>}
                  </div>
                ))}
              </div>
            )}
          </section>

          <Separator />

          <section className="space-y-3">
            <h2 className="text-sm font-semibold">Assign an administrator</h2>
            <div className="flex gap-2">
              <Input
                aria-label="Search eligible accounts"
                value={candidateSearch}
                onChange={event => setCandidateSearch(event.target.value)}
                onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); void findAdministratorCandidates(); } }}
                placeholder="Search name or email (3+ characters)"
              />
              <Button variant="outline" onClick={() => void findAdministratorCandidates()} disabled={searchingCandidates || candidateSearch.trim().length < 3}>
                {searchingCandidates ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                <span className="sr-only">Search candidates</span>
              </Button>
            </div>
            {candidates.length > 0 && <div className="max-h-48 space-y-2 overflow-y-auto">
              {candidates.map(candidate => (
                <div key={candidate.user_id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{candidate.full_name || candidate.email}</p>
                    {candidate.full_name && <p className="truncate text-xs text-muted-foreground">{candidate.email}</p>}
                    <p className="text-xs text-muted-foreground">Current role: {candidate.current_role}</p>
                  </div>
                  <Button size="sm" disabled={membershipSaving || membershipReason.trim().length < 10} onClick={() => requestAssignAdministrator(candidate)}>
                    <UserPlus className="mr-2 h-4 w-4" /> Assign
                  </Button>
                </div>
              ))}
            </div>}
            {candidateSearch.trim().length >= 3 && candidates.length === 0 && !searchingCandidates && !membershipError && (
              <p className="text-sm text-muted-foreground">No eligible accounts found for this university.</p>
            )}
          </section>

          <div className="space-y-1.5">
            <Label htmlFor="university-admin-reason">Reason (required for assignment or revocation)</Label>
            <Textarea
              id="university-admin-reason"
              value={membershipReason}
              onChange={event => setMembershipReason(event.target.value)}
              minLength={10}
              maxLength={500}
              rows={3}
              placeholder="Explain the operational reason (10–500 characters)."
            />
          </div>

          <DialogFooter><Button variant="outline" onClick={() => setManagedUniversity(null)}>Close</Button></DialogFooter>
        </DialogContent>
      </Dialog>
      <AlertDialog open={pendingMembershipAction !== null} onOpenChange={open => { if (!open && !membershipSaving) setPendingMembershipAction(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm administrator {pendingMembershipAction?.kind === 'assign' ? 'assignment' : 'access revocation'}</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingMembershipAction?.kind === 'assign'
                ? `Grant ${pendingMembershipAction.targetName} university administrator access to ${pendingMembershipAction.universityName}? This changes their privileges and will be audited.`
                : `Revoke ${pendingMembershipAction?.targetName}'s administrator access to ${pendingMembershipAction?.universityName}? This will be audited.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <p className="rounded-md bg-muted p-3 text-sm">Reason: {membershipReason.trim()}</p>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={membershipSaving}>Cancel</AlertDialogCancel>
            <AlertDialogAction disabled={membershipSaving} onClick={event => { event.preventDefault(); void confirmMembershipAction(); }}>
              {membershipSaving ? 'Saving…' : pendingMembershipAction?.kind === 'assign' ? 'Confirm assignment' : 'Confirm revocation'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
