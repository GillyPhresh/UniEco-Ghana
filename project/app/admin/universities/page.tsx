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
import { supabase } from '@/lib/supabase/client';
import { getLocalUniversityBranding } from '@/lib/data/university-branding';
import { GraduationCap, Plus, Edit, Power, Upload, Trash2, Image as ImageIcon, Loader2, Search, ShieldCheck, Globe2, UserPlus, UserX, MapPin, Filter, ExternalLink, CheckCircle2, CircleAlert } from 'lucide-react';
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
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'needs_branding' | 'disabled'>('all');
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
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteHours, setInviteHours] = useState('168');
  const [inviteNote, setInviteNote] = useState('');
  const [sendingInvite, setSendingInvite] = useState(false);
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
    setInviteEmail('');
    setInviteHours('168');
    setInviteNote('');
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

  async function sendInstitutionAdminInvite() {
    if (!managedUniversity) return;
    const email = inviteEmail.trim().toLowerCase();
    if (!/^\S+@\S+\.\S+$/.test(email)) {
      setMembershipError('Enter a valid recipient email address.');
      return;
    }
    if (inviteNote.trim().length > 500) {
      setMembershipError('The note must be 500 characters or fewer.');
      return;
    }
    setSendingInvite(true);
    setMembershipError(null);
    const { error } = await supabase.rpc('create_institution_admin_invite', {
      p_university_id: managedUniversity.id,
      p_recipient_email: email,
      p_expires_hours: Number(inviteHours),
      p_note: inviteNote.trim() || null,
    });
    setSendingInvite(false);
    if (error) {
      setMembershipError(error.message);
      return;
    }
    toast.success(`Invitation sent to ${email}`);
    setInviteEmail('');
    setInviteNote('');
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
    const localBranding = getLocalUniversityBranding(uni.slug);
    const hasLogo = Boolean(uni.logo_url || localBranding.logoUrl);
    const hasCampus = Boolean(uni.hero_image_url || localBranding.campusUrl);
    const matchesStatus = statusFilter === 'all'
      || (statusFilter === 'active' && uni.is_enabled)
      || (statusFilter === 'disabled' && !uni.is_enabled)
      || (statusFilter === 'needs_branding' && (!hasLogo || !hasCampus));
    return haystack.includes(search.trim().toLowerCase()) && matchesStatus;
  });
  const brandedCount = universities.filter(uni => {
    const localBranding = getLocalUniversityBranding(uni.slug);
    return Boolean((uni.logo_url || localBranding.logoUrl) && (uni.hero_image_url || localBranding.campusUrl));
  }).length;
  const activeCount = universities.filter(uni => uni.is_enabled).length;
  const needsBrandingCount = universities.filter(uni => {
    const localBranding = getLocalUniversityBranding(uni.slug);
    return !uni.logo_url && !localBranding.logoUrl || !uni.hero_image_url && !localBranding.campusUrl;
  }).length;

  return (
    <div className="mx-auto w-full max-w-[1440px] space-y-5 p-3 sm:p-6 lg:p-8">
      <section className="relative overflow-hidden rounded-[1.75rem] bg-[#0b1220] p-5 text-white shadow-[0_16px_40px_rgba(15,23,42,0.12)] sm:p-7">
        <div className="pointer-events-none absolute -right-20 -top-24 h-64 w-64 rounded-full bg-primary/20 blur-3xl" />
        <div className="relative flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-2xl">
            <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-primary/25 bg-primary/10 px-3 py-1 text-xs font-semibold text-primary-foreground/90">
              <ShieldCheck className="h-3.5 w-3.5 text-primary" /> Directory control center
            </div>
            <h1 className="font-display text-2xl font-bold tracking-tight sm:text-3xl">Universities</h1>
            <p className="mt-2 max-w-xl text-sm leading-6 text-white/65">Maintain the institutions, official branding, and administrator access that power the UniEco Ghana campus network.</p>
          </div>
          {!isUniversityAdmin && <Button onClick={openCreate} className="h-11 w-full shrink-0 bg-primary text-primary-foreground shadow-lg shadow-primary/20 hover:bg-primary/90 sm:w-auto"><Plus className="mr-2 h-4 w-4" /> Add university</Button>}
        </div>
        <div className="relative mt-6 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <div className="rounded-2xl border border-white/10 bg-white/[0.06] p-3"><p className="text-xl font-bold">{universities.length}</p><p className="mt-1 text-[11px] text-white/55">Institutions</p></div>
          <div className="rounded-2xl border border-white/10 bg-white/[0.06] p-3"><p className="text-xl font-bold text-emerald-300">{activeCount}</p><p className="mt-1 text-[11px] text-white/55">Active</p></div>
          <div className="rounded-2xl border border-white/10 bg-white/[0.06] p-3"><p className="text-xl font-bold text-sky-300">{brandedCount}</p><p className="mt-1 text-[11px] text-white/55">Fully branded</p></div>
          <div className="rounded-2xl border border-white/10 bg-white/[0.06] p-3"><p className="text-xl font-bold text-amber-300">{needsBrandingCount}</p><p className="mt-1 text-[11px] text-white/55">Needs attention</p></div>
        </div>
      </section>

      <div className="flex flex-col gap-3 rounded-2xl border border-border/80 bg-card p-3 shadow-[0_1px_2px_rgba(15,23,42,0.04)] sm:flex-row sm:items-center">
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
          <Input value={search} onChange={event => setSearch(event.target.value)} className="h-11 border-0 bg-muted/50 pl-9 shadow-none focus-visible:ring-1" placeholder="Search name, abbreviation, city, or region" />
        </div>
        <div className="relative sm:w-52">
          <Filter className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
          <select aria-label="Filter universities" value={statusFilter} onChange={event => setStatusFilter(event.target.value as typeof statusFilter)} className="h-11 w-full appearance-none rounded-lg border border-border bg-background pl-9 pr-3 text-sm font-medium outline-none focus:ring-2 focus:ring-primary/30">
            <option value="all">All institutions</option>
            <option value="active">Active only</option>
            <option value="needs_branding">Needs branding</option>
            <option value="disabled">Disabled only</option>
          </select>
        </div>
      </div>

      <div className="flex items-center justify-between gap-3 px-1 text-xs text-muted-foreground"><span>Showing <strong className="font-semibold text-foreground">{visibleUniversities.length}</strong> of {universities.length} institutions</span><span className="hidden sm:inline">Official branding is preferred over placeholders</span></div>

      {loadError && <div className="flex items-center gap-3 rounded-xl border border-destructive/20 bg-destructive/5 p-3" role="alert"><p className="text-sm text-destructive">{loadError}</p><Button variant="outline" size="sm" onClick={loadUniversities}>Retry</Button></div>}
      {loading ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{[1, 2, 3, 4, 5, 6].map(i => <Skeleton key={i} className="h-72 rounded-2xl" />)}</div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {visibleUniversities.map(uni => {
            const localBranding = getLocalUniversityBranding(uni.slug);
            const logoUrl = localBranding.logoUrl || uni.logo_url;
            const campusUrl = uni.hero_image_url || localBranding.campusUrl;
            const fullyBranded = Boolean(logoUrl && campusUrl);

            return <Card key={uni.id} className="group overflow-hidden border-border/80 bg-card transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-lg">
                <div className="relative h-32 overflow-hidden bg-gradient-to-br from-primary/20 via-slate-100 to-sky-100">
                  {campusUrl ? <img src={campusUrl} alt={uni.hero_alt_text || `${uni.name} campus`} className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105" loading="lazy" /> : <div className="flex h-full items-center justify-center"><ImageIcon className="h-10 w-10 text-primary/25" /></div>}
                  <div className="absolute inset-0 bg-gradient-to-t from-slate-950/65 via-slate-950/10 to-transparent" />
                  <div className="absolute left-3 top-3 flex items-center gap-2"><Badge className={uni.is_enabled ? 'border-emerald-200/30 bg-emerald-500/90 text-white' : 'border-white/20 bg-slate-900/70 text-white'}>{uni.is_enabled ? 'Active' : 'Disabled'}</Badge>{fullyBranded && <Badge className="border-white/20 bg-slate-900/70 text-white"><CheckCircle2 className="mr-1 h-3 w-3 text-emerald-300" /> Branded</Badge>}</div>
                </div>
                <CardContent className="p-4 pt-0">
                  <div className="-mt-8 flex items-end gap-3">
                    <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl border-4 border-card bg-white p-2 shadow-md">{logoUrl ? <img src={logoUrl} alt={uni.logo_alt_text || `${uni.name} official logo`} className="max-h-full max-w-full object-contain" loading="lazy" /> : <GraduationCap className="h-7 w-7 text-primary" />}</div>
                    <div className="min-w-0 pb-1"><p className="truncate text-base font-bold text-foreground">{uni.name}</p><p className="truncate text-xs font-medium text-primary">{uni.short_name}</p></div>
                  </div>
                  <div className="mt-3 space-y-1 text-xs text-muted-foreground"><p className="flex items-center gap-1.5 truncate"><MapPin className="h-3.5 w-3.5 shrink-0 text-primary" />{[uni.city, uni.region].filter(Boolean).join(', ') || 'Ghana'}</p>{uni.website_url ? <a href={uni.website_url} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 truncate hover:text-primary"><Globe2 className="h-3.5 w-3.5 shrink-0" />{uni.website_url.replace(/^https?:\/\//, '').replace(/\/$/, '')}<ExternalLink className="h-3 w-3 shrink-0" /></a> : <p className="flex items-center gap-1.5 text-amber-600"><CircleAlert className="h-3.5 w-3.5 shrink-0" />Official website not added</p>}</div>
                  <div className="mt-4 grid gap-2 sm:grid-cols-2">
                    <Button size="sm" variant="outline" className="h-10" onClick={() => openEdit(uni)}><Edit className="mr-1.5 h-3.5 w-3.5" /> {isUniversityAdmin ? 'Update branding' : 'Edit record'}</Button>
                    {!isUniversityAdmin && <Button size="sm" variant="ghost" className="h-10" onClick={() => handleToggle(uni)}><Power className="mr-1.5 h-3.5 w-3.5" /> {uni.is_enabled ? 'Disable' : 'Enable'}</Button>}
                    {user?.role === 'super_admin' && <Button size="sm" variant="ghost" className="h-10 sm:col-span-2" onClick={() => void openUniversityAdmins(uni)}><UserPlus className="mr-1.5 h-3.5 w-3.5" /> Manage administrators</Button>}
                  </div>
                </CardContent>
              </Card>;
          })}
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

          <section className="space-y-3 rounded-xl border border-primary/20 bg-primary/5 p-4">
            <div>
              <h2 className="flex items-center gap-2 text-sm font-semibold"><ShieldCheck className="h-4 w-4 text-primary" />Invite a new institution administrator</h2>
              <p className="mt-1 text-xs text-muted-foreground">The recipient will receive a secure, one-time email link. They must create or sign in with that email before access is activated.</p>
            </div>
            <div className="space-y-1.5"><Label htmlFor="institution-admin-email">Recipient email</Label><Input id="institution-admin-email" type="email" value={inviteEmail} onChange={event => setInviteEmail(event.target.value)} placeholder="appointed.person@example.com" /></div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5"><Label htmlFor="institution-admin-expiry">Invitation expiry</Label><select id="institution-admin-expiry" className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={inviteHours} onChange={event => setInviteHours(event.target.value)}><option value="24">24 hours</option><option value="72">3 days</option><option value="168">7 days</option><option value="720">30 days</option></select></div>
              <div className="space-y-1.5"><Label htmlFor="institution-admin-note">Appointment note (optional)</Label><Input id="institution-admin-note" value={inviteNote} onChange={event => setInviteNote(event.target.value)} placeholder="Tertiary platform coordinator" maxLength={500} /></div>
            </div>
            <Button onClick={() => void sendInstitutionAdminInvite()} disabled={sendingInvite || !inviteEmail.trim()}>{sendingInvite ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <UserPlus className="mr-2 h-4 w-4" />}Send secure invitation</Button>
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
